import Dexie, { type EntityTable } from "dexie";
import type { Checklist } from "../domain/types";

/**
 * IndexedDB（Dexie）の定義。データ設計書 3 章。
 * スキーマを変えるときは version(n + 1) を追加し、過去の version 宣言は残す。
 */
export const db = new Dexie("checklist") as Dexie & {
  checklists: EntityTable<Checklist, "id">;
};

db.version(1).stores({
  checklists: "id, updatedAt, *tags",
});
