import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 設定画面の「アプリ情報」に出すバージョン（画面設計書 3.5 節）
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

// base は GitHub Pages 配置時に deploy.yml が --base=/checklist/ で上書きする（仕様書 11 章）
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    reporters: "verbose",
  },
});
