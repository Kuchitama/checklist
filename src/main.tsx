import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { ThemeProvider } from "./app/ThemeProvider";
import "./index.css";

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
