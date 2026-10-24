import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { createChecklist } from "@/domain/checklists";
import type { Checklist } from "@/domain/types";
import { makeChecklist } from "@/test/fixtures";
import { renderApp } from "@/test/render";

// 保存中の状態を作るため、createChecklist だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return { ...actual, createChecklist: vi.fn(actual.createChecklist) };
});

const titleInput = () => screen.getByRole("textbox", { name: /タイトル/ });
const itemInputs = () => screen.queryAllByRole("textbox", { name: /^項目 \d+$/ });
const itemInput = (index: number) => {
  const input = itemInputs()[index];
  if (!input) throw new Error(`項目 ${index + 1} の入力欄がない`);
  return input;
};
const saveButton = () => screen.getByRole("button", { name: "保存" });

/** 新規作成画面を開く。history は一覧 → 新規作成の順に積む */
async function openNew() {
  const user = userEvent.setup();
  const result = renderApp(["/", "/lists/new"]);
  await screen.findByRole("heading", { name: "新しいリスト" });
  return { user, ...result };
}

describe("ListEdit（新規作成）", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(createChecklist).mockClear();
    await db.checklists.clear();
  });

  it("ヘッダーに「新しいリスト」と「保存」を出し、保存すると詳細へ遷移する", async () => {
    const { user, router } = await openNew();
    expect(saveButton()).toBeInTheDocument();

    await user.type(titleInput(), "旅行の持ち物");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(0), "パスポート");
    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\/[0-9a-f-]+$/));
    const [saved, ...rest] = await db.checklists.toArray();
    expect(rest).toHaveLength(0);
    expect(saved).toMatchObject({
      title: "旅行の持ち物",
      description: "",
      tags: [],
      items: [{ title: "パスポート", note: "", url: null, dueDate: null, checked: false }],
    });
    expect(router.state.location.pathname).toBe(`/lists/${saved?.id}`);
  });

  it("「項目を追加」で末尾に空行を追加し、その行にフォーカスを移す", async () => {
    const { user } = await openNew();
    expect(itemInputs()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(0), "一つ目");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));

    expect(itemInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["一つ目", ""]);
    expect(itemInput(1)).toHaveFocus();
  });

  it("項目タイトルで Enter を押すと直下に空行を追加してフォーカスを移す", async () => {
    const { user } = await openNew();
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(0), "一つ目");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(1), "二つ目");

    await user.click(itemInput(0));
    await user.keyboard("{Enter}");

    expect(itemInputs().map((i) => (i as HTMLInputElement).value)).toEqual([
      "一つ目",
      "",
      "二つ目",
    ]);
    expect(itemInput(1)).toHaveFocus();
  });

  it("IME の変換確定の Enter では行を追加しない", async () => {
    const { user } = await openNew();
    await user.click(screen.getByRole("button", { name: "項目を追加" }));

    fireEvent.keyDown(itemInput(0), { key: "Enter", isComposing: true });

    expect(itemInputs()).toHaveLength(1);
  });

  it("空のタイトル欄で Backspace を押しても行は消えない", async () => {
    const { user } = await openNew();
    await user.click(screen.getByRole("button", { name: "項目を追加" }));

    await user.keyboard("{Backspace}{Backspace}");

    expect(itemInputs()).toHaveLength(1);
  });

  it("各行の削除ボタンで行を消せる", async () => {
    const { user } = await openNew();
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(0), "一つ目");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(1), "二つ目");

    await user.click(screen.getByRole("button", { name: "項目 1 を削除" }));

    expect(itemInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["二つ目"]);
  });

  it("検証エラーは欄の直下に出して保存を止め、最初のエラー欄にフォーカスする。空行は捨てない", async () => {
    const { user, router } = await openNew();
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(0), "一つ目");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));

    await user.click(saveButton());

    expect(await screen.findByText("タイトルを入力してください")).toBeInTheDocument();
    expect(titleInput()).toHaveAttribute("aria-invalid", "true");
    expect(titleInput()).toHaveAccessibleDescription("タイトルを入力してください");
    expect(itemInput(1)).toHaveAccessibleDescription(
      "項目名を入力してください（不要な行は削除してください）",
    );
    expect(titleInput()).toHaveFocus();
    expect(itemInputs()).toHaveLength(2);
    expect(await db.checklists.count()).toBe(0);
    expect(router.state.location.pathname).toBe("/lists/new");
  });

  it("タイトルが正しく項目だけ誤っていれば、その項目にフォーカスする", async () => {
    const { user } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");
    await user.click(screen.getByRole("button", { name: "項目を追加" }));

    await user.click(saveButton());

    await waitFor(() => expect(itemInput(0)).toHaveFocus());
    expect(screen.queryByText("タイトルを入力してください")).not.toBeInTheDocument();
  });

  it("保存中は保存ボタンを無効にし、二重に保存しない", async () => {
    const { user } = await openNew();
    let finish: (checklist: Checklist) => void = () => {};
    vi.mocked(createChecklist).mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    await user.type(titleInput(), "旅行の持ち物");

    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeDisabled());
    await user.click(saveButton());
    expect(createChecklist).toHaveBeenCalledTimes(1);
    await act(async () => finish(makeChecklist({ id: "saved" })));
  });

  it("保存に失敗したらトーストを出し、入力を残す", async () => {
    const { user, router } = await openNew();
    vi.spyOn(db.checklists, "add").mockRejectedValue(
      new DOMException("容量不足", "QuotaExceededError"),
    );
    await user.type(titleInput(), "旅行の持ち物");

    await user.click(saveButton());

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    expect(titleInput()).toHaveValue("旅行の持ち物");
    expect(saveButton()).toBeEnabled();
    expect(router.state.location.pathname).toBe("/lists/new");
  });

  it("変更がなければ「キャンセル」でそのまま一覧へ戻る", async () => {
    const { user, router } = await openNew();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("空白だけ入力して消した場合は未変更とみなし、確認を出さない", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "   ");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("変更があれば「キャンセル」で破棄確認を出す。「破棄」で一覧へ、確認のキャンセルでとどまる", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    let dialog = await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" });
    expect(within(dialog).getByText("保存していない変更は失われます。")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/lists/new");
    expect(titleInput()).toHaveValue("旅行の持ち物");

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    dialog = await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" });
    await user.click(within(dialog).getByRole("button", { name: "破棄" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("ヘッダーの「戻る」でも、変更があれば破棄確認を出す", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");

    await user.click(screen.getByRole("link", { name: "戻る" }));

    expect(
      await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lists/new");
  });

  it("ブラウザの戻るでも、変更があれば破棄確認を出す", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");

    await act(() => router.navigate(-1));

    expect(
      await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lists/new");
  });

  it("変更があるときだけ beforeunload で離脱確認を出す", async () => {
    const { user } = await openNew();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);

    await user.type(titleInput(), "旅行の持ち物");

    expect(unload()).toBe(true);
  });
});
