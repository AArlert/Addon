# Auto Headings — 可分发插件文件

本文件夹（`release/`）由 `npm run release` 生成，提供两种取用方式：

**A. 三个独立文件**（直接拖放安装）：

- `main.js` — 打包后的插件代码
- `manifest.json` — 插件清单
- `styles.css` — 设置面板样式

**B. 打包 zip**：`obsidian-auto-headings.zip` —— 内含一个 `obsidian-auto-headings/`
文件夹，里面就是上面三个文件。下载、解压即得标准插件目录，也便于日后发布 GitHub Release。

## 安装

**方式一（zip）**：下载 `obsidian-auto-headings.zip`，解压后把整个 `obsidian-auto-headings/`
文件夹放进 `<你的 Vault>/.obsidian/plugins/`。

**方式二（独立文件）**：把三个文件复制到你的 Vault 插件目录：

```
<你的 Vault>/.obsidian/plugins/obsidian-auto-headings/
├── main.js
├── manifest.json
└── styles.css
```

然后在 Obsidian：**设置 → 第三方插件 → 启用「Auto Headings」**。

首次启用会在该插件文件夹下自动生成 `templates/default.json`（默认模板）。

## 使用要点（v0.6.0）

**设置面板**

- 顶部为**全局自动编号**开关（与命令面板「切换自动编号（全局）」双向同步）。
- **防抖延迟**滑块（50–2000ms）：控制编辑停顿后多久触发自动编号，默认 300ms。
- **模板**区可「+ 新增模板」、删除、展开编辑：为 H1–H6 各级设置前缀 / 序号样式
  （阿拉伯·中文·带圈·字母）/ 序号间隔符 / 后缀 / 标题间隔符 / 继承前级，实时预览；
  每模板另有起始层级 `topLevel`、跳级占位 `skipFill`、白名单编辑器。
- **路径规则表**：把文件夹 / 文件映射到对应模板，`/` 根规则即全局默认。
- **危险区域 → 「清除全库编号」**：一次性剥除全库所有 Markdown 文件的编号前缀，还原裸标题，需二次确认。

**命令面板**

| 命令 | 说明 |
|------|------|
| 切换自动编号（全局） | 与面板开关联动 |
| 立即重新编号（当前文件） | 绕过防抖与全局关、立即触发一次 |
| **清除当前文件编号** | 剥除当前文件所有编号前缀，还原裸标题，可撤销 |

**单文件开关**（frontmatter 复选框属性）

在 Obsidian 属性面板勾选 / 取消 `obsidian-auto-headings`，或手动写入：

```yaml
---
obsidian-auto-headings: true   # 勾选 → 强制开（覆盖全局关）
# obsidian-auto-headings: false  # 取消勾选 → 强制关（立即重新编号命令仍可手动触发）
---
```
