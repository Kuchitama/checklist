import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  deleteChecklist,
  duplicateChecklist,
  exportChecklist,
  resetChecklist,
  toggleItem,
} from "@/domain/checklists";
import { makeChecklist, makeItem } from "@/test/fixtures";
import { renderApp } from "@/test/render";

// 楽観更新の途中の状態を作るため、toggleItem だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return {
    ...actual,
    toggleItem: vi.fn(actual.toggleItem),
    resetChecklist: vi.fn(actual.resetChecklist),
    deleteChecklist: vi.fn(actual.deleteChecklist),
    exportChecklist: vi.fn(actual.exportChecklist),
    duplicateChecklist: vi.fn(actual.duplicateChecklist),
  };
});

/** 端末のローカル日付で、今日から days 日後を "YYYY-MM-DD" にする */
function localDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" を今年の表示（M/D）にする。テストの日付はすべて今年に収まる前提ではないので年も見る */
function shown(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  return y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

const checkbox = (name: string) => screen.getByRole("checkbox", { name });

async function openDetail(id = "list") {
  const user = userEvent.setup();
  const result = renderApp(["/", `/lists/${id}`]);
  return { user, ...result };
}

describe("ListDetail", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(toggleItem).mockClear();
    await db.checklists.clear();
  });

  it("ヘッダーにタイトルと「戻る」、本文に説明・タグ・進捗を出す", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        title: "リリース手順",
        description: "本番リリース前に\n必ず通す確認",
        tags: ["仕事", "リリース"],
        items: [
          makeItem({ id: "a", checked: true, checkedAt: "2026-10-01T00:00:00.000Z" }),
          makeItem({ id: "b" }),
        ],
      }),
    );

    await openDetail();

    expect(
      await screen.findByRole("heading", { level: 1, name: "リリース手順" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
    expect(screen.getByText(/本番リリース前に/)).toHaveTextContent("本番リリース前に 必ず通す確認");
    expect(screen.getByText("仕事")).toBeInTheDocument();
    expect(screen.getByText("リリース")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.queryByText("すべて完了")).not.toBeInTheDocument();
  });

  it("進捗の横に「編集」を出し、編集画面へのリンクにする", async () => {
    await db.checklists.put(makeChecklist({ id: "list", items: [makeItem({ id: "a" })] }));

    await openDetail();

    expect(await screen.findByRole("link", { name: "編集" })).toHaveAttribute(
      "href",
      "/lists/list/edit",
    );
  });

  it("説明とタグが空なら出さない", async () => {
    await db.checklists.put(
      makeChecklist({ id: "list", title: "空の説明", items: [makeItem({ id: "a" })] }),
    );

    await openDetail();

    await screen.findByRole("heading", { level: 1, name: "空の説明" });
    expect(screen.queryByTestId("description")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "タグ" })).not.toBeInTheDocument();
  });

  it("全件完了なら「すべて完了」を出す", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [makeItem({ id: "a", checked: true, checkedAt: "2026-10-01T00:00:00.000Z" })],
      }),
    );

    await openDetail();

    expect(await screen.findByText("すべて完了")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("項目 0 件なら 0 / 0 と案内を出す", async () => {
    await db.checklists.put(makeChecklist({ id: "list", items: [] }));

    await openDetail();

    expect(
      await screen.findByText("項目がありません。編集から追加してください"),
    ).toBeInTheDocument();
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
    expect(screen.queryByText("すべて完了")).not.toBeInTheDocument();
  });

  it("行全体が label で包んだ checkbox になり、行を押すと切り替わる。Space でも切り替わる", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [makeItem({ id: "a", title: "パスポート", note: "期限を確認" })],
      }),
    );
    const { user } = await openDetail();

    const box = await screen.findByRole("checkbox", { name: "パスポート" });
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box.closest("label")).not.toBeNull();

    await user.click(screen.getByText("期限を確認"));
    await waitFor(() => expect(box).toBeChecked());
    await waitFor(async () =>
      expect((await db.checklists.get("list"))?.items[0]?.checked).toBe(true),
    );

    box.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(box).not.toBeChecked());
    await waitFor(async () =>
      expect((await db.checklists.get("list"))?.items[0]?.checked).toBe(false),
    );
  });

  it("チェック済みの項目は取り消し線と「完了 M/D HH:mm」を出し、期限は出さない", async () => {
    const checkedAt = new Date(new Date().getFullYear(), 9, 18, 9, 30).toISOString();
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [
          makeItem({
            id: "a",
            title: "済んだ項目",
            checked: true,
            checkedAt,
            dueDate: localDate(-1),
          }),
        ],
      }),
    );

    await openDetail();

    const title = await screen.findByText("済んだ項目");
    expect(title).toHaveClass("line-through");
    expect(screen.getByText("完了 10/18 09:30")).toBeInTheDocument();
    expect(screen.queryByText(/期限/)).not.toBeInTheDocument();
  });

  it("補足メモを表示し、URL はリンクアイコンで出す。リンクを押してもチェックは切り替わらない", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [
          makeItem({
            id: "a",
            title: "手順書を読む",
            note: "1 行目\n2 行目",
            url: "https://example.com/doc",
          }),
        ],
      }),
    );
    const { user } = await openDetail();

    expect(await screen.findByText(/1 行目/)).toHaveTextContent("1 行目 2 行目");
    const link = screen.getByRole("link", { name: "「手順書を読む」のリンクを開く" });
    expect(link).toHaveAttribute("href", "https://example.com/doc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);

    expect(checkbox("手順書を読む")).not.toBeChecked();
    expect(toggleItem).not.toHaveBeenCalled();
  });

  it("期限を 3 状態で表示する（期限超過・今日・通常）", async () => {
    const [past, today, future] = [localDate(-1), localDate(0), localDate(1)];
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [
          makeItem({ id: "a", title: "昨日まで", dueDate: past }),
          makeItem({ id: "b", title: "今日まで", dueDate: today }),
          makeItem({ id: "c", title: "明日まで", dueDate: future }),
        ],
      }),
    );

    await openDetail();

    expect(await screen.findByText(`⚠ 期限超過 ${shown(past)}`)).toHaveClass("text-destructive");
    expect(screen.getByText(`● 今日 ${shown(today)}`)).toHaveClass("text-warning");
    expect(screen.getByText(`期限 ${shown(future)}`)).toBeInTheDocument();
  });

  it("開いたまま日付が変わったら、期限の状態を表示し直す", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 23, 23, 0, 0));
    await db.checklists.put(
      makeChecklist({
        id: "list",
        items: [makeItem({ id: "a", title: "告知を出す", dueDate: "2026-10-23" })],
      }),
    );
    try {
      await openDetail();
      expect(await screen.findByText("● 今日 10/23")).toBeInTheDocument();

      vi.setSystemTime(new Date(2026, 9, 24, 7, 0, 0));
      act(() => document.dispatchEvent(new Event("visibilitychange")));

      expect(await screen.findByText("⚠ 期限超過 10/23")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("チェックは押した直後に表示と進捗へ反映し、連打しても最後に押した状態を保ってから DB の値に合流する", async () => {
    await db.checklists.put(
      makeChecklist({ id: "list", items: [makeItem({ id: "a", title: "パスポート" })] }),
    );
    const finishers: (() => void)[] = [];
    vi.mocked(toggleItem).mockImplementation(
      () => new Promise<void>((resolve) => finishers.push(resolve)),
    );
    const { user } = await openDetail();
    const box = await screen.findByRole("checkbox", { name: "パスポート" });

    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();

    await user.click(box);
    expect(box).not.toBeChecked();
    expect(screen.getByText("0 / 1")).toBeInTheDocument();

    // 1 回目の書き込みが終わり、その購読更新（チェック済み）が届いても、2 回目が進行中なので表示は変えない
    await act(async () => {
      await db.checklists.update("list", {
        items: [
          makeItem({
            id: "a",
            title: "パスポート",
            checked: true,
            checkedAt: "2026-10-01T00:00:00.000Z",
          }),
        ],
      });
      finishers[0]?.();
    });
    expect(box).not.toBeChecked();

    // 2 回目が終わると DB の最終値（未チェック）に合流する
    await act(async () => {
      await db.checklists.update("list", { items: [makeItem({ id: "a", title: "パスポート" })] });
      finishers[1]?.();
    });
    await waitFor(() => expect(box).not.toBeChecked());
    expect(toggleItem).toHaveBeenNthCalledWith(1, "list", "a", true);
    expect(toggleItem).toHaveBeenNthCalledWith(2, "list", "a", false);
  });

  it("書き込みが終わっても、それを反映した購読値が届くまでは一時状態を保つ（巻き戻らない）", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        updatedAt: "2026-10-01T00:00:00.000Z",
        items: [makeItem({ id: "a", title: "パスポート" })],
      }),
    );
    // 保存は完了したが、購読値（useLiveQuery）はまだ古い、という順序を作る
    vi.mocked(toggleItem).mockResolvedValueOnce(undefined);
    const { user } = await openDetail();
    const box = await screen.findByRole("checkbox", { name: "パスポート" });

    await user.click(box);
    await act(async () => {});

    expect(box).toBeChecked();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();

    await act(async () => {
      await db.checklists.put(
        makeChecklist({
          id: "list",
          updatedAt: "2026-10-02T00:00:00.000Z",
          items: [
            makeItem({
              id: "a",
              title: "パスポート",
              checked: true,
              checkedAt: "2026-10-02T00:00:00.000Z",
            }),
          ],
        }),
      );
    });
    await waitFor(() => expect(screen.getByText(/^完了 /)).toBeInTheDocument());
    expect(box).toBeChecked();
  });

  it("書き込み後に別の書き込みで値が変わったら、一時状態を捨てて DB の値を出す", async () => {
    await db.checklists.put(
      makeChecklist({
        id: "list",
        updatedAt: "2026-10-01T00:00:00.000Z",
        items: [makeItem({ id: "a", title: "パスポート" })],
      }),
    );
    vi.mocked(toggleItem).mockResolvedValueOnce(undefined);
    const { user } = await openDetail();
    const box = await screen.findByRole("checkbox", { name: "パスポート" });

    await user.click(box);
    await act(async () => {});
    expect(box).toBeChecked();

    // 別のタブなどで未チェックのまま更新された（updatedAt が変わった）
    await act(async () => {
      await db.checklists.put(
        makeChecklist({
          id: "list",
          updatedAt: "2026-10-02T00:00:00.000Z",
          items: [makeItem({ id: "a", title: "パスポート" })],
        }),
      );
    });
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it("書き込みに失敗したら表示を DB の値に戻し、トーストを出す", async () => {
    await db.checklists.put(
      makeChecklist({ id: "list", items: [makeItem({ id: "a", title: "パスポート" })] }),
    );
    vi.mocked(toggleItem).mockRejectedValueOnce(new DOMException("容量不足", "QuotaExceededError"));
    const { user } = await openDetail();
    const box = await screen.findByRole("checkbox", { name: "パスポート" });

    await user.click(box);

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
  });

  it("存在しない id なら「見つかりません」と一覧への導線を出す", async () => {
    await openDetail("missing");

    expect(await screen.findByText("リストが見つかりません")).toBeInTheDocument();
    expect(
      screen.getByText("削除されたか、別のブラウザで作成されたリストかもしれません"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一覧へ" })).toHaveAttribute("href", "/");
  });
});

describe("ListDetail のエラー状態", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.checklists.clear();
  });

  it("読み取りに失敗したら案内と再試行ボタンを出し、再試行で読み直す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await db.checklists.put(makeChecklist({ id: "list", title: "再試行で見えるリスト" }));
    const get = vi.spyOn(db.checklists, "get").mockImplementation(() => {
      throw new Error("一時的な読み取り失敗");
    });
    const { user } = await openDetail();

    expect(await screen.findByText("リストを読み込めませんでした")).toBeInTheDocument();
    get.mockRestore();
    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "再試行で見えるリスト" }),
    ).toBeInTheDocument();
  });

  it("DB を開けない環境では保存できない旨を出し、再試行ボタンは出さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.checklists, "get").mockImplementation(() => {
      const error = new Error("IndexedDB を開けません");
      error.name = "OpenFailedError";
      throw error;
    });

    await openDetail();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("データを保存できない環境です")).toBeInTheDocument();
    expect(within(alert).getByText(/プライベートブラウズ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).not.toBeInTheDocument();
  });
});

