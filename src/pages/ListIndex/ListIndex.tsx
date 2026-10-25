import { useLiveQuery } from "dexie-react-hooks";
import { FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AppShell } from "@/components/AppShell";
import { ChecklistCard } from "@/components/ChecklistCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadErrorState } from "@/components/LoadErrorState";
import { SearchBox } from "@/components/SearchBox";
import { Button } from "@/components/ui/button";
import { listChecklists, searchChecklists } from "@/domain/checklists";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

/**
 * 一覧画面（画面設計書 3.1 節）。検索で絞り込める。タグ絞り込みは後続の Issue で加える。
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

/** 読み込み画面への導線（副ボタン）。空状態では文言を「ファイルを読み込む」にする（画面設計書 3.1 節） */
function ImportButton({ label, className }: { label: string; className?: string }) {
  return (
    <Button asChild size="lg" variant="secondary" className={className}>
      <Link to="/import">
        <FileUp aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

/** 検索の入力を待つ時間（画面設計書 3.1 節） */
const SEARCH_DEBOUNCE_MS = 150;

function ListIndexContent() {
  const [query, setQuery] = useState("");
  // 入力を 150ms 待ってから検索する。検索語は画面の状態だけに持ち、URL には持たない
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  // 全件（空状態の判定）と検索結果を別に購読する。どちらも DB の変更に追従する
  const all = useLiveQuery(listChecklists, []);
  const checklists = useLiveQuery(() => searchChecklists(debouncedQuery, []), [debouncedQuery]);

  // 読み込み中は何も描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節）
  if (all === undefined || checklists === undefined) return null;

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">まだチェックリストがありません</p>
        <div className="flex flex-wrap justify-center gap-2">
          <NewChecklistButton />
          <ImportButton label="ファイルを読み込む" />
        </div>
      </div>
    );
  }

  const trimmedQuery = debouncedQuery.trim();
  return (
    <div className="flex flex-col gap-4">
      <SearchBox value={query} onChange={setQuery} />
      {checklists.length === 0 ? (
        // 文言は画面設計書 6.3 節
        <p className="py-12 text-center text-muted-foreground">
          {`「${trimmedQuery}」に一致するリストはありません`}
        </p>
      ) : (
        // 右下の固定ボタンに最後のカードが隠れないよう、下に余白を取る
        <ul aria-label="チェックリスト一覧" className="flex flex-col gap-3 pb-20">
          {checklists.map((checklist) => (
            <li key={checklist.id}>
              <ChecklistCard checklist={checklist} />
            </li>
          ))}
        </ul>
      )}
      <div className="fixed right-4 bottom-4 flex gap-2">
        <ImportButton label="読み込み" className="shadow-lg" />
        <NewChecklistButton className="shadow-lg" />
      </div>
    </div>
  );
}
