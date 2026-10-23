import { createHashRouter } from "react-router";
import { App } from "./App";
import { RootError } from "./RootError";

// ルート定義はこのファイルに 1 箇所で持つ（画面設計書 1 章）。
// useBlocker を使うため、<HashRouter> ではなくデータルーターで構成する（仕様書 2 章）。
export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RootError />,
  },
]);
