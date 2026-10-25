import { cn } from "cn";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ActionMenu } from "@/components/ActionMenu";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadErrorState } from "@/components/LoadErrorState";
import { NotFoundState } from "@/components/NotFoundState";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteChecklist,
  exportChecklist,
  getChecklist,
  resetChecklist,
  serializeExportFile,
  toggleItem,
} from "@/domain/checklists";
import type { Checklist, ChecklistItem } from "@/domain/types";
import { type DueState, dueState, formatDateTime, formatDueDate } from "@/lib/date";
import { downloadTextFile } from "@/lib/download";
import { exportFileName } from "@/lib/exportFileName";
import { useToday } from "@/lib/useToday";

/**
 * 詳細画面（画面設計書 3.2 節、仕様書 5.2 節）。項目の表示とチェック・解除、リセット、書き出し、削除を行う。
 * 操作メニューの複製は M4 で追加する。
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

const SAVE_FAILED = "保存できませんでした。空き容量を確認してください";

function ListDetailContent({ id }: { id: string }) {
  const navigate = useNavigate();
  // 見つからないときは null にして、読み込み中（undefined）と区別する
  const checklist = useLiveQuery(async () => (await getChecklist(id)) ?? null, [id]);
  // 開いている確認ダイアログ
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  // 削除して一覧へ戻る途中は、購読が null を返しても「見つかりません」を出さない
  const [leaving, setLeaving] = useState(false);

  const reset = async () => {
    setConfirming(null);
    try {
      await resetChecklist(id);
    } catch {
      toast.error(SAVE_FAILED, { duration: 5000 });
    }
  };

  // 書き出し（仕様書 4 章、FR-30・FR-31）。ファイル名はデータ設計書 5.4 節
  const exportFile = async () => {
    try {
      const file = await exportChecklist(id);
      downloadTextFile(
        exportFileName(file.checklist.title),
        serializeExportFile(file),
        "application/json",
      );
      toast.success("ファイルを書き出しました", { duration: 3000 });
    } catch {
      toast.error("書き出せませんでした", { duration: 5000 });
    }
  };

  const remove = async () => {
    setConfirming(null);
    try {
      await deleteChecklist(id);
      setLeaving(true);
      // 戻るで消えたリストに戻らないよう、履歴を置き換える
      navigate("/", { replace: true });
    } catch {
      toast.error(SAVE_FAILED, { duration: 5000 });
    }
  };

  return (
    <AppShell
      title={checklist?.title}
      backTo="/"
      actions={
        checklist && (
          <ActionMenu
            items={[
              {
                label: "リセット",
                icon: <RotateCcw aria-hidden="true" />,
                opensDialog: true,
                onSelect: () => setConfirming("reset"),
              },
              {
                label: "書き出し",
                icon: <Download aria-hidden="true" />,
                onSelect: exportFile,
              },
              {
                label: "削除",
                icon: <Trash2 aria-hidden="true" />,
                danger: true,
                opensDialog: true,
                onSelect: () => setConfirming("delete"),
              },
            ]}
          />
        )
      }
    >
      {/* 読み込み中は本文を描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節） */}
      {checklist === null && !leaving && <NotFoundState />}
      {checklist && <ChecklistView checklist={checklist} />}
      {/* 文言は画面設計書 5.2 節 */}
      <ConfirmDialog
        open={confirming === "reset"}
        title="すべてのチェックを外しますか？"
        message="完了日時も消えます。項目はそのまま残ります。"
        confirmLabel="リセット"
        onConfirm={reset}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title={`「${checklist?.title ?? ""}」を削除しますか？`}
        message="この操作は取り消せません。必要なら先に書き出してください。"
        confirmLabel="削除"
        danger
        onConfirm={remove}
        onCancel={() => setConfirming(null)}
      />
    </AppShell>
  );
}

/** 一時状態。settledAt は書き込みがすべて成功した時点の購読値の updatedAt（5.4 節の手順 4） */
type Optimistic = { value: boolean; settledAt?: string };

/**
 * チェックの楽観更新（画面設計書 5.4 節）。項目ごとに一時状態と進行中の書き込み数を持ち、
 * 書き込みが終わって購読値に反映されるまでは、一時状態を DB の値より優先して表示する。
 */
