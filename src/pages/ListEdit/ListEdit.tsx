import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AutoTextarea } from "@/components/AutoTextarea";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadErrorState } from "@/components/LoadErrorState";
import { NotFoundState } from "@/components/NotFoundState";
import { TagInput, toTag } from "@/components/TagInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createChecklist, getChecklist, updateChecklist } from "@/domain/checklists";
import { ChecklistValidationError } from "@/domain/errors";
import { normalizeChecklistInput } from "@/domain/normalize";
import { validateChecklistInput } from "@/domain/schema";
import type { Checklist, ChecklistInput, ValidationIssue } from "@/domain/types";

/**
 * 項目の行。key は React の描画とフォーカス移動のための画面内だけの識別子。
 * id は既存項目だけが持つ（保存時にチェック状態を引き継ぐ。データ設計書 4.1 節）。
 * note / url / dueDate は入力欄ができるまで、読み込んだ値をそのまま保って保存する。
 */
type Row = {
  key: string;
  id?: string;
  title: string;
  note: string;
  url: string | null;
  dueDate: string | null;
};

/** 入力欄ごとのエラー文言。項目は行の key で引く（行の追加・削除で位置がずれても対応が崩れない） */
type Errors = {
  title?: string;
  description?: string;
  tags?: string;
  items?: string;
  rows: Record<string, string>;
};

const NO_ERRORS: Errors = { rows: {} };

/** 画面の入力をドメインの入力にする。タグの未確定の入力は確定したものとして扱う（画面設計書 3.3 節） */
function toInput(
  title: string,
  description: string,
  tags: string[],
  tagDraft: string,
  rows: Row[],
): ChecklistInput {
  return {
    title,
    description,
    tags: commitTag(tags, tagDraft),
    items: rows.map(({ key: _key, ...item }) => item),
  };
}

/** 未確定の入力をタグ列に加える。空白だけなら無視し、重複は加えない */
function commitTag(tags: string[], draft: string): string[] {
  const value = toTag(draft);
  return value === null || tags.includes(value) ? tags : [...tags, value];
}

function rowsOf(checklist: Checklist): Row[] {
  return checklist.items.map((item) => ({
    key: item.id,
    id: item.id,
    title: item.title,
    note: item.note,
    url: item.url,
    dueDate: item.dueDate,
  }));
}

/** 検証結果を入力欄ごとの文言に振り分ける。issues の項目の位置は保存しようとした時点の rows に対応する */
function toErrors(issues: ValidationIssue[], rows: Row[]): Errors {
  const errors: Errors = { rows: {} };
  for (const issue of issues) {
    const [field, index] = issue.path;
    if (field === "title") errors.title ??= issue.message;
    else if (field === "description") errors.description ??= issue.message;
    else if (field === "tags") errors.tags ??= issue.message;
    else if (field === "items" && typeof index === "number") {
      const key = rows[index]?.key;
      if (key && !errors.rows[key]) errors.rows[key] = issue.message;
    } else if (field === "items") errors.items ??= issue.message;
  }
  return errors;
}

/**
 * 新規作成（`#/lists/new`）と編集（`#/lists/:id/edit`）の画面（画面設計書 3.3 節、仕様書 5.3 節）。
 * タイトル・説明・タグと項目タイトルを入力する。項目の詳細（メモ・URL・期限）と並び替えは後続の Issue で加える。
 */
export function ListEdit() {
  const { id } = useParams();
  if (id === undefined) return <ListEditor mode="new" />;
  // 編集対象が変わったら読み込みと入力を作り直す（同じタブで別のリストの編集画面へ直接遷移した場合）
  return (
    <ErrorBoundary
      key={id}
      fallback={(error, reset) => (
        <AppShell backTo={`/lists/${id}`}>
          <LoadErrorState error={error} onRetry={reset} />
        </AppShell>
      )}
    >
      <ExistingListLoader id={id} />
    </ErrorBoundary>
  );
}

