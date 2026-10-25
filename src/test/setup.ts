// Vitest の共通セットアップ（vite.config.ts の test.setupFiles）
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest の globals を使っていないため、Testing Library の自動クリーンアップは登録されない。
// 前のテストで描画した DOM が残って次のテストの判定を誤らせないよう、明示的に片付ける。
afterEach(() => {
  cleanup();
});

// jsdom には matchMedia がない。sonner（トースト）がテーマの判定に使うため、常に不一致を返す代わりを置く
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom にはポインターキャプチャがない。vaul（ボトムシート）がドラッグ判定に使うため、何もしない代わりを置く
for (const name of ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"] as const) {
  if (!Element.prototype[name]) {
    Element.prototype[name] = (() => false) as never;
  }
}
