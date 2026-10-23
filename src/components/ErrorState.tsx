import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description?: string;
  /** 渡したときだけ「再試行」ボタンを出す */
  onRetry?: () => void;
};

/** 読み取り失敗などのエラー表示（画面設計書 4 章の ErrorState） */
export function ErrorState({ title, description, onRetry }: Props) {
  return (
    <div role="alert" className="py-12 text-center">
      <p className="font-bold">{title}</p>
      {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          再試行
        </Button>
      )}
    </div>
  );
}
