import { ListIndex } from "@/pages/ListIndex/ListIndex";

/** アプリの外枠。M1 では一覧画面だけを表示する（ルートは src/app/router.tsx） */
export function App() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">チェックリスト</h1>
      <ListIndex />
    </main>
  );
}
