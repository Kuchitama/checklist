import { defineConfig, devices } from "@playwright/test";

/**
 * E2E テスト（仕様書 10 章・11 章、Issue #68）。ビルド済みの成果物（vite preview）に対して Chromium だけで実行する。
 * ポートは手元の preview（4173）とぶつからないよう 4174 にする。
 */
export default defineConfig({
  testDir: "e2e",
  // テストごとに別のブラウザコンテキスト（IndexedDB も別）なので並列でよい
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // 失敗箇所をそのまま次の修正に使えるよう list を基本にし、CI では playwright-report/ にも残す（仕様書 12.2 節 H-1）
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4174",
    locale: "ja-JP",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // ブラウザを別に用意する環境（ダウンロードできない CI の自前ランナーなど）向け。未設定なら Playwright が導入したものを使う
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  projects: [
    {
      name: "chromium",
      // 幅 360px のスマートフォンを基準にする（要件 NFR-03）。操作メニューはボトムシートになる
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 } },
    },
  ],
  webServer: {
    // 毎回ビルドし直し、古い dist/ に対して走らせない
    command: "pnpm build && pnpm exec vite preview --port 4174 --strictPort",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
