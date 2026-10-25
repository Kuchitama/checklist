import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { renderApp } from "@/test/render";

/**
 * 要件定義書 3 章のユースケースを画面の操作だけで通す（M1 の完了条件）。
 * ドメイン関数は差し替えず、IndexedDB（fake-indexeddb）まで通す。
 */
describe("ユースケースの通しテスト", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  /** 一覧の「新規作成」から、タイトルと項目を入れて保存し、詳細画面に着く */
  async function createList(
    user: ReturnType<typeof userEvent.setup>,
    title: string,
    items: string[],
  ) {
    await user.click(await screen.findByRole("link", { name: "新規作成" }));
    await screen.findByRole("heading", { name: "新しいリスト" });
    await user.type(screen.getByRole("textbox", { name: /タイトル/ }), title);
    for (const [index, item] of items.entries()) {
      await user.click(screen.getByRole("button", { name: "項目を追加" }));
      await user.type(screen.getByRole("textbox", { name: `項目 ${index + 1}` }), item);
    }
    await user.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("heading", { level: 1, name: title });
  }

  it("US-1: 手順書を作り、全項目をチェックして「すべて完了」にし、リセットして次回に備える", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await screen.findByText("まだチェックリストがありません");

    await createList(user, "リリース手順", ["CI を確認", "タグを打つ", "告知を出す"]);
    expect(router.state.location.pathname).toMatch(/^\/lists\/[0-9a-f-]+$/);
    expect(screen.getByText("0 / 3")).toBeInTheDocument();

    for (const name of ["CI を確認", "タグを打つ", "告知を出す"]) {
      await user.click(screen.getByRole("checkbox", { name }));
    }
    expect(await screen.findByText("すべて完了")).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    await waitFor(async () => {
      const [stored] = await db.checklists.toArray();
      expect(stored?.items.every((i) => i.checked && i.checkedAt !== null)).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "操作メニュー" }));
    await user.click(await screen.findByRole("button", { name: "リセット" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "すべてのチェックを外しますか？",
    });
    await user.click(within(dialog).getByRole("button", { name: "リセット" }));

    await waitFor(() => expect(screen.getByText("0 / 3")).toBeInTheDocument());
    expect(screen.queryByText("すべて完了")).not.toBeInTheDocument();
    for (const name of ["CI を確認", "タグを打つ", "告知を出す"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
    const [stored] = await db.checklists.toArray();
    expect(stored?.items.map((i) => [i.title, i.checked, i.checkedAt])).toEqual([
      ["CI を確認", false, null],
      ["タグを打つ", false, null],
      ["告知を出す", false, null],
    ]);
  });

  it("US-2: 持ち物リストを作り、一部をチェックすると一覧のカードに進捗が反映される", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await screen.findByText("まだチェックリストがありません");

    await createList(user, "旅行の持ち物", ["パスポート", "充電器"]);
    await user.click(screen.getByRole("checkbox", { name: "パスポート" }));
    await waitFor(async () => {
      const [stored] = await db.checklists.toArray();
      expect(stored?.items.map((i) => i.checked)).toEqual([true, false]);
    });

    await user.click(screen.getByRole("link", { name: "戻る" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    const card = await screen.findByRole("link", { name: /旅行の持ち物/ });
    expect(within(card).getByText("1 / 2")).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(within(card).queryByText("すべて完了")).not.toBeInTheDocument();
  });
});
