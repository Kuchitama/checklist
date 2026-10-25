/**
 * ドメイン層の API（仕様書 6 章、データ設計書 4 章）。
 * UI からの読み書きはここを通し、Dexie を直接触るのはこのモジュールだけにする。
 */
import { db } from "@/db";
import { ChecklistNotFoundError, ChecklistValidationError } from "./errors";
import { normalizeChecklistInput } from "./normalize";
import { messageFor, validateChecklistInput } from "./schema";
import type {
  Checklist,
  ChecklistInput,
  ChecklistItem,
  ExportFile,
  ValidationIssue,
} from "./types";

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
 * 既存のリストを入力で置き換える（データ設計書 4 章）。項目はデータ設計書 4.1 節の規則でマージし、
 * id を持つ既存項目は checked / checkedAt を引き継ぐ。読み取りから書き込みまでを 1 トランザクションで行う。
 * 検証に通らなければ ChecklistValidationError、リストがなければ ChecklistNotFoundError を投げ、何も保存しない。
 */
export async function updateChecklist(id: string, input: ChecklistInput): Promise<Checklist> {
  const normalized = normalizeChecklistInput(input);
  const issues = validateChecklistInput(normalized);
  if (issues.length > 0) throw new ChecklistValidationError(issues);

  return db.transaction("rw", db.checklists, async () => {
    const current = await db.checklists.get(id);
    if (!current) throw new ChecklistNotFoundError(`リストがありません: ${id}`);

    const existing = new Map(current.items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const unknown: ValidationIssue[] = [];
    const items: ChecklistItem[] = normalized.items.map((item, index) => {
      const previous = item.id === undefined ? undefined : existing.get(item.id);
      // 既存にない id や同じ id の繰り返しは、編集画面の改変か古い画面からの保存。拒否して読み込み直してもらう（4.1 節の 3）
      const invalid = item.id !== undefined && (!previous || seen.has(item.id));
      if (item.id !== undefined) seen.add(item.id);
      if (invalid) {
        unknown.push({
          path: ["items", index, "id"],
          code: "unknown_id",
          message: messageFor("unknown_id", undefined),
        });
      }
      return {
        id: previous?.id ?? crypto.randomUUID(),
        title: item.title,
        note: item.note,
        url: item.url,
        dueDate: item.dueDate,
        checked: previous?.checked ?? false,
        checkedAt: previous?.checkedAt ?? null,
      };
    });
    if (unknown.length > 0) throw new ChecklistValidationError(unknown);

    const checklist: Checklist = {
      ...current,
      title: normalized.title,
      description: normalized.description,
      tags: normalized.tags,
      items,
      updatedAt: now(),
    };
    await db.checklists.put(checklist);
    return checklist;
  });
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

/**
 * リストを書き出しファイルの形にする（仕様書 4 章、データ設計書 5.1 節）。
 * id・createdAt・updatedAt・checked・checkedAt と項目の id は含めない（FR-31）。項目の順序はそのまま。
 */
export async function exportChecklist(id: string): Promise<ExportFile> {
  const checklist = await db.checklists.get(id);
  if (!checklist) throw new ChecklistNotFoundError(`リストがありません: ${id}`);
  return {
    format: "checklist-export",
    version: 1,
    exportedAt: now(),
    checklist: {
      title: checklist.title,
      description: checklist.description,
      tags: checklist.tags,
      items: checklist.items.map((item) => ({
        title: item.title,
        note: item.note,
        url: item.url,
        dueDate: item.dueDate,
      })),
    },
  };
}

/** 書き出しファイルの文字列。2 スペース整形（データ設計書 5.3 節の上限の根拠はこの整形を前提にしている）、末尾に改行 */
export function serializeExportFile(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * 解析済みの読み込みファイルを新しいリストとして保存する（仕様書 4.3 節、FR-32〜34）。
 * 新しい id と項目の id を採番し、checked=false、checkedAt=null、createdAt=updatedAt=現在時刻にする。
 * 同名のリストがあっても上書きせず、常に新規に追加する。正規化・検証は createChecklist と同じ。
 */
export async function importChecklist(file: ExportFile): Promise<Checklist> {
  return createChecklist(file.checklist);
}
