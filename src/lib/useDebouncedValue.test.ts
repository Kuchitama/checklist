import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("最後の変更から delay ミリ秒経つまでは前の値を返し、経ったら新しい値を返す", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 150), {
      initialProps: { value: "" },
    });
    expect(result.current).toBe("");

    rerender({ value: "a" });
    act(() => vi.advanceTimersByTime(149));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("a");
  });

  it("待っている間に値が変わると、待ち時間を最後の変更から数え直す", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 150), {
      initialProps: { value: "" },
    });

    rerender({ value: "a" });
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: "ab" });
    // 最初の変更から 150ms 経っても、2 回目の変更から 150ms 経っていなければ更新しない
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(99));
    expect(result.current).toBe("");
    act(() => vi.advanceTimersByTime(1));
    // 中間の値「a」は一度も返さず、最後の値だけになる
    expect(result.current).toBe("ab");
  });

  it("アンマウントしたら待っているタイマーを止める", () => {
    const { result, rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 150), {
      initialProps: { value: "" },
    });
    rerender({ value: "a" });
    unmount();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    expect(result.current).toBe("");
  });
});
