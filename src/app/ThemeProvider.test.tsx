import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEY, type Theme } from "@/domain/settings";
import { installFakeMatchMedia } from "@/test/matchMedia";
import { ThemeProvider, useTheme } from "./ThemeProvider";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Context の値を画面に出し、ボタンで setTheme / reload を呼べるようにする */
function Probe() {
  const { theme, resolved, setTheme, reload } = useTheme();
  return (
    <div>
      <output data-testid="theme">{theme}</output>
      <output data-testid="resolved">{resolved}</output>
      {(["system", "light", "dark"] as const).map((t) => (
        <button key={t} type="button" onClick={() => setTheme(t)}>
          {t}
        </button>
      ))}
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

const renderProvider = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

const isDark = () => document.documentElement.classList.contains("dark");

describe("ThemeProvider", () => {
  let media: ReturnType<typeof installFakeMatchMedia>;

  beforeEach(() => {
    media = installFakeMatchMedia({ [DARK_QUERY]: false });
  });

  afterEach(() => {
    media.restore();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)(
    "設定 %s で OS がダーク=%s なら %s を適用する",
    (theme: Theme, prefersDark, expected) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme }));
      media.set(DARK_QUERY, prefersDark);
      renderProvider();
      expect(screen.getByTestId("theme")).toHaveTextContent(theme);
      expect(screen.getByTestId("resolved")).toHaveTextContent(expected);
      expect(isDark()).toBe(expected === "dark");
    },
  );

  it("保存値が不正なら system として扱う", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "blue" }));
    media.set(DARK_QUERY, true);
    renderProvider();
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(isDark()).toBe(true);
  });

  it("system のときは OS の変更に追従する", () => {
    renderProvider();
    expect(isDark()).toBe(false);
    act(() => media.set(DARK_QUERY, true));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(isDark()).toBe(true);
    act(() => media.set(DARK_QUERY, false));
    expect(isDark()).toBe(false);
  });

  it.each(["light", "dark"] as const)("%s のときは OS の変更を無視する", (theme) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme }));
    renderProvider();
    act(() => media.set(DARK_QUERY, true));
    expect(isDark()).toBe(theme === "dark");
    act(() => media.set(DARK_QUERY, false));
    expect(isDark()).toBe(theme === "dark");
  });

  it("setTheme は即時に html.dark を更新し、localStorage に保存する", async () => {
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(isDark()).toBe(true);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ version: 1, theme: "dark" }));

    await user.click(screen.getByRole("button", { name: "light" }));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify({ version: 1, theme: "light" }));

    // system に戻すと OS の設定（ダーク）に従う
    act(() => media.set(DARK_QUERY, true));
    await user.click(screen.getByRole("button", { name: "system" }));
    expect(isDark()).toBe(true);
  });

  it("reload は localStorage を読み直す（全データ削除の後に system へ戻す）", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, theme: "dark" }));
    renderProvider();
    expect(isDark()).toBe(true);
    localStorage.removeItem(SETTINGS_KEY);
    await user.click(screen.getByRole("button", { name: "reload" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(isDark()).toBe(false);
  });

  it("localStorage が使えない環境では、変更はその場で反映するが保存せず、読み直すと既定値に戻る", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const user = userEvent.setup();
    renderProvider();
    await user.click(screen.getByRole("button", { name: "dark" }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    // 再読み込み相当。保存されていないので既定値（OS に合わせる）に戻る
    await user.click(screen.getByRole("button", { name: "reload" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(isDark()).toBe(false);
  });

  it("アンマウントで OS の監視を解除する", () => {
    const { unmount } = renderProvider();
    expect(media.listenerCount(DARK_QUERY)).toBeGreaterThan(0);
    unmount();
    expect(media.listenerCount(DARK_QUERY)).toBe(0);
  });

  it("ThemeProvider の外で useTheme を使うと分かるエラーになる", () => {
    expect(() => render(<Probe />)).toThrow("ThemeProvider");
  });
});
