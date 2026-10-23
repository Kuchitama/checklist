import { useLiveQuery } from "dexie-react-hooks";
import { listChecklists } from "@/domain/checklists";

/**
 * 一覧画面（画面設計書 3.1 節）。M1 の最初の段階では、リストのタイトルと空状態だけを表示する。
 * 進捗・タグ・検索・ボタン類は後続の Issue で追加する。
 */
export function ListIndex() {
  const checklists = useLiveQuery(listChecklists, []);

  // 読み込み中は何も描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節）
  if (checklists === undefined) return null;

  if (checklists.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">まだチェックリストがありません</p>
    );
  }

  return (
    <ul aria-label="チェックリスト一覧" className="flex flex-col gap-3">
      {checklists.map((checklist) => (
        <li key={checklist.id} className="rounded-lg border bg-card p-4 text-card-foreground">
          <h2 className="truncate text-base font-bold">{checklist.title}</h2>
        </li>
      ))}
    </ul>
  );
}
