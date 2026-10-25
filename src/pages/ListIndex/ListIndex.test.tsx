import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { searchChecklists } from "@/domain/checklists";
import type { ChecklistItem } from "@/domain/types";
import { makeChecklist } from "@/test/fixtures";
import { renderWithRouter } from "@/test/render";
import { ListIndex } from "./ListIndex";

// 検索の呼び出しを数えるため、searchChecklists だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return { ...actual, searchChecklists: vi.fn(actual.searchChecklists) };
});

const item = (id: string, checked: boolean): ChecklistItem => ({
  id,
  title: `項目 ${id}`,
  note: "",
  url: null,
  dueDate: null,
  checked,
  checkedAt: checked ? "2026-10-02T00:00:00.000Z" : null,
});

describe("ListIndex", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  it("リストが 0 件なら空状態の文言を表示する", async () => {
    renderWithRouter(<ListIndex />);

    expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
  });

  it("保存済みリストのタイトルを updatedAt の降順で表示する", async () => {
    await db.checklists.bulkPut([
      makeChecklist({ id: "a", title: "朝のルーティン", updatedAt: "2026-10-01T00:00:00.000Z" }),
      makeChecklist({ id: "b", title: "リリース手順", updatedAt: "2026-10-03T00:00:00.000Z" }),
      makeChecklist({ id: "c", title: "旅行の持ち物", updatedAt: "2026-10-02T00:00:00.000Z" }),
    ]);

    renderWithRouter(<ListIndex />);

    const list = await screen.findByRole("list", { name: "チェックリスト一覧" });
    const titles = within(list)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["リリース手順", "旅行の持ち物", "朝のルーティン"]);
  });

  it("リストが 0 件なら新規作成への導線を出し、右下の新規作成ボタンは出さない", async () => {
    renderWithRouter(<ListIndex />);

    await screen.findByText("まだチェックリストがありません");
    const links = screen.getAllByRole("link", { name: "新規作成" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/lists/new");
  });

  it("リストがあれば右下に新規作成ボタンを出す", async () => {
    await db.checklists.put(makeChecklist({ id: "a" }));
    renderWithRouter(<ListIndex />);

    await screen.findByRole("list", { name: "チェックリスト一覧" });
    expect(screen.getByRole("link", { name: "新規作成" })).toHaveAttribute("href", "/lists/new");
  });

  it("カードにタグ・進捗・更新日時を出し、カード全体を詳細へのリンクにする", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list-1",
        title: "リリース手順",
        tags: ["仕事", "リリース", "月次", "本番", "確認"],
        items: [item("a", true), item("b", false), item("c", false)],
        updatedAt: new Date(new Date().getFullYear(), 9, 18, 9, 30).toISOString(),
      }),
    );

    renderWithRouter(<ListIndex />);

    const card = await screen.findByRole("link", { name: /リリース手順/ });
    expect(card).toHaveAttribute("href", "/lists/list-1");
    const c = within(card);
    expect(c.getByText("仕事")).toBeInTheDocument();
    expect(c.getByText("リリース")).toBeInTheDocument();
    expect(c.getByText("月次")).toBeInTheDocument();
    expect(c.queryByText("本番")).not.toBeInTheDocument();
    expect(c.getByText("+2")).toBeInTheDocument();
    expect(c.getByText("1 / 3")).toBeInTheDocument();
    const bar = c.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "33");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(c.getByText("更新 10/18 09:30")).toBeInTheDocument();
    expect(c.queryByText("すべて完了")).not.toBeInTheDocument();
  });

  it("全件完了のカードに「すべて完了」を出す。項目 0 件では出さない", async () => {
    await db.checklists.bulkPut([
      makeChecklist({ id: "done", title: "完了済み", items: [item("a", true), item("b", true)] }),
      makeChecklist({ id: "empty", title: "項目なし", items: [] }),
    ]);

    renderWithRouter(<ListIndex />);

    const done = await screen.findByRole("link", { name: /完了済み/ });
    expect(within(done).getByText("すべて完了")).toBeInTheDocument();
    expect(within(done).getByText("2 / 2")).toBeInTheDocument();
    const empty = screen.getByRole("link", { name: /項目なし/ });
    expect(within(empty).queryByText("すべて完了")).not.toBeInTheDocument();
    expect(within(empty).getByText("0 / 0")).toBeInTheDocument();
  });

  it("DB に書き込むと再読み込みなしで一覧に反映する", async () => {
    renderWithRouter(<ListIndex />);
    await screen.findByText("まだチェックリストがありません");

    await db.checklists.put(makeChecklist({ id: "x", title: "あとから追加" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "あとから追加" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("まだチェックリストがありません")).not.toBeInTheDocument();
  });
});

