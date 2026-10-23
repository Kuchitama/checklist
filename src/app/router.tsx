import { createHashRouter, type RouteObject } from "react-router";
import { ListIndex } from "@/pages/ListIndex/ListIndex";
import { App } from "./App";
import { RootError } from "./RootError";

// ルート定義はこのファイルに 1 箇所で持つ（画面設計書 1 章）。テストも同じ定義を使う。
export const routes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    errorElement: <RootError />,
    children: [{ index: true, element: <ListIndex /> }],
  },
];

// useBlocker を使うため、<HashRouter> ではなくデータルーターで構成する（仕様書 2 章）。
export const router = createHashRouter(routes);
