import type { ValidationIssue } from "./types";

/**
 * DB を開けない環境（プライベートブラウズ、ストレージ無効、新しい版で作った DB を古い版で開いた等）の
 * エラーかどうかを判定する（データ設計書 3.4 節）。Dexie と IndexedDB のエラー名で判定する。
 */
const DATABASE_UNAVAILABLE = new Set([
  "OpenFailedError",
  "MissingAPIError",
  "DatabaseClosedError",
  "VersionError",
  "InvalidStateError",
  "SecurityError",
]);

export function isDatabaseUnavailable(error: unknown): boolean {
  return error instanceof Error && DATABASE_UNAVAILABLE.has(error.name);
}

/** 入力が検証を通らなかった（データ設計書 1.5 節）。issues を画面の入力欄の直下に出す */
export class ChecklistValidationError extends Error {
  override name = "ChecklistValidationError";

  constructor(readonly issues: ValidationIssue[]) {
    super("入力に誤りがあります");
  }
}
