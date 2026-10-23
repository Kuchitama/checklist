// PreToolUse（Bash）: CLAUDE.md 8 章の禁止事項に当たるコマンドを拒否する（仕様書 12.2 節 H-3）。
// 終了コード 2 で拒否し、理由を stderr に出す。
//
// 判定はコマンド文字列をシェル風に分割した「単語列」に対して行う。
// - ヒアドキュメントの本文（文書やコミットメッセージ）は判定しない
// - 引用された引数（rm "a.test.ts" など）は引用を外した単語として判定する
// - echo "rm a.test.ts" のように、引数の中に禁止語が現れるだけでは拒否しない
const input = JSON.parse(await readStdin());
const command = String(input?.tool_input?.command ?? "");

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const PREFIX_WORDS = new Set(["sudo", "env", "time", "nice", "exec", "command", "builtin"]);

const rules = [
  {
    name: "no-verify",
    test: (argv) =>
      argv[0] === "git" &&
      ["commit", "push", "merge"].includes(argv[1]) &&
      argv.includes("--no-verify"),
    reason:
      "--no-verify でフックを飛ばすことは禁止（CLAUDE.md 8 章）。pnpm verify を通してから push する。",
  },
  {
    name: "rm-test",
    test: (argv) =>
      (argv[0] === "rm" && argv.slice(1).some((a) => TEST_FILE.test(a))) ||
      (argv[0] === "git" && argv[1] === "rm" && argv.slice(2).some((a) => TEST_FILE.test(a))),
    reason:
      "テストファイルの削除は禁止（CLAUDE.md 8 章）。テストを減らす変更は理由を PR 本文に書き、人が判断する。",
  },
  {
    name: "force-push-main",
    test: (argv) => {
      if (argv[0] !== "git" || argv[1] !== "push") return false;
      const args = argv.slice(2);
      const force = args.some(
        (a) => a === "--force" || a === "-f" || a.startsWith("--force-with-lease"),
      );
      const targetsMain = args.some((a) => a === "main" || a.endsWith(":main") || a === "+main");
      return force && targetsMain;
    },
    reason: "main への force push は禁止（CLAUDE.md 3 章・8 章）。",
  },
  {
    name: "package-manager",
    test: (argv) => ["npm", "npx", "yarn"].includes(argv[0]),
    reason:
      "パッケージマネージャは pnpm のみ（CLAUDE.md 3 章）。npm / npx / yarn は使わない。pnpm dlx を使う。",
  },
];

for (const argv of splitCommands(stripHeredocs(command))) {
  for (const rule of rules) {
    if (rule.test(argv)) {
      process.stderr.write(`${rule.reason}\n`);
      process.exit(2);
    }
  }
}

/** ヒアドキュメント本文を取り除く（<<EOF ... EOF、<<-EOF、<<'EOF'、<<"EOF"） */
function stripHeredocs(src) {
  return src.replace(
    /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g,
    "<<HEREDOC",
  );
}

/**
 * コマンド文字列を単純コマンドごとの単語列に分割する。
 * 引用とバックスラッシュを解釈し、| || && ; & 改行 ( ) $( で区切る。
 */
function splitCommands(src) {
  const commands = [];
  let argv = [];
  let word = "";
  let inWord = false;
  const flush = () => {
    if (inWord) argv.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    flush();
    if (argv.length > 0) commands.push(normalize(argv));
    argv = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const body = end === -1 ? src.slice(i + 1) : src.slice(i + 1, end);
      word += body;
      inWord = true;
      i = end === -1 ? src.length : end;
    } else if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          word += src[j + 1];
          j += 2;
        } else {
          word += src[j];
          j += 1;
        }
      }
      inWord = true;
      i = j;
    } else if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") {
        word += src[i + 1];
        inWord = true;
      }
      i += 1;
    } else if (c === "|" || c === "&" || c === ";" || c === "\n" || c === "(" || c === ")") {
      endCommand();
      if (c === "$") i += 1;
    } else if (c === "$" && src[i + 1] === "(") {
      endCommand();
      i += 1;
    } else if (c === " " || c === "\t") {
      flush();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

/** sudo / env / 変数代入などの前置きを外し、コマンド本体から始まる単語列にする */
function normalize(argv) {
  let i = 0;
  while (
    i < argv.length &&
    (PREFIX_WORDS.has(argv[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[i]))
  ) {
    i += 1;
  }
  const rest = argv.slice(i);
  // パスつきの呼び出し（/usr/bin/git など）はベース名で判定する
  if (rest.length > 0) rest[0] = rest[0].replace(/^.*\//, "");
  return rest;
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
