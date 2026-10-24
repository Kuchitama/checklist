import { describe, expect, it } from "vitest";
import { formatDateTime } from "./date";

// 端末のタイムゾーンに依存しないよう、期待値はローカル時刻で組み立てる
const local = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).toISOString();
const today = new Date(2026, 9, 23, 12, 0);

describe("formatDateTime", () => {
  it("今年の日時は M/D HH:mm で表示する", () => {
    expect(formatDateTime(local(2026, 10, 18, 9, 30), today)).toBe("10/18 09:30");
    expect(formatDateTime(local(2026, 1, 5, 0, 5), today)).toBe("1/5 00:05");
  });

  it("今年以外の日時は YYYY/M/D HH:mm で表示する", () => {
    expect(formatDateTime(local(2025, 12, 31, 23, 59), today)).toBe("2025/12/31 23:59");
  });
});
