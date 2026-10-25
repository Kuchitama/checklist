import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "cn";
import { ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";
import { AutoTextarea } from "@/components/AutoTextarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 項目の入力欄の名前。エラーとフォーカスの対応に使う */
export type ItemField = "title" | "note" | "url" | "dueDate";

export type ItemRowValue = {
  title: string;
  note: string;
  url: string | null;
  dueDate: string | null;
  /** 日付欄に不正・未完成の入力が残っているか（ブラウザの validity.badInput。そのとき value は空）。保存を止めるために持つ */
  dueDateInvalid: boolean;
  /** 「詳細」（メモ・URL・期限）を開いているか */
  expanded: boolean;
};

type Props = {
  /** 行の識別子。SortableList に渡した ids の要素と同じもの */
  rowKey: string;
  index: number;
  value: ItemRowValue;
  errors: Partial<Record<ItemField, string>>;
  /** 入力欄をフォーカス用に登録する */
  registerRef: (field: ItemField, element: HTMLElement | null) => void;
  onChange: (patch: Partial<ItemRowValue>) => void;
  onRemove: () => void;
  onTitleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * 編集画面の項目行（画面設計書 3.3 節、4 章の ItemEditorRow）。
 * ドラッグハンドル、タイトルと削除ボタン、「詳細」の開閉、開いたときの補足メモ・URL・期限の入力欄。
 * SortableList の中で使い、ハンドルから並び替えを始める。
 */
export function ItemEditorRow({
  rowKey,
  index,
  value,
  errors,
  registerRef,
  onChange,
  onRemove,
  onTitleKeyDown,
}: Props) {
  const n = index + 1;
  const id = (field: ItemField) => `item-${rowKey}-${field}`;
  const errorId = (field: ItemField) => `${id(field)}-error`;
  const detailsId = `item-${rowKey}-details`;
  const described = (field: ItemField) => (errors[field] ? errorId(field) : undefined);
  const dueRef = useRef<HTMLInputElement | null>(null);
  // 未完成の入力のまま欄を離れても value は空のままなので、blur でも不正の有無を親へ伝える
  const syncDue = (input: HTMLInputElement) =>
    onChange({ dueDate: input.value || null, dueDateInvalid: input.validity.badInput });

  // 役割説明（aria-roledescription）の既定は英語の "sortable" なので日本語にする（要件 NFR-08、画面設計書 8 章）
  const sortable = useSortable({
    id: rowKey,
    attributes: { roleDescription: "並び替えできる項目" },
  });
  // 挿入位置の線。持ち上げた行が上から来るなら自分の下、下から来るなら自分の上に出す（画面設計書 3.3 節）
  const insertion =
    sortable.isOver && !sortable.isDragging
      ? sortable.activeIndex < sortable.index
        ? "after"
        : "before"
      : null;

  return (
    <li
      ref={sortable.setNodeRef}
      // 縦 1 列なので横には動かさない。拡大縮小もしない（行の高さが違っても伸ばさない）
      style={{
        transform: CSS.Transform.toString(
          sortable.transform ? { ...sortable.transform, x: 0, scaleX: 1, scaleY: 1 } : null,
        ),
        transition: sortable.transition,
      }}
      className={cn(
        "relative flex flex-col gap-1",
        sortable.isDragging && "opacity-50",
        // 線は行間（12px）の中央に 2px。色は --primary（--ring は白の背景で 2.59:1 と、非テキストに必要な 3:1 を満たさない。画面設計書 2.2 節）
        insertion === "before" &&
          "before:absolute before:inset-x-0 before:-top-[7px] before:h-0.5 before:bg-primary",
        insertion === "after" &&
          "after:absolute after:inset-x-0 after:-bottom-[7px] after:h-0.5 after:bg-primary",
      )}
    >
      <div className="flex items-center gap-1">
        {/* touch-none がないと、長押しの判定中にブラウザがスクロールを始めてしまう。ハンドル以外の場所は普通にスクロールできる */}
        <Button
          ref={sortable.setActivatorNodeRef}
          variant="ghost"
          size="icon"
          aria-label={`項目 ${n} を並び替え`}
          className={cn("touch-none", sortable.isDragging ? "cursor-grabbing" : "cursor-grab")}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical aria-hidden="true" />
        </Button>
        {/* min-w-0 がないと、ハンドルと削除ボタンを足したときに入力欄が画面幅からはみ出す */}
        <Input
          ref={(element) => registerRef("title", element)}
          aria-label={`項目 ${n}`}
          className="min-w-0 flex-1"
          value={value.title}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={described("title")}
          onChange={(event) => onChange({ title: event.target.value })}
          onKeyDown={onTitleKeyDown}
        />
        <Button variant="ghost" size="icon" aria-label={`項目 ${n} を削除`} onClick={onRemove}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      {errors.title && <FieldError id={errorId("title")}>{errors.title}</FieldError>}

      <Button
        variant="ghost"
        className="ml-11 self-start"
        aria-label={`項目 ${n} の詳細`}
        aria-expanded={value.expanded}
        aria-controls={detailsId}
        onClick={() => onChange({ expanded: !value.expanded })}
      >
        <ChevronRight aria-hidden="true" className={value.expanded ? "rotate-90" : undefined} />
        詳細
      </Button>

      {value.expanded && (
        <div id={detailsId} className="ml-14 flex flex-col gap-3 border-l-2 border-border pl-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("note")}>補足メモ</Label>
            <AutoTextarea
              id={id("note")}
              ref={(element) => registerRef("note", element)}
              aria-label={`項目 ${n} の補足メモ`}
              value={value.note}
              minRows={2}
              maxRows={10}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={described("note")}
              onChange={(event) => onChange({ note: event.target.value })}
            />
            {errors.note && <FieldError id={errorId("note")}>{errors.note}</FieldError>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("url")}>URL</Label>
            <Input
              id={id("url")}
              ref={(element) => registerRef("url", element)}
              aria-label={`項目 ${n} の URL`}
              inputMode="url"
              value={value.url ?? ""}
              placeholder="https://"
              aria-invalid={errors.url ? true : undefined}
              aria-describedby={described("url")}
              onChange={(event) => onChange({ url: event.target.value || null })}
            />
            {errors.url && <FieldError id={errorId("url")}>{errors.url}</FieldError>}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("dueDate")}>期限</Label>
            <div className="flex items-center gap-1">
              <Input
                id={id("dueDate")}
                ref={(element) => {
                  dueRef.current = element;
                  registerRef("dueDate", element);
                }}
                type="date"
                aria-label={`項目 ${n} の期限`}
                value={value.dueDate ?? ""}
                aria-invalid={errors.dueDate ? true : undefined}
                aria-describedby={described("dueDate")}
                onChange={(event) => syncDue(event.target)}
                onBlur={(event) => syncDue(event.target)}
              />
              <Button
                variant="ghost"
                aria-label={`項目 ${n} の期限をクリア`}
                onClick={() => {
                  // value が空のままだと React は DOM を書き換えないので、未完成の入力は直接消す
                  if (dueRef.current) dueRef.current.value = "";
                  onChange({ dueDate: null, dueDateInvalid: false });
                }}
              >
                クリア
              </Button>
            </div>
            {errors.dueDate && <FieldError id={errorId("dueDate")}>{errors.dueDate}</FieldError>}
          </div>
        </div>
      )}
    </li>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}
