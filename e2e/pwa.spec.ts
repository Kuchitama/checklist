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
  // オフラインでも操作が保存される。楽観更新の表示ではなく、DB の購読に反映された完了日時を待ち、
  // オフラインのまま再読み込みしてもチェックが残ることを確かめる
  await page.getByRole("checkbox", { name: "搭乗券を出す" }).check();
  await expect(page.getByText("すべて完了")).toBeVisible();
  await expect(page.getByText(/^完了 /)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "機内で見る手順" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "搭乗券を出す" })).toBeChecked();
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

test("変更の説明（/explain-diff/）は Service Worker の対象外で、アプリに差し替わらない", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("まだチェックリストがありません")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // SW の制御下でも、ナビゲーションのフォールバック（アプリの index.html）にならず、説明の一覧が開く
  await page.goto("/explain-diff/");
  await expect(page.getByRole("heading", { level: 1, name: "変更の説明" })).toBeVisible();

  // 説明はアプリのプリキャッシュに入れない（アプリの更新やオフラインの容量に影響させない）
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      for (const request of await (await caches.open(key)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter((url) => url.includes("/explain-diff/"))).toEqual([]);
});
