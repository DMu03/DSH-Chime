/**
 * 构建 lib/client.js：把 lib/recipes.js + lib/synth.js（可打包 ESM）
 * 与 lib/client-entry.js（CJS）拼成 __ModuleLoader__ 工厂 bundle。
 *
 * 用法：
 *   node scripts/build.mjs          # 生成 lib/client.js
 *   node scripts/build.mjs --check  # 只校验现有产物能否解析
 *
 * 这里不做通用打包，只转换本包自己约定的两种写法：
 *   - `import { ... } from "./x.js";`  → 删除（合并到同一作用域）
 *   - `export const/function ...`     → 去掉 export
 *   - `export { ... };`               → 删除
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "lib", "client.js");

function toBundledScope(source, label) {
  const lines = source.split("\n");
  const out = [];
  let inImport = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (inImport) {
      if (/(from\s+["'][^"']+["']\s*;?|;\s*)$/.test(trimmed)) inImport = false;
      continue;
    }
    if (/^import\s/.test(trimmed)) {
      if (!/(from\s+["'][^"']+["']\s*;?|;\s*)$/.test(trimmed)) inImport = true;
      continue;
    }
    if (/^export\s*\{[^}]*\}\s*;?\s*$/.test(trimmed)) continue;
    out.push(line.replace(/^(\s*)export\s+(const|function|let|var|class)\b/, "$1$2"));
  }
  return `//#region ${label}\n${out.join("\n")}\n//#endregion`;
}

export function buildBundle() {
  const recipes = toBundledScope(readFileSync(join(root, "lib", "recipes.js"), "utf8"), "lib/recipes.js");
  const synth = toBundledScope(readFileSync(join(root, "lib", "synth.js"), "utf8"), "lib/synth.js");
  const entry = readFileSync(join(root, "lib", "client-entry.js"), "utf8");

  const bundle = `// Generated from lib/recipes.js + lib/synth.js + lib/client-entry.js by scripts/build.mjs. Do not edit.
(() => {
	const __CHIME_MODULE_URL__ = typeof document !== "undefined" ? document.currentScript?.src : undefined;
	window.__ModuleLoader__.load({
		id: "dsh-done-chime",
		factory: (require) => {
			var module = { exports: {} };
			var exports = module.exports;
${recipes}

${synth}

//#region lib/client-entry.js
${entry}
//#endregion
			return module.exports;
		}
	});
})();
`;
  writeFileSync(outFile, bundle, "utf8");
  return outFile;
}

function checkBundle() {
  if (!existsSync(outFile)) {
    console.error("lib/client.js 不存在，请先运行 node scripts/build.mjs");
    process.exit(1);
  }
  execFileSync(process.execPath, ["--check", outFile], { stdio: "inherit" });
  const text = readFileSync(outFile, "utf8");
  for (const needle of ["__ModuleLoader__.load", "dsh-done-chime", "function play", "sidebar.panellist"]) {
    if (!text.includes(needle)) {
      console.error(`产物缺少关键片段：${needle}`);
      process.exit(1);
    }
  }
  console.log("lib/client.js 校验通过");
}

const mode = process.argv[2] || "";
if (mode === "--check") {
  checkBundle();
} else {
  const out = buildBundle();
  checkBundle();
  console.log(`已生成 ${out}`);
}
