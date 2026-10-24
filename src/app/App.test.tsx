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

  // 画面の中身はそれぞれのテストで確かめる。ここではルートがあり、エラー画面にならないことだけを確かめる
  it.each([
    ["/lists/new", "新しいリスト"],
    ["/lists/example-id", "チェックリスト"],
  ])("%s のルートがあり、エラー画面にならない", async (path, title) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("問題が発生しました")).not.toBeInTheDocument();
  });
});
