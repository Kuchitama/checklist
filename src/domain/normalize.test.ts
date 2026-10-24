import { describe, expect, it } from "vitest";
import { makeChecklistInput } from "@/test/fixtures";
import { normalizeChecklistInput } from "./normalize";

describe("normalizeChecklistInput", () => {
  it("タイトルの改行を半角スペースにし、前後の空白を除く", () => {
    const result = normalizeChecklistInput(
      makeChecklistInput({ title: "  リリース\r\n手順\n第2版\r  " }),
    );
    expect(result.title).toBe("リリース 手順 第2版");
  });

  it("説明の改行を \\n に統一し、前後の空白を除く", () => {
    const result = normalizeChecklistInput(
      makeChecklistInput({ description: "\n 1 行目\r\n2 行目\r3 行目 \n" }),
    );
    expect(result.description).toBe("1 行目\n2 行目\n3 行目");
  });

  it("タグの前後の空白を除き、空文字と重複を除き、入力順を保つ", () => {
    const result = normalizeChecklistInput(
      makeChecklistInput({ tags: [" 仕事 ", "家", "", "  ", "仕事", "リリース", "家"] }),
    );
    expect(result.tags).toEqual(["仕事", "家", "リリース"]);
  });

  it("項目のタイトル・メモ・URL・期限を正規化する", () => {
    const result = normalizeChecklistInput(
      makeChecklistInput({
        items: [
          { title: " 持ち物\nを確認 ", note: "\r\nメモ\r\n", url: "  ", dueDate: "" },
          {
            id: "item-1",
            title: "予約",
            note: "",
            url: " https://example.com/a ",
            dueDate: "2026-10-20",
          },
        ],
      }),
    );
    expect(result.items).toEqual([
      { title: "持ち物 を確認", note: "メモ", url: null, dueDate: null },
      {
        id: "item-1",
        title: "予約",
        note: "",
        url: "https://example.com/a",
        dueDate: "2026-10-20",
      },
    ]);
  });

  it("新規項目には id を付けない", () => {
    const result = normalizeChecklistInput(
      makeChecklistInput({ items: [{ title: "a", note: "", url: null, dueDate: null }] }),
    );
    expect(result.items[0]).not.toHaveProperty("id");
  });
});
