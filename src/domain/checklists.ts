/**
 * ドメイン層の API（仕様書 6 章、データ設計書 4 章）。
 * UI からの読み書きはここを通し、Dexie を直接触るのはこのモジュールだけにする。
 */
import { db } from "@/db";
import type { Checklist } from "./types";

/** すべてのリストを updatedAt の降順で返す */
export async function listChecklists(): Promise<Checklist[]> {
  return db.checklists.orderBy("updatedAt").reverse().toArray();
}