function useOptimisticToggle(checklist: Checklist) {
  const [optimistic, setOptimistic] = useState<ReadonlyMap<string, Optimistic>>(new Map());
  const pending = useRef(new Map<string, number>());
  const failed = useRef(new Set<string>());
  const latest = useRef(checklist);
  latest.current = checklist;

  const update = (change: (next: Map<string, Optimistic>) => void) =>
    setOptimistic((current) => {
      const next = new Map(current);
      change(next);
      return next;
    });

  const toggle = (itemId: string, checked: boolean) => {
    update((next) => next.set(itemId, { value: checked }));
    pending.current.set(itemId, (pending.current.get(itemId) ?? 0) + 1);
    toggleItem(checklist.id, itemId, checked)
      .catch(() => {
        failed.current.add(itemId);
        toast.error(SAVE_FAILED, { duration: 5000 });
      })
      .finally(() => {
        const rest = (pending.current.get(itemId) ?? 1) - 1;
        if (rest > 0) {
          pending.current.set(itemId, rest);
          return;
        }
        pending.current.delete(itemId);
        if (failed.current.delete(itemId)) {
          // 失敗を含むときは直ちに DB の値へ巻き戻す
          update((next) => next.delete(itemId));
          return;
        }
        // 成功時は、保存の完了が購読値の更新より先に届くことがあるので、反映済みでなければまだ消さない
        const snapshot = latest.current;
        const item = snapshot.items.find((i) => i.id === itemId);
        update((next) => {
          const entry = next.get(itemId);
          if (!entry) return;
          if (!item || item.checked === entry.value) next.delete(itemId);
          else next.set(itemId, { ...entry, settledAt: snapshot.updatedAt });
        });
      });
  };

  // 書き込みが反映された購読値、または後から別の書き込みがあった購読値が届いたら一時状態を捨てる
  useEffect(() => {
    setOptimistic((current) => {
      let next: Map<string, Optimistic> | undefined;
      for (const [itemId, entry] of current) {
        if (entry.settledAt === undefined) continue;
        const item = checklist.items.find((i) => i.id === itemId);
        if (!item || item.checked === entry.value || checklist.updatedAt !== entry.settledAt) {
          next ??= new Map(current);
          next.delete(itemId);
        }
      }
      return next ?? current;
    });
  }, [checklist]);

  const isChecked = (item: ChecklistItem) => optimistic.get(item.id)?.value ?? item.checked;
  return { isChecked, toggle };
}

function ChecklistView({ checklist }: { checklist: Checklist }) {
  const { isChecked, toggle } = useOptimisticToggle(checklist);
  const today = useToday();
  const done = checklist.items.filter(isChecked).length;

  return (
    <div className="flex flex-col gap-4">
      {checklist.description !== "" && (
        // 空白のない長い文字列（URL など）も途中で折り返し、横スクロールを出さない
        <p data-testid="description" className="whitespace-pre-wrap wrap-anywhere">
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
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <ProgressBar done={done} total={checklist.items.length} />
        </div>
        {/* 「編集」は進捗バーの右（画面設計書 3.2 節） */}
        <Button asChild variant="outline">
          <Link to={`/lists/${checklist.id}/edit`}>編集</Link>
        </Button>
      </div>
      {checklist.items.length === 0 ? (
        <p className="text-muted-foreground">項目がありません。編集から追加してください</p>
      ) : (
        <ul aria-label="項目" className="flex flex-col divide-y border-y">
          {checklist.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              checked={isChecked(item)}
              today={today}
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
  /** 期限の状態を判定する基準日（端末のローカル日付） */
  today: Date;
  onToggle: (checked: boolean) => void;
};

/**
 * 詳細の項目行（画面設計書 3.2 節、4 章の ChecklistItemRow）。
 * 行全体を label にしてチェックの切り替え領域にする。リンクアイコンは label の外に置き、押してもチェックが変わらないようにする。
 */
function ItemRow({ item, checked, today, onToggle }: ItemRowProps) {
  const titleId = useId();
  const detailsId = useId();
  const due = dueState(item.dueDate, checked, today);
  // 楽観更新中は DB の checkedAt がまだないことがある。そのときは完了日時の行を出さない
  const completedAt = checked ? item.checkedAt : null;

  return (
    <li className="flex items-start gap-1">
      {/* min-w-0 がないと、空白のない長いタイトルやメモで行が画面幅を超える */}
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 py-3">
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
                {`${DUE_LABEL[due].text} ${formatDueDate(item.dueDate, today)}`}
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
