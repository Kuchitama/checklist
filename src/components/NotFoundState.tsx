import { Link } from "react-router";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";

/** 存在しない id のリストを開いたときの表示（画面設計書 3.6 節）。詳細と編集で共通 */
export function NotFoundState() {
  return (
    <div className="flex flex-col items-center">
      <ErrorState
        title="リストが見つかりません"
        description="削除されたか、別のブラウザで作成されたリストかもしれません"
      />
      <Button asChild variant="secondary">
        <Link to="/">一覧へ</Link>
      </Button>
    </div>
  );
}
