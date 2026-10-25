import { ExternalLink, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useTheme } from "@/app/ThemeProvider";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { clearAllData } from "@/domain/checklists";
import { THEMES, type Theme } from "@/domain/settings";

const THEME_LABELS: Record<Theme, string> = {
  system: "OS に合わせる",
  light: "ライト",
  dark: "ダーク",
};

const REPOSITORY_URL = "https://github.com/Kuchitama/checklist";

const SAVE_FAILED = "保存できませんでした。空き容量を確認してください";

/**
 * 設定画面（画面設計書 3.5 節、仕様書 5.5 節）。テーマの切り替え、全データ削除（2 段階確認）、アプリ情報。
 */
export function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme, reload } = useTheme();
  const themeHeadingId = useId();
  // 全データ削除の確認の段階（画面設計書 5.2 節の「全データ削除 1」「全データ削除 2」）
  const [step, setStep] = useState<1 | 2 | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await clearAllData();
      // 設定も消えたので、テーマを既定（OS に合わせる）に戻す
      reload();
      setStep(null);
      // 戻るで設定に戻れてよいので履歴は置き換えない
      navigate("/");
    } catch {
      setStep(null);
      toast.error(SAVE_FAILED, { duration: 5000 });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell title="設定" backTo="/">
      <div className="flex flex-col gap-8">
        <section aria-labelledby={themeHeadingId} className="flex flex-col gap-2">
          <h2 id={themeHeadingId} className="text-base font-bold">
            テーマ
          </h2>
          <RadioGroup
            aria-labelledby={themeHeadingId}
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
            className="gap-0"
          >
            {THEMES.map((value) => (
              // 行全体（44px 以上）を押して選べるよう、ラベルで包む
              <Label key={value} className="min-h-11 cursor-pointer gap-3 text-base font-normal">
                <RadioGroupItem value={value} />
                {THEME_LABELS[value]}
              </Label>
            ))}
          </RadioGroup>
        </section>

        <section aria-labelledby="settings-data" className="flex flex-col items-start gap-3">
          <h2 id="settings-data" className="text-base font-bold">
            データ
          </h2>
          {/* 文言は画面設計書 6.3 節 */}
          <p className="text-muted-foreground">
            データはこのブラウザの中にだけ保存されています。大切なリストは書き出して保管してください。
          </p>
          <Button variant="destructive" onClick={() => setStep(1)}>
            <Trash2 aria-hidden="true" />
            全データを削除
          </Button>
        </section>

        <section aria-labelledby="settings-about" className="flex flex-col items-start gap-2">
          <h2 id="settings-about" className="text-base font-bold">
            アプリ情報
          </h2>
          {/* バージョンはビルド時に package.json から埋め込む（vite.config.ts の define） */}
          <p>バージョン {__APP_VERSION__}</p>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
          >
            GitHub リポジトリ
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only">（新しいタブで開く）</span>
          </a>
        </section>
      </div>

      {/* 文言は画面設計書 5.2 節 */}
      <ConfirmDialog
        open={step === 1}
        title="すべてのデータを削除しますか？"
        message="すべてのチェックリストと設定を削除します。この操作は取り消せません。"
        confirmLabel="次へ"
        danger
        onConfirm={() => setStep(2)}
        onCancel={() => setStep(null)}
      />
      <ConfirmDialog
        open={step === 2}
        title="確認"
        message="確認のため「削除」と入力してください。"
        confirmLabel="削除"
        danger
        confirmInput="削除"
        onConfirm={remove}
        onCancel={() => setStep(null)}
      />
    </AppShell>
  );
}
