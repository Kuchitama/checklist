/**
 * 読み込みファイルの解析（仕様書 4.3 節、データ設計書 5.3 節）。DB は触らない。
 * 保存は checklists.ts の importChecklist が行う。
 */
import { exportFileV1Schema, toValidationIssues } from "./schema";
import type { ExportFile, ImportError, Result } from "./types";

/**
 * 読み込めるファイルの上限（バイト）。各フィールドが上限いっぱいのリストを本アプリが書き出した
 * 理論最大（約 13 MB）に余裕を持たせた値。仕様書 4.3 節・画面設計書 3.4 節と同じ値にする。
 * 画面側が File.size で判定し、超えていれば読まずに NOT_EXPORT_FILE として扱う
 */
export const MAX_IMPORT_BYTES = 20_000_000;

const SUPPORTED_VERSION = 1;

/** データ設計書 5.3 節の順序で判定する。将来 version 2 を導入したら、3 の前に 1 → 2 の変換を挟む */
export function parseImportFile(text: string): Result<ExportFile, ImportError> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "INVALID_JSON" } };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: { code: "NOT_EXPORT_FILE" } };
  }
  const record = value as Record<string, unknown>;
  if (record.format !== "checklist-export") {
    return { ok: false, error: { code: "NOT_EXPORT_FILE" } };
  }
  const version = record.version;
  if (!Number.isInteger(version) || version !== SUPPORTED_VERSION) {
    return { ok: false, error: { code: "UNSUPPORTED_VERSION", version } };
  }
  const parsed = exportFileV1Schema.safeParse(record);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", issues: toValidationIssues(parsed.error) } };
  }
  return { ok: true, file: parsed.data };
}
