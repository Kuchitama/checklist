import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";

/** ルートのレイアウト。各画面（Outlet）と、画面遷移をまたいで残すトースト領域を置く */
export function App() {
  return (
    <>
      <Outlet />
      <Toaster position="bottom-center" />
    </>
  );
}
