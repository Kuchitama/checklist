import { Loader2, Upload } from "lucide-react";
import { type ChangeEvent, useId, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** input の accept。例 ".json,application/json" */
  accept: string;
  /** 検証中・保存中。スピナーを出し、ファイルを受け付けない */
  busy?: boolean;
  onFile: (file: File) => void;
};

/**
 * ファイルの選択領域（画面設計書 3.4 節、4 章の DropZone）。
 * 点線枠の中に「ファイルを選択」を置く。ドラッグ＆ドロップは後続の Issue で加える。
 */
export function DropZone({ accept, busy = false, onFile }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が起きるよう、選んだ後は空に戻す
    event.target.value = "";
    if (file && !busy) onFile(file);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center",
        busy && "border-primary",
      )}
    >
      {busy ? (
        <div role="status" className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-8 animate-spin" />
          読み込み中
        </div>
      ) : (
        <>
          <Upload aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-muted-foreground">
            ここにファイルをドロップ
            <br />
            または
          </p>
          {/* input は見えない位置に置き、label をボタンの見た目にする。input 自体にフォーカスできるのでキーボードでも開ける */}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={accept}
            aria-label="ファイルを選択"
            className="sr-only"
            onChange={onChange}
          />
          <label
            htmlFor={inputId}
            className={cn(buttonVariants({ variant: "secondary" }), "cursor-pointer")}
          >
            ファイルを選択
          </label>
        </>
      )}
    </div>
  );
}
