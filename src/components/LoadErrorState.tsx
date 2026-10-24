import { ErrorState } from "@/components/ErrorState";
import { isDatabaseUnavailable } from "@/domain/errors";

type Props = {
  error: unknown;
  onRetry: () => void;
};

/**
 * リストの読み取りに失敗したときの表示（画面設計書 3.1 節・3.6 節、データ設計書 3.4 節）。
 * 一覧と詳細で共通。DB を開けない環境では再試行しても直らないため、再試行ボタンを出さない。
 */
export function LoadErrorState({ error, onRetry }: Props) {
  if (isDatabaseUnavailable(error)) {
    return (
      <ErrorState
        title="データを保存できない環境です"
        description="このブラウザではデータの保存が許可されていません。プライベートブラウズを使っている場合は通常のウィンドウで開いてください。それでも表示されない場合は、ページを再読み込みしてください。"
      />
    );
  }
  return <ErrorState title="リストを読み込めませんでした" onRetry={onRetry} />;
}