describe("ListIndex のエラー状態", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.checklists.clear();
  });

  it("読み取りに失敗したら案内と再試行ボタンを表示し、再試行で一覧を読み直す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.checklists.put(makeChecklist({ id: "r", title: "再試行で見えるリスト" }));
    const orderBy = vi.spyOn(db.checklists, "orderBy").mockImplementation(() => {
      throw new Error("一時的な読み取り失敗");
    });

    renderWithRouter(<ListIndex />);

    expect(await screen.findByText("リストを読み込めませんでした")).toBeInTheDocument();
    orderBy.mockRestore();
    await userEvent.click(screen.getByRole("button", { name: "再試行" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "再試行で見えるリスト" }),
    ).toBeInTheDocument();
  });

  it("DB を開けない環境では保存できない旨と対処を表示し、再試行ボタンは出さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.checklists, "orderBy").mockImplementation(() => {
      const error = new Error("IndexedDB を開けません");
      error.name = "OpenFailedError";
      throw error;
    });

    renderWithRouter(<ListIndex />);

    expect(await screen.findByText("データを保存できない環境です")).toBeInTheDocument();
    expect(screen.getByText(/プライベートブラウズ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).not.toBeInTheDocument();
  });
});

describe("ListIndex の検索", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(searchChecklists).mockClear();
    await db.checklists.clear();
  });

  const seed = () =>
    db.checklists.bulkPut([
      makeChecklist({
        id: "release",
        title: "リリース手順",
        updatedAt: "2026-10-03T00:00:00.000Z",
        items: [item("r1", false)],
      }),
      makeChecklist({
        id: "travel",
        title: "旅行の持ち物",
        updatedAt: "2026-10-02T00:00:00.000Z",
        items: [{ ...item("t1", false), title: "パスポート" }],
      }),
    ]);

  const titles = () =>
    within(screen.getByRole("list", { name: "チェックリスト一覧" }))
      .getAllByRole("heading")
      .map((h) => h.textContent);

  it("検索ボックス（type=search）を出し、入力をデバウンスして検索する", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithRouter(<ListIndex />);
    const box = await screen.findByRole("searchbox", { name: "検索" });
    expect(box).toHaveAttribute("placeholder", "リストや項目を検索");
    vi.mocked(searchChecklists).mockClear();

    await user.type(box, "リリース手順");

    // 150ms の境界と入力ごとのリセットは useDebouncedValue.test.ts でフェイクタイマーにより確かめる。
    // ここでは、入力の直後には検索せず、待った後に最後の値で検索して結果が出ることを確かめる
    expect(searchChecklists).not.toHaveBeenCalledWith("リリース手順", []);
    await waitFor(() => expect(searchChecklists).toHaveBeenLastCalledWith("リリース手順", []));
    await waitFor(() => expect(titles()).toEqual(["リリース手順"]));
  });

  it("項目名の一致でも表示する。一致がなければ検索語つきの文言を出す", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithRouter(<ListIndex />);
    const box = await screen.findByRole("searchbox", { name: "検索" });

    await user.type(box, "パスポート");
    await waitFor(() => expect(titles()).toEqual(["旅行の持ち物"]));

    await user.clear(box);
    await user.type(box, "存在しない");
    expect(
      await screen.findByText("「存在しない」に一致するリストはありません"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "チェックリスト一覧" })).not.toBeInTheDocument();
  });

  it("クリアボタンで検索語を消すと全件に戻り、フォーカスは検索ボックスに移る", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithRouter(<ListIndex />);
    const box = await screen.findByRole("searchbox", { name: "検索" });
    expect(screen.queryByRole("button", { name: "検索をクリア" })).not.toBeInTheDocument();

    await user.type(box, "手順");
    await waitFor(() => expect(titles()).toEqual(["リリース手順"]));
    await user.click(screen.getByRole("button", { name: "検索をクリア" }));

    expect(box).toHaveValue("");
    expect(box).toHaveFocus();
    await waitFor(() => expect(titles()).toEqual(["リリース手順", "旅行の持ち物"]));
    expect(screen.queryByRole("button", { name: "検索をクリア" })).not.toBeInTheDocument();
  });

  it("検索結果は DB の変更に追従する", async () => {
    await seed();
    const user = userEvent.setup();
    renderWithRouter(<ListIndex />);
    await user.type(await screen.findByRole("searchbox", { name: "検索" }), "手順");
    await waitFor(() => expect(titles()).toEqual(["リリース手順"]));

    await db.checklists.put(
      makeChecklist({ id: "new", title: "新しい手順", updatedAt: "2026-10-04T00:00:00.000Z" }),
    );

    await waitFor(() => expect(titles()).toEqual(["新しい手順", "リリース手順"]));
  });

  it("リストが 0 件の空状態では検索ボックスを出さない", async () => {
    renderWithRouter(<ListIndex />);

    await screen.findByText("まだチェックリストがありません");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
