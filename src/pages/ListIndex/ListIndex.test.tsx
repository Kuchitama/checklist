import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
