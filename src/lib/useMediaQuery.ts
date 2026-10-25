import { useCallback, useSyncExternalStore } from "react";

/** メディアクエリの一致状態を返し、変化に追従する（画面幅でメニューの形を切り替えるために使う） */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
