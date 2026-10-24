import { Progress } from "@/components/ui/progress";

type Props = {
  done: number;
  total: number;
};

/**
 * 進捗バーと `完了数 / 総数`（画面設計書 4 章の ProgressBar）。
 * 全件完了（項目 1 件以上）のときはバーを --success にし「すべて完了」を添える。
 */
export function ProgressBar({ done, total }: Props) {
  const complete = total > 0 && done === total;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <Progress
        value={percent}
        aria-label="進捗"
        className={
          complete ? "h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-success" : "h-2 flex-1"
        }
      />
      <span className="shrink-0 text-sm tabular-nums">{`${done} / ${total}`}</span>
      {complete && <span className="shrink-0 text-sm font-bold text-success">すべて完了</span>}
    </div>
  );
}
