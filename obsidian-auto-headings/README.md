# obsidian-auto-headings

> An Obsidian plugin that automatically numbers headings in Markdown files using fully customisable, per-path templates — keeping your files clean and consistent without manual effort.

---

## Table of Contents

1. [Background](#1-background)
2. [Requirements Analysis](#2-requirements-analysis)
   - [Core Requirements](#21-core-requirements)
   - [Out of Scope](#22-out-of-scope)
   - [Edge Cases & Design Decisions](#23-edge-cases--design-decisions)
3. [Feature Specification](#3-feature-specification)
   - [Write-to-File Model](#31-write-to-file-model)
   - [H1 Handling Rules](#32-h1-handling-rules)
   - [Internal Numbering Model](#33-internal-numbering-model)
   - [Template System](#34-template-system)
   - [Whitelist System](#35-whitelist-system)
   - [Per-Path Configuration](#36-per-path-configuration)
   - [Trigger & Debounce](#37-trigger--debounce)
4. [Architecture](#4-architecture)
5. [Roadmap](#5-roadmap)
6. [Tech Stack](#6-tech-stack)
7. [Development Setup](#7-development-setup)

---

## 1. Background

Markdown documents — especially long technical notes, meeting records, or academic writings — benefit enormously from numbered headings. Yet maintaining those numbers by hand is error-prone: inserting a section in the middle requires renumbering everything below it.

`obsidian-auto-headings` solves this by hooking into Obsidian's editor events, detecting heading changes, and rewriting heading prefixes directly in the file with a configurable delay. Users define exactly how each heading level should look (Chinese numerals, legal numbering, outline letters, etc.), and those rules can vary per folder or even per note.

---

## 2. Requirements Analysis

### 2.1 Core Requirements

| ID | Requirement |
|----|-------------|
| CR-01 | Detect heading changes after a configurable debounce delay (default 300 ms) and rewrite heading prefixes in the active `.md` file |
| CR-02 | Numbering is written directly into the file (not injected into the render layer only) |
| CR-03 | The **first H1** in any file is always exempt from numbering (it is treated as the document title) |
| CR-04 | Subsequent H1s (if present — non-standard but tolerated) are **demoted in place**: the `#` marker is rewritten to `##`, and all headings beneath them are shifted down one level accordingly, until the next original H1 (or end of file) |
| CR-05 | Headings whose trimmed text (after stripping any existing prefix) exactly matches a whitelist entry are left unnumbered |
| CR-06 | The whitelist supports global entries and per-folder / per-note overrides; all configuration lives exclusively in the plugin's settings GUI (no frontmatter) |
| CR-07 | Each heading level's display format is defined by a **template**; templates are fully user-configurable |
| CR-08 | Multiple named templates can be defined; a path-matching rule maps each folder (or note) to a template |
| CR-09 | Internally, the plugin tracks all heading levels using plain Arabic counters; display formats are applied only when writing prefixes to the file |
| CR-10 | The plugin re-numbers the entire file on each trigger (not just the edited section), ensuring global consistency |

### 2.2 Out of Scope

- Render-layer-only (CSS counter) injection — numbering must be visible in raw Markdown
- Numbering H1 headings that are the first heading in the file
- Table-of-contents generation (separate concern)
- Any configuration via YAML frontmatter (intentionally excluded to keep notes clean)
- Multi-file batch renumbering (post-MVP)
- Git-aware change minimisation (post-MVP)

### 2.3 Edge Cases & Design Decisions

| Scenario | Decision |
|----------|----------|
| File has no H2+ headings | Plugin writes nothing; file is untouched |
| Heading is on the whitelist AND has children | The whitelisted heading is skipped (no prefix), but its counter slot is still consumed so that sibling numbering remains correct |
| User manually edits a heading prefix | The next debounce cycle rewrites it to the correct value; manual edits to prefixes are intentionally overwritten |
| Multiple H1s | First H1: no number, not demoted. Each subsequent H1: its `#` is rewritten to `##`, and all headings within its subtree are shifted down one level (H2→H3, H3→H4, etc.) until the next original H1 or end of file |
| Nested heading skips a level (H2 → H4) | Plugin numbers what is present; missing intermediate levels are simply not instantiated |
| Whitelist entry contains leading/trailing spaces | Matched after `trim()` on both sides |
| Per-note config and per-folder config both match | Per-note wins (most-specific-wins) |
| No template matches a path | The global default template is applied |

---

## 3. Feature Specification

### 3.1 Write-to-File Model

The plugin uses Obsidian's `Editor` API to read and rewrite heading lines. On each trigger cycle:

1. Parse the full file line-by-line to identify heading lines (lines starting with one or more `#` followed by a space).
2. Strip any existing auto-heading prefix from each heading's text.
3. Re-compute the correct prefix for every heading using the active template and counter state.
4. Replace each heading line in the editor atomically (single transaction to avoid excessive undo entries).

> **Why whole-file rewrite?** Partial rewriting (only the changed section) would require tracking which headings are "below" the edit point and whether counter resets are needed above it. Whole-file rewriting is simpler, correct, and fast enough for any realistic note length.

### 3.2 H1 Handling Rules

The plugin performs a **two-pass** process:

**Pass 1 — H1 demotion (structural rewrite):**

```
Scan the file top-to-bottom:

1. First `# ` heading encountered → "document title".
   Action: leave the `#` as-is; mark it as exempt (no prefix, no counter).

2. Each subsequent `# ` heading → "misplaced H1".
   Action: rewrite the `#` marker to `##` in the file.
   All headings within its subtree (until the next original `# ` or EOF)
   are shifted down one level:
     ##  → ###
     ### → ####
     ... and so on.

Example (original → after demotion):

  # My Document          →  # My Document          (title, untouched)
  ## Section A           →  ## Section A
  ### Detail             →  ### Detail
  ### Detail             →  ### Detail
  # Appendix             →  ## Appendix             (demoted)
  ## Sub                 →  ### Sub                 (shifted)
```

**Pass 2 — Numbering:**
After structural rewriting, the file is re-parsed and numbered as if it had no H1s beyond the document title. All subsequent logic operates on the post-demotion heading levels.

### 3.3 Internal Numbering Model

The plugin maintains an array of integer counters `[c2, c3, c4, c5, c6]`, one per heading level H2–H6 (H1 is the document title and is never counted).

Rules:
- When a heading at level *n* is encountered, `c[n]` is incremented and all counters for levels *> n* are reset to 0.
- The counter array is **independent of display format**; format conversion is applied only at write time.
- Whitelisted headings do **not** skip their counter slot — the counter increments normally, but no prefix is written to the file.
- All arithmetic uses plain Arabic integers internally, regardless of what symbol style the template specifies.

**Example — internal counter state vs. written output:**

```
Internal tracking (pure Arabic)    Written to file (template applied)
──────────────────────────────    ──────────────────────────────────
H2 → c2=1                    →    一、
H3 → c3=1                    →    1.1
H3 → c3=2                    →    1.2
H4 → c4=1                    →    a)
H2 → c2=2, c3..=0            →    二、
H3 → c3=1 (whitelisted)      →    (no prefix written; counter still = 1)
H3 → c3=2                    →    2.2
H4 → c4=1                    →    a)
```

> **Cross-level variable resolution**: When a format string references a parent level (e.g. `{p2}` in an H3 format), the plugin substitutes the current `c2` value as a plain Arabic numeral, regardless of how H2 itself is displayed. This is what allows `1.1`, `1.2`, `2.2` etc. while H2 shows `一、`, `二、`.

### 3.4 Template System

A **template** is a named configuration object that maps each heading level to a format string. Templates are created and edited exclusively in the plugin's **Settings GUI** — no YAML or frontmatter involved.

**Template schema (internal representation stored in `data.json`):**

```jsonc
{
  "name": "academic",        // unique template identifier shown in GUI dropdowns
  "levels": {
    "h2": { "format": "{cn}、" },
    "h3": { "format": "{p2}.{n} " },
    "h4": { "format": "{alpha}) " },
    "h5": { "format": "({alpha}) " },
    "h6": { "format": "{n}. " }
  }
}
```

**Format variables (usable inside any format string):**

| Variable | Meaning |
|----------|---------|
| `{n}` | This level's own counter, rendered in Arabic numerals |
| `{cn}` | This level's counter in Chinese upper-case numerals (一、二、三…) |
| `{CN}` | This level's counter in Chinese lower-case numerals (same glyphs; reserved for future distinction) |
| `{alpha}` | This level's counter as a lowercase letter (a, b, … z, aa, ab, …) |
| `{Alpha}` | Uppercase letter variant (A, B, … Z, AA, …) |
| `{roman}` | Lowercase Roman numeral (i, ii, iii, …) |
| `{Roman}` | Uppercase Roman numeral (I, II, III, …) |
| `{p2}` … `{p5}` | Counter value of the specified parent level, always in Arabic (for cross-level concatenation, e.g. `{p2}.{n}` → `2.3`) |

A **default template** is always present and cannot be deleted; it can be edited. Additional named templates can be created, duplicated, renamed, and deleted — all within the Settings GUI. Template names appear in a dropdown wherever a path rule needs to reference a template.

**Settings GUI layout for templates:**

```
┌─ Templates ─────────────────────────────────────────────────────────┐
│  [+ New template]  [Duplicate]  [Delete]                            │
│                                                                     │
│  Template name: [ academic          ▼ ]                             │
│                                                                     │
│  Level │ Format string  │ Preview                                   │
│  ──────┼────────────────┼─────────                                  │
│  H2    │ {cn}、         │ 一、 二、 三、                            │
│  H3    │ {p2}.{n}       │ 1.1  1.2  2.1                            │
│  H4    │ {alpha})       │ a)  b)  c)                                │
│  H5    │ ({alpha})      │ (a)  (b)                                  │
│  H6    │ {n}.           │ 1.  2.                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.5 Whitelist System

Whitelists contain **exact-match** strings compared against the heading text after stripping any existing prefix and trimming whitespace.

**Built-in global defaults** (pre-populated, user-editable):
```
目录
附录
参考文献
References
Appendix
```

**Scoping and override rules:**

```
Resolution order (most specific wins):

1. Per-note rule     (path rule matching the exact file path, set in Settings GUI)
2. Per-folder rule   (path rule matching the closest ancestor folder, set in Settings GUI)
3. Global default    (the fallback template + whitelist, set in Settings GUI)

Merge strategy for whitelists: the resolved whitelist is the UNION of all matching
scopes, unless a scope is configured with "override: true" in the GUI, in which
case only that scope's whitelist is used.
```

> **No frontmatter.** All configuration — templates, whitelists, path rules, per-note overrides — is managed exclusively through the plugin's Settings GUI. Frontmatter in notes is never read or written by this plugin.

### 3.6 Per-Path Configuration

All path rules are managed in the plugin's **Settings GUI** — a visual table where each row maps a path pattern to a template (chosen from a dropdown of defined templates) and an optional local whitelist.

**GUI layout:**

```
┌─ Path Rules ────────────────────────────────────────────────────────┐
│  [+ Add rule]                                                       │
│                                                                     │
│  #  │ Path pattern              │ Template       │ Whitelist        │
│  ───┼───────────────────────────┼────────────────┼──────────────    │
│  1  │ **                        │ [default    ▼] │ [Edit…]          │
│  2  │ Projects/**               │ [technical  ▼] │ [Edit…]          │
│  3  │ Reading Notes/**          │ [academic   ▼] │ [Edit…]          │
│  4  │ Reading Notes/Deep Work…  │ [minimal    ▼] │ [Edit…]          │
│                                 ↑ drag to reorder                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Resolution logic:**

1. All rules whose path pattern matches the active file are collected.
2. The **most specific match** wins (exact file path > longest folder prefix > `**`).
3. Tie-breaking: the rule with the **higher row number** (lower in the list) wins, allowing overrides by adding rules at the bottom.
4. If no rule matches, the built-in system default is used.

### 3.7 Trigger & Debounce

```
User types / pastes / deletes in the editor
        ↓
Editor onChange event fires
        ↓
Debounce timer resets (default: 300 ms, configurable 50–2000 ms)
        ↓  [timer expires]
Plugin checks: does the file contain any headings?
        ↓  [yes]
Full-file renumbering cycle runs
        ↓
Editor content updated in a single transaction
```

- The debounce timer is per-file; editing a second note does not cancel the first note's pending update.
- If the file is closed before the timer fires, the pending update is cancelled (no write to a closed file).
- A manual **"Renumber now"** command is available in the Command Palette for immediate triggering regardless of debounce.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  main.ts  (Plugin entry point)                                   │
│  • Registers editor-change listener                              │
│  • Manages per-file debounce timers                              │
│  • Loads / saves settings                                        │
└──────┬────────────────────────────┬────────────────────────────┬─┘
       │                            │                            │
┌──────▼──────┐           ┌─────────▼─────────┐      ┌──────────▼──────────┐
│  parser.ts  │           │  numbering.ts      │      │  settings/           │
│  • Parse    │           │  • Counter state   │      │  SettingsTab.ts      │
│    headings │           │  • Apply template  │      │  • Template editor   │
│    from raw │           │  • Resolve format  │      │  • Whitelist editor  │
│    Markdown │  ──────►  │    variables       │      │  • Path rules        │
│  • Strip    │           │  • Write prefixes  │      │    manager           │
│    existing │           │    back to editor  │      └──────────────────────┘
│    prefixes │           └────────────────────┘
└─────────────┘

settings/
├── TemplateStore.ts     // CRUD for named templates
├── WhitelistStore.ts    // Global + scoped whitelist management
└── PathRuleStore.ts     // Path → template + whitelist resolution
```

**Settings storage:** `plugin.loadData()` / `plugin.saveData()` (Obsidian standard), stored in `.obsidian/plugins/obsidian-auto-headings/data.json`.

---

## 5. Roadmap

### Milestone 0 — Project Bootstrap
- [ ] Scaffold with `npm create obsidian-plugin` (or manual scaffold matching Obsidian sample plugin structure)
- [ ] TypeScript, ESLint, Prettier configuration
- [ ] Minimal `main.ts` that loads and unloads cleanly
- [ ] Basic settings tab skeleton

### Milestone 1 — Core Parser & Numbering Engine
- [ ] `parser.ts`: parse heading lines, detect level, strip existing prefix
- [ ] `numbering.ts`: counter state machine (increment, reset on level change)
- [ ] Apply a single hardcoded template to verify output correctness
- [ ] Unit tests for parser and numbering engine

### Milestone 2 — Write-to-File & Debounce
- [ ] Editor onChange listener with per-file debounce timer
- [ ] Two-pass rewrite: H1 demotion (structural), then numbering
- [ ] Whole-file rewrite in a single editor transaction
- [ ] H1 title-skip rule
- [ ] Manual "Renumber now" command

### Milestone 3 — Template System
- [ ] Template schema definition and validation
- [ ] Format variable resolution (`{n}`, `{cn}`, `{alpha}`, `{roman}`, `{p2}`…`{p5}`)
- [ ] Built-in symbol renderers (Arabic, Chinese, alpha, Roman)
- [ ] Default template pre-populated
- [ ] Template CRUD in settings GUI (name, per-level format strings, live preview row)

### Milestone 4 — Whitelist System
- [ ] Global whitelist (exact match after trim)
- [ ] Whitelist check integrated into numbering cycle (counter increments; prefix suppressed)
- [ ] Whitelist editor in settings GUI (add / remove entries; union vs. override toggle)
- [ ] Per-folder whitelist configurable in path rule row
- [ ] Whitelist merge / override resolution logic

### Milestone 5 — Per-Path Configuration
- [ ] Path rule store (glob matching, specificity resolution)
- [ ] Path rules editor in settings UI
- [ ] Per-folder template assignment
- [ ] Per-note template override via frontmatter

### Milestone 6 — Polish & Robustness
- [ ] Configurable debounce delay in settings (50–2000 ms slider)
- [ ] Cancel pending timer when file is closed
- [ ] Handle edge cases: empty files, files with only H1, headings inside code blocks (must be ignored)
- [ ] Localisation scaffold (i18n)
- [ ] Comprehensive integration tests with real Vault fixtures

### Milestone 7 — Post-MVP Features (Backlog)
- [ ] Multi-file batch renumbering command
- [ ] Export with numbering baked in (for PDF / Pandoc workflows)
- [ ] "Preview mode" — show what numbering would look like before writing
- [ ] Community submission to Obsidian plugin directory

---

## 6. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Language | TypeScript | Obsidian's official recommendation; type safety for template schema |
| Framework | Obsidian Plugin API | Standard plugin interface (`Plugin`, `Editor`, `SettingTab`) |
| Build | `esbuild` (via Obsidian sample plugin build script) | Fast incremental builds; matches community convention |
| Testing | Vitest | Fast, ESM-native; can test parser/numbering logic without Obsidian runtime |
| Linting | ESLint + `@typescript-eslint` | Catches common TS mistakes |
| Formatting | Prettier | Consistent code style |

---

## 7. Development Setup

> Prerequisites: Node.js ≥ 18, an Obsidian vault for testing

```bash
# 1. Clone into your vault's plugin directory
cd /path/to/your/vault/.obsidian/plugins
git clone <repo> obsidian-auto-headings
cd obsidian-auto-headings

# 2. Install dependencies
npm install

# 3. Start watch build
npm run dev

# 4. Enable the plugin in Obsidian
# Settings → Community Plugins → obsidian-auto-headings → Enable

# 5. Run unit tests (no Obsidian runtime required)
npm test
```

> **Hot reload**: Install the [Hot Reload](https://github.com/pjeby/hot-reload) community plugin in your dev vault to automatically reload `obsidian-auto-headings` whenever `main.js` is rebuilt.
