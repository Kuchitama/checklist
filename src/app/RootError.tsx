import { ErrorState } from "@/components/ErrorState";

/**
 * 画面ごとのエラー境界で受け止められなかったエラーの表示（router の errorElement）。
 * React Router の英語の既定エラー画面を出さないためのもの。
 */
export function RootError() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">チェックリスト</h1>
      <ErrorState
        title="問題が発生しました"
        description="再読み込みしてください。"
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
