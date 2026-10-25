import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { AppShell } from "@/components/AppShell";
import { ChecklistCard } from "@/components/ChecklistCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadErrorState } from "@/components/LoadErrorState";
import { Button } from "@/components/ui/button";
import { listChecklists } from "@/domain/checklists";

/**
 * 一覧画面（画面設計書 3.1 節）。検索・タグ絞り込み（M4）と読み込み（M3）は後続のマイルストーンで追加する。
 */
export function ListIndex() {
  return (
    <AppShell>
      <ErrorBoundary fallback={(error, reset) => <LoadErrorState error={error} onRetry={reset} />}>
        <ListIndexContent />
      </ErrorBoundary>
    </AppShell>
  );
}

function NewChecklistButton({ className }: { className?: string }) {
  return (
    <Button asChild size="lg" className={className}>
      <Link to="/lists/new">
        <Plus aria-hidden="true" />
        新規作成
      </Link>
    </Button>
  );
}

function ListIndexContent() {
  const checklists = useLiveQuery(listChecklists, []);

  // 読み込み中は何も描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節）
  if (checklists === undefined) return null;

  if (checklists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">まだチェックリストがありません</p>
        <NewChecklistButton />
      </div>
    );
  }

  return (
    <>
      {/* 右下の固定ボタンに最後のカードが隠れないよう、下に余白を取る */}
      <ul aria-label="チェックリスト一覧" className="flex flex-col gap-3 pb-20">
        {checklists.map((checklist) => (
          <li key={checklist.id}>
            <ChecklistCard checklist={checklist} />
          </li>
        ))}
      </ul>
      <NewChecklistButton className="fixed right-4 bottom-4 shadow-lg" />
    </>
  );
}
