import { describe, expect, it } from "vitest";
import { dueState, formatDateTime, formatDueDate } from "./date";

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

describe("formatDueDate", () => {
  it("今年の期限は M/D、今年以外は YYYY/M/D で表示する", () => {
    expect(formatDueDate("2026-10-08", today)).toBe("10/8");
    expect(formatDueDate("2027-01-05", today)).toBe("2027/1/5");
  });
});

describe("dueState", () => {
  it("未チェックで今日より前は overdue、今日は today、それ以外は normal", () => {
    expect(dueState("2026-10-22", false, today)).toBe("overdue");
    expect(dueState("2025-12-31", false, today)).toBe("overdue");
    expect(dueState("2026-10-23", false, today)).toBe("today");
    expect(dueState("2026-10-24", false, today)).toBe("normal");
  });

  it("「今日」は端末のローカル日付で決める", () => {
    const lateNight = new Date(2026, 9, 23, 23, 59);
    expect(dueState("2026-10-23", false, lateNight)).toBe("today");
    const earlyMorning = new Date(2026, 9, 24, 0, 0);
    expect(dueState("2026-10-23", false, earlyMorning)).toBe("overdue");
  });

  it("チェック済みと期限なしは null（期限の状態を表示しない）", () => {
    expect(dueState("2026-10-22", true, today)).toBeNull();
    expect(dueState(null, false, today)).toBeNull();
  });
});
