import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "@/test/render";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("戻り先がなければアプリ名を一覧へのリンクとして見出しに出す", () => {
    renderWithRouter(<AppShell>本文</AppShell>);

    const heading = screen.getByRole("heading", { level: 1, name: "チェックリスト" });
    expect(heading.querySelector("a")).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "戻る" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("本文");
  });

  it("戻り先を渡すと「戻る」と画面のタイトルを出す", () => {
    renderWithRouter(
      <AppShell title="リリース手順" backTo="/" actions={<button type="button">操作</button>}>
        本文
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { level: 1, name: "リリース手順" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "操作" })).toBeInTheDocument();
  });
});
