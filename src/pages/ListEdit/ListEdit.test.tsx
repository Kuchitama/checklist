import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { createChecklist, updateChecklist } from "@/domain/checklists";
import type { Checklist } from "@/domain/types";
import { makeChecklist, makeItem } from "@/test/fixtures";
import { renderApp } from "@/test/render";

// 保存中の状態を作るため、createChecklist だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return {
    ...actual,
    createChecklist: vi.fn(actual.createChecklist),
    updateChecklist: vi.fn(actual.updateChecklist),
  };
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
    toast.dismiss();
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

describe("ListEdit（編集）", () => {
  const existing = () =>
    makeChecklist({
      id: "list",
      title: "旅行の持ち物",
      description: "前回の反省",
      tags: ["旅行"],
      items: [
        makeItem({
          id: "a",
          title: "パスポート",
          checked: true,
          checkedAt: "2026-10-02T00:00:00.000Z",
        }),
        makeItem({
          id: "b",
          title: "充電器",
          note: "予備も",
          url: "https://example.com/c",
          dueDate: "2026-12-01",
        }),
      ],
    });

  /** 編集画面を開く。history は詳細 → 編集の順に積む */
  async function openEdit(id = "list") {
    const user = userEvent.setup();
    const result = renderApp([`/lists/${id}`, `/lists/${id}/edit`]);
    return { user, ...result };
  }

  afterEach(async () => {
    // トーストはモジュール内に状態を持ち、次のテストの Toaster にも出るので消す
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(updateChecklist).mockClear();
    await db.checklists.clear();
  });

  it("ヘッダーに「リストを編集」と「保存」を出し、既存のタイトルと項目を初期値にする", async () => {
    await db.checklists.put(existing());

    await openEdit();

    expect(await screen.findByRole("heading", { name: "リストを編集" })).toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
    expect(titleInput()).toHaveValue("旅行の持ち物");
    expect(itemInputs().map((i) => (i as HTMLInputElement).value)).toEqual([
      "パスポート",
      "充電器",
    ]);
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/lists/list");
  });

  it("保存すると updateChecklist で更新し、詳細へ遷移する。チェック状態と入力欄のないフィールドは保たれる", async () => {
    await db.checklists.put(existing());
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });

    await user.clear(itemInput(0));
    await user.type(itemInput(0), "パスポート（更新）");
    await user.click(screen.getByRole("button", { name: "項目 2 を削除" }));
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(itemInput(1), "傘");
    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/list"));
    const stored = await db.checklists.get("list");
    expect(stored).toMatchObject({
      title: "旅行の持ち物",
      description: "前回の反省",
      tags: ["旅行"],
    });
    expect(stored?.items).toEqual([
      {
        id: "a",
        title: "パスポート（更新）",
        note: "",
        url: null,
        dueDate: null,
        checked: true,
        checkedAt: "2026-10-02T00:00:00.000Z",
      },
      expect.objectContaining({ title: "傘", checked: false, checkedAt: null }),
    ]);
    expect(await db.checklists.count()).toBe(1);
  });

  it("変更していない項目は、メモ・URL・期限を保ったまま保存する", async () => {
    await db.checklists.put(existing());
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });

    await user.type(titleInput(), "！");
    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/list"));
    expect((await db.checklists.get("list"))?.items[1]).toEqual({
      id: "b",
      title: "充電器",
      note: "予備も",
      url: "https://example.com/c",
      dueDate: "2026-12-01",
      checked: false,
      checkedAt: null,
    });
  });

  it("変更がなければ「キャンセル」でそのまま詳細へ戻る", async () => {
    await db.checklists.put(existing());
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });

    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/list"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("変更があれば「戻る」で破棄確認を出し、「破棄」で詳細へ戻る", async () => {
    await db.checklists.put(existing());
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });
    await user.type(titleInput(), "！");

    await user.click(screen.getByRole("link", { name: "戻る" }));

    const dialog = await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" });
    expect(router.state.location.pathname).toBe("/lists/list/edit");
    await user.click(within(dialog).getByRole("button", { name: "破棄" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/list"));
    expect((await db.checklists.get("list"))?.title).toBe("旅行の持ち物");
  });

  it("検証エラーは欄の直下に出して保存を止める", async () => {
    await db.checklists.put(existing());
    const { user } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });

    await user.clear(titleInput());
    await user.click(saveButton());

    expect(await screen.findByText("タイトルを入力してください")).toBeInTheDocument();
    expect(titleInput()).toHaveFocus();
    expect(updateChecklist).not.toHaveBeenCalled();
  });

  it("保存に失敗したらトーストを出し、入力を残す", async () => {
    await db.checklists.put(existing());
    vi.mocked(updateChecklist).mockRejectedValueOnce(
      new DOMException("容量不足", "QuotaExceededError"),
    );
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });
    await user.type(titleInput(), "！");

    await user.click(saveButton());

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    expect(titleInput()).toHaveValue("旅行の持ち物！");
    expect(router.state.location.pathname).toBe("/lists/list/edit");
  });

  it("編集中に別のリストの編集画面へ直接遷移すると、表示と保存先がそのリストに切り替わる", async () => {
    await db.checklists.bulkPut([
      existing(),
      makeChecklist({
        id: "other",
        title: "別のリスト",
        items: [makeItem({ id: "x", title: "別の項目" })],
      }),
    ]);
    const { user, router } = await openEdit();
    await screen.findByRole("heading", { name: "リストを編集" });
    expect(titleInput()).toHaveValue("旅行の持ち物");

    await act(() => router.navigate("/lists/other/edit"));

    await waitFor(() => expect(titleInput()).toHaveValue("別のリスト"));
    expect(itemInputs().map((i) => (i as HTMLInputElement).value)).toEqual(["別の項目"]);
    await user.type(titleInput(), "！");
    await user.click(saveButton());
    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/other"));
    expect((await db.checklists.get("other"))?.title).toBe("別のリスト！");
    expect((await db.checklists.get("list"))?.title).toBe("旅行の持ち物");
  });

  it("存在しない id なら「見つかりません」と一覧への導線を出す", async () => {
    await openEdit("missing");

    expect(await screen.findByText("リストが見つかりません")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一覧へ" })).toHaveAttribute("href", "/");
  });

  it("読み取りに失敗したら案内と再試行ボタンを出し、再試行で読み直す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.checklists.put(existing());
    const get = vi.spyOn(db.checklists, "get").mockImplementation(() => {
      throw new Error("一時的な読み取り失敗");
    });
    const { user } = await openEdit();

    expect(await screen.findByText("リストを読み込めませんでした")).toBeInTheDocument();
    get.mockRestore();
    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(await screen.findByRole("heading", { name: "リストを編集" })).toBeInTheDocument();
    expect(titleInput()).toHaveValue("旅行の持ち物");
  });

  it("DB を開けない環境では保存できない旨を出し、再試行ボタンは出さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.checklists, "get").mockImplementation(() => {
      const error = new Error("IndexedDB を開けません");
      error.name = "OpenFailedError";
      throw error;
    });

    await openEdit();

    expect(await screen.findByText("データを保存できない環境です")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).not.toBeInTheDocument();
  });
});

