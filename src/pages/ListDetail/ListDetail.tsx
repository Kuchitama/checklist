import { AppShell } from "@/components/AppShell";

/** 詳細（画面設計書 3.2 節）。中身は #19 で作る。ここではルートの受け口だけを置く */
export function ListDetail() {
  return (
    <AppShell title="チェックリスト" backTo="/">
      <p className="text-muted-foreground">この画面は準備中です。</p>
    </AppShell>
  );
}
