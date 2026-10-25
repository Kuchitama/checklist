import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { DropZone } from "@/components/DropZone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { importChecklist } from "@/domain/checklists";
import { describeImportIssue, MAX_IMPORT_BYTES, parseImportFile } from "@/domain/import";
import type { ExportFile, ImportError } from "@/domain/types";

/** 画面設計書 7.2 節の状態 */
type State =
  | { kind: "idle" }
  | { kind: "validating"; name: string }
  | { kind: "error"; name: string; error: ImportError }
  | { kind: "preview"; name: string; file: ExportFile; saving: boolean };

const IDLE: State = { kind: "idle" };
const MAX_ISSUES = 10;
const MAX_PREVIEW_ITEMS = 20;
const MAX_DESCRIPTION_LINES = 3;

/** 画面設計書 6.2 節 */
const ERROR_MESSAGES: Record<ImportError["code"], string> = {
  INVALID_JSON: "JSON ファイルとして読めません",
  NOT_EXPORT_FILE: "このアプリの書き出しファイルではありません",
  UNSUPPORTED_VERSION:
    "このファイルは新しいバージョンのアプリで書き出されています。アプリを更新してください",
  VALIDATION: "ファイルの内容に問題があります",
};

/**
 * 読み込み画面（画面設計書 3.4 節、仕様書 5.4 節）。
 * ファイルを選ぶと検証し、プレビューを出して「取り込む」で新しいリストとして保存する。
 */
export function Import() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>(IDLE);

  const onFile = async (file: File) => {
    // 上限を超えるファイルは読まずに拒否する（データ設計書 5.3 節）
    if (file.size > MAX_IMPORT_BYTES) {
      setState({ kind: "error", name: file.name, error: { code: "NOT_EXPORT_FILE" } });
      return;
    }
    setState({ kind: "validating", name: file.name });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setState({ kind: "error", name: file.name, error: { code: "INVALID_JSON" } });
      return;
    }
    const result = parseImportFile(text);
    setState(
      result.ok
        ? { kind: "preview", name: file.name, file: result.file, saving: false }
        : { kind: "error", name: file.name, error: result.error },
    );
  };

  const save = async () => {
    if (state.kind !== "preview" || state.saving) return;
    setState({ ...state, saving: true });
    try {
      const checklist = await importChecklist(state.file);
      toast.success(`「${checklist.title}」を取り込みました`, { duration: 3000 });
      // 戻るで読み込み画面に戻らないよう、履歴を置き換える
      navigate(`/lists/${checklist.id}`, { replace: true });
    } catch {
      toast.error("保存できませんでした。空き容量を確認してください", { duration: 5000 });
      setState({ ...state, saving: false });
    }
  };

  return (
    <AppShell title="ファイルを読み込む" backTo="/">
      <div className="flex flex-col gap-4">
        {state.kind === "preview" ? (
          <Preview
            name={state.name}
            file={state.file}
            saving={state.saving}
            onSave={save}
            onReset={() => setState(IDLE)}
          />
        ) : (
          <>
            <DropZone
              accept=".json,application/json"
              busy={state.kind === "validating"}
              onFile={onFile}
            />
            {state.kind === "error" && <ImportErrorBox error={state.error} />}
            <p className="text-sm text-muted-foreground">
              このアプリで書き出した .json ファイルを読み込めます
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ImportErrorBox({ error }: { error: ImportError }) {
  const issues = error.code === "VALIDATION" ? error.issues : [];
  const shown = issues.slice(0, MAX_ISSUES);
  const rest = issues.length - shown.length;
  return (
    <div role="alert" className="rounded-lg border border-destructive p-4 text-sm">
      <p className="font-medium text-destructive">{ERROR_MESSAGES[error.code]}</p>
      {shown.length > 0 && (
        // 違反箇所は「項目 3 の URL: …」の形（データ設計書 5.3.1 節）。長い文言も折り返す
        <ul className="mt-2 list-inside list-disc wrap-anywhere">
          {shown.map((issue) => (
            <li key={issue.path.join(".")}>{describeImportIssue(issue)}</li>
          ))}
        </ul>
      )}
      {rest > 0 && <p className="mt-1 text-muted-foreground">ほか {rest} 件</p>}
    </div>
  );
}

type PreviewProps = {
  name: string;
  file: ExportFile;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
};

function Preview({ name, file, saving, onSave, onReset }: PreviewProps) {
  const { checklist } = file;
  const lines = checklist.description.split("\n");
  const description = lines.slice(0, MAX_DESCRIPTION_LINES);
  const items = checklist.items.slice(0, MAX_PREVIEW_ITEMS);
  const rest = checklist.items.length - items.length;

  return (
    <section aria-label="プレビュー" className="flex flex-col gap-4">
      {/* 空白のない長いファイル名・タイトル・項目名も途中で折り返し、横スクロールを出さない */}
      <p className="text-sm text-muted-foreground wrap-anywhere">{name}</p>
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-bold text-lg wrap-anywhere">{checklist.title}</h2>
        {checklist.tags.length > 0 && (
          <ul aria-label="タグ" className="flex flex-wrap gap-1">
            {checklist.tags.map((tag) => (
              <li key={tag} className="max-w-full">
                <Badge variant="secondary" className="max-w-full">
                  <span className="truncate">{tag}</span>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {checklist.description !== "" && (
          <p className="whitespace-pre-wrap text-sm wrap-anywhere">
            {description.join("\n")}
            {lines.length > description.length && "\n…"}
          </p>
        )}
        <p className="text-sm text-muted-foreground">項目 {checklist.items.length} 件</p>
        {items.length > 0 && (
          <ol aria-label="項目" className="list-inside list-decimal text-sm wrap-anywhere">
            {items.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 読み込みファイルの項目は id を持たず、表示だけで並び替えもしない
              <li key={index}>{item.title}</li>
            ))}
          </ol>
        )}
        {rest > 0 && <p className="text-sm text-muted-foreground">ほか {rest} 件</p>}
      </div>
      <p className="text-sm text-muted-foreground">チェック状態はすべて未完了で取り込まれます</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={saving}>
          別のファイル
        </Button>
        <Button onClick={onSave} disabled={saving}>
          取り込む
        </Button>
      </div>
    </section>
  );
}
