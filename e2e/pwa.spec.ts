import { expect, test } from "@playwright/test";
import { createList } from "./helpers";

/**
 * PWA とテーマ（要件定義書 8 章 3、NFR-02、NFR-04。仕様書 7 章・8 章）。
 */
test("機内モード: Service Worker の有効化後は、通信なしで再起動しても一覧と詳細が開ける", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("まだチェックリストがありません")).toBeVisible();
  await createList(page, "機内で見る手順", ["搭乗券を出す"]);
  const detailUrl = page.url();

  // SW が有効になり、ページを制御するまで待つ（初回登録では再読み込みで制御が始まる）
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "機内で見る手順" })).toBeVisible();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "機内で見る手順" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "搭乗券を出す" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: /機内で見る手順/ })).toBeVisible();
  await page.getByRole("link", { name: /機内で見る手順/ }).click();
  await expect(page).toHaveURL(detailUrl);
  // オフラインでも操作が保存される
  await page.getByRole("checkbox", { name: "搭乗券を出す" }).check();
  await expect(page.getByText("すべて完了")).toBeVisible();
  await context.setOffline(false);
});

test("マニフェストが取得でき、ホーム画面に追加できる形式になっている", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).not.toBeNull();
  const manifest = await page.evaluate(async (url) => (await fetch(url)).json(), href as string);
  expect(manifest).toMatchObject({
    name: "チェックリスト",
    lang: "ja",
    display: "standalone",
    start_url: "./",
    scope: "./",
  });
  expect(
    manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`),
  ).toEqual(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]);
});

test("テーマ: 設定でダークを選ぶと html.dark が付き、再読み込み後も保たれる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("まだチェックリストがありません")).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "設定" })).toBeVisible();
  await page.getByRole("radio", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  // 起動前スクリプトが React の起動前に決めるので、最初の描画からダーク
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("radio", { name: "ダーク" })).toBeChecked();

  await page.getByRole("radio", { name: "ライト" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
