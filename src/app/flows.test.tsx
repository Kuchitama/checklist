import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { renderApp } from "@/test/render";

/**
 * 要件定義書 3 章のユースケースを画面の操作だけで通す（M1 の完了条件）。
 * ドメイン関数は差し替えず、IndexedDB（fake-indexeddb）まで通す。
 */
describe("ユースケースの通しテスト", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
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

  it("US-4 / US-5: 手順書を書き出し、そのファイルを読み込むと、チェック状態のない新しいリストになる", async () => {
    // ダウンロードは jsdom では動かないので、書き出された Blob を捕まえる
    let exported: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn();
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await screen.findByText("まだチェックリストがありません");

    // 作ってチェックを付ける（書き出しにはチェック状態が含まれない）
    await createList(user, "リリース手順", ["CI を確認", "タグを打つ"]);
    await user.click(screen.getByRole("checkbox", { name: "CI を確認" }));
    await waitFor(async () => {
      const [stored] = await db.checklists.toArray();
      expect(stored?.items[0]?.checked).toBe(true);
    });
    const [source] = await db.checklists.toArray();

    // 書き出し
    await user.click(screen.getByRole("button", { name: "操作メニュー" }));
    await user.click(await screen.findByRole("button", { name: "書き出し" }));
    expect(await screen.findByText("ファイルを書き出しました")).toBeInTheDocument();
    expect(downloadName).toMatch(/^checklist-リリース手順-\d{8}\.json$/);
    const text = await exported?.text();
    expect(text).toBeDefined();

    // 別端末で読み込む想定: 一覧の「読み込み」から同じ内容のファイルを選ぶ
    await user.click(screen.getByRole("link", { name: "戻る" }));
    await user.click(await screen.findByRole("link", { name: "読み込み" }));
    await screen.findByRole("heading", { name: "ファイルを読み込む" });
    await user.upload(
      screen.getByLabelText("ファイルを選択"),
      new File([text ?? ""], downloadName, { type: "application/json" }),
    );
    const preview = await screen.findByRole("region", { name: "プレビュー" });
    expect(within(preview).getByRole("heading", { name: "リリース手順" })).toBeInTheDocument();
    expect(within(preview).getByText("項目 2 件")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取り込む" }));

    // 新しい id の詳細に着き、チェックはすべて未完了。元のリストは変わらない
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\/[0-9a-f-]+$/));
    expect(router.state.location.pathname).not.toBe(`/lists/${source?.id}`);
    expect(await screen.findByText("「リリース手順」を取り込みました")).toBeInTheDocument();
    expect(await screen.findByText("0 / 2")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "CI を確認" })).not.toBeChecked();
    const lists = await db.checklists.toArray();
    expect(lists).toHaveLength(2);
    const imported = lists.find((l) => l.id !== source?.id);
    expect(imported?.items.map((i) => [i.title, i.checked, i.checkedAt])).toEqual([
      ["CI を確認", false, null],
      ["タグを打つ", false, null],
    ]);
    expect(imported?.items.map((i) => i.id)).not.toEqual(source?.items.map((i) => i.id));
    expect(lists.find((l) => l.id === source?.id)).toEqual(source);
  });

  it("US-6: 既存のリストを複製し、一部を変えた別バージョンを作る。元のリストは変わらない", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await screen.findByText("まだチェックリストがありません");
    await createList(user, "リリース手順", ["CI を確認", "タグを打つ"]);
    await user.click(screen.getByRole("checkbox", { name: "CI を確認" }));
    await waitFor(async () => {
      const [stored] = await db.checklists.toArray();
      expect(stored?.items[0]?.checked).toBe(true);
    });
    const [source] = await db.checklists.toArray();

    // 複製 → 未完了のコピーの詳細に着く
    await user.click(screen.getByRole("button", { name: "操作メニュー" }));
    await user.click(await screen.findByRole("button", { name: "複製" }));
    await screen.findByRole("heading", { level: 1, name: "リリース手順 のコピー" });
    expect(await screen.findByText("0 / 2")).toBeInTheDocument();
    expect(router.state.location.pathname).not.toBe(`/lists/${source?.id}`);

    // 複製を編集して、タイトルと項目を変える
    await user.click(screen.getByRole("link", { name: "編集" }));
    await screen.findByRole("heading", { name: "リストを編集" });
    const title = screen.getByRole("textbox", { name: /タイトル/ });
    await user.clear(title);
    await user.type(title, "ホットフィックス手順");
    await user.click(screen.getByRole("button", { name: "項目 2 を削除" }));
    await user.click(screen.getByRole("button", { name: "項目を追加" }));
    await user.type(screen.getByRole("textbox", { name: "項目 2" }), "動作確認");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("heading", { level: 1, name: "ホットフィックス手順" });

    // 元のリストはそのまま。一覧には 2 件
    const lists = await db.checklists.toArray();
    expect(lists).toHaveLength(2);
    expect(lists.find((l) => l.id === source?.id)).toEqual(source);
    const copy = lists.find((l) => l.id !== source?.id);
    expect(copy?.items.map((i) => [i.title, i.checked])).toEqual([
      ["CI を確認", false],
      ["動作確認", false],
    ]);
    await user.click(screen.getByRole("link", { name: "戻る" }));
    const list = await screen.findByRole("list", { name: "チェックリスト一覧" });
    expect(
      within(list)
        .getAllByRole("heading")
        .map((h) => h.textContent),
    ).toEqual(["ホットフィックス手順", "リリース手順"]);
  });

  it("US-7: 増えたリストから、タグで絞り込み、キーワードで検索して目的のものを探す", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");

    /** タグ付きのリストを作る（タグは Enter で確定） */
    async function createTagged(title: string, tags: string[], items: string[]) {
      await user.click(await screen.findByRole("link", { name: "新規作成" }));
      await screen.findByRole("heading", { name: "新しいリスト" });
      await user.type(screen.getByRole("textbox", { name: /タイトル/ }), title);
      for (const tag of tags) {
        await user.type(screen.getByRole("textbox", { name: /タグ/ }), `${tag}{Enter}`);
      }
      for (const [index, item] of items.entries()) {
        await user.click(screen.getByRole("button", { name: "項目を追加" }));
        await user.type(screen.getByRole("textbox", { name: `項目 ${index + 1}` }), item);
      }
      await user.click(screen.getByRole("button", { name: "保存" }));
      await screen.findByRole("heading", { level: 1, name: title });
      await user.click(screen.getByRole("link", { name: "戻る" }));
      await screen.findByRole("list", { name: "チェックリスト一覧" });
    }
    await createTagged("リリース手順", ["仕事", "リリース"], ["CI を確認"]);
    await createTagged("旅行の持ち物", ["家", "旅行"], ["パスポート"]);
    await createTagged("朝のルーティン", ["家", "習慣"], ["ストレッチ"]);
    const titles = () =>
      within(screen.getByRole("list", { name: "チェックリスト一覧" }))
        .getAllByRole("heading")
        .map((h) => h.textContent);
    expect(titles()).toEqual(["朝のルーティン", "旅行の持ち物", "リリース手順"]);

    // タグで絞る
    const group = screen.getByRole("group", { name: "タグで絞り込む" });
    await user.click(within(group).getByRole("button", { name: "家" }));
    await waitFor(() => expect(titles()).toEqual(["朝のルーティン", "旅行の持ち物"]));

    // 検索語でさらに絞る（項目名でも一致する）
    const box = screen.getByRole("searchbox", { name: "検索" });
    await user.type(box, "パスポート");
    await waitFor(() => expect(titles()).toEqual(["旅行の持ち物"]));

    // クリアとタグの解除で戻る
    await user.click(screen.getByRole("button", { name: "検索をクリア" }));
    await waitFor(() => expect(titles()).toEqual(["朝のルーティン", "旅行の持ち物"]));
    await user.click(within(group).getByRole("button", { name: "家" }));
    await waitFor(() =>
      expect(titles()).toEqual(["朝のルーティン", "旅行の持ち物", "リリース手順"]),
    );

    // 一致しなければ案内を出し、目的のリストへは検索結果のカードから進める
    await user.type(box, "存在しない");
    expect(
      await screen.findByText("「存在しない」に一致するリストはありません"),
    ).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "ci");
    await waitFor(() => expect(titles()).toEqual(["リリース手順"]));
    await user.click(screen.getByRole("link", { name: /リリース手順/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "リリース手順" }),
    ).toBeInTheDocument();
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
