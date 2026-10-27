import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 変更の説明（public/explain-diff/、.claude/skills/explain-diff-html/SKILL.md）。
 * GitHub Pages の /checklist/explain-diff/ に置く静的な HTML で、アプリの一部ではない。
 * 一覧（index.html）とファイルの対応と、外部の資源を読み込まないこと（要件 NFR-07）を確かめる
 */
// テスト環境（jsdom）では import.meta.url がファイルの URL にならないので、リポジトリの直下から辿る
const dir = join(process.cwd(), "public", "explain-diff");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const pages = readdirSync(dir).filter((name) => name !== "index.html");
const index = read("index.html");
const linked = [...index.matchAll(/<a\s[^>]*href="\.\/([^"]+)"/g)].map((match) => match[1]);

describe("変更の説明", () => {
  it("ファイル名は日付で始まる HTML だけ", () => {
    for (const name of pages) {
      expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.html$/);
    }
  });

  it("一覧はすべてのファイルを新しい順に 1 回ずつ載せ、存在しないファイルを載せない", () => {
    expect(linked).toEqual([...pages].sort().reverse());
  });

  it("説明がないときだけ「まだありません」を出す", () => {
    expect(index.includes("まだありません")).toBe(pages.length === 0);
  });

  it.each(["index.html", ...pages])("%s は外部の資源を読み込まない", (name) => {
    const html = read(name);
    // 押したときに開くリンク（a 要素）は通信を起こさないので対象外。読み込みを起こす属性と CSS だけを見る
    expect(html).not.toMatch(/<(script|img|iframe|source|video|audio)\s[^>]*src="(https?:)?\/\//i);
    expect(html).not.toMatch(/<link\s[^>]*href="(https?:)?\/\//i);
    expect(html).not.toMatch(/(@import|url\()\s*["']?(https?:)?\/\//i);
    expect(html).toMatch(/<html lang="ja">/);
  });
});
