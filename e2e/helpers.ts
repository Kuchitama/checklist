import { expect, type Page } from "@playwright/test";

/**
 * 一覧の「新規作成」から、タイトル・タグ・項目を入れて保存し、詳細画面に着く。
 * 操作名は画面設計書 3.3 節と単体の通しテスト（src/app/flows.test.tsx）と同じ
 */
export async function createList(
  page: Page,
  title: string,
  items: string[],
  tags: string[] = [],
): Promise<void> {
  await page.getByRole("link", { name: "新規作成" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "新しいリスト" })).toBeVisible();
  await page.getByRole("textbox", { name: /タイトル/ }).fill(title);
  for (const tag of tags) {
    await page.getByRole("textbox", { name: /タグ/ }).fill(tag);
    await page.keyboard.press("Enter");
  }
  for (const [index, item] of items.entries()) {
    await page.getByRole("button", { name: "項目を追加" }).click();
    await page.getByRole("textbox", { name: `項目 ${index + 1}` }).fill(item);
  }
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

/** 詳細画面の操作メニュー（幅 360px ではボトムシート）を開いて項目を選ぶ */
export async function chooseAction(page: Page, action: string): Promise<void> {
  await page.getByRole("button", { name: "操作メニュー" }).click();
  await page.getByRole("dialog").getByRole("button", { name: action }).click();
}

/** 詳細画面からヘッダーの「戻る」で一覧へ戻る */
export async function backToIndex(page: Page): Promise<void> {
  await page.getByRole("link", { name: "戻る" }).click();
  await expect(page.getByRole("list", { name: "チェックリスト一覧" })).toBeVisible();
}
