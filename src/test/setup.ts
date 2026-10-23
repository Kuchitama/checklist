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
