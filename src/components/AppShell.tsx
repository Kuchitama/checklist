import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

type Props = {
  /** 画面のタイトル。省略するとアプリ名を一覧へのリンクとして出す */
  title?: string;
  /** 渡すと左に「戻る」を出す */
  backTo?: string;
  /** ヘッダー右端の操作 */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * ヘッダーとメインの枠（画面設計書 2.1 節、4 章の AppShell）。
 * トースト領域は画面遷移をまたいで残すため、ルートのレイアウト（App）に置く。
 */
export function AppShell({ title, backTo, actions, children }: Props) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1 px-4">
          {backTo && (
            <Button asChild variant="ghost" size="icon" className="-ml-2">
              <Link to={backTo} aria-label="戻る">
                <ChevronLeft aria-hidden="true" />
              </Link>
            </Button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">
            {title ?? <Link to="/">チェックリスト</Link>}
          </h1>
          {actions}
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-4 py-4">{children}</main>
    </>
  );
}
