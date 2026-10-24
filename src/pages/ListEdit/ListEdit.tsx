import { AppShell } from "@/components/AppShell";

/** 新規作成・編集（画面設計書 3.3 節）。中身は #18 で作る。ここではルートの受け口だけを置く */
export function ListEdit() {
  return (
    <AppShell title="新規作成" backTo="/">
      <p className="text-muted-foreground">この画面は準備中です。</p>
    </AppShell>
  );
}