describe("ListDetail の操作メニュー", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(async () => {
    window.matchMedia = originalMatchMedia;
    // トーストはモジュール内に状態を持ち、次のテストの Toaster にも出るので消す
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(resetChecklist).mockClear();
    vi.mocked(deleteChecklist).mockClear();
    await db.checklists.clear();
  });

  const seed = () =>
    db.checklists.put(
      makeChecklist({
        id: "list",
        title: "リリース手順",
        items: [
          makeItem({
            id: "a",
            title: "CI を確認",
            checked: true,
            checkedAt: "2026-10-01T00:00:00.000Z",
          }),
          makeItem({ id: "b", title: "タグを打つ" }),
        ],
      }),
    );

  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "操作メニュー" }));
  };

  it("幅 640px 未満では、ヘッダー右の「操作メニュー」からボトムシートで「リセット」「削除」を出す", async () => {
    await seed();
    const { user } = await openDetail();

    await openMenu(user);

    const sheet = await screen.findByRole("dialog", { name: "操作メニュー" });
    expect(within(sheet).getByRole("button", { name: "リセット" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "削除" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "キャンセル" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "操作メニュー" })).not.toBeInTheDocument(),
    );
  });

  it("幅 640px 以上では、ドロップダウンで出す", async () => {
    window.matchMedia = (query: string) =>
      ({ ...originalMatchMedia(query), matches: query === "(min-width: 640px)" }) as MediaQueryList;
    await seed();
    const { user } = await openDetail();

    await openMenu(user);

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "リセット" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "削除" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "操作メニュー" })).not.toBeInTheDocument();
  });

  it("「リセット」は確認ダイアログを出し、確定すると全項目が未完了になって同じ画面に留まる", async () => {
    await seed();
    const { user, router } = await openDetail();
    await openMenu(user);

    await user.click(await screen.findByRole("button", { name: "リセット" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "すべてのチェックを外しますか？",
    });
    expect(
      within(dialog).getByText("完了日時も消えます。項目はそのまま残ります。"),
    ).toBeInTheDocument();
    const cancel = within(dialog).getByRole("button", { name: "キャンセル" });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.click(within(dialog).getByRole("button", { name: "リセット" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("0 / 2")).toBeInTheDocument());
    const stored = await db.checklists.get("list");
    expect(stored?.items.map((i) => [i.checked, i.checkedAt])).toEqual([
      [false, null],
      [false, null],
    ]);
    expect(stored?.items.map((i) => i.title)).toEqual(["CI を確認", "タグを打つ"]);
    expect(router.state.location.pathname).toBe("/lists/list");
  });

  it("確認ダイアログは Esc でキャンセルでき、キャンセルでは何も変わらない", async () => {
    await seed();
    const { user } = await openDetail();
    await openMenu(user);
    await user.click(await screen.findByRole("button", { name: "リセット" }));
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(resetChecklist).not.toHaveBeenCalled();
    expect((await db.checklists.get("list"))?.items[0]?.checked).toBe(true);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("「削除」は確認ダイアログを出し、確定するとリストを削除して一覧へ戻る", async () => {
    await seed();
    const { user, router } = await openDetail();
    await openMenu(user);

    await user.click(await screen.findByRole("button", { name: "削除" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "「リリース手順」を削除しますか？",
    });
    expect(
      within(dialog).getByText("この操作は取り消せません。必要なら先に書き出してください。"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "キャンセル" })).toHaveFocus(),
    );

    await user.click(within(dialog).getByRole("button", { name: "削除" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await db.checklists.get("list")).toBeUndefined();
    expect(screen.queryByText("リストが見つかりません")).not.toBeInTheDocument();
  });

  it("削除の確認をキャンセルすると、何も変わらない", async () => {
    await seed();
    const { user, router } = await openDetail();
    await openMenu(user);
    await user.click(await screen.findByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(deleteChecklist).not.toHaveBeenCalled();
    expect(await db.checklists.get("list")).toBeDefined();
    expect(router.state.location.pathname).toBe("/lists/list");
  });

  it.each([
    ["リセット", resetChecklist, "/lists/list"],
    ["削除", deleteChecklist, "/lists/list"],
  ])("%sの書き込みに失敗したらトーストを出す", async (label, fn, path) => {
    await seed();
    vi.mocked(fn).mockRejectedValueOnce(new DOMException("容量不足", "QuotaExceededError"));
    const { user, router } = await openDetail();
    await openMenu(user);
    await user.click(await screen.findByRole("button", { name: label }));
    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: label }));

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(path);
    expect(await db.checklists.get("list")).toBeDefined();
  });
});

describe("ListDetail の書き出し", () => {
  /** ダウンロードは jsdom では動かないので、Blob と a 要素のクリックを捕まえる */
  const captured: { blob?: Blob; name?: string; revoked: string[] } = { revoked: [] };

  beforeEach(() => {
    captured.blob = undefined;
    captured.name = undefined;
    captured.revoked = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      captured.blob = blob;
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      captured.revoked.push(url);
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured.name = this.download;
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0));
  });

  afterEach(async () => {
    vi.useRealTimers();
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(exportChecklist).mockClear();
    await db.checklists.clear();
  });

  const seed = () =>
    db.checklists.put(
      makeChecklist({
        id: "list",
        title: "リリース手順: v2",
        tags: ["仕事"],
        items: [
          makeItem({
            id: "a",
            title: "CI を確認",
            checked: true,
            checkedAt: "2026-10-01T00:00:00.000Z",
          }),
          makeItem({ id: "b", title: "タグを打つ", url: "https://example.com/tag" }),
        ],
      }),
    );

  it("操作メニューに「書き出し」があり、選ぶと JSON をダウンロードしてトーストを出す", async () => {
    await seed();
    const { user } = await openDetail();
    await user.click(await screen.findByRole("button", { name: "操作メニュー" }));

    const sheet = await screen.findByRole("dialog", { name: "操作メニュー" });
    const labels = within(sheet)
      .getAllByRole("button")
      .map((b) => b.textContent?.trim());
    expect(labels).toEqual(["リセット", "複製", "書き出し", "削除", "キャンセル"]);
    await user.click(within(sheet).getByRole("button", { name: "書き出し" }));

    expect(await screen.findByText("ファイルを書き出しました")).toBeInTheDocument();
    expect(captured.name).toBe("checklist-リリース手順__v2-20261025.json");
    expect(captured.blob?.type).toBe("application/json");
    const text = await captured.blob?.text();
    expect(JSON.parse(text ?? "")).toEqual({
      format: "checklist-export",
      version: 1,
      exportedAt: new Date(2026, 9, 25, 12, 0, 0).toISOString(),
      checklist: {
        title: "リリース手順: v2",
        description: "",
        tags: ["仕事"],
        items: [
          { title: "CI を確認", note: "", url: null, dueDate: null },
          { title: "タグを打つ", note: "", url: "https://example.com/tag", dueDate: null },
        ],
      },
    });
    expect(text).not.toContain('"checked"');
    expect(captured.revoked).toEqual(["blob:mock"]);
  });

  it("書き出した後はフォーカスが「操作メニュー」に戻る（ボトムシート）", async () => {
    await seed();
    const { user } = await openDetail();
    const menuButton = await screen.findByRole("button", { name: "操作メニュー" });
    await user.click(menuButton);

    await user.click(await screen.findByRole("button", { name: "書き出し" }));

    await screen.findByText("ファイルを書き出しました");
    await waitFor(() => expect(menuButton).toHaveFocus());
  });

  it("書き出した後はフォーカスが「操作メニュー」に戻る（ドロップダウン）", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({ ...originalMatchMedia(query), matches: query === "(min-width: 640px)" }) as MediaQueryList;
    try {
      await seed();
      const { user } = await openDetail();
      const menuButton = await screen.findByRole("button", { name: "操作メニュー" });
      await user.click(menuButton);

      await user.click(await screen.findByRole("menuitem", { name: "書き出し" }));

      await screen.findByText("ファイルを書き出しました");
      await waitFor(() => expect(menuButton).toHaveFocus());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("読み取りに失敗したらトーストで知らせ、ダウンロードしない", async () => {
    await seed();
    vi.mocked(exportChecklist).mockRejectedValueOnce(new Error("読み取り失敗"));
    const { user } = await openDetail();
    await user.click(await screen.findByRole("button", { name: "操作メニュー" }));

    await user.click(await screen.findByRole("button", { name: "書き出し" }));

    expect(await screen.findByText("書き出せませんでした")).toBeInTheDocument();
    expect(captured.name).toBeUndefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("ListDetail の複製", () => {
  afterEach(async () => {
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(duplicateChecklist).mockClear();
    await db.checklists.clear();
  });

  const seed = () =>
    db.checklists.put(
      makeChecklist({
        id: "list",
        title: "リリース手順",
        tags: ["仕事"],
        items: [
          makeItem({
            id: "a",
            title: "CI を確認",
            checked: true,
            checkedAt: "2026-10-01T00:00:00.000Z",
          }),
          makeItem({ id: "b", title: "タグを打つ" }),
        ],
      }),
    );

  it("操作メニューの「複製」で、未完了の複製を作って詳細へ遷移し、トーストを出す。戻ると元の詳細", async () => {
    await seed();
    const { user, router } = await openDetail();
    await user.click(await screen.findByRole("button", { name: "操作メニュー" }));
    const sheet = await screen.findByRole("dialog", { name: "操作メニュー" });
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((b) => b.textContent?.trim()),
    ).toEqual(["リセット", "複製", "書き出し", "削除", "キャンセル"]);

    await user.click(within(sheet).getByRole("button", { name: "複製" }));

    await waitFor(() => expect(router.state.location.pathname).not.toBe("/lists/list"));
    const copies = (await db.checklists.toArray()).filter((c) => c.id !== "list");
    expect(copies).toHaveLength(1);
    const copy = copies[0];
    expect(router.state.location.pathname).toBe(`/lists/${copy?.id}`);
    expect(copy?.title).toBe("リリース手順 のコピー");
    expect(copy?.items.every((i) => !i.checked && i.checkedAt === null)).toBe(true);
    expect(await screen.findByText("「リリース手順 のコピー」を複製しました")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 1, name: "リリース手順 のコピー" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 / 2")).toBeInTheDocument();
    // 履歴は積む。戻ると元の詳細
    expect(router.state.historyAction).toBe("PUSH");
    await user.click(screen.getByRole("link", { name: "戻る" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("複製に失敗したらトーストを出し、元の画面に留まる", async () => {
    await seed();
    vi.mocked(duplicateChecklist).mockRejectedValueOnce(
      new DOMException("容量不足", "QuotaExceededError"),
    );
    const { user, router } = await openDetail();
    await user.click(await screen.findByRole("button", { name: "操作メニュー" }));

    await user.click(await screen.findByRole("button", { name: "複製" }));

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/lists/list");
    expect(await db.checklists.count()).toBe(1);
  });

  it("キーボードで複製を選んだ後、フォーカスは操作メニューのトリガーに戻る", async () => {
    await seed();
    const { user } = await openDetail();
    const menuButton = await screen.findByRole("button", { name: "操作メニュー" });
    menuButton.focus();
    await user.keyboard("[Enter]");
    const sheet = await screen.findByRole("dialog", { name: "操作メニュー" });
    within(sheet).getByRole("button", { name: "複製" }).focus();
    await user.keyboard("[Enter]");

    await screen.findByText(/を複製しました/);
    await waitFor(() => expect(screen.getByRole("button", { name: "操作メニュー" })).toHaveFocus());
  });
});
