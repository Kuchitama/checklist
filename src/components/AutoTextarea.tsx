import { cn } from "cn";
import { type ComponentProps, type Ref, useEffect, useLayoutEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

type Props = ComponentProps<"textarea"> & {
  /** 最小の行数。初期の高さ */
  minRows?: number;
  /** 最大の行数。これを超えたらスクロールする */
  maxRows?: number;
  ref?: Ref<HTMLTextAreaElement>;
};

/**
 * 内容に合わせて高さが伸びる textarea（画面設計書 3.3 節、4 章の TextArea）。
 * CSS の field-sizing に頼らず、描画後に scrollHeight で高さを決める。
 */
export function AutoTextarea({ minRows = 2, maxRows = 10, className, ref, ...props }: Props) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  const measure = () => {
    const element = inner.current;
    // jsdom では scrollHeight が 0 なので何もしない
    if (!element || element.scrollHeight === 0) return;
    const style = getComputedStyle(element);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const line = px(style.lineHeight) || 24;
    const padding = px(style.paddingTop) + px(style.paddingBottom);
    const border = px(style.borderTopWidth) + px(style.borderBottomWidth);
    const max = line * maxRows + padding + border;
    element.style.height = "auto";
    const needed = element.scrollHeight + border;
    element.style.height = `${Math.min(needed, max)}px`;
    element.style.overflowY = needed > max ? "auto" : "hidden";
  };
  // 値はこの effect の外から来るので依存に書けない。描画のたびに測り直す（高さの計算は軽い）
  useLayoutEffect(measure);

  // 画面の回転などで幅が変わると折り返しが変わるので、resize でも測り直す
  const latest = useRef(measure);
  latest.current = measure;
  useEffect(() => {
    const onResize = () => latest.current();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Textarea
      ref={(element) => {
        inner.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      rows={minRows}
      className={cn("field-sizing-fixed min-h-0 resize-none", className)}
      {...props}
    />
  );
}
