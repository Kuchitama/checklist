import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { useTheme } from "./ThemeProvider";
import { useAppUpdate } from "./useAppUpdate";

/** ルートのレイアウト。各画面（Outlet）と、画面遷移をまたいで残すトースト領域を置く */
export function App() {
  // トーストの配色をアプリのテーマに合わせる（sonner 自身の OS 判定ではなく、設定の値に従う）
  const { resolved } = useTheme();
  // Service Worker の登録と更新通知。画面遷移をまたいで残すためルートで呼ぶ
  useAppUpdate();
  return (
    <>
      <Outlet />
      <Toaster position="bottom-center" theme={resolved} />
    </>
  );
}