describe("ListEdit（説明とタグ）", () => {
  const descriptionInput = () => screen.getByRole("textbox", { name: "説明" });
  const tagInput = () => screen.getByRole("textbox", { name: "タグ" });
  const chips = () => {
    const list = screen.queryByRole("list", { name: "タグ" });
    return list
      ? within(list)
          .getAllByRole("listitem")
          .map((li) => li.textContent)
      : [];
  };

  afterEach(async () => {
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(createChecklist).mockClear();
    vi.mocked(updateChecklist).mockClear();
    await db.checklists.clear();
  });

  it("説明を入力して保存すると、改行を保って保存される", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "リリース手順");

    await user.type(descriptionInput(), "本番リリース前に{Enter}必ず通す確認");
    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\//));
    const [saved] = await db.checklists.toArray();
    expect(saved?.description).toBe("本番リリース前に\n必ず通す確認");
  });

  it("説明が 1000 文字を超えたら直下にエラーを出して保存を止め、説明にフォーカスする", async () => {
    const { user } = await openNew();
    await user.type(titleInput(), "リリース手順");
    await user.click(descriptionInput());
    await user.paste("あ".repeat(1001));

    await user.click(saveButton());

    expect(await screen.findByText("説明は 1000 文字以内です")).toBeInTheDocument();
    expect(descriptionInput()).toHaveAccessibleDescription("説明は 1000 文字以内です");
    expect(descriptionInput()).toHaveFocus();
    expect(await db.checklists.count()).toBe(0);
  });

  it("タグは Enter または , で確定し、trim と重複除去をする", async () => {
    const { user } = await openNew();

    await user.type(tagInput(), "仕事{Enter}");
    expect(chips()).toEqual(["仕事"]);
    expect(tagInput()).toHaveValue("");

    await user.type(tagInput(), " 仕事 ,");
    expect(chips()).toEqual(["仕事"]);
    expect(tagInput()).toHaveValue("");

    await user.type(tagInput(), "リリース,");
    expect(chips()).toEqual(["仕事", "リリース"]);
  });

  it("Backspace で入力が空なら直前のチップを削除し、Esc で入力内容を消す", async () => {
    const { user } = await openNew();
    await user.type(tagInput(), "仕事{Enter}リリース{Enter}");

    await user.keyboard("{Backspace}");
    expect(chips()).toEqual(["仕事"]);

    await user.type(tagInput(), "途中まで");
    await user.keyboard("{Escape}");
    expect(tagInput()).toHaveValue("");
    expect(chips()).toEqual(["仕事"]);
  });

  it("チップの削除ボタンで消せる", async () => {
    const { user } = await openNew();
    await user.type(tagInput(), "仕事{Enter}リリース{Enter}");

    await user.click(screen.getByRole("button", { name: "タグ「仕事」を削除" }));

    expect(chips()).toEqual(["リリース"]);
  });

  it("21 個目と 31 文字以上は確定せず、直下にエラーを出す", async () => {
    const { user } = await openNew();
    for (let i = 1; i <= 20; i++) await user.type(tagInput(), `t${i}{Enter}`);
    expect(chips()).toHaveLength(20);

    await user.type(tagInput(), "t21{Enter}");
    expect(chips()).toHaveLength(20);
    expect(tagInput()).toHaveValue("t21");
    expect(tagInput()).toHaveAccessibleDescription("タグは 20 個までです");

    await user.clear(tagInput());
    await user.click(screen.getByRole("button", { name: "タグ「t20」を削除" }));
    await user.type(tagInput(), `${"あ".repeat(31)}{Enter}`);
    expect(chips()).toHaveLength(19);
    expect(tagInput()).toHaveAccessibleDescription("タグは 30 文字以内です");
  });

  it("上限のエラーは、チップを消して確定し直すと消える", async () => {
    const { user } = await openNew();
    for (let i = 1; i <= 20; i++) await user.type(tagInput(), `t${i}{Enter}`);
    await user.type(tagInput(), "t21{Enter}");
    expect(tagInput()).toHaveAccessibleDescription("タグは 20 個までです");

    await user.click(screen.getByRole("button", { name: "タグ「t1」を削除" }));
    await user.click(tagInput());
    await user.keyboard("{Enter}");

    expect(chips()).toHaveLength(20);
    expect(chips()).toContain("t21");
    expect(screen.queryByText("タグは 20 個までです")).not.toBeInTheDocument();
  });

  it("保存時に未確定の入力が 31 文字以上なら、確定も保存もせずにエラーを出す", async () => {
    const { user } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");
    const long = "あ".repeat(31);
    await user.type(tagInput(), long);

    await user.click(saveButton());

    expect(await screen.findByText("タグは 30 文字以内です")).toBeInTheDocument();
    expect(chips()).toEqual([]);
    expect(tagInput()).toHaveValue(long);
    expect(tagInput()).toHaveFocus();
    expect(await db.checklists.count()).toBe(0);
  });

  it("保存時に未確定の入力を確定する。空白だけなら無視する", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");
    await user.type(tagInput(), "仕事{Enter}");
    await user.type(tagInput(), "旅行");

    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\//));
    const [saved] = await db.checklists.toArray();
    expect(saved?.tags).toEqual(["仕事", "旅行"]);
  });

  it("空白だけの未確定の入力は保存時に無視する", async () => {
    const { user, router } = await openNew();
    await user.type(titleInput(), "旅行の持ち物");
    await user.type(tagInput(), "   ");

    await user.click(saveButton());

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\//));
    const [saved] = await db.checklists.toArray();
    expect(saved?.tags).toEqual([]);
  });

  it("編集では説明とタグを初期値にし、説明を変えると破棄確認の対象になる", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        title: "旅行の持ち物",
        description: "前回の反省",
        tags: ["旅行", "準備"],
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp(["/lists/list", "/lists/list/edit"]);
    await screen.findByRole("heading", { name: "リストを編集" });

    expect(descriptionInput()).toHaveValue("前回の反省");
    expect(chips()).toEqual(["旅行", "準備"]);

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/lists/list"));

    await act(() => router.navigate("/lists/list/edit"));
    await screen.findByRole("heading", { name: "リストを編集" });
    await user.type(descriptionInput(), "！");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(
      await screen.findByRole("alertdialog", { name: "変更を破棄しますか？" }),
    ).toBeInTheDocument();
  });
});
