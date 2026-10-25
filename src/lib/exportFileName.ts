/**
 * 書き出しファイル名（データ設計書 5.4 節）: `checklist-<safeTitle>-<YYYYMMDD>.json`。
 * 日付は端末のローカル日付。
 */
const pad2 = (n: number) => String(n).padStart(2, "0");

/** ファイル名に使えない文字（\ / : * ? " < > |）と制御文字（U+0000〜U+001F、U+007F） */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字を置換対象にするのが目的
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const MAX_TITLE_CODE_POINTS = 50;

/** タイトルをファイル名に使える形にする。空なら untitled */
export function safeFileTitle(title: string): string {
  // 改行やタブは空白でもあり制御文字でもある。先に空白としてまとめないと "a \t b" が "a___b" になる
  const replaced = title.replace(/\s+/g, "_").replace(UNSAFE, "_");
  const cut = Array.from(replaced).slice(0, MAX_TITLE_CODE_POINTS).join("");
  // 空白だけ・空文字は "_" や "" になるので、置換後に _ 以外が残らなければ untitled にする
  return /[^_]/.test(cut) ? cut : "untitled";
}

export function exportFileName(title: string, date: Date = new Date()): string {
  const ymd = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  return `checklist-${safeFileTitle(title)}-${ymd}.json`;
}
