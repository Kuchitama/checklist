import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSettings, resolveTheme, SETTINGS_KEY } from "@/domain/settings";
import { installFakeMatchMedia } from "@/test/matchMedia";
import html from "../../index.html?raw";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** index.html のインラインスクリプト（React の起動前に html.dark を決める）を取り出して実行する */
function runInlineScript() {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) throw new Error("index.html にインラインスクリプトがない");
  new Function(match[1])();
}

/**
 * 起動前スクリプトと ThemeProvider（readSettings + resolveTheme）の判定が一致し、
 * React の起動で配色が切り替わらないことを確かめる（画面設計書 7.3 節）
 */
describe("index.html の起動前のテーマ判定", () => {
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

  const cases: [string, string | null][] = [
    ["未保存", null],
    ["system", JSON.stringify({ version: 1, theme: "system" })],
    ["light", JSON.stringify({ version: 1, theme: "light" })],
    ["dark", JSON.stringify({ version: 1, theme: "dark" })],
    ["version が 2", JSON.stringify({ version: 2, theme: "dark" })],
    ["theme が不正", JSON.stringify({ version: 1, theme: "blue" })],
    ["壊れた JSON", "{theme:"],
    ["オブジェクトでない", JSON.stringify("dark")],
    ["null", "null"],
  ];

  it.each(
    cases.flatMap(([label, raw]) => [false, true].map((dark) => [label, dark, raw] as const)),
  )(
    "保存値が %s で OS がダーク=%s のとき、起動前と起動後の判定が一致する",
    (_label, prefersDark, raw) => {
      if (raw !== null) localStorage.setItem(SETTINGS_KEY, raw);
      media.set(DARK_QUERY, prefersDark);
      runInlineScript();
      const expected = resolveTheme(readSettings().theme, prefersDark);
      expect(document.documentElement.classList.contains("dark")).toBe(expected === "dark");
    },
  );

  it.each([false, true])(
    "localStorage が読めない（OS がダーク=%s）ときも、既定値（OS に合わせる）で一致する",
    (prefersDark) => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });
      media.set(DARK_QUERY, prefersDark);
      runInlineScript();
      const expected = resolveTheme(readSettings().theme, prefersDark);
      expect(document.documentElement.classList.contains("dark")).toBe(prefersDark);
      expect(expected === "dark").toBe(prefersDark);
    },
  );
});
