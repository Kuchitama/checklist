/**
 * 設定データ（データ設計書 6 章）。localStorage の `checklist.settings` に JSON で持つ。
 * localStorage が使えない環境（例外が出る）では既定値で動作し、変更は保存しない。
 */

export type Theme = "system" | "light" | "dark";

export type Settings = {
  version: 1;
  theme: Theme;
};

export const SETTINGS_KEY = "checklist.settings";

export const THEMES: readonly Theme[] = ["system", "light", "dark"];

export const DEFAULT_SETTINGS: Settings = { version: 1, theme: "system" };

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** 保存されている値が設定として解釈できるか。version が 1 で theme が 3 値のどれか */
function parseSettings(raw: string | null): Settings | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { version, theme } = value as { version?: unknown; theme?: unknown };
    if (version !== 1 || !isTheme(theme)) return null;
    return { version: 1, theme };
  } catch {
    return null;
  }
}

/**
 * 設定を読む。解析できない、version が 1 でない、theme が 3 値以外のときは既定値で上書きして返す。
 * localStorage が使えなければ既定値を返す
 */
export function readSettings(): Settings {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch {
    return DEFAULT_SETTINGS;
  }
  const parsed = parseSettings(raw);
  if (parsed) return parsed;
  if (raw !== null) writeSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/** 設定を保存する。localStorage が使えなければ何もしない */
export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できない環境では既定値のまま動作する（データ設計書 6 章）
  }
}

/** 設定を削除する（全データ削除で使う）。localStorage が使えなければ何もしない */
export function removeSettings(): void {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // 同上
  }
}

/**
 * 設定とOS の設定から、実際に適用するテーマを決める。
 * index.html のインラインスクリプト（React の起動前に html.dark を決める）と同じ判定にする（画面設計書 7.3 節）
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}
