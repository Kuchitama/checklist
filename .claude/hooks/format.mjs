// PostToolUse（Edit / Write）: 編集したファイルを Biome で整形する（仕様書 12.2 節 H-3）。
// 失敗しても作業を止めない（終了コード 0）。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const input = JSON.parse(await readStdin());
const file = input?.tool_response?.filePath ?? input?.tool_input?.file_path;
const targets = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css", ".html"]);

if (typeof file === "string" && targets.has(path.extname(file)) && existsSync(file)) {
  const rel = path.relative(root, file);
  if (!rel.startsWith("..") && !rel.startsWith("node_modules")) {
    spawnSync("pnpm", ["exec", "biome", "check", "--write", "--no-errors-on-unmatched", file], {
      cwd: root,
      stdio: "ignore",
    });
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", () => resolve(data || "{}"));
  });
}
