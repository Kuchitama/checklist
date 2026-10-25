import { useLiveQuery } from "dexie-react-hooks";
import { FileUp, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AppShell } from "@/components/AppShell";
import { ChecklistCard } from "@/components/ChecklistCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadErrorState } from "@/components/LoadErrorState";
import { SearchBox } from "@/components/SearchBox";
import { TagFilter } from "@/components/TagFilter";
import { Button } from "@/components/ui/button";
import { listChecklists, searchChecklists } from "@/domain/checklists";
import type { Checklist } from "@/domain/types";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

/**
 * 一覧画面（画面設計書 3.1 節）。検索とタグで絞り込める（併用は AND）。
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

/** タグの並び順: 五十音・アルファベット順（画面設計書 3.1 節）。ja ロケールの照合で、英字が先、かなが後になる */
const tagCollator = new Intl.Collator("ja");

/** 全リストに存在するタグを重複なく並べる */
function collectTags(checklists: Checklist[]): string[] {
  return [...new Set(checklists.flatMap((c) => c.tags))].sort(tagCollator.compare);
}

function ListIndexContent() {
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 入力を 150ms 待ってから検索する。検索語とタグは画面の状態だけに持ち、URL には持たない
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  // 全件（空状態の判定とタグ列）と検索結果を別に購読する。どちらも DB の変更に追従する
  const all = useLiveQuery(listChecklists, []);
  const tags = useMemo(() => collectTags(all ?? []), [all]);
  // リストの編集で消えたタグは選択から外す（画面設計書 3.1 節。チップ列は現在のタグから作り直す）
  useEffect(() => {
    setSelectedTags((current) => {
      const kept = current.filter((tag) => tags.includes(tag));
      return kept.length === current.length ? current : kept;
    });
  }, [tags]);
  const tagKey = selectedTags.join("\u0000");
  const checklists = useLiveQuery(
    () => searchChecklists(debouncedQuery, selectedTags),
    // 配列は毎回別の参照になるので、結合した文字列を依存にする
    [debouncedQuery, tagKey],
  );
  const toggleTag = (tag: string) =>
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );

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
      <TagFilter tags={tags} selected={selectedTags} onToggle={toggleTag} />
      {checklists.length === 0 ? (
        // 文言は画面設計書 6.3 節。検索語があればそちらを優先する。空白のない長い検索語も折り返し、横スクロールを出さない
        <p className="py-12 text-center text-muted-foreground wrap-anywhere">
          {trimmedQuery !== ""
            ? `「${trimmedQuery}」に一致するリストはありません`
            : "選択したタグを持つリストはありません"}
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
