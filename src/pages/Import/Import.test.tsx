import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { importChecklist } from "@/domain/checklists";
import { makeChecklist } from "@/test/fixtures";
import invalidDate from "@/test/fixtures/export-invalid-date.json?raw";
import invalidUrl from "@/test/fixtures/export-invalid-url.json?raw";
import notJson from "@/test/fixtures/export-not-json.txt?raw";
import v2 from "@/test/fixtures/export-v2.json?raw";
import valid from "@/test/fixtures/export-valid.json?raw";
import wrongFormat from "@/test/fixtures/export-wrong-format.json?raw";
import { renderApp } from "@/test/render";

vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return { ...actual, importChecklist: vi.fn(actual.importChecklist) };
});

const jsonFile = (text: string, name = "release.json") =>
  new File([text], name, { type: "application/json" });

/** 正常ファイルの checklist を差し替えた文字列 */
function withChecklist(change: (checklist: Record<string, unknown>) => void): string {
  const file = JSON.parse(valid) as { checklist: Record<string, unknown> };
  change(file.checklist);
  return JSON.stringify(file);
}

async function openImport() {
  const user = userEvent.setup();
  const result = renderApp(["/", "/import"]);
  await screen.findByRole("heading", { name: "ファイルを読み込む" });
  return { user, ...result };
}

const fileInput = () => screen.getByLabelText("ファイルを選択") as HTMLInputElement;

