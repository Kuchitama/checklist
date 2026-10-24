import { AppShell } from "@/components/AppShell";
import { ErrorState } from "@/components/ErrorState";

/**
 * 画面ごとのエラー境界で受け止められなかったエラーの表示（router の errorElement）。
 * React Router の英語の既定エラー画面を出さないためのもの。
 */
export function RootError() {
  return (
    <AppShell>
      <ErrorState
        title="問題が発生しました"
        description="再読み込みしてください。"
        onRetry={() => window.location.reload()}
      />
    </AppShell>
  );
}
