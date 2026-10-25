import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { readSettings, resolveTheme, type Theme, writeSettings } from "@/domain/settings";
import { useMediaQuery } from "@/lib/useMediaQuery";

type ThemeContextValue = {
  /** 設定の値（OS に合わせる / ライト / ダーク） */
  theme: Theme;
  /** 実際に適用しているテーマ */
  resolved: "light" | "dark";
  /** 設定を変える。即時に html.dark を更新し、localStorage に保存する */
  setTheme: (theme: Theme) => void;
  /** localStorage から読み直す（全データ削除の後に system へ戻すために使う） */
  reload: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * テーマの適用（仕様書 8 章、画面設計書 4 章の ThemeProvider、7.3 節）。
 * 設定が system のときは OS の設定（prefers-color-scheme）に追従し、変更も監視する。light / dark は固定。
 * 初回描画の html.dark は index.html のインラインスクリプトが同じ判定で先に決めている。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readSettings().theme);
  const prefersDark = useMediaQuery(DARK_QUERY);
  const resolved = resolveTheme(theme, prefersDark);

  // 描画と同時に切り替え、ライトで一瞬描かれてからダークになるちらつきを避ける
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    writeSettings({ version: 1, theme: next });
  }, []);
  const reload = useCallback(() => {
    setThemeState(readSettings().theme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, reload }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** ThemeProvider の中で使う */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme は ThemeProvider の中で使う");
  }
  return value;
}
