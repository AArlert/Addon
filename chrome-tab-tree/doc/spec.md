# chrome-tab-tree

> 一款 Chromium 扩展（Manifest V3），在侧边面板（Side Panel）中将当前窗口的标签页以父子树状结构可视化展示，专为 Edge 竖版标签页工作流优化。支持中文与英文界面。

---

## 目录

1. [背景](#1-背景)
2. [技术调研](#2-技术调研)
3. [需求分析](#3-需求分析)
   - [核心需求](#31-核心需求)
   - [非目标](#32-非目标)
   - [已知限制](#33-已知限制)
4. [功能规格](#4-功能规格)
5. [架构设计](#5-架构设计)
6. [Roadmap](#6-roadmap)
7. [技术栈](#7-技术栈)
8. [开发环境搭建](#8-开发环境搭建)

---

## 1. 背景

Edge 内置的竖版标签栏为重度多标签用户提供了便利，但所有标签页均以扁平列表展示，无论其打开方式如何，父子关系一概丢失。用户在页面内中键点击或右键选择"在新标签页中打开"时，新标签与当前页面存在明确的语义关联，却在打开的瞬间被浏览器抹去。

`chrome-tab-tree` 通过专属的侧边面板恢复这种层级关系，让用户直观地厘清标签页的开启脉络。

---

## 2. 技术调研

**MV3 扩展能否修改浏览器原生标签栏 UI？**

不能。Edge 的竖版标签栏（以及 Chrome 的原生标签条）由浏览器进程以原生 UI 渲染，完全超出 Web 平台 API 的触达范围。Chrome 扩展无法向浏览器 chrome 注入脚本，无法访问或修改原生侧边栏 DOM，也没有任何钩子介入侧边栏的渲染流程。

**结论 → 采用方案 A（Side Panel）。**

扩展使用 [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)（`chrome.sidePanel`，Chromium ≥ 114 可用）创建一个完全由扩展掌控的面板，在其中绘制树状列表。浏览器原生标签栏保持不变；用户可自行选择隐藏原生标签栏或与面板并排显示。

---

## 3. 需求分析

### 3.1 核心需求

| 编号 | 需求描述 |
|------|----------|
| CR-01 | 在侧边面板中以树状结构展示当前窗口所有已打开的标签页 |
| CR-02 | 仅当标签页通过**页面内中键点击**或**右键 → 在新标签页中打开**的方式创建，且 `chrome.tabs.onCreated` 事件携带非空 `openerTabId` 时，才建立父子关系 |
| CR-03 | 通过其他方式打开的标签页（地址栏输入、键盘快捷键、`window.open` 无 `openerTabId` 等）作为根节点显示 |
| CR-04 | 当**父标签页**被关闭时，在侧边面板内弹出内联提示："是否将子标签页提升为兄弟节点，还是一并关闭？"；**提升**则将所有直接子节点重新挂载到已关闭节点的父节点下（若无父节点则提升为根节点）；**一并关闭**则递归关闭所有子标签页 |
| CR-05 | 树状结构跨浏览器会话持久保存（使用 `chrome.storage.local`） |
| CR-06 | 面向通用 Chromium 浏览器（Chrome、Edge、Brave 等），不使用任何 Edge 专属 API |
| CR-07 | 基于 Manifest V3 构建 |
| CR-08 | 界面支持**中文**与**英文**（通过 `_locales` 目录实现 Chrome 扩展国际化） |

### 3.2 非目标

- 修改或隐藏浏览器原生标签栏 / 竖版标签栏
- 拖拽排序树节点（后续版本）
- Tab Groups 集成（后续版本）
- 通过 `chrome.storage.sync` 跨设备同步树状态（后续版本）
- Firefox 支持

### 3.3 已知限制

| 限制 | 影响 |
|------|------|
| MV3 Service Worker 非持久化 | 树状态必须在每次变更时同步写入 `chrome.storage.local`；Service Worker 不能在内存中跨事件保持状态 |
| `openerTabId` 仅在浏览器能明确归因时才有值 | 部分通过 JS `window.open()` 打开的标签页可能无 `openerTabId`，会被识别为根节点 |
| Side Panel API 要求 Chromium ≥ 114 | 不支持更旧版本的 Chromium |
| 父节点关闭时需一次 UI 交互 | 提示必须以非阻塞方式呈现（使用侧边面板内的内联 UI，而非 `window.confirm`） |

---

## 4. 功能规格

### 4.1 树状面板

- 侧边面板将标签页树渲染为缩进列表。
- 每个节点显示：**网站图标**、**页面标题**、**域名（截断显示）**、**关闭按钮**。
- 当前激活（聚焦）的标签页高亮显示。
- 点击节点即切换到对应标签页。
- 节点可折叠 / 展开以隐藏子树。

### 4.2 父子关系建立

```
触发条件（须同时满足）：
  • chrome.tabs.onCreated 事件触发
  • event.tab.openerTabId 不为空
  • opener 标签页存在于当前树中

结果：
  • 新标签页作为 opener 标签页的子节点插入
  • 插入位置：追加在 opener 现有子节点的末尾
```

### 4.3 标签页关闭行为

```
情形 A — 叶节点（无子节点）：
  • 静默移除节点，无提示。

情形 B — 父节点（有子节点）：
  • 在侧边面板内显示内联提示：
      "正在关闭「页面标题」，其 X 个子标签页如何处理？"
      [提升为兄弟节点]   [一并关闭]
  • 提升为兄弟节点：每个直接子节点重新挂载到已关闭节点的父节点下
    （若已关闭节点为根节点，则子节点提升为根节点）。
  • 一并关闭：深度优先递归关闭所有子标签页，再移除该节点。
```

### 4.4 持久化

- 每次树状结构变更时，将序列化后的树写入 `chrome.storage.local`，键名为 `tabTree`。
- Service Worker 启动（或侧边面板加载）时，从存储中读取树并与当前实际标签页列表进行核对：删除已不存在的节点；将存在但不在树中的标签页作为根节点补充进来。

### 4.5 多窗口支持

- 每个浏览器窗口维护各自独立的树，以 `windowId` 为键。
- 侧边面板仅展示其所属窗口的树。

### 4.6 国际化（i18n）

- 使用 Chrome 扩展标准 `_locales` 目录结构。
- 提供 `_locales/zh_CN/messages.json`（中文）与 `_locales/en/messages.json`（英文）。
- 界面中所有文案（面板标题、提示语、按钮文字等）均通过 `chrome.i18n.getMessage()` 加载，不硬编码字符串。
- 默认语言跟随浏览器语言设置；不支持的语言回落到英文。

---

## 5. 架构设计

```
┌──────────────────────────────────────────────────────┐
│  Service Worker（background.js）                     │
│  • 监听：chrome.tabs.onCreated / onRemoved /         │
│           onActivated / onUpdated /                  │
│           onDetached / onAttached                    │
│  • 维护树状数据模型，写入 chrome.storage.local       │
│  • 处理父节点关闭的提示逻辑                          │
│  • 通过 chrome.runtime 消息与侧边面板通信            │
└───────────────────┬──────────────────────────────────┘
                    │ chrome.runtime 消息
┌───────────────────▼──────────────────────────────────┐
│  侧边面板（panel.html + panel.js）                   │
│  • 渲染树状 UI                                       │
│  • 分发用户操作（点击、关闭、提升/一并关闭）         │
│  • 接收 Service Worker 的树状态更新                  │
└──────────────────────────────────────────────────────┘
```

**存储数据模型（`chrome.storage.local`）：**

```jsonc
{
  "tabTree": {
    "<windowId>": {
      "roots": ["<tabId>", "..."],
      "nodes": {
        "<tabId>": {
          "tabId": 42,
          "parentId": null,          // null 表示根节点
          "children": [43, 44],
          "title": "示例页面",
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

### Milestone 0 — 项目初始化
- [ ] `manifest.json`（MV3，声明 `sidePanel`、`tabs`、`storage` 权限）
- [ ] Service Worker 最小骨架
- [ ] 侧边面板 HTML/JS 最小骨架
- [ ] `_locales/zh_CN` 与 `_locales/en` 基础文案文件
- [ ] 开发加载 / 热重载工作流

### Milestone 1 — 核心树逻辑（MVP）
- [ ] `chrome.tabs.onCreated` → 通过 `openerTabId` 建立父子关系
- [ ] `chrome.tabs.onRemoved` → 叶节点静默移除；父节点触发提示
- [ ] `chrome.tabs.onUpdated` → 同步节点的标题、URL、图标
- [ ] `chrome.tabs.onActivated` → 高亮当前激活节点
- [ ] 每次树变更写入 `chrome.storage.local`
- [ ] 启动时从存储加载并与实际标签页核对

### Milestone 2 — 侧边面板 UI
- [ ] 递归渲染缩进树列表
- [ ] 激活标签页高亮
- [ ] 点击节点 → 调用 `chrome.tabs.update` 切换焦点
- [ ] 每个节点的关闭按钮
- [ ] 父节点关闭的内联提示（提升 / 一并关闭）
- [ ] 子树折叠 / 展开

### Milestone 3 — 多窗口支持
- [ ] 按 `windowId` 分隔独立树
- [ ] 侧边面板仅展示本窗口的树

### Milestone 4 — 健壮性与完善
- [ ] 启动核对（清理已关闭的节点，将孤立标签页补充为根节点）
- [ ] 处理标签页跨窗口移动（`chrome.tabs.onDetached` / `onAttached`）
- [ ] 当 `chrome.sidePanel` 不可用时（Chromium < 114）优雅降级
- [ ] 面板内键盘导航（无障碍访问）
- [ ] 中英文文案完整覆盖

### Milestone 5 — 后续功能（Backlog）
- [ ] 拖拽节点排序
- [ ] Tab Groups 集成
- [ ] 通过 `chrome.storage.sync` 跨设备同步
- [ ] 面板内搜索 / 过滤
- [ ] "全部折叠" / "全部展开" 控件

---

## 7. 技术栈

| 层次 | 选型 | 理由 |
|------|------|------|
| 扩展平台 | Manifest V3 | Chrome Web Store 要求 |
| 后台 | Service Worker（原生 JS） | MV3 默认方式；事件处理无需框架 |
| 侧边面板 UI | 原生 JS + CSS（MVP）/ React（复杂度增长后） | MVP 阶段无需构建步骤，包体小 |
| 存储 | `chrome.storage.local` | 跨会话持久化；标签树体量不存在配额问题 |
| 国际化 | Chrome `_locales` + `chrome.i18n` API | 扩展平台标准方案 |
| 构建工具 | Vite + `@crxjs/vite-plugin`（可选） | 扩展开发零配置热更新 |

---

## 8. 开发环境搭建

> 前置条件：Node.js ≥ 18，Chrome / Edge ≥ 114

```bash
# 1. 安装依赖（添加 package.json 后执行）
npm install

# 2. 构建（MVP 阶段若无构建步骤可直接跳过）
npm run build

# 3. 加载未打包扩展
# Chrome/Edge → chrome://extensions → 开启开发者模式 → 加载已解压的扩展 → 选择 dist/ 目录
```

