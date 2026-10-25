import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { clearAllData } from "@/domain/checklists";
import { SETTINGS_KEY } from "@/domain/settings";
import { makeChecklist } from "@/test/fixtures";
import { installFakeMatchMedia } from "@/test/matchMedia";
import { renderApp } from "@/test/render";

// 失敗の経路を試すため、clearAllData だけ差し替えられるようにする（既定は本物を呼ぶ）
vi.mock("@/domain/checklists", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/checklists")>();
  return { ...actual, clearAllData: vi.fn(actual.clearAllData) };
});

const DARK_QUERY = "(prefers-color-scheme: dark)";
const isDark = () => document.documentElement.classList.contains("dark");
const dialog = () => screen.getByRole("alertdialog");

async function openSettings() {
  const user = userEvent.setup();
  const result = renderApp(["/", "/settings"]);
  await screen.findByRole("heading", { level: 1, name: "設定" });
  return { user, ...result };
}

/** 「全データを削除」→「次へ」で 2 段階目のダイアログを開く */
async function openSecondStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "全データを削除" }));
  await user.click(screen.getByRole("button", { name: "次へ" }));
  await waitFor(() => expect(dialog()).toHaveAccessibleName("確認"));
  return within(dialog()).getByRole("textbox", { name: "確認のため「削除」と入力してください。" });
}

