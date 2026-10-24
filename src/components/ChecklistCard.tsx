import { Link } from "react-router";
import { ProgressBar } from "@/components/ProgressBar";
import { Badge } from "@/components/ui/badge";
import type { Checklist } from "@/domain/types";
import { formatDateTime } from "@/lib/date";

const MAX_TAGS = 3;

/** 一覧のカード（画面設計書 3.1 節、4 章の ChecklistCard）。カード全体が詳細へのリンク */
export function ChecklistCard({ checklist }: { checklist: Checklist }) {
  const done = checklist.items.filter((item) => item.checked).length;
  const shownTags = checklist.tags.slice(0, MAX_TAGS);
  const hiddenTags = checklist.tags.length - shownTags.length;
  return (
    <Link
      to={`/lists/${checklist.id}`}
      className="flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <h2 className="truncate text-base font-bold">{checklist.title}</h2>
      {checklist.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownTags.map((tag) => (
            // 長いタグ（最大 30 文字）でもカード幅を超えないよう、幅を親に収めて溢れは … にする
            <Badge key={tag} variant="secondary" className="max-w-full">
              <span className="truncate">{tag}</span>
            </Badge>
          ))}
          {hiddenTags > 0 && <Badge variant="outline">{`+${hiddenTags}`}</Badge>}
        </div>
      )}
      <ProgressBar done={done} total={checklist.items.length} />
      <p className="text-sm text-muted-foreground">{`更新 ${formatDateTime(checklist.updatedAt)}`}</p>
    </Link>
  );
}
