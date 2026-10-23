import type { Checklist } from "@/domain/types";

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
