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
