import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "@/app/router";
import { ThemeProvider } from "@/app/ThemeProvider";

/** 画面単体を、Link などが動くようメモリ上のルーターの中で描画する */
export function renderWithRouter(ui: ReactElement) {
  const router = createMemoryRouter([{ path: "*", element: ui }]);
  return { router, ...renderInProviders(router) };
}

/**
 * アプリのルート定義をそのまま使い、path の画面を描画する。
 * 配列を渡すと履歴として積み、最後の要素の画面を開く（ブラウザの戻るを試すため）
 */
export function renderApp(path: string | string[] = "/") {
  const router = createMemoryRouter(routes, {
    initialEntries: Array.isArray(path) ? path : [path],
  });
  return { router, ...renderInProviders(router) };
}

/** 本番（main.tsx）と同じプロバイダで包む */
function renderInProviders(router: Parameters<typeof RouterProvider>[0]["router"]) {
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}
