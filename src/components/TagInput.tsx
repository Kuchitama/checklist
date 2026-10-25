import { X } from "lucide-react";
import { type KeyboardEvent, type Ref, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cpLength, messageFor } from "@/domain/schema";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 30;

type Props = {
  id: string;
  tags: string[];
  /** 未確定の入力。保存時に親が確定するため、親が持つ */
  draft: string;
  onTagsChange: (tags: string[]) => void;
  onDraftChange: (draft: string) => void;
  /** 保存時の検証エラー（タグの path のもの） */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
};

/** 入力を 1 つのタグとして確定できる形にする。空白だけなら null */
export function toTag(draft: string): string | null {
  const value = draft.trim();
  return value === "" ? null : value;
}

/**
 * タグ入力（画面設計書 3.3 節、4 章の TagInput / TagChip、5.1 節）。
 * チップ列の末尾に入力欄。Enter または `,` で確定し、確定時に trim と重複除去をする。
 * Backspace で入力が空なら直前のチップを削除し、Esc で入力内容を消す。
 */
export function TagInput({ id, tags, draft, onTagsChange, onDraftChange, error, inputRef }: Props) {
  // 21 個目や 31 文字以上を確定しようとしたときの文言。入力を変えると消す
  const [limitError, setLimitError] = useState<string | null>(null);
  const shownError = error ?? limitError;
  const errorId = `${id}-error`;

  const confirm = () => {
    const value = toTag(draft);
    if (value === null) {
      onDraftChange("");
      return;
    }
    if (cpLength(value) > MAX_TAG_LENGTH) {
      setLimitError(messageFor("too_long", "タグ"));
      return;
    }
    if (tags.includes(value)) {
      onDraftChange("");
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setLimitError(messageFor("too_many", "タグ"));
      return;
    }
    onTagsChange([...tags, value]);
    onDraftChange("");
  };

  const remove = (tag: string) => onTagsChange(tags.filter((t) => t !== tag));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      confirm();
    } else if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      event.preventDefault();
      remove(tags[tags.length - 1] as string);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDraftChange("");
      setLimitError(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <ul aria-label="タグ" className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className="max-w-full">
              {/* Badge の overflow-hidden を外し、削除ボタンの当たり判定を外へ広げる。チップ間の gap と同じ 8px だけ広げるので隣と重ならない */}
              <Badge variant="secondary" className="h-7 max-w-full gap-1 overflow-visible pr-0">
                <span className="truncate">{tag}</span>
                {/* 見た目は小さいが、after でタップ領域を 44px に広げる（画面設計書 2.1 節） */}
                <button
                  type="button"
                  aria-label={`タグ「${tag}」を削除`}
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-full after:absolute after:-inset-2 hover:bg-foreground/10"
                  onClick={() => remove(tag)}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        ref={inputRef}
        value={draft}
        placeholder="Enter またはカンマで追加"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        onChange={(event) => {
          onDraftChange(event.target.value);
          setLimitError(null);
        }}
        onKeyDown={onKeyDown}
      />
      {shownError && (
        <p id={errorId} className="text-sm text-destructive">
          {shownError}
        </p>
      )}
    </div>
  );
}
