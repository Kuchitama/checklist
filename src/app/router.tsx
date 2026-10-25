import { createHashRouter, type RouteObject } from "react-router";
import { ListDetail } from "@/pages/ListDetail/ListDetail";
import { ListEdit } from "@/pages/ListEdit/ListEdit";
import { ListIndex } from "@/pages/ListIndex/ListIndex";
import { App } from "./App";
import { RootError } from "./RootError";

// ルート定義はこのファイルに 1 箇所で持つ（画面設計書 1 章）。テストも同じ定義を使う。
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    errorElement: <RootError />,
    children: [
      { index: true, element: <ListIndex /> },
      // lists/new は lists/:id より具体的なので、並び順によらず先に一致する
      { path: "lists/new", element: <ListEdit /> },
      { path: "lists/:id", element: <ListDetail /> },
      { path: "lists/:id/edit", element: <ListEdit /> },
    ],
  },
];

// useBlocker を使うため、<HashRouter> ではなくデータルーターで構成する（仕様書 2 章）。
export const router = createHashRouter(routes);