describe("Settings", () => {
  let media: ReturnType<typeof installFakeMatchMedia>;

  beforeEach(() => {
    media = installFakeMatchMedia({ [DARK_QUERY]: false });
  });

  afterEach(async () => {
    media.restore();
    vi.mocked(clearAllData).mockReset();
    vi.mocked(clearAllData).mockImplementation(
      (await vi.importActual<typeof import("@/domain/checklists")>("@/domain/checklists"))
        .clearAllData,
    );
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    await db.checklists.clear();
  });

  it("ヘッダーに「設定」と「戻る」（一覧へ）を出し、3 つの見出しを持つ", async () => {
    await openSettings();
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/");
    for (const name of ["テーマ", "データ", "アプリ情報"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  describe("テーマ", () => {
    it("現在の設定が選択済みで、選ぶと即時に html.dark と localStorage に反映する", async () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
      const { user } = await openSettings();
      const group = screen.getByRole("radiogroup", { name: "テーマ" });
      expect(within(group).getByRole("radio", { name: "ダーク" })).toBeChecked();
      expect(isDark()).toBe(true);

      await user.click(within(group).getByRole("radio", { name: "ライト" }));
      expect(within(group).getByRole("radio", { name: "ライト" })).toBeChecked();
      expect(isDark()).toBe(false);
      expect(localStorage.getItem(SETTINGS_KEY)).toBe(
        JSON.stringify({ version: 1, theme: "light" }),
      );
    });

    it("ラベルの文字を押しても選べる", async () => {
      const { user } = await openSettings();
      await user.click(screen.getByText("ダーク"));
      expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
      expect(isDark()).toBe(true);
    });

    it("矢印キーで移動すると選択も移る", async () => {
      const { user } = await openSettings();
      const system = screen.getByRole("radio", { name: "OS に合わせる" });
      expect(system).toBeChecked();
      system.focus();
      // Radix はキーを押した後に setTimeout でフォーカスを移し、キーを離す前のフォーカスで選択する。
      // user-event は keydown と keyup を続けて送るので、キーを押したまま移動を待ってから離す
      const pressArrowDown = async (next: string) => {
        await user.keyboard("{ArrowDown>}");
        await waitFor(() => expect(screen.getByRole("radio", { name: next })).toHaveFocus());
        await user.keyboard("{/ArrowDown}");
      };
      await pressArrowDown("ライト");
      expect(screen.getByRole("radio", { name: "ライト" })).toBeChecked();
      expect(isDark()).toBe(false);
      await pressArrowDown("ダーク");
      expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked();
      expect(isDark()).toBe(true);
      expect(localStorage.getItem(SETTINGS_KEY)).toBe(
        JSON.stringify({ version: 1, theme: "dark" }),
      );
    });

    it("「OS に合わせる」のときは OS の変更に追従する", async () => {
      await openSettings();
      act(() => media.set(DARK_QUERY, true));
      expect(isDark()).toBe(true);
    });
  });

  describe("データ", () => {
    it("注意文言と「全データを削除」を出す", async () => {
      await openSettings();
      expect(
        screen.getByText(
          "データはこのブラウザの中にだけ保存されています。大切なリストは書き出して保管してください。",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "全データを削除" })).toBeInTheDocument();
    });

    it("2 段階の確認を通ると全データを削除し、一覧の空状態へ遷移してテーマも既定に戻る", async () => {
      await db.checklists.bulkPut([makeChecklist({ id: "a" }), makeChecklist({ id: "b" })]);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
      const { user, router } = await openSettings();
      expect(isDark()).toBe(true);

      await user.click(screen.getByRole("button", { name: "全データを削除" }));
      expect(dialog()).toHaveAccessibleName("すべてのデータを削除しますか？");
      // 本文はダイアログの説明として読み上げられる（aria-describedby）
      expect(dialog()).toHaveAccessibleDescription(
        "すべてのチェックリストと設定を削除します。この操作は取り消せません。",
      );
      await user.click(within(dialog()).getByRole("button", { name: "次へ" }));

      await waitFor(() => expect(dialog()).toHaveAccessibleName("確認"));
      expect(dialog()).toHaveAccessibleDescription("確認のため「削除」と入力してください。");
      const input = within(dialog()).getByRole("textbox", {
        name: "確認のため「削除」と入力してください。",
      });
      const confirm = within(dialog()).getByRole("button", { name: "削除" });
      expect(confirm).toBeDisabled();
      await user.type(input, "削除");
      expect(confirm).toBeEnabled();
      await user.click(confirm);

      expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/");
      expect(await db.checklists.count()).toBe(0);
      expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
      expect(isDark()).toBe(false);
    });

    it("入力が完全に一致するまで「削除」は無効（前後の空白や別の文字は一致とみなさない）", async () => {
      const { user } = await openSettings();
      const input = await openSecondStep(user);
      const confirm = within(dialog()).getByRole("button", { name: "削除" });
      for (const value of ["削", " 削除", "削除 ", "さくじょ", "削除する"]) {
        await user.clear(input);
        await user.type(input, value);
        expect(confirm).toBeDisabled();
      }
      await user.clear(input);
      await user.type(input, "削除");
      expect(confirm).toBeEnabled();
    });

    it("2 段階目を開くと入力欄にフォーカスが当たり、一致した状態の Enter で確定する", async () => {
      await db.checklists.put(makeChecklist({ id: "a" }));
      const { user } = await openSettings();
      const input = await openSecondStep(user);
      expect(input).toHaveFocus();
      await user.keyboard("削除{Enter}");
      expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
      expect(await db.checklists.count()).toBe(0);
    });

    it("一致していない Enter と IME の変換中の Enter では確定しない", async () => {
      await db.checklists.put(makeChecklist({ id: "a" }));
      const { user } = await openSettings();
      const input = await openSecondStep(user);
      await user.keyboard("削{Enter}");
      expect(dialog()).toBeInTheDocument();
      await user.clear(input);
      await user.type(input, "削除");
      // 変換確定の Enter は isComposing が true で届く
      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
        );
      });
      // Safari では compositionend が先に発火して isComposing が false になり、keyCode が 229 で届く
      act(() => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            isComposing: false,
            keyCode: 229,
            bubbles: true,
          }),
        );
      });
      expect(await db.checklists.count()).toBe(1);
      expect(dialog()).toBeInTheDocument();
    });

    it("1 段階目のキャンセルと 2 段階目の Esc では何も消えない", async () => {
      await db.checklists.put(makeChecklist({ id: "a" }));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "light" }));
      const { user } = await openSettings();

      await user.click(screen.getByRole("button", { name: "全データを削除" }));
      await user.click(within(dialog()).getByRole("button", { name: "キャンセル" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      // 閉じたらフォーカスは起点のボタンへ戻る（画面設計書 8 章）
      expect(screen.getByRole("button", { name: "全データを削除" })).toHaveFocus();

      const input = await openSecondStep(user);
      await user.type(input, "削除");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: "全データを削除" })).toHaveFocus();

      expect(clearAllData).not.toHaveBeenCalled();
      expect(await db.checklists.count()).toBe(1);
      expect(localStorage.getItem(SETTINGS_KEY)).toBe(
        JSON.stringify({ version: 1, theme: "light" }),
      );
      expect(screen.getByRole("heading", { level: 1, name: "設定" })).toBeInTheDocument();
    });

    it("2 段階目を閉じて開き直すと入力は空に戻り、「削除」は無効", async () => {
      const { user } = await openSettings();
      const input = await openSecondStep(user);
      await user.type(input, "削除");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      const reopened = await openSecondStep(user);
      expect(reopened).toHaveValue("");
      expect(within(dialog()).getByRole("button", { name: "削除" })).toBeDisabled();
    });

    it("削除の処理中はキャンセル・Esc で閉じられず、「削除しています」を出す。完了したら一覧へ", async () => {
      await db.checklists.put(makeChecklist({ id: "a" }));
      let finish: () => void = () => {};
      const actual =
        await vi.importActual<typeof import("@/domain/checklists")>("@/domain/checklists");
      vi.mocked(clearAllData).mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = () => resolve(actual.clearAllData());
          }),
      );
      const { user } = await openSettings();
      const input = await openSecondStep(user);
      await user.type(input, "削除");
      await user.click(within(dialog()).getByRole("button", { name: "削除" }));

      // 処理中: 文言が変わり、キャンセルと入力欄は無効、Esc でも閉じない
      const busy = within(dialog()).getByRole("button", { name: "削除しています" });
      expect(busy).toBeDisabled();
      expect(within(dialog()).getByRole("button", { name: "キャンセル" })).toBeDisabled();
      expect(input).toBeDisabled();
      expect(dialog()).toHaveAttribute("aria-busy", "true");
      await user.keyboard("{Escape}");
      await user.click(within(dialog()).getByRole("button", { name: "キャンセル" }));
      expect(dialog()).toBeInTheDocument();
      expect(await db.checklists.count()).toBe(1);

      await act(async () => {
        finish();
      });
      expect(await screen.findByText("まだチェックリストがありません")).toBeInTheDocument();
      expect(await db.checklists.count()).toBe(0);
    });

    it("削除に失敗したらダイアログを閉じてトーストを出し、設定画面に留まる", async () => {
      await db.checklists.put(makeChecklist({ id: "a" }));
      vi.mocked(clearAllData).mockRejectedValueOnce(new Error("QuotaExceededError"));
      const { user, router } = await openSettings();
      const input = await openSecondStep(user);
      await user.type(input, "削除");
      await user.click(within(dialog()).getByRole("button", { name: "削除" }));

      expect(
        await screen.findByText("保存できませんでした。空き容量を確認してください"),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(router.state.location.pathname).toBe("/settings");
      expect(await db.checklists.count()).toBe(1);
      expect(screen.getByRole("button", { name: "全データを削除" })).toHaveFocus();
    });
  });

  describe("アプリ情報", () => {
    it("バージョンとリポジトリへのリンク（新しいタブ）を出す", async () => {
      await openSettings();
      expect(screen.getByText("バージョン 0.1.0")).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /GitHub リポジトリ/ });
      expect(link).toHaveAccessibleName(/新しいタブで開く/);
      expect(link).toHaveAttribute("href", "https://github.com/Kuchitama/checklist");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });
});
