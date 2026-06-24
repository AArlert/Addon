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
| CR-04 | Subsequent H1s (if present — non-standard but tolerated) are numbered, treated as top-level numbered sections in the hierarchy |
| CR-05 | Headings whose trimmed text (after stripping any existing prefix) exactly matches a whitelist entry are left unnumbered |
| CR-06 | The whitelist supports global entries and per-folder / per-note overrides |
| CR-07 | Each heading level's display format is defined by a **template**; templates are fully user-configurable |
| CR-08 | Multiple named templates can be defined; a path-matching rule maps each folder (or note) to a template |
| CR-09 | Internally, the plugin tracks all heading levels using plain Arabic counters; display formats are applied only when writing prefixes to the file |
| CR-10 | The plugin re-numbers the entire file on each trigger (not just the edited section), ensuring global consistency |

### 2.2 Out of Scope

- Render-layer-only (CSS counter) injection — numbering must be visible in raw Markdown
- Numbering H1 headings that are the first heading in the file
- Table-of-contents generation (separate concern)
- Automatic heading level correction (e.g. promoting H4 to H3)
- Multi-file batch renumbering (post-MVP)
- Git-aware change minimisation (post-MVP)

### 2.3 Edge Cases & Design Decisions

| Scenario | Decision |
|----------|----------|
| File has no H2+ headings | Plugin writes nothing; file is untouched |
| Heading is on the whitelist AND has children | The whitelisted heading is skipped (no prefix), but its counter slot is still consumed so that sibling numbering remains correct |
| User manually edits a heading prefix | The next debounce cycle rewrites it to the correct value; manual edits to prefixes are intentionally overwritten |
| Multiple H1s | First H1: no number. H2–H6 between the first and second H1: numbered normally. Second H1 onward: numbered as top-level sections (counter continues from where it was) |
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

```
Line-by-line scan order:

1. First encountered `# ` heading → mark as "document title", no prefix, no counter.
2. Any subsequent `# ` heading → treated as a numbered top-level section.
   Counter used: the level-1 counter (same counter used if H2 were at the top level).
   Display format: the template's entry for "h1_subsequent" (user-configurable,
   defaults to the same format as h2 if not set separately).
```

### 3.3 Internal Numbering Model

The plugin maintains an array of integer counters `[c1, c2, c3, c4, c5, c6]`, one per heading level H1–H6.

Rules:
- When a heading at level *n* is encountered, `c[n]` is incremented and all counters for levels *> n* are reset to 0.
- The counter array is independent of the display format; display format is applied afterwards.
- The first H1 does not touch any counter.

**Example (using the default template for illustration):**

```
# Introduction          → title, skip        counters: [0,0,0,0,0,0]
## Background           → c[2]=1             display: "一、"
## Methods              → c[2]=2             display: "二、"
### Setup               → c[3]=1             display: "1.1 "   (c[2]=2 → "2", but remapped)
### Execution           → c[3]=2             display: "1.2 "
#### Step A             → c[4]=1             display: "a) "
## Results              → c[2]=3, c[3..]=0   display: "三、"
### Table               → c[3]=1, whitelisted → no prefix (counter still increments)
### Analysis            → c[3]=2             display: "3.2 "
```

> **Remapping**: Each level's display format receives only that level's own counter value, not a concatenation of parent counters. If H3 format is `"{parent}.{n} "`, the plugin resolves `{parent}` as the current H2 counter value (already remapped to Arabic). This allows formats like `"2.3 "` even when H2 is displayed as `"二、"`.

### 3.4 Template System

A **template** is a named JSON object that maps each heading level to a format descriptor.

**Template schema:**

```jsonc
{
  "name": "academic",        // unique template identifier
  "levels": {
    "h1_subsequent": { "format": "{n}. ",       "style": "arabic" },
    "h2":            { "format": "{cn}、",       "style": "chinese_upper" },
    "h3":            { "format": "{p2}.{n} ",   "style": "arabic" },
    "h4":            { "format": "{alpha}) ",   "style": "alpha_lower" },
    "h5":            { "format": "({alpha}) ",  "style": "alpha_lower" },
    "h6":            { "format": "{n}. ",       "style": "arabic" }
  }
}
```

**Format variables:**

| Variable | Meaning |
|----------|---------|
| `{n}` | This level's counter, rendered in the level's own `style` |
| `{p2}` … `{p6}` | Parent level counter value, rendered in Arabic (for cross-level concatenation) |
| `{cn}` | This level's counter in Chinese upper-case numerals (一二三…) |
| `{alpha}` | This level's counter as a lowercase letter (a, b, c, … z, aa, ab, …) |
| `{Alpha}` | Uppercase letter variant |
| `{roman}` | Lowercase Roman numeral |
| `{Roman}` | Uppercase Roman numeral |

**Built-in styles:**

| Style key | Example output |
|-----------|---------------|
| `arabic` | 1, 2, 3 |
| `chinese_upper` | 一, 二, 三 |
| `chinese_lower` | 一, 二, 三 (same glyphs, reserved for distinction) |
| `alpha_lower` | a, b, c |
| `alpha_upper` | A, B, C |
| `roman_lower` | i, ii, iii |
| `roman_upper` | I, II, III |

A **default template** is always present and cannot be deleted; it can be edited. Additional named templates can be created, duplicated, and deleted.

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

1. Per-note whitelist   (defined in the note's frontmatter or in settings for that path)
2. Per-folder whitelist (defined in settings for the closest ancestor folder)
3. Global whitelist     (defined in plugin settings)

Merge strategy: the resolved whitelist is the UNION of all matching scopes,
unless a scope explicitly sets `override: true`, in which case only that
scope's list is used (no union with broader scopes).
```

**Frontmatter integration (per-note):**

```yaml
---
auto-headings:
  whitelist: ["Introduction", "Summary"]
  whitelist-override: false   # false = union with folder/global; true = replace
  template: "legal"           # override template for this note
---
```

### 3.6 Per-Path Configuration

In plugin settings, users define **path rules** — an ordered list of glob-style path patterns mapping to a template name and optional whitelist overrides:

```jsonc
[
  { "path": "**",                "template": "default"  },   // global fallback
  { "path": "Projects/**",       "template": "technical" },
  { "path": "Reading Notes/**",  "template": "academic"  },
  { "path": "Reading Notes/Deep Work.md", "template": "minimal" }
]
```

Resolution:
1. All matching rules are collected.
2. The **most specific match** wins (exact file path > folder glob > `**`).
3. Tie-breaking: the rule listed **last** in the config wins (allows easy overriding by appending new rules).

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
- [ ] Whole-file rewrite in a single editor transaction
- [ ] H1 title-skip rule
- [ ] Subsequent H1 numbering
- [ ] Manual "Renumber now" command

### Milestone 3 — Template System
- [ ] Template schema definition and validation
- [ ] Format variable resolution (`{n}`, `{p2}`, `{cn}`, `{alpha}`, `{roman}`, etc.)
- [ ] Built-in style renderers (Arabic, Chinese, alpha, Roman)
- [ ] Default template pre-populated
- [ ] Template CRUD in settings UI

### Milestone 4 — Whitelist System
- [ ] Global whitelist (exact match, trim)
- [ ] Whitelist check integrated into numbering cycle (counter still increments)
- [ ] Whitelist editor in settings UI
- [ ] Per-note whitelist via frontmatter (`auto-headings.whitelist`)
- [ ] Whitelist merge / override logic

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
