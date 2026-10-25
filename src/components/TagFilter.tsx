import { cn } from "@/lib/utils";

type Props = {
  /** 並べるタグ（重複なし、並び替え済み） */
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
};

/**
 * タグチップ列（画面設計書 3.1 節、4 章の TagChip）。押すと選択が反転し、複数選択は AND で絞り込む。
 * チップは 44px の高さ（2.1 節）で、長いタグは … で収める
 */
export function TagFilter({ tags, selected, onToggle }: Props) {
  if (tags.length === 0) return null;
  return (
    // fieldset は role=group で、legend が名前になる。既定の枠と余白は消す
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">タグで絞り込む</legend>
      {tags.map((tag) => {
        const pressed = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(tag)}
            className={cn(
              // 短いタグ（1 文字など）でも幅 44px を保つ。フォーカスリングは不透明な --primary（--ring は白で 2.59:1 と 3:1 を満たさない。画面設計書 8 章）
              "inline-flex h-11 min-w-11 max-w-full items-center justify-center rounded-full border px-4 text-sm transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              pressed
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
            )}
          >
            <span className="truncate">{tag}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
