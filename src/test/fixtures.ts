import type { Checklist, ChecklistInput } from "@/domain/types";

/** テスト用のリストを作る。内容は架空（CLAUDE.md 10 章） */
export function makeChecklist(overrides: Partial<Checklist> & Pick<Checklist, "id">): Checklist {
  return {
    title: "テスト用リスト",
    description: "",
    tags: [],
    items: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** テスト用の入力を作る（データ設計書 1.4 節） */
export function makeChecklistInput(overrides: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    title: "テスト用リスト",
    description: "",
    tags: [],
    items: [],
    ...overrides,
  };
}

/** 文字列 s を n 回繰り返す */
export function repeat(s: string, n: number): string {
  return s.repeat(n);
}

/**
 * 絵文字と結合文字を含むタイトル（データ設計書 7 章 emoji-title）。
 * UTF-16 の長さ（12）がコードポイント数（8）より長い。
 */
export const EMOJI_TITLE = "🎉👨\u200d👩\u200d👧か\u3099";

/** すべてのフィールドが上限ちょうどの入力（データ設計書 7 章 boundary-max） */
export function makeBoundaryMaxInput(): ChecklistInput {
  return {
    title: repeat("あ", 100),
    description: repeat("あ", 1000),
    tags: Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, "0")}${repeat("あ", 28)}`),
    items: Array.from({ length: 500 }, () => ({
      title: repeat("あ", 200),
      note: repeat("あ", 2000),
      url: `https://example.com/${repeat("a", 2000 - 20)}`,
      dueDate: "2026-12-31",
    })),
  };
}
