import { useEffect, useState } from "react";

/** value が変わってから delay ミリ秒の間に変わらなければ、その値を返す（検索の入力に使う） */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
