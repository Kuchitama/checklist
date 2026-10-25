/**
 * テスト用の matchMedia の代わり。jsdom には matchMedia がないため、
 * クエリごとの一致状態を外から変えられ、change イベントを購読者に届けるものを置く。
 */
export function installFakeMatchMedia(initial: Record<string, boolean> = {}) {
  const matches = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  const original = window.matchMedia;

  window.matchMedia = (query: string) => {
    const set = listeners.get(query) ?? new Set();
    listeners.set(query, set);
    const list = {
      get matches() {
        return matches.get(query) ?? false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        set.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        set.delete(listener);
      },
      addListener: (listener: () => void) => {
        set.add(listener);
      },
      removeListener: (listener: () => void) => {
        set.delete(listener);
      },
      dispatchEvent: () => false,
    };
    return list as unknown as MediaQueryList;
  };

  return {
    /** 一致状態を変え、購読者に change を届ける */
    set(query: string, value: boolean) {
      matches.set(query, value);
      for (const listener of listeners.get(query) ?? []) listener();
    },
    /** いま購読している数（監視の解除を確かめる） */
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0;
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
