import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { toggleItem } from "@/domain/checklists";
import { makeChecklist, makeItem } from "@/test/fixtures";
import { renderApp } from "@/test/render";

// 楽観更新の途中の状態を作るため、toggleItem だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return { ...actual, toggleItem: vi.fn(actual.toggleItem) };
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
