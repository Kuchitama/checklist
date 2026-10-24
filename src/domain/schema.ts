/**
 * zod スキーマと、zod の issue から ValidationIssue への変換（データ設計書 5.2 節、5.3.1 節）。
 * スキーマには文言を書かず、文言は toValidationIssues で画面設計書 6.1 節の表から引く。
 */
import { z } from "zod";
import type { ChecklistInput, ValidationIssue } from "./types";

type IssueCode = ValidationIssue["code"];

/** 文字数はコードポイント数で数える（データ設計書 1.1 節） */
export const cpLength = (s: string) => Array.from(s).length;

const cpMax = (max: number) => (s: string, ctx: z.RefinementCtx) => {
  if (cpLength(s) > max) ctx.addIssue({ code: "custom", params: { code: "too_long", max } });
};

const httpUrl = (s: string, ctx: z.RefinementCtx) => {
  let ok = false;
  try {
    const u = new URL(s);
    ok = u.protocol === "http:" || u.protocol === "https:";
  } catch {
    ok = false;
  }
  if (!ok) ctx.addIssue({ code: "custom", params: { code: "invalid_url" } });
};

const isoDate = (s: string, ctx: z.RefinementCtx) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let ok = false;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    // Date.UTC は 0〜99 年を 1900 年代とみなすので、setUTCFullYear で年をそのまま設定する
    const dt = new Date(0);
    dt.setUTCFullYear(y, mo - 1, d);
    ok = dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }
  if (!ok) ctx.addIssue({ code: "custom", params: { code: "invalid_date" } });
};

export const exportItemSchema = z.object({
  title: z.string().trim().min(1).superRefine(cpMax(200)),
  note: z.string().default("").superRefine(cpMax(2000)),
  // 上限はコードポイント数で判定する（1.1 節）。zod の .max() は UTF-16 単位なので使わない
  url: z.string().trim().superRefine(cpMax(2000)).superRefine(httpUrl).nullable().default(null),
  dueDate: z.string().superRefine(isoDate).nullable().default(null),
});

export const exportChecklistSchema = z.object({
  title: z.string().trim().min(1).superRefine(cpMax(100)),
  description: z.string().default("").superRefine(cpMax(1000)),
  tags: z
    .array(z.string().trim().min(1).superRefine(cpMax(30)))
    .max(20)
    .default([]),
  items: z.array(exportItemSchema).max(500).default([]),
});

export const exportFileV1Schema = z.object({
  format: z.literal("checklist-export"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  checklist: exportChecklistSchema,
});

/** 編集画面・新規作成からの入力。既存項目だけが id を持つ（データ設計書 1.4 節） */
export const checklistInputSchema = exportChecklistSchema.extend({
  items: z
    .array(exportItemSchema.extend({ id: z.string().optional() }))
    .max(500)
    .default([]),
});

/**
 * 正規化済みの入力を検証する（データ設計書 1.5 節）。問題がなければ空配列を返す。
 * 呼び出し側は先に normalizeChecklistInput を通す。
 */
export function validateChecklistInput(input: ChecklistInput): ValidationIssue[] {
  const result = checklistInputSchema.safeParse(input);
  return result.success ? [] : toValidationIssues(result.error);
}

/** zod の issue を ValidationIssue に変換する（データ設計書 5.3.1 節） */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    const path = issue.path.filter(
      (p): p is string | number => typeof p === "string" || typeof p === "number",
    );
    const code = toCode(issue);
    return { path, code, message: messageFor(code, fieldName(path)) };
  });
}

function toCode(issue: z.core.$ZodIssue): IssueCode {
  if (issue.code === "custom" && typeof issue.params?.code === "string") {
    return issue.params.code as IssueCode;
  }
  if (issue.code === "too_small" && issue.origin === "string") return "required";
  if (issue.code === "too_big" && issue.origin === "array") return "too_many";
  return "invalid_type";
}

const ITEM_FIELDS: Record<string, string> = {
  title: "項目名",
  note: "補足メモ",
  url: "URL",
  dueDate: "期限",
};

const LIST_FIELDS: Record<string, string> = {
  title: "タイトル",
  description: "説明",
  tags: "タグ",
  items: "項目",
  format: "ファイル形式",
  version: "ファイル形式",
  exportedAt: "ファイル形式",
  checklist: "ファイル形式",
};

/** path の末尾の文字列要素を、親に items があるかどうかと合わせて日本語にする */
function fieldName(path: (string | number)[]): string | undefined {
  const last = path.findLast((p): p is string => typeof p === "string");
  if (last === undefined) return undefined;
  const underItems = path.slice(0, path.lastIndexOf(last)).includes("items");
  return underItems ? ITEM_FIELDS[last] : LIST_FIELDS[last];
}

/** 画面設計書 6.1 節。（code, フィールド名）の組み合わせごとの文言 */
const MESSAGES: Record<string, string> = {
  "required:タイトル": "タイトルを入力してください",
  "required:項目名": "項目名を入力してください（不要な行は削除してください）",
  "too_long:タイトル": "タイトルは 100 文字以内です",
  "too_long:説明": "説明は 1000 文字以内です",
  "too_long:タグ": "タグは 30 文字以内です",
  "too_many:タグ": "タグは 20 個までです",
  "too_long:項目名": "項目名は 200 文字以内です",
  "too_long:補足メモ": "補足メモは 2000 文字以内です",
  "invalid_url:URL": "http または https の URL を入力してください",
  "too_long:URL": "URL は 2000 文字以内です",
  "invalid_date:期限": "存在する日付を入力してください",
  "too_many:項目": "項目は 500 件までです",
  "invalid_type:ファイル形式": "ファイルの形式が正しくありません",
};

/** 表にない組み合わせのときの既定の文言（画面設計書 6.1 節の「汎用」） */
const GENERIC_MESSAGES: Record<IssueCode, string> = {
  required: "入力してください",
  too_long: "文字数が上限を超えています",
  too_many: "件数が上限を超えています",
  invalid_url: "http または https の URL を入力してください",
  invalid_date: "存在する日付を入力してください",
  invalid_type: "値の形式が正しくありません",
  unknown_id: "項目の識別子が不正です。画面を再読み込みしてください",
};

export function messageFor(code: IssueCode, field: string | undefined): string {
  return MESSAGES[`${code}:${field}`] ?? GENERIC_MESSAGES[code];
}
