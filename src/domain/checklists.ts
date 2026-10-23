/**
 * ドメイン層の API（仕様書 6 章、データ設計書 4 章）。
 * UI からの読み書きはここを通し、Dexie を直接触るのはこのモジュールだけにする。
 */
import { db } from "@/db";
import { ChecklistNotFoundError, ChecklistValidationError } from "./errors";
import { normalizeChecklistInput } from "./normalize";
import { validateChecklistInput } from "./schema";
import type { Checklist, ChecklistInput } from "./types";

const now = () => new Date().toISOString();

/** すべてのリストを updatedAt の降順で返す */
export async function listChecklists(): Promise<Checklist[]> {
  return db.checklists.orderBy("updatedAt").reverse().toArray();
}

/** id のリストを返す。見つからなければ undefined（例外にしない） */
export async function getChecklist(id: string): Promise<Checklist | undefined> {
  return db.checklists.get(id);
}

/**
 * 入力を正規化・検証して新しいリストを保存する。項目の id は入力に関係なく採番し直す。
 * 検証に通らなければ ChecklistValidationError を投げ、何も保存しない。
 */
export async function createChecklist(input: ChecklistInput): Promise<Checklist> {
  const normalized = normalizeChecklistInput(input);
  const issues = validateChecklistInput(normalized);
  if (issues.length > 0) throw new ChecklistValidationError(issues);

  const timestamp = now();
  const checklist: Checklist = {
    id: crypto.randomUUID(),
    title: normalized.title,
    description: normalized.description,
    tags: normalized.tags,
    items: normalized.items.map((item) => ({
      id: crypto.randomUUID(),
      title: item.title,
      note: item.note,
      url: item.url,
      dueDate: item.dueDate,
      checked: false,
      checkedAt: null,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.transaction("rw", db.checklists, async () => {
    await db.checklists.add(checklist);
  });
  return checklist;
}

/**
 * 項目のチェック状態を変える。checkedAt は checked なら現在時刻、外したら null。
 * 読み取りから書き込みまでを 1 トランザクションで行い、連打や並行呼び出しで更新を失わない（データ設計書 3.2 節）。
 */
export async function toggleItem(listId: string, itemId: string, checked: boolean): Promise<void> {
  await db.transaction("rw", db.checklists, async () => {
    const list = await db.checklists.get(listId);
    if (!list) throw new ChecklistNotFoundError(`リストがありません: ${listId}`);
    if (!list.items.some((item) => item.id === itemId)) {
      throw new ChecklistNotFoundError(`項目がありません: ${itemId}`);
    }
    const timestamp = now();
    await db.checklists.put({
      ...list,
      items: list.items.map((item) =>
        item.id === itemId ? { ...item, checked, checkedAt: checked ? timestamp : null } : item,
      ),
      updatedAt: timestamp,
    });
  });
}

/** 全項目のチェックを外す。項目の数・順序・内容は変えない */
export async function resetChecklist(id: string): Promise<void> {
  await db.transaction("rw", db.checklists, async () => {
    const list = await db.checklists.get(id);
    if (!list) throw new ChecklistNotFoundError(`リストがありません: ${id}`);
    await db.checklists.put({
      ...list,
      items: list.items.map((item) => ({ ...item, checked: false, checkedAt: null })),
      updatedAt: now(),
    });
  });
}

/** リストを削除する。存在しなくても成功扱い（冪等） */
export async function deleteChecklist(id: string): Promise<void> {
  await db.checklists.delete(id);
}
