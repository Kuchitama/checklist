// PreToolUse（Bash）: CLAUDE.md 8 章の禁止事項に当たるコマンドを拒否する（仕様書 12.2 節 H-3）。
// 終了コード 2 で拒否し、理由を stderr に出す。
// ヒアドキュメントや引用文字列の中身（文書やコミットメッセージの本文）は判定しない。
const input = JSON.parse(await readStdin());
const command = stripLiterals(String(input?.tool_input?.command ?? ""));

const rules = [
  {
    test: /\bgit\s+(commit|push|merge)\b[^|;&\n]*--no-verify\b/,
    reason:
      "--no-verify でフックを飛ばすことは禁止（CLAUDE.md 8 章）。pnpm verify を通してから push する。",
  },
  {
    test: /(^|[|;&]\s*)(rm|git\s+rm)\s[^|;&\n]*\.(test|spec)\.[cm]?[jt]sx?\b/m,
    reason:
      "テストファイルの削除は禁止（CLAUDE.md 8 章）。テストを減らす変更は理由を PR 本文に書き、人が判断する。",
  },
  {
    test: /\bgit\s+push\b[^|;&\n]*(--force\b|\s-f\b|--force-with-lease\b)[^|;&\n]*\b(main)\b/,
    reason: "main への force push は禁止（CLAUDE.md 3 章・8 章）。",
  },
  {
    test: /(^|[|;&]\s*)(npm|npx|yarn)\s/m,
    reason:
      "パッケージマネージャは pnpm のみ（CLAUDE.md 3 章）。npm / npx / yarn は使わない。pnpm dlx を使う。",
  },
];

for (const rule of rules) {
  if (rule.test.test(command)) {
    process.stderr.write(`${rule.reason}\n`);
    process.exit(2);
  }
}

/** ヒアドキュメント本文と引用文字列を取り除き、コマンドの骨格だけを残す */
function stripLiterals(src) {
  return src
    .replace(
      /<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(?=\n|$)/g,
      "<<HEREDOC",
    )
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''");
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
