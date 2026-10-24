import { Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createChecklist } from "@/domain/checklists";
import { ChecklistValidationError } from "@/domain/errors";
import { normalizeChecklistInput } from "@/domain/normalize";
import { validateChecklistInput } from "@/domain/schema";
import type { ChecklistInput, ValidationIssue } from "@/domain/types";

/** 項目の行。key は React の描画とフォーカス移動のための画面内だけの識別子 */
type Row = { key: string; title: string };

/** 入力欄ごとのエラー文言。項目は行の key で引く（行の追加・削除で位置がずれても対応が崩れない） */
type Errors = { title?: string; items?: string; rows: Record<string, string> };

const NO_ERRORS: Errors = { rows: {} };

/** 新規作成は空の入力から始める（画面設計書 7.1 節） */
const INITIAL_INPUT = toInput("", []);

/** 説明・タグ・メモ・URL・期限は M2 まで入力欄がないため、空の既定値で保存する */
function toInput(title: string, rows: Row[]): ChecklistInput {
  return {
    title,
    description: "",
    tags: [],
    items: rows.map((row) => ({ title: row.title, note: "", url: null, dueDate: null })),
  };
}

/** 「変更あり」は正規化後の入力を初期値と比べて判定する（画面設計書 7.1 節） */
function isChanged(input: ChecklistInput): boolean {
  return (
    JSON.stringify(normalizeChecklistInput(input)) !==
    JSON.stringify(normalizeChecklistInput(INITIAL_INPUT))
  );
}

/** 検証結果を入力欄ごとの文言に振り分ける。issues の項目の位置は保存しようとした時点の rows に対応する */
function toErrors(issues: ValidationIssue[], rows: Row[]): Errors {
  const errors: Errors = { rows: {} };
  for (const issue of issues) {
    const [field, index] = issue.path;
    if (field === "title") errors.title ??= issue.message;
    else if (field === "items" && typeof index === "number") {
      const key = rows[index]?.key;
      if (key && !errors.rows[key]) errors.rows[key] = issue.message;
    } else if (field === "items") errors.items ??= issue.message;
  }
  return errors;
}

/**
 * 新規作成画面（画面設計書 3.3 節、仕様書 5.3 節）。M1 ではタイトルと項目タイトルだけを入力する。
 * 既存リストの編集、説明・タグ・詳細の入力、並び替えは M2 で追加する。
 */
export function ListEdit() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // 保存に成功したら、詳細への遷移を破棄確認で止めない
  const saved = useRef(false);

  const changed = isChanged(toInput(title, rows));

  // キャンセル、ヘッダーの「戻る」、ブラウザの戻る、リンク遷移のすべてで破棄確認を出す（画面設計書 7.1 節）
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      changed && !saved.current && currentLocation.pathname !== nextLocation.pathname,
  );

  // ページを閉じる・再読み込みには標準の離脱確認を出す
  useEffect(() => {
    if (!changed) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [changed]);

  // 行を追加したら、描画後にその行へフォーカスを移す
  useEffect(() => {
    if (focusKey === null) return;
    rowRefs.current.get(focusKey)?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const insertRow = (index: number) => {
    const key = crypto.randomUUID();
    setRows((current) => [...current.slice(0, index), { key, title: "" }, ...current.slice(index)]);
    setFocusKey(key);
  };

  const updateRow = (key: string, value: string) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, title: value } : row)));
    setErrors((current) => ({ ...current, rows: { ...current.rows, [key]: "" } }));
  };

  const removeRow = (key: string) => {
    setRows((current) => current.filter((row) => row.key !== key));
    setErrors((current) => ({
      ...current,
      items: undefined,
      rows: { ...current.rows, [key]: "" },
    }));
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    // IME の変換確定の Enter では行を追加しない
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    insertRow(index + 1);
  };

  /** 最初のエラー欄（タイトル → 項目の順）にフォーカスを移す */
  const focusFirstError = (next: Errors) => {
    if (next.title) {
      titleRef.current?.focus();
      return;
    }
    const firstRow = rows.find((row) => next.rows[row.key]);
    if (firstRow) rowRefs.current.get(firstRow.key)?.focus();
  };

  const showIssues = (issues: ValidationIssue[]) => {
    const next = toErrors(issues, rows);
    setErrors(next);
    focusFirstError(next);
  };

  const save = async () => {
    if (saving) return;
    const input = toInput(title, rows);
    const issues = validateChecklistInput(normalizeChecklistInput(input));
    if (issues.length > 0) {
      showIssues(issues);
      return;
    }
    setErrors(NO_ERRORS);
    setSaving(true);
    try {
      const checklist = await createChecklist(input);
      saved.current = true;
      // 戻るで空の作成画面に戻らないよう、履歴を置き換える
      navigate(`/lists/${checklist.id}`, { replace: true });
    } catch (error) {
      setSaving(false);
      if (error instanceof ChecklistValidationError) {
        showIssues(error.issues);
        return;
      }
      toast.error("保存できませんでした。空き容量を確認してください", { duration: 5000 });
    }
  };

  return (
    <AppShell
      title="新しいリスト"
      backTo="/"
      actions={
        <Button onClick={save} disabled={saving}>
          保存
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="list-title">
            タイトル<span aria-hidden="true"> *</span>
          </Label>
          {/* 文字数はコードポイントで数えるため maxLength は付けない（画面設計書 3.3 節） */}
          <Input
            id="list-title"
            ref={titleRef}
            value={title}
            required
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "list-title-error" : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setErrors((current) => ({ ...current, title: undefined }));
            }}
          />
          {errors.title && <FieldError id="list-title-error">{errors.title}</FieldError>}
        </div>

        <section aria-labelledby="items-heading" className="flex flex-col gap-2">
          <h2 id="items-heading" className="text-sm font-medium">
            項目
          </h2>
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const error = errors.rows[row.key];
              const errorId = `item-${row.key}-error`;
              return (
                <li key={row.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Input
                      ref={(element) => {
                        if (element) rowRefs.current.set(row.key, element);
                        else rowRefs.current.delete(row.key);
                      }}
                      aria-label={`項目 ${index + 1}`}
                      value={row.title}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? errorId : undefined}
                      onChange={(event) => updateRow(row.key, event.target.value)}
                      onKeyDown={(event) => onRowKeyDown(event, index)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`項目 ${index + 1} を削除`}
                      onClick={() => removeRow(row.key)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  {error && <FieldError id={errorId}>{error}</FieldError>}
                </li>
              );
            })}
          </ul>
          {errors.items && <FieldError id="items-error">{errors.items}</FieldError>}
          <Button variant="outline" className="self-start" onClick={() => insertRow(rows.length)}>
            <Plus aria-hidden="true" />
            項目を追加
          </Button>
        </section>

        <Button variant="outline" className="self-start" onClick={() => navigate("/")}>
          キャンセル
        </Button>
      </div>

      <AlertDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>変更を破棄しますか？</AlertDialogTitle>
            <AlertDialogDescription>保存していない変更は失われます。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              破棄
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}
