import { Loader2, Upload } from "lucide-react";
import { type ChangeEvent, type DragEvent, useId, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

type Props = {
  /** input の accept。例 ".json,application/json" */
  accept: string;
  /** 検証中・保存中。スピナーを出し、ファイルを受け付けない */
  busy?: boolean;
  onFile: (file: File) => void;
};

/** スマートフォン（ホバーがなく、指で操作する端末）の判定。画面設計書 3.4 節 */
const COARSE_POINTER = "(hover: none) and (pointer: coarse)";

/**
 * ファイルの選択領域（画面設計書 3.4 節、4 章の DropZone）。
 * 点線枠の中に「ファイルを選択」を置き、PC ではファイルのドロップも受け付ける。
 * ドラッグオーバー中は枠を --primary の実線にして背景を薄く着色する。
 */
export function DropZone({ accept, busy = false, onFile }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const coarse = useMediaQuery(COARSE_POINTER);
  // 子要素に入るたびに dragenter / dragleave が来るので、深さを数えて領域の外へ出たときだけ戻す
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が起きるよう、選んだ後は空に戻す
    event.target.value = "";
    if (file && !busy) onFile(file);
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const onDragOver = (event: DragEvent) => {
    // preventDefault しないと drop が発火せず、ブラウザがファイルを開いてしまう
    event.preventDefault();
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    // 複数ファイルは先頭だけ。拡張子は見ず、中身で判定する（呼び出し側）
    const file = event.dataTransfer?.files?.[0];
    if (file && !busy) onFile(file);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ドロップはマウス専用の補助的な経路。キーボードと支援技術は中の「ファイルを選択」（input）を使う
    <div
      data-testid="drop-zone"
      data-over={over}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center",
        over && "border-solid border-primary bg-primary/5",
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
            {coarse ? (
              "ファイルを選択してください"
            ) : (
              <>
                ここにファイルをドロップ
                <br />
                または
              </>
            )}
          </p>
          {/* input は見えない位置に置き、label をボタンの見た目にする。input 自体にフォーカスできるのでキーボードでも開ける。
              フォーカスは見えない input に当たるので、peer で label にフォーカスリングを出す（画面設計書 8 章） */}
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept={accept}
            aria-label="ファイルを選択"
            className="peer sr-only"
            onChange={onChange}
          />
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
            )}
          >
            ファイルを選択
          </label>
        </>
      )}
    </div>
  );
}
