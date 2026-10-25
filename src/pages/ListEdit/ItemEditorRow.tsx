import { ChevronRight, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
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
  /** 「詳細」（メモ・URL・期限）を開いているか */
  expanded: boolean;
};

type Props = {
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
 * タイトルと削除ボタン、「詳細」の開閉、開いたときの補足メモ・URL・期限の入力欄。
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

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          ref={(element) => registerRef("title", element)}
          aria-label={`項目 ${n}`}
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
        className="self-start"
        aria-label={`項目 ${n} の詳細`}
        aria-expanded={value.expanded}
        aria-controls={detailsId}
        onClick={() => onChange({ expanded: !value.expanded })}
      >
        <ChevronRight aria-hidden="true" className={value.expanded ? "rotate-90" : undefined} />
        詳細
      </Button>

      {value.expanded && (
        <div id={detailsId} className="ml-3 flex flex-col gap-3 border-l-2 border-border pl-3">
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
                ref={(element) => registerRef("dueDate", element)}
                type="date"
                aria-label={`項目 ${n} の期限`}
                value={value.dueDate ?? ""}
                aria-invalid={errors.dueDate ? true : undefined}
                aria-describedby={described("dueDate")}
                onChange={(event) => onChange({ dueDate: event.target.value || null })}
              />
              <Button
                variant="ghost"
                aria-label={`項目 ${n} の期限をクリア`}
                onClick={() => onChange({ dueDate: null })}
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
