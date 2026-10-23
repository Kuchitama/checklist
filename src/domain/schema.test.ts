import { describe, expect, it } from "vitest";
import type { ChecklistItemInput } from "@/domain/types";
import { EMOJI_TITLE, makeBoundaryMaxInput, makeChecklistInput, repeat } from "@/test/fixtures";
import { validateChecklistInput } from "./schema";

const item = (overrides: Partial<ChecklistItemInput> = {}): ChecklistItemInput => ({
  title: "項目",
  note: "",
  url: null,
  dueDate: null,
  ...overrides,
});

describe("validateChecklistInput", () => {
  it("上限ちょうどの入力を通す", () => {
    expect(validateChecklistInput(makeBoundaryMaxInput())).toEqual([]);
  });

  it.each([
    ["タイトル", { title: repeat("あ", 101) }, ["title"], "タイトルは 100 文字以内です"],
    ["説明", { description: repeat("あ", 1001) }, ["description"], "説明は 1000 文字以内です"],
    ["タグ", { tags: [repeat("あ", 31)] }, ["tags", 0], "タグは 30 文字以内です"],
  ])("%sが上限 + 1 文字なら too_long で拒否する", (_, overrides, path, message) => {
    expect(validateChecklistInput(makeChecklistInput(overrides))).toEqual([
      { path, code: "too_long", message },
    ]);
  });

  it.each([
    ["項目名", { title: repeat("あ", 201) }, "title", "項目名は 200 文字以内です"],
    ["補足メモ", { note: repeat("あ", 2001) }, "note", "補足メモは 2000 文字以内です"],
    [
      "URL",
      { url: `https://example.com/${repeat("a", 2000 - 20 + 1)}` },
      "url",
      "URL は 2000 文字以内です",
    ],
  ])("%sが上限 + 1 文字なら too_long で拒否する", (_, overrides, field, message) => {
    expect(validateChecklistInput(makeChecklistInput({ items: [item(overrides)] }))).toEqual([
      { path: ["items", 0, field], code: "too_long", message },
    ]);
  });

  it("タグが 21 個なら too_many で拒否する", () => {
    const tags = Array.from({ length: 21 }, (_, i) => `タグ${i}`);
    expect(validateChecklistInput(makeChecklistInput({ tags }))).toEqual([
      { path: ["tags"], code: "too_many", message: "タグは 20 個までです" },
    ]);
  });

  it("項目が 501 件なら too_many で拒否する", () => {
    const items = Array.from({ length: 501 }, () => item());
    expect(validateChecklistInput(makeChecklistInput({ items }))).toEqual([
      { path: ["items"], code: "too_many", message: "項目は 500 件までです" },
    ]);
  });

  it("文字数をコードポイント数で数える（絵文字と結合文字）", () => {
    // UTF-16 の長さはコードポイント数より長い
    expect(EMOJI_TITLE.length).toBeGreaterThan(Array.from(EMOJI_TITLE).length);
    const count = Array.from(EMOJI_TITLE).length;
    const atLimit = repeat(EMOJI_TITLE, Math.floor(100 / count));
    expect(Array.from(atLimit).length).toBeLessThanOrEqual(100);
    expect(atLimit.length).toBeGreaterThan(100);
    expect(validateChecklistInput(makeChecklistInput({ title: atLimit }))).toEqual([]);

    const over = repeat("あ", 101 - count) + EMOJI_TITLE;
    expect(validateChecklistInput(makeChecklistInput({ title: over }))).toEqual([
      { path: ["title"], code: "too_long", message: "タイトルは 100 文字以内です" },
    ]);
  });

  it("空のタイトルと項目名を required で拒否する", () => {
    expect(
      validateChecklistInput(
        makeChecklistInput({ title: "", items: [item(), item({ title: "" })] }),
      ),
    ).toEqual([
      { path: ["title"], code: "required", message: "タイトルを入力してください" },
      {
        path: ["items", 1, "title"],
        code: "required",
        message: "項目名を入力してください（不要な行は削除してください）",
      },
    ]);
  });

  it.each(["ftp://example.com/a", "javascript:alert(1)", "example.com"])(
    "http(s) 以外の URL（%s）を invalid_url で拒否する",
    (url) => {
      expect(validateChecklistInput(makeChecklistInput({ items: [item({ url })] }))).toEqual([
        {
          path: ["items", 0, "url"],
          code: "invalid_url",
          message: "http または https の URL を入力してください",
        },
      ]);
    },
  );

  it("http と https の URL を通す", () => {
    const items = [item({ url: "http://example.com" }), item({ url: "https://example.com/a?b=c" })];
    expect(validateChecklistInput(makeChecklistInput({ items }))).toEqual([]);
  });

  it.each(["2026-02-30", "2026-13-01", "2026/10/20", "20261020"])(
    "存在しない日付や形式違い（%s）を invalid_date で拒否する",
    (dueDate) => {
      expect(validateChecklistInput(makeChecklistInput({ items: [item({ dueDate })] }))).toEqual([
        {
          path: ["items", 0, "dueDate"],
          code: "invalid_date",
          message: "存在する日付を入力してください",
        },
      ]);
    },
  );

  it("うるう年の 2 月 29 日を通す", () => {
    expect(
      validateChecklistInput(makeChecklistInput({ items: [item({ dueDate: "2028-02-29" })] })),
    ).toEqual([]);
  });

  it("型が違う値は汎用の文言で invalid_type にする", () => {
    const input = { ...makeChecklistInput(), title: 1 } as unknown as Parameters<
      typeof validateChecklistInput
    >[0];
    expect(validateChecklistInput(input)).toEqual([
      { path: ["title"], code: "invalid_type", message: "値の形式が正しくありません" },
    ]);
  });

  it("表にない（code, フィールド）の組み合わせは汎用の文言にする", () => {
    // 正規化を通さずに空のタグを渡すと（required, タグ）になる。表にないので汎用の文言
    expect(validateChecklistInput(makeChecklistInput({ tags: [""] }))).toEqual([
      { path: ["tags", 0], code: "required", message: "入力してください" },
    ]);
  });
});
