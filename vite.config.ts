import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// 設定画面の「アプリ情報」に出すバージョン（画面設計書 3.5 節）
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

// base は GitHub Pages 配置時に deploy.yml が --base=/checklist/ で上書きする（仕様書 11 章）
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA（仕様書 7 章）。generateSW でビルド成果物をプリキャッシュし、更新は利用者の操作で反映する（registerType: prompt）
    VitePWA({
      registerType: "prompt",
      // public/ の画像は workbox.globPatterns で拾うので、マニフェストのアイコンを重ねて登録しない
      includeManifestIcons: false,
      manifest: {
        name: "チェックリスト",
        short_name: "チェックリスト",
        description: "ローカルファーストのチェックリスト管理アプリ",
        lang: "ja",
        display: "standalone",
        // base（/ または /checklist/）に対する相対パスにし、配置先が変わっても動くようにする
        start_url: "./",
        scope: "./",
        // ライトの --background。ダークは index.html の media 付き theme-color で持つ
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icon-maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // マニフェストはプラグインが登録するので glob に含めない
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        // 変更の説明（public/explain-diff/）はアプリの一部ではないので、プリキャッシュせず、
        // ナビゲーションもアプリの index.html に差し替えない（仕様書 7 章）。node_modules は workbox の既定の除外
        globIgnores: ["**/node_modules/**/*", "explain-diff/**"],
        navigateFallbackDenylist: [/\/explain-diff(?:[/?]|$)/],
        // 古いバージョンのキャッシュは新しい SW の有効化時に消す
        cleanupOutdatedCaches: true,
      },
      // 開発サーバーでは SW を登録しない（Issue #66）
      devOptions: { enabled: false },
    }),
  ],
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
