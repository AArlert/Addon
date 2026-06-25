/**
 * 把构建产物同步到 release/ 文件夹，得到可直接安装到 Obsidian 的插件文件集。
 *
 * 由 `npm run release` 调用（其前置 `npm run build` 已生成根目录 main.js）。
 * 复制清单：main.js + manifest.json + styles.css。每个开发周期结束都应运行，
 * 以保证 release/ 始终是「可供 Obsidian 实测的最新产物」。
 */
import { copyFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release");
mkdirSync(outDir, { recursive: true });

const files = ["main.js", "manifest.json", "styles.css"];
for (const f of files) {
	copyFileSync(join(root, f), join(outDir, f));
	console.log(`synced release/${f}`);
}
console.log("release/ 已更新——可直接复制到 <Vault>/.obsidian/plugins/obsidian-auto-headings/");
