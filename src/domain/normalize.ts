/**
 * 入力の正規化（データ設計書 1.2〜1.3 節、1.5 節）。検証の前に必ず通す。
 */
import type { ChecklistInput, ChecklistItemInput } from "./types";

/** 改行を半角スペース 1 個にして前後の空白を除く（タイトル用） */
const singleLine = (s: string) => s.replace(/\r\n|\r|\n/g, " ").trim();

/** 改行を \n に統一して前後の空白を除く（説明・補足メモ用） */
const multiLine = (s: string) => s.replace(/\r\n|\r/g, "\n").trim();

export function normalizeChecklistInput(input: ChecklistInput): ChecklistInput {
  return {
    title: singleLine(input.title),
    description: multiLine(input.description),
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter((tag) => tag !== ""))],
    items: input.items.map(normalizeItem),
  };
}

function normalizeItem(item: ChecklistItemInput): ChecklistItemInput {
  const url = item.url?.trim() ?? "";
  const normalized: ChecklistItemInput = {
    title: singleLine(item.title),
    note: multiLine(item.note),
    url: url === "" ? null : url,
    dueDate: item.dueDate === "" ? null : item.dueDate,
  };
  return item.id === undefined ? normalized : { id: item.id, ...normalized };
}
