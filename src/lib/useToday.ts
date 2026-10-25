import { useEffect, useState } from "react";

const isSameLocalDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * 端末のローカル日付で「今日」を返す（データ設計書 2 章）。期限の状態を判定し直せるよう、
 * 日付が変わる 0 時と、画面に戻ったとき（スリープ中はタイマーが動かないため）に更新する。
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    // 日付が変わっていなければ同じ値を返し、再描画しない
    const refresh = () =>
      setToday((current) => {
        const now = new Date();
        return isSameLocalDate(current, now) ? current : now;
      });
    const nextMidnight = new Date(today);
    nextMidnight.setHours(24, 0, 0, 0);
    // 0 時ちょうどは必ず新しい値にし、この effect を張り直して次の 0 時を待つ
    const timer = setTimeout(() => setToday(new Date()), nextMidnight.getTime() - Date.now());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [today]);

  return today;
}
