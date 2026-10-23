import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "@/test/render";

describe("App", () => {
  it("一覧画面でアプリ名を表示する", async () => {
    renderApp("/");
    expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "チェックリスト" })).toBeInTheDocument();
    expect(screen.queryByText("問題が発生しました")).not.toBeInTheDocument();
  });
});
