import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "./ThemeProvider";

/** ルートのレイアウト。各画面（Outlet）と、画面遷移をまたいで残すトースト領域を置く */
export function App() {
  // トーストの配色をアプリのテーマに合わせる（sonner 自身の OS 判定ではなく、設定の値に従う）
  const { resolved } = useTheme();
  return (
    <>
      <Outlet />
      <Toaster position="bottom-center" theme={resolved} />
    </>
  );
}
