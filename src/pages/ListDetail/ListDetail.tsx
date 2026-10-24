import { cn } from "cn";
import { useLiveQuery } from "dexie-react-hooks";
import { ExternalLink } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { LoadErrorState } from "@/components/LoadErrorState";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChecklist, toggleItem } from "@/domain/checklists";
import type { Checklist, ChecklistItem } from "@/domain/types";
import { type DueState, dueState, formatDateTime, formatDueDate } from "@/lib/date";

/**
 * 詳細画面（画面設計書 3.2 節、仕様書 5.2 節）。項目の表示とチェック・解除を行う。
 * 「編集」ボタンは M2、操作メニュー（リセット・削除・複製・書き出し）は後続の Issue で追加する。
 */
export function ListDetail() {
  const { id = "" } = useParams();
  // 読み取りに失敗してもヘッダー（戻る）は残す
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <AppShell backTo="/">
          <LoadErrorState error={error} onRetry={reset} />
        </AppShell>
      )}
    >
      <ListDetailContent id={id} />
    </ErrorBoundary>
  );
}

function ListDetailContent({ id }: { id: string }) {
  // 見つからないときは null にして、読み込み中（undefined）と区別する
  const checklist = useLiveQuery(async () => (await getChecklist(id)) ?? null, [id]);
  return (
    <AppShell title={checklist?.title} backTo="/">
      {/* 読み込み中は本文を描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節） */}
      {checklist === null && <NotFound />}
      {checklist && <ChecklistView checklist={checklist} />}
    </AppShell>
  );
}

/** 画面設計書 3.6 節 */
function NotFound() {
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

/**
 * チェックの楽観更新（画面設計書 5.4 節）。項目ごとに一時状態と進行中の書き込み数を持ち、
 * 書き込みがすべて終わるまでは一時状態を DB の値より優先して表示する。
 */
function useOptimisticToggle(listId: string) {
  const [optimistic, setOptimistic] = useState<ReadonlyMap<string, boolean>>(new Map());
  const pending = useRef(new Map<string, number>());

  const toggle = (itemId: string, checked: boolean) => {
    setOptimistic((current) => new Map(current).set(itemId, checked));
    pending.current.set(itemId, (pending.current.get(itemId) ?? 0) + 1);
    toggleItem(listId, itemId, checked)
      .catch(() => {
        toast.error("保存できませんでした。空き容量を確認してください", { duration: 5000 });
      })
      .finally(() => {
        const rest = (pending.current.get(itemId) ?? 1) - 1;
        if (rest > 0) {
          pending.current.set(itemId, rest);
          return;
        }
        // 進行中の書き込みがなくなったら、以後は DB の値（失敗時は巻き戻った値）を表示する
        pending.current.delete(itemId);
        setOptimistic((current) => {
          const next = new Map(current);
          next.delete(itemId);
          return next;
        });
      });
  };

  return { optimistic, toggle };
}

function ChecklistView({ checklist }: { checklist: Checklist }) {
  const { optimistic, toggle } = useOptimisticToggle(checklist.id);
  const isChecked = (item: ChecklistItem) => optimistic.get(item.id) ?? item.checked;
  const done = checklist.items.filter(isChecked).length;

  return (
    <div className="flex flex-col gap-4">
      {checklist.description !== "" && (
        <p data-testid="description" className="whitespace-pre-wrap">
          {checklist.description}
        </p>
      )}
      {checklist.tags.length > 0 && (
        <ul aria-label="タグ" className="flex flex-wrap gap-1">
          {checklist.tags.map((tag) => (
            <li key={tag} className="max-w-full">
              <Badge variant="secondary" className="max-w-full">
                <span className="truncate">{tag}</span>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <ProgressBar done={done} total={checklist.items.length} />
      {checklist.items.length === 0 ? (
        <p className="text-muted-foreground">項目がありません。編集から追加してください</p>
      ) : (
        <ul aria-label="項目" className="flex flex-col divide-y border-y">
          {checklist.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              checked={isChecked(item)}
              onToggle={(checked) => toggle(item.id, checked)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const DUE_LABEL: Record<DueState, { text: string; className: string }> = {
  overdue: { text: "⚠ 期限超過", className: "text-destructive" },
  today: { text: "● 今日", className: "text-warning" },
  normal: { text: "期限", className: "text-muted-foreground" },
};

type ItemRowProps = {
  item: ChecklistItem;
  /** 楽観更新を反映した表示上の状態 */
  checked: boolean;
  onToggle: (checked: boolean) => void;
};

/**
 * 詳細の項目行（画面設計書 3.2 節、4 章の ChecklistItemRow）。
 * 行全体を label にしてチェックの切り替え領域にする。リンクアイコンは label の外に置き、押してもチェックが変わらないようにする。
 */
function ItemRow({ item, checked, onToggle }: ItemRowProps) {
  const titleId = useId();
  const detailsId = useId();
  const due = dueState(item.dueDate, checked);
  // 楽観更新中は DB の checkedAt がまだないことがある。そのときは完了日時の行を出さない
  const completedAt = checked ? item.checkedAt : null;

  return (
    <li className="flex items-start gap-1">
      <label className="flex min-h-11 flex-1 cursor-pointer items-start gap-3 py-3">
        <input
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-primary"
          checked={checked}
          aria-labelledby={titleId}
          aria-describedby={detailsId}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span
            id={titleId}
            className={cn("break-words", checked && "text-muted-foreground line-through")}
          >
            {item.title}
          </span>
          <span id={detailsId} className="flex flex-col gap-1 text-sm">
            {completedAt && (
              <span className="text-muted-foreground">{`完了 ${formatDateTime(completedAt)}`}</span>
            )}
            {item.note !== "" && (
              <span className="whitespace-pre-wrap break-words">{item.note}</span>
            )}
            {item.dueDate && due && (
              <span className={DUE_LABEL[due].className}>
                {`${DUE_LABEL[due].text} ${formatDueDate(item.dueDate)}`}
              </span>
            )}
          </span>
        </span>
      </label>
      {item.url && (
        <Button asChild variant="ghost" size="icon" className="mt-0.5">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`「${item.title}」のリンクを開く`}
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      )}
    </li>
  );
}
