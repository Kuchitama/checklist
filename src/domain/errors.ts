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
