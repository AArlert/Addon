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

## 使用要点（Milestone 3）

- 设置面板顶部为**全局开关**。
- **模板**区可「+ 新增模板」、删除、展开编辑：为 H2–H6 各级设置前缀 / 序号样式
  （阿拉伯·中文·带圈·字母）/ 序号间隔符 / 标题间隔符 / 继承前级，并有实时预览。
- 目前所有文件统一使用「默认」模板；编辑「默认」即可改变编号效果。
- 命令面板：「切换自动编号（全局）」「立即重新编号（当前文件）」。

> 白名单匹配（M4）、按路径选模板（M5）见 `../doc/spec.md` 的 Roadmap。
