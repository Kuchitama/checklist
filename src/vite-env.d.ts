/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** package.json の version。ビルド時に vite.config.ts の define で埋め込む（画面設計書 3.5 節） */
declare const __APP_VERSION__: string;
