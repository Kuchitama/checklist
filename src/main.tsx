import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { ThemeProvider } from "./app/ThemeProvider";
import "./index.css";

// Service Worker の登録（仕様書 7 章）。新しい SW は自動では有効化しない（更新通知は Issue #67）
registerSW();

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root が見つかりません");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
