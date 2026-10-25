import { act, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it } from "vitest";
import { SETTINGS_KEY } from "@/domain/settings";
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
    ["/lists/new", "新しいリスト", "/"],
    ["/lists/example-id", "チェックリスト", "/"],
    ["/lists/example-id/edit", "チェックリスト", "/lists/example-id"],
  ])("%s のルートがあり、エラー画面にならない", async (path, title, backTo) => {
    renderApp(path);
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", backTo);
    expect(screen.queryByText("問題が発生しました")).not.toBeInTheDocument();
  });
});

describe("App のトースト領域", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("トーストの配色が設定のテーマに従う", async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");
    act(() => {
      toast("テスト");
    });
    expect(await screen.findByText("テスト")).toBeInTheDocument();
    expect(document.querySelector("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      "dark",
    );
  });
});
