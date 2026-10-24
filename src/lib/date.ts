/**
 * 日時の表示（データ設計書 2 章）。ISO 8601（UTC）を端末のローカル時刻で表示する。
 */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 今年なら `M/D HH:mm`、今年以外なら `YYYY/M/D HH:mm` */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const date = `${d.getMonth() + 1}/${d.getDate()}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear()
    ? `${date} ${time}`
    : `${d.getFullYear()}/${date} ${time}`;
}

/** "YYYY-MM-DD" を年・月・日の数値にする */
function parseDueDate(dueDate: string): [number, number, number] {
  const [y, m, d] = dueDate.split("-").map(Number);
  return [y ?? 0, m ?? 0, d ?? 0];
}

/** 期限（暦日）を、今年なら `M/D`、今年以外なら `YYYY/M/D` で表示する */
export function formatDueDate(dueDate: string, now: Date = new Date()): string {
  const [y, m, d] = parseDueDate(dueDate);
  return y === now.getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

export type DueState = "overdue" | "today" | "normal";

/**
 * 期限の状態（データ設計書 2 章）。「今日」は端末のローカル日付で、年月日を数値にして比べる。
 * チェック済みと期限なしは状態を表示しないので null を返す。
 */
export function dueState(
  dueDate: string | null,
  checked: boolean,
  now: Date = new Date(),
): DueState | null {
  if (dueDate === null || checked) return null;
  const [y, m, d] = parseDueDate(dueDate);
  const due = y * 10000 + m * 100 + d;
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  if (due < today) return "overdue";
  return due === today ? "today" : "normal";
}
