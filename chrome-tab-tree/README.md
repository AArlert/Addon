# chrome-tab-tree

> A Chromium extension (Manifest V3) that visualises your open tabs as a parent-child tree inside a Side Panel, optimised for Edge's vertical-tab workflow.

---

## Table of Contents

1. [Background](#1-background)
2. [Technical Investigation](#2-technical-investigation)
3. [Requirements Analysis](#3-requirements-analysis)
   - [Core Requirements](#31-core-requirements)
   - [Out of Scope](#32-out-of-scope)
   - [Known Constraints](#33-known-constraints)
4. [Feature Specification](#4-feature-specification)
5. [Architecture](#5-architecture)
6. [Roadmap](#6-roadmap)
7. [Tech Stack](#7-tech-stack)
8. [Development Setup](#8-development-setup)

---

## 1. Background

Edge's built-in vertical tab bar is convenient for power users who open many tabs, but it provides no visual hierarchy — all tabs appear as a flat list regardless of how they were opened. When a user middle-clicks a link or selects "Open in new tab", the new tab has a clear semantic relationship to the current page, yet this relationship is lost immediately.

`chrome-tab-tree` restores that hierarchy by building a persistent tree of tabs and exposing it in a dedicated Side Panel.

---

## 2. Technical Investigation

**Can a Manifest V3 extension modify the browser's native tab sidebar UI?**

No. The vertical tab bar in Edge (and the equivalent native tab strip in Chrome) is rendered by the browser process as native UI, completely outside the reach of web-platform APIs. Chrome Extensions cannot inject scripts into browser chrome, cannot access or modify native sidebar DOM, and receive no hooks into the sidebar's rendering pipeline.

**Conclusion → Method A (Side Panel).**

The extension creates its own panel using the [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) (`chrome.sidePanel`), which is available in Chromium ≥ 114. The panel hosts a full React/Vanilla JS tree view that the extension controls entirely. The browser's native tab bar is left untouched; users may hide it or keep it alongside the panel — that is their choice.

---

## 3. Requirements Analysis

### 3.1 Core Requirements

| ID | Requirement |
|----|-------------|
| CR-01 | Display all open tabs in a tree structure inside the Side Panel |
| CR-02 | A parent-child edge is created **only** when a tab is opened via middle-click or right-click → "Open in new tab" from within a web page, identified by a non-null `openerTabId` from `chrome.tabs.onCreated` |
| CR-03 | Tabs opened by any other means (address bar, keyboard shortcut, JS `window.open` without `openerTabId`, etc.) appear as top-level (root) nodes |
| CR-04 | When a **parent tab** is closed, the user is prompted: **Promote children** (children become siblings of the parent, i.e. children of the grandparent) or **Close all** (close children recursively) |
| CR-05 | The tree state is persisted across browser sessions via `chrome.storage.local` |
| CR-06 | The extension targets general Chromium browsers (Chrome, Edge, Brave, etc.); no Edge-specific APIs are used |
| CR-07 | Built on Manifest V3 |

### 3.2 Out of Scope

- Modifying or hiding the browser's native tab bar / vertical tab bar
- Drag-and-drop reordering of tree nodes (post-MVP)
- Tab groups integration (post-MVP)
- Syncing tree state across devices via `chrome.storage.sync` (post-MVP)
- Firefox support

### 3.3 Known Constraints

| Constraint | Impact |
|------------|--------|
| MV3 service workers are non-persistent | Tree state must be flushed to `chrome.storage.local` on every mutation; the service worker cannot hold in-memory state between events |
| `openerTabId` is only populated when the browser can attribute a clear opener | Some programmatic `window.open()` calls may not set `openerTabId`; those tabs will appear as roots |
| Side Panel API requires Chromium ≥ 114 | Older Chromium builds are not supported |
| Prompt on parent close adds a UI round-trip | The prompt must be non-blocking (use the Side Panel UI, not `window.confirm`) |

---

## 4. Feature Specification

### 4.1 Tree Panel

- The Side Panel renders the tab tree as an indented list.
- Each node shows: **favicon**, **page title**, **URL domain** (truncated), and a **close button**.
- Active (focused) tab is highlighted.
- Clicking a node switches focus to that tab.
- Nodes can be collapsed/expanded to hide sub-trees.

### 4.2 Parent-Child Relationship

```
Trigger condition (all must be true):
  • chrome.tabs.onCreated fires
  • event.tab.openerTabId is defined and non-null
  • The opener tab exists in the current tree

Result:
  • New tab is inserted as a child of the opener tab
  • Position: appended after existing children of the opener
```

### 4.3 Tab Close Behaviour

```
Case A — Leaf node (no children):
  • Remove node silently; no prompt.

Case B — Parent node (has children):
  • Show inline prompt in the Side Panel:
      "Closing '[page title]' — what should happen to its X child tab(s)?"
      [Promote children]   [Close all]
  • Promote children: each direct child becomes a sibling of the closed tab
    (i.e., re-parented to the closed tab's parent, or to root if none).
  • Close all: close child tabs recursively (DFS), then remove the node.
```

### 4.4 Persistence

- On every tree mutation, the serialised tree is written to `chrome.storage.local` under the key `tabTree`.
- On service-worker startup (or Side Panel load), the tree is loaded from storage and reconciled against the live tab list: nodes whose tab ID no longer exists are pruned; tabs that exist but are missing from the tree are added as roots.

### 4.5 Multiple Windows

- Each browser window maintains its own independent tree, keyed by `windowId`.
- The Side Panel shows only the tree for its own window.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Service Worker (background.js)                      │
│  • Listens: chrome.tabs.onCreated / onRemoved /      │
│             onActivated / onUpdated                  │
│  • Maintains tree data model in chrome.storage.local │
│  • Handles tab close prompt logic                    │
│  • Communicates with Side Panel via chrome.runtime   │
│    messaging                                         │
└───────────────────┬──────────────────────────────────┘
                    │ chrome.runtime messages
┌───────────────────▼──────────────────────────────────┐
│  Side Panel (panel.html + panel.js)                  │
│  • Renders tree UI                                   │
│  • Dispatches user actions (click, close, promote)   │
│  • Receives tree state updates from service worker   │
└──────────────────────────────────────────────────────┘
```

**Data model (stored in `chrome.storage.local`):**

```jsonc
{
  "tabTree": {
    "<windowId>": {
      "roots": ["<tabId>", ...],
      "nodes": {
        "<tabId>": {
          "tabId": 42,
          "parentId": null,          // null = root
          "children": [43, 44],
          "title": "Example Domain",
          "url": "https://example.com",
          "favIconUrl": "..."
        }
      }
    }
  }
}
```

---

## 6. Roadmap

### Milestone 0 — Project Bootstrap
- [ ] `manifest.json` (MV3, `sidePanel`, `tabs`, `storage` permissions)
- [ ] Minimal service worker scaffold
- [ ] Minimal Side Panel HTML/JS scaffold
- [ ] Development load/reload workflow

### Milestone 1 — Core Tree Logic (MVP)
- [ ] `chrome.tabs.onCreated` → build parent-child relationship via `openerTabId`
- [ ] `chrome.tabs.onRemoved` → leaf removal; prompt for parent removal
- [ ] `chrome.tabs.onUpdated` → sync title, URL, favicon into node
- [ ] `chrome.tabs.onActivated` → highlight active node
- [ ] Persist tree to `chrome.storage.local` on every mutation
- [ ] Load & reconcile tree from storage on startup

### Milestone 2 — Side Panel UI
- [ ] Render indented tree list (recursive component)
- [ ] Active tab highlight
- [ ] Click node → `chrome.tabs.update` to switch focus
- [ ] Close button per node
- [ ] Inline promote/close-all prompt for parent close
- [ ] Collapse/expand sub-trees

### Milestone 3 — Multi-Window Support
- [ ] Separate tree per `windowId`
- [ ] Side Panel scoped to its window

### Milestone 4 — Polish & Robustness
- [ ] Startup reconciliation (prune dead tabs, adopt orphan tabs as roots)
- [ ] Handle detach/attach tab across windows (`chrome.tabs.onDetached` / `onAttached`)
- [ ] Graceful degradation when `chrome.sidePanel` is unavailable (Chromium < 114)
- [ ] Accessibility: keyboard navigation within the tree panel
- [ ] Localisation scaffold (i18n)

### Milestone 5 — Post-MVP Features (Backlog)
- [ ] Drag-and-drop node reordering
- [ ] Tab groups integration
- [ ] Cross-device sync via `chrome.storage.sync`
- [ ] Search/filter within the panel
- [ ] "Collapse all" / "Expand all" controls

---

## 7. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Extension platform | Manifest V3 | Required by Chrome Web Store |
| Background | Service Worker (vanilla JS) | MV3 default; no framework needed for event handling |
| Side Panel UI | Vanilla JS + CSS (MVP) / React (if complexity grows) | Minimal bundle, no build step for MVP |
| Storage | `chrome.storage.local` | Persists across sessions; no quota issues for tab trees |
| Build tooling | Vite + `@crxjs/vite-plugin` (optional) | Zero-config HMR for extension development |

---

## 8. Development Setup

> Prerequisites: Node.js ≥ 18, Chrome / Edge ≥ 114

```bash
# 1. Install dependencies (once a package.json is added)
npm install

# 2. Build (or open directly if no build step in MVP)
npm run build

# 3. Load unpacked extension
# Chrome/Edge → chrome://extensions → Enable Developer Mode → Load unpacked → select dist/
```