describe("Import（読み込み画面）", () => {
  afterEach(async () => {
    toast.dismiss();
    vi.restoreAllMocks();
    vi.mocked(importChecklist).mockClear();
    await db.checklists.clear();
  });

  it("一覧の「読み込み」と空状態の「ファイルを読み込む」から遷移できる", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(["/"]);
    await user.click(await screen.findByRole("link", { name: "ファイルを読み込む" }));
    expect(router.state.location.pathname).toBe("/import");
    expect(await screen.findByRole("heading", { name: "ファイルを読み込む" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
  });

  it("リストがあるときは右下に「読み込み」を出す", async () => {
    await db.checklists.put(makeChecklist({ id: "a", title: "既存" }));
    renderApp(["/"]);
    expect(await screen.findByRole("link", { name: "読み込み" })).toHaveAttribute(
      "href",
      "/import",
    );
    expect(screen.queryByRole("link", { name: "ファイルを読み込む" })).not.toBeInTheDocument();
  });

  it("初期状態は「ファイルを選択」と案内文を出し、.json だけを受け付ける", async () => {
    await openImport();

    expect(fileInput()).toHaveAttribute("accept", ".json,application/json");
    // フォーカスは sr-only の input に当たるので、見えている label に peer で --primary のリングを出す（画面設計書 8 章）
    expect(fileInput()).toHaveClass("peer");
    expect(screen.getByText("ファイルを選択", { selector: "label" })).toHaveClass(
      "peer-focus-visible:ring-2",
      "peer-focus-visible:ring-primary",
    );
    expect(
      screen.getByText("このアプリで書き出した .json ファイルを読み込めます"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取り込む" })).not.toBeInTheDocument();
  });

  it("正常なファイルを選ぶとプレビュー（ファイル名、タイトル、タグ、説明、項目）を出す", async () => {
    const { user } = await openImport();

    await user.upload(fileInput(), jsonFile(valid, "release-20261018.json"));

    const preview = await screen.findByRole("region", { name: "プレビュー" });
    expect(within(preview).getByText("release-20261018.json")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "リリース手順" })).toBeInTheDocument();
    expect(
      within(within(preview).getByRole("list", { name: "タグ" }))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["仕事", "リリース"]);
    expect(within(preview).getByText("本番リリース前に必ず通す確認")).toBeInTheDocument();
    expect(within(preview).getByText("項目 2 件")).toBeInTheDocument();
    const items = within(within(preview).getByRole("list", { name: "項目" })).getAllByRole(
      "listitem",
    );
    expect(items.map((li) => li.textContent)).toEqual([
      "CI が緑であることを確認",
      "リリースノートを書く",
    ]);
    expect(screen.getByText("チェック状態はすべて未完了で取り込まれます")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り込む" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "別のファイル" })).toBeInTheDocument();
  });

  it("説明は先頭 3 行だけ、項目は 20 件まで出し、残りは「ほか N 件」にする", async () => {
    const { user } = await openImport();
    const text = withChecklist((c) => {
      c.description = "1 行目\n2 行目\n3 行目\n4 行目";
      c.items = Array.from({ length: 21 }, (_, i) => ({ title: `項目 ${i + 1}` }));
    });

    await user.upload(fileInput(), jsonFile(text));

    const preview = await screen.findByRole("region", { name: "プレビュー" });
    expect(within(preview).getByText(/1 行目/)).toHaveTextContent("1 行目 2 行目 3 行目 …");
    expect(within(preview).queryByText(/4 行目/)).not.toBeInTheDocument();
    expect(within(preview).getByText("項目 21 件")).toBeInTheDocument();
    expect(
      within(within(preview).getByRole("list", { name: "項目" })).getAllByRole("listitem"),
    ).toHaveLength(20);
    expect(within(preview).getByText("ほか 1 件")).toBeInTheDocument();
  });

  it("項目がちょうど 20 件なら「ほか N 件」を出さない", async () => {
    const { user } = await openImport();
    const text = withChecklist((c) => {
      c.items = Array.from({ length: 20 }, (_, i) => ({ title: `項目 ${i + 1}` }));
    });

    await user.upload(fileInput(), jsonFile(text));

    const preview = await screen.findByRole("region", { name: "プレビュー" });
    expect(
      within(within(preview).getByRole("list", { name: "項目" })).getAllByRole("listitem"),
    ).toHaveLength(20);
    expect(within(preview).queryByText(/ほか \d+ 件/)).not.toBeInTheDocument();
  });

  it.each([
    ["JSON でない", notJson, "JSON ファイルとして読めません"],
    ["format が違う", wrongFormat, "このアプリの書き出しファイルではありません"],
    [
      "version が新しい",
      v2,
      "このファイルは新しいバージョンのアプリで書き出されています。アプリを更新してください",
    ],
  ])("受け入れられないファイルは理由を出し、選び直せる（%s）", async (_name, text, message) => {
    const { user } = await openImport();

    await user.upload(fileInput(), jsonFile(text, "bad.txt"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "取り込む" })).not.toBeInTheDocument();
    // 同じファイルを選び直しても change が起きるよう、入力欄は空に戻す
    expect(fileInput()).toHaveValue("");

    await user.upload(fileInput(), jsonFile(valid));
    expect(await screen.findByRole("region", { name: "プレビュー" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("内容の違反は「項目 N の <欄>: <文言>」の形で列挙する", async () => {
    const { user } = await openImport();

    await user.upload(fileInput(), jsonFile(invalidUrl));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ファイルの内容に問題があります");
    expect(alert).toHaveTextContent("項目 1 の URL: http または https の URL を入力してください");

    await user.upload(fileInput(), jsonFile(invalidDate));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "項目 1 の期限: 存在する日付を入力してください",
      ),
    );

    await user.upload(fileInput(), jsonFile(withChecklist((c) => (c.title = ""))));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("タイトル: タイトルを入力してください"),
    );
  });

  it("違反は 10 件まで列挙し、残りは「ほか N 件」にする", async () => {
    const { user } = await openImport();
    const eleven = withChecklist((c) => {
      c.items = Array.from({ length: 11 }, (_, i) => ({
        title: `項目 ${i + 1}`,
        url: "ftp://example.com",
      }));
    });

    await user.upload(fileInput(), jsonFile(eleven));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(10);
    expect(alert).toHaveTextContent("項目 10 の URL");
    expect(alert).not.toHaveTextContent("項目 11 の URL");
    expect(alert).toHaveTextContent("ほか 1 件");

    const ten = withChecklist((c) => {
      c.items = Array.from({ length: 10 }, (_, i) => ({
        title: `項目 ${i + 1}`,
        url: "ftp://example.com",
      }));
    });
    await user.upload(fileInput(), jsonFile(ten));
    await waitFor(() =>
      expect(within(screen.getByRole("alert")).getAllByRole("listitem")).toHaveLength(10),
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(/ほか \d+ 件/);
  });

  it("20,000,000 バイトを超えるファイルは読まずに拒否する", async () => {
    const { user } = await openImport();
    const file = jsonFile(valid);
    Object.defineProperty(file, "size", { value: 20_000_001 });
    const text = vi.spyOn(file, "text");

    await user.upload(fileInput(), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "このアプリの書き出しファイルではありません",
    );
    expect(text).not.toHaveBeenCalled();
  });

  it("ちょうど 20,000,000 バイトのファイルは読む", async () => {
    const { user } = await openImport();
    const file = jsonFile(valid);
    Object.defineProperty(file, "size", { value: 20_000_000 });

    await user.upload(fileInput(), file);

    expect(await screen.findByRole("region", { name: "プレビュー" })).toBeInTheDocument();
  });

  it("検証中はスピナーを出し、終わると消える", async () => {
    const { user } = await openImport();
    const file = jsonFile(valid);
    let finish: (text: string) => void = () => {};
    vi.spyOn(file, "text").mockReturnValue(new Promise((resolve) => (finish = resolve)));

    await user.upload(fileInput(), file);

    expect(await screen.findByRole("status")).toHaveTextContent("読み込み中");
    finish(valid);
    expect(await screen.findByRole("region", { name: "プレビュー" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("「取り込む」で新しいリストとして保存し、詳細へ遷移してトーストを出す", async () => {
    const { user, router } = await openImport();
    await user.upload(fileInput(), jsonFile(valid));
    await screen.findByRole("region", { name: "プレビュー" });

    await user.click(screen.getByRole("button", { name: "取り込む" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/lists\/[0-9a-f-]+$/));
    const [saved, ...rest] = await db.checklists.toArray();
    expect(rest).toHaveLength(0);
    expect(saved?.title).toBe("リリース手順");
    expect(saved?.items.every((i) => !i.checked)).toBe(true);
    expect(router.state.location.pathname).toBe(`/lists/${saved?.id}`);
    expect(await screen.findByText("「リリース手順」を取り込みました")).toBeInTheDocument();
    // 戻るで読み込み画面に戻らないよう、履歴を置き換える
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("保存に失敗したらトーストを出し、プレビューに留まる", async () => {
    vi.mocked(importChecklist).mockRejectedValueOnce(
      new DOMException("容量不足", "QuotaExceededError"),
    );
    const { user, router } = await openImport();
    await user.upload(fileInput(), jsonFile(valid));
    await screen.findByRole("region", { name: "プレビュー" });

    await user.click(screen.getByRole("button", { name: "取り込む" }));

    expect(
      await screen.findByText("保存できませんでした。空き容量を確認してください"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/import");
    expect(screen.getByRole("button", { name: "取り込む" })).toBeEnabled();
    expect(await db.checklists.count()).toBe(0);
  });

  it("「別のファイル」で初期状態に戻る", async () => {
    const { user } = await openImport();
    await user.upload(fileInput(), jsonFile(valid));
    await screen.findByRole("region", { name: "プレビュー" });

    await user.click(screen.getByRole("button", { name: "別のファイル" }));

    expect(screen.queryByRole("region", { name: "プレビュー" })).not.toBeInTheDocument();
    expect(fileInput()).toBeInTheDocument();
    expect(
      screen.getByText("このアプリで書き出した .json ファイルを読み込めます"),
    ).toBeInTheDocument();
  });
});
