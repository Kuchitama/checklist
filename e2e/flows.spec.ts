import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { backToIndex, chooseAction, createList } from "./helpers";

/**
 * 要件定義書 3 章のユースケースを、ビルド済みの成果物と実ブラウザで通す（仕様書 10 章、Issue #68）。
 * テストごとに新しいブラウザコンテキストなので、IndexedDB は空から始まる。
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("まだチェックリストがありません")).toBeVisible();
});

test("US-1: 手順書を作り、全項目をチェックして「すべて完了」にし、リセットして次回に備える", async ({
  page,
}) => {
  await createList(page, "リリース手順", ["CI を確認", "タグを打つ", "告知を出す"]);
  await expect(page).toHaveURL(/#\/lists\/[0-9a-f-]+$/);
  await expect(page.getByText("0 / 3")).toBeVisible();

  for (const name of ["CI を確認", "タグを打つ", "告知を出す"]) {
    await page.getByRole("checkbox", { name }).check();
  }
  await expect(page.getByText("すべて完了")).toBeVisible();
  await expect(page.getByText("3 / 3")).toBeVisible();

  await chooseAction(page, "リセット");
  const dialog = page.getByRole("alertdialog", { name: "すべてのチェックを外しますか？" });
  await dialog.getByRole("button", { name: "リセット" }).click();

  await expect(page.getByText("0 / 3")).toBeVisible();
  await expect(page.getByText("すべて完了")).toHaveCount(0);
  for (const name of ["CI を確認", "タグを打つ", "告知を出す"]) {
    await expect(page.getByRole("checkbox", { name })).not.toBeChecked();
  }
});

test("US-4 / US-5: 手順書を書き出し、そのファイルを読み込むと、チェック状態のない新しいリストになる", async ({
  page,
}) => {
  await createList(page, "引っ越し手順", ["転出届", "電気の停止"]);
  await page.getByRole("checkbox", { name: "転出届" }).check();
  await expect(page.getByText("1 / 2")).toBeVisible();

  // 書き出し（ダウンロードしたファイルの中身を使う。日本語のファイル名は headless では確かめられない。docs/harness.md 5 章）
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    chooseAction(page, "書き出し"),
  ]);
  await expect(page.getByText("ファイルを書き出しました")).toBeVisible();
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path as string, "utf8")) as {
    version: number;
    checklist: { title: string; items: { title: string }[] };
  };
  expect(exported.version).toBe(1);
  expect(exported.checklist.title).toBe("引っ越し手順");
  expect(exported.checklist.items.map((i) => i.title)).toEqual(["転出届", "電気の停止"]);

  // 元のリストを削除してから読み込む（共有された側のブラウザを想定）
  await chooseAction(page, "削除");
  await page
    .getByRole("alertdialog", { name: "「引っ越し手順」を削除しますか？" })
    .getByRole("button", { name: "削除" })
    .click();
  await expect(page.getByText("まだチェックリストがありません")).toBeVisible();

  await page.getByRole("link", { name: "ファイルを読み込む" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "ファイルを読み込む" })).toBeVisible();
  await page.getByLabel("ファイルを選択").setInputFiles({
    name: "export.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByRole("heading", { name: "引っ越し手順" })).toBeVisible();
  await expect(page.getByText("項目 2 件")).toBeVisible();
  await expect(page.getByText("チェック状態はすべて未完了で取り込まれます")).toBeVisible();
  await page.getByRole("button", { name: "取り込む" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "引っ越し手順" })).toBeVisible();
  await expect(page.getByText("「引っ越し手順」を取り込みました")).toBeVisible();
  await expect(page.getByText("0 / 2")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "転出届" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "電気の停止" })).not.toBeChecked();
});

test("US-6: 既存のリストを複製し、一部を変えた別バージョンを作る。元のリストは変わらない", async ({
  page,
}) => {
  await createList(page, "出張の持ち物", ["充電器", "名刺"]);
  await page.getByRole("checkbox", { name: "充電器" }).check();
  await expect(page.getByText("1 / 2")).toBeVisible();

  await chooseAction(page, "複製");
  await expect(
    page.getByRole("heading", { level: 1, name: "出張の持ち物 のコピー" }),
  ).toBeVisible();
  await expect(page.getByText("「出張の持ち物 のコピー」を複製しました")).toBeVisible();
  await expect(page.getByText("0 / 2")).toBeVisible();

  // 複製を編集しても元は変わらない
  await page.getByRole("link", { name: "編集" }).click();
  await page.getByRole("textbox", { name: /タイトル/ }).fill("海外出張の持ち物");
  await page.getByRole("button", { name: "項目を追加" }).click();
  await page.getByRole("textbox", { name: "項目 3" }).fill("パスポート");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "海外出張の持ち物" })).toBeVisible();
  await expect(page.getByText("0 / 3")).toBeVisible();

  await backToIndex(page);
  const cards = page.getByRole("list", { name: "チェックリスト一覧" }).getByRole("listitem");
  await expect(cards).toHaveCount(2);
  await page
    .getByRole("link", { name: /出張の持ち物/ })
    .filter({ hasNotText: "海外" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "出張の持ち物" })).toBeVisible();
  await expect(page.getByText("1 / 2")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "充電器" })).toBeChecked();
});

test("US-7: 増えたリストから、タグで絞り込み、キーワードで検索して目的のものを探す", async ({
  page,
}) => {
  const lists: [string, string[], string[]][] = [
    ["リリース手順", ["CI を確認"], ["仕事"]],
    ["旅行の持ち物", ["パスポート", "充電器"], ["家", "旅行"]],
    ["大掃除", ["換気扇", "窓"], ["家"]],
  ];
  for (const [title, items, tags] of lists) {
    await createList(page, title, items, tags);
    await backToIndex(page);
  }
  const cards = page.getByRole("list", { name: "チェックリスト一覧" }).getByRole("listitem");
  await expect(cards).toHaveCount(3);

  // タグ「家」で 2 件
  const group = page.getByRole("group", { name: "タグで絞り込む" });
  await group.getByRole("button", { name: "家" }).click();
  await expect(group.getByRole("button", { name: "家" })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(2);

  // さらに項目名「パスポート」で 1 件
  const box = page.getByRole("searchbox", { name: "検索" });
  await box.fill("パスポート");
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole("link", { name: /旅行の持ち物/ })).toBeVisible();

  // 一致しなければ案内
  await box.fill("存在しない語");
  await expect(page.getByText("「存在しない語」に一致するリストはありません")).toBeVisible();

  // クリアとタグの解除で 3 件に戻り、大文字小文字を区別せずに探せる
  await page.getByRole("button", { name: "検索をクリア" }).click();
  await group.getByRole("button", { name: "家" }).click();
  await expect(cards).toHaveCount(3);
  await box.fill("ci");
  await expect(cards).toHaveCount(1);
  await page.getByRole("link", { name: /リリース手順/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "リリース手順" })).toBeVisible();
});
