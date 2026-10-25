import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  readSettings,
  removeSettings,
  resolveTheme,
  SETTINGS_KEY,
  writeSettings,
} from "./settings";

describe("readSettings", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("未保存なら既定値（system）を返し、保存はしない", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it("保存した設定を読める", () => {
    writeSettings({ version: 1, theme: "dark" });
    expect(readSettings()).toEqual({ version: 1, theme: "dark" });
  });

  it.each([
    ["JSON として解析できない", "{theme:"],
    ["version が 1 でない", JSON.stringify({ version: 2, theme: "dark" })],
    ["theme が 3 値以外", JSON.stringify({ version: 1, theme: "blue" })],
    ["オブジェクトでない", JSON.stringify("dark")],
  ])("%s ときは既定値で上書きする", (_label, raw) => {
    localStorage.setItem(SETTINGS_KEY, raw);
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify(DEFAULT_SETTINGS));
  });

  it("localStorage が読めない環境では既定値で動作する", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("writeSettings / removeSettings", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("localStorage が書けない環境では例外を外に出さず、保存もしない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeSettings({ version: 1, theme: "light" })).not.toThrow();
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("removeSettings で設定が消え、以後は既定値になる", () => {
    writeSettings({ version: 1, theme: "light" });
    removeSettings();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("localStorage が消せない環境でも例外を外に出さない", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => removeSettings()).not.toThrow();
  });
});

describe("resolveTheme", () => {
  // index.html のインラインスクリプトと同じ判定（画面設計書 7.3 節）
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ] as const)("theme=%s, OS がダーク=%s → %s", (theme, prefersDark, expected) => {
    expect(resolveTheme(theme, prefersDark)).toBe(expected);
  });
});
