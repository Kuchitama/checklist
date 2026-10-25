import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "@/test/render";
import { UPDATE_TOAST_ID } from "./useAppUpdate";

// toast の呼び出し（id と duration）を確かめるため、sonner の toast を数えられるようにする（既定は本物を呼ぶ）
vi.mock("sonner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sonner")>();
  return { ...actual, toast: Object.assign(vi.fn(actual.toast), actual.toast) };
});

/**
 * vite-plugin-pwa の仮想モジュールを差し替える。needRefresh は本物と同じく React の状態で持ち、
 * テストから setNeedRefresh で「新しい SW が waiting になった」を再現する
 */
const mocks = vi.hoisted(() => ({
  updateServiceWorker: vi.fn((_reload?: boolean) => Promise.resolve()),
  setNeedRefresh: null as null | ((value: boolean) => void),
  hookCalls: 0,
}));

vi.mock("virtual:pwa-register/react", async () => {
  const { useState } = await import("react");
  return {
    useRegisterSW: () => {
      mocks.hookCalls++;
      const [needRefresh, setNeedRefresh] = useState(false);
      mocks.setNeedRefresh = setNeedRefresh;
      return {
        needRefresh: [needRefresh, setNeedRefresh],
        offlineReady: [false, () => {}],
        // 描画のたびに別の関数を返し、effect が再実行されても重複しないことを確かめる
        updateServiceWorker: (reload?: boolean) => mocks.updateServiceWorker(reload),
      };
    },
  };
});

const detectUpdate = () => act(() => mocks.setNeedRefresh?.(true));
const updateToast = () => screen.queryByText("新しいバージョンがあります");

describe("useAppUpdate（更新通知）", () => {
  beforeEach(() => {
    mocks.hookCalls = 0;
  });

  afterEach(() => {
    mocks.updateServiceWorker.mockClear();
    mocks.setNeedRefresh = null;
    vi.mocked(toast).mockClear();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("新しい SW がなければトーストを出さない", async () => {
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");
    expect(mocks.hookCalls).toBeGreaterThan(0);
    expect(updateToast()).not.toBeInTheDocument();
  });

  it("新しい SW を検出したら「新しいバージョンがあります」[再読み込み] を出し、押すと新しい SW を有効化する", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");

    detectUpdate();
    const message = await screen.findByText("新しいバージョンがあります");
    const toastElement = message.closest("[data-sonner-toast]") as HTMLElement;
    expect(toastElement).not.toBeNull();
    const reload = within(toastElement).getByRole("button", { name: "再読み込み" });
    // 部品既定の半透明のリングではなく、不透明な --primary のリング（画面設計書 8 章）
    expect(reload).toHaveClass("focus-visible:ring-primary", "focus-visible:ring-offset-2");
    await user.click(reload);
    expect(mocks.updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("トーストは時間で消えず、画面遷移をまたいで残る", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");
    detectUpdate();
    await screen.findByText("新しいバージョンがあります");

    await user.click(screen.getByRole("link", { name: "設定" }));
    await screen.findByRole("heading", { level: 1, name: "設定" });
    expect(updateToast()).toBeInTheDocument();
    // 時間で消えない（sonner の既定は 4 秒。Dexie とフェイクタイマーは併用できないので、渡した duration で確かめる）
    expect(toast).toHaveBeenCalledWith(
      "新しいバージョンがあります",
      expect.objectContaining({ id: UPDATE_TOAST_ID, duration: Number.POSITIVE_INFINITY }),
    );
    expect(mocks.updateServiceWorker).not.toHaveBeenCalled();
  });

  it("同じ更新で 2 回トーストを出さない", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await screen.findByText("まだチェックリストがありません");
    detectUpdate();
    await screen.findByText("新しいバージョンがあります");
    // テーマの変更で App（ThemeProvider の Context を使う）が再描画され、effect が再実行されても増えない（同じ id で更新する）
    await user.click(screen.getByRole("link", { name: "設定" }));
    await screen.findByRole("heading", { level: 1, name: "設定" });
    await user.click(screen.getByRole("radio", { name: "ダーク" }));
    await waitFor(() => expect(vi.mocked(toast).mock.calls.length).toBeGreaterThan(1));
    expect(screen.getAllByText("新しいバージョンがあります")).toHaveLength(1);
  });

  it("編集中（変更あり）でもトーストを出すだけで、「再読み込み」を押すまで何もしない。押しても破棄確認は出ない", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/lists/new");
    await screen.findByRole("heading", { level: 1, name: "新しいリスト" });
    await user.type(screen.getByRole("textbox", { name: /タイトル/ }), "買い物");

    detectUpdate();
    await screen.findByText("新しいバージョンがあります");
    expect(mocks.updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /タイトル/ })).toHaveValue("買い物");

    await user.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true);
    // ページの再読み込みはルーターの遷移ではないので、破棄確認は出ず、画面も変わらない
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/lists/new");
    expect(screen.getByRole("textbox", { name: /タイトル/ })).toHaveValue("買い物");
  });
});