/** 既存リストを読み込んで編集画面に渡す。開いた時点の内容を初期値にし、編集中の購読更新では入力を上書きしない（7.1 節） */
function ExistingListLoader({ id }: { id: string }) {
  const checklist = useLiveQuery(async () => (await getChecklist(id)) ?? null, [id]);
  const initial = useRef<Checklist | null>(null);
  if (checklist && !initial.current) initial.current = checklist;

  if (initial.current) return <ListEditor mode="edit" checklist={initial.current} />;
  return (
    <AppShell backTo={`/lists/${id}`}>
      {/* 読み込み中は本文を描画しない。IndexedDB の読み取りは 200ms 以内に終わる前提（画面設計書 2.1 節） */}
      {checklist === null && <NotFoundState />}
    </AppShell>
  );
}

type EditorProps = { mode: "new" } | { mode: "edit"; checklist: Checklist };

function ListEditor(props: EditorProps) {
  const navigate = useNavigate();
  const checklist = props.mode === "edit" ? props.checklist : null;
  // 「変更あり」はこの初期値と比べて判定する（新規は空。画面設計書 7.1 節）
  const initialInput = toInput(
    checklist?.title ?? "",
    checklist?.description ?? "",
    checklist?.tags ?? [],
    "",
    checklist ? rowsOf(checklist) : [],
  );
  // キャンセルと「戻る」の行き先。新規は一覧、編集は詳細
  const backTo = checklist ? `/lists/${checklist.id}` : "/";

  const [title, setTitle] = useState(initialInput.title);
  const [description, setDescription] = useState(initialInput.description);
  const [tags, setTags] = useState(initialInput.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [rows, setRows] = useState<Row[]>(() => (checklist ? rowsOf(checklist) : []));
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // 保存に成功したら、詳細への遷移を破棄確認で止めない
  const saved = useRef(false);

  const changed =
    JSON.stringify(normalizeChecklistInput(toInput(title, description, tags, tagDraft, rows))) !==
    JSON.stringify(normalizeChecklistInput(initialInput));

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
    const row: Row = { key, title: "", note: "", url: null, dueDate: null };
    setRows((current) => [...current.slice(0, index), row, ...current.slice(index)]);
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

  /** 最初のエラー欄（タイトル → 説明 → タグ → 項目の順）にフォーカスを移す */
  const focusFirstError = (next: Errors) => {
    if (next.title) return titleRef.current?.focus();
    if (next.description) return descriptionRef.current?.focus();
    if (next.tags) return tagRef.current?.focus();
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
    const input = toInput(title, description, tags, tagDraft, rows);
    // 未確定のタグを確定した状態を画面にも反映する
    setTags(input.tags);
    setTagDraft("");
    const issues = validateChecklistInput(normalizeChecklistInput(input));
    if (issues.length > 0) {
      showIssues(issues);
      return;
    }
    setErrors(NO_ERRORS);
    setSaving(true);
    try {
      const result = checklist
        ? await updateChecklist(checklist.id, input)
        : await createChecklist(input);
      saved.current = true;
      // 戻るで作成・編集画面に戻らないよう、履歴を置き換える
      navigate(`/lists/${result.id}`, { replace: true });
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
      title={checklist ? "リストを編集" : "新しいリスト"}
      backTo={backTo}
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="list-description">説明</Label>
          <AutoTextarea
            id="list-description"
            ref={descriptionRef}
            value={description}
            minRows={2}
            maxRows={10}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? "list-description-error" : undefined}
            onChange={(event) => {
              setDescription(event.target.value);
              setErrors((current) => ({ ...current, description: undefined }));
            }}
          />
          {errors.description && (
            <FieldError id="list-description-error">{errors.description}</FieldError>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="list-tags">タグ</Label>
          <TagInput
            id="list-tags"
            inputRef={tagRef}
            tags={tags}
            draft={tagDraft}
            error={errors.tags}
            onTagsChange={(next) => {
              setTags(next);
              setErrors((current) => ({ ...current, tags: undefined }));
            }}
            onDraftChange={(next) => {
              setTagDraft(next);
              setErrors((current) => ({ ...current, tags: undefined }));
            }}
          />
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

        <Button variant="outline" className="self-start" onClick={() => navigate(backTo)}>
          キャンセル
        </Button>
      </div>

      {/* 文言は画面設計書 5.2 節 */}
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="変更を破棄しますか？"
        message="保存していない変更は失われます。"
        confirmLabel="破棄"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => {
          if (blocker.state === "blocked") blocker.reset();
        }}
      />
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
