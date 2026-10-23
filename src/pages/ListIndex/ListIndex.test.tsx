import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { makeChecklist } from "@/test/fixtures";
import { ListIndex } from "./ListIndex";

describe("ListIndex", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  it("リストが 0 件なら空状態の文言を表示する", async () => {
    render(<ListIndex />);

    expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
  });

  it("保存済みリストのタイトルを updatedAt の降順で表示する", async () => {
    await db.checklists.bulkPut([
      makeChecklist({ id: "a", title: "朝のルーティン", updatedAt: "2026-10-01T00:00:00.000Z" }),
      makeChecklist({ id: "b", title: "リリース手順", updatedAt: "2026-10-03T00:00:00.000Z" }),
      makeChecklist({ id: "c", title: "旅行の持ち物", updatedAt: "2026-10-02T00:00:00.000Z" }),
    ]);

    render(<ListIndex />);

    const list = await screen.findByRole("list", { name: "チェックリスト一覧" });
    const titles = within(list)
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(["リリース手順", "旅行の持ち物", "朝のルーティン"]);
  });

  it("DB に書き込むと再読み込みなしで一覧に反映する", async () => {
    render(<ListIndex />);
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

    render(<ListIndex />);

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

    render(<ListIndex />);

    expect(await screen.findByText("データを保存できない環境です")).toBeInTheDocument();
    expect(screen.getByText(/プライベートブラウズ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "再試行" })).not.toBeInTheDocument();
  });
});
