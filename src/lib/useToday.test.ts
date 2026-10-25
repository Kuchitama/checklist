import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToday } from "./useToday";

const dateOf = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("useToday", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("端末のローカル日付が変わる時刻（0 時）に更新する", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date(2026, 9, 23, 23, 59, 0));
    const { result } = renderHook(() => useToday());
    expect(dateOf(result.current)).toBe("2026-10-23");

    act(() => vi.advanceTimersByTime(59 * 1000));
    expect(dateOf(result.current)).toBe("2026-10-23");

    act(() => vi.advanceTimersByTime(2 * 1000));
    expect(dateOf(result.current)).toBe("2026-10-24");

    // 翌日の 0 時にも続けて更新する
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(dateOf(result.current)).toBe("2026-10-25");
  });

  it("画面に戻ったとき（visibilitychange）に日付が変わっていれば更新する", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 23, 22, 0, 0));
    const { result } = renderHook(() => useToday());
    const before = result.current;

    // 同じ日のうちに戻っても、値は変えない（再描画を増やさない）
    vi.setSystemTime(new Date(2026, 9, 23, 23, 0, 0));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(before);

    // スリープなどでタイマーが動かないまま日をまたいだ
    vi.setSystemTime(new Date(2026, 9, 24, 7, 0, 0));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(dateOf(result.current)).toBe("2026-10-24");
  });
});
