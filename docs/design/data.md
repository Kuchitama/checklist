# データ設計書

- 作成日: 2026-10-22
- ステータス: ドラフト（レビュー待ち）
- 関連文書: [要件定義書](../requirements.md)、[仕様書](../spec.md)（3 章、4 章、6 章）、[画面設計書](./screens.md)

本書は仕様書 3 章（データモデル）、4 章（書き出し・読み込み）、6 章（ドメイン層 API）を、実装者がそのままコードに落とせる粒度まで確定する。仕様書と食い違う記述があれば仕様書を直してから本書を直す。

## 1. エンティティ定義

### 1.1 文字数の数え方

文字数はすべて **コードポイント数**（`Array.from(value).length`）で数える。絵文字や結合文字を含むタイトルが UTF-16 の長さで不当に拒否されないようにするため。前後の空白を除去（`trim`）した後に数える。

### 1.2 Checklist

| フィールド | 型 | 必須 | 既定値 | 制約 | 正規化 |
| --- | --- | --- | --- | --- | --- |
| `id` | `string` | 必須 | `crypto.randomUUID()` | UUID v4。作成後は不変 | なし |
| `title` | `string` | 必須 | なし | 1〜100 文字 | `trim`。改行（`\r\n`、`\n`、`\r`）は半角スペース 1 個に置換 |
| `description` | `string` | 必須（空文字可） | `""` | 0〜1000 文字 | `trim`。`\r\n` と `\r` は `\n` に統一 |
| `tags` | `string[]` | 必須 | `[]` | 各要素 1〜30 文字。最大 20 個。重複なし | 各要素を `trim` し、空文字を除き、完全一致で重複を除く。入力順を保つ |
| `items` | `ChecklistItem[]` | 必須 | `[]` | 最大 500 件。`id` はリスト内で一意 | 配列順をそのまま表示順とする |
| `createdAt` | `string` | 必須 | 作成時刻 | ISO 8601、UTC、ミリ秒あり（`new Date().toISOString()`） | なし |
| `updatedAt` | `string` | 必須 | 作成時刻 | 同上。`createdAt` 以上 | すべての書き込みで現在時刻に更新 |

項目数の上限 500 件は、性能要件 NFR-05（1 リスト 300 項目）に余裕を持たせた値。

### 1.3 ChecklistItem

| フィールド | 型 | 必須 | 既定値 | 制約 | 正規化 |
| --- | --- | --- | --- | --- | --- |
| `id` | `string` | 必須 | `crypto.randomUUID()` | UUID v4。リスト内で一意。作成後は不変 | なし |
| `title` | `string` | 必須 | なし | 1〜200 文字 | `trim`。改行は半角スペース 1 個に置換 |
| `note` | `string` | 必須（空文字可） | `""` | 0〜2000 文字 | `trim`。`\r\n` と `\r` は `\n` に統一 |
| `url` | `string \| null` | 必須 | `null` | `null` または `http:` / `https:` で始まる絶対 URL。最大 2000 文字 | `trim`。空文字は `null` に変換。`new URL()` で解析できなければ不正 |
| `dueDate` | `string \| null` | 必須 | `null` | `null` または `YYYY-MM-DD`。暦として存在する日付（2 月 30 日などは不正） | 空文字は `null` に変換 |
| `checked` | `boolean` | 必須 | `false` | なし | なし |
| `checkedAt` | `string \| null` | 必須 | `null` | `checked === false` のとき必ず `null`。`checked === true` のとき必ず ISO 8601 | `checked` の変更時に合わせて更新 |

### 1.4 入力型

```ts
/** 編集画面と読み込みから渡される、保存前のリスト */
export type ChecklistInput = {
  title: string;
  description: string;
  tags: string[];
  items: ChecklistItemInput[];
};

/** id を持つ項目は既存項目。持たない項目は新規項目 */
export type ChecklistItemInput = {
  id?: string;
  title: string;
  note: string;
  url: string | null;
  dueDate: string | null;
};
```

`checked` と `checkedAt` は入力型に含めない。編集画面は項目の定義だけを変え、チェック状態は `updateChecklist` が既存項目から引き継ぐ（4 章）。

### 1.5 正規化と検証の順序

`normalizeChecklistInput(input)` → `validateChecklistInput(normalized)` の順に必ず通す。正規化で消える違反（前後空白だけのタグなど）はエラーにしない。検証エラーは次の型で返す。

```ts
export type ValidationIssue = {
  path: (string | number)[]; // 例: ["title"], ["items", 3, "url"]
  code: "required" | "too_long" | "too_many" | "invalid_url" | "invalid_date" | "invalid_type" | "unknown_id";
  message: string;           // 画面にそのまま出す日本語
};
```

文言は画面設計書 6 章の一覧に従う。

## 2. 時刻と日付の扱い

| 値 | 保存形式 | タイムゾーン | 表示 |
| --- | --- | --- | --- |
| `createdAt` / `updatedAt` / `checkedAt` / `exportedAt` | ISO 8601 UTC（`2026-10-22T00:30:00.000Z`） | UTC | 端末のローカル時刻に変換し `M/D HH:mm`（例 `10/18 09:30`）。年が今年でなければ `YYYY/M/D HH:mm` |
| `dueDate` | `YYYY-MM-DD` | タイムゾーンを持たない暦日 | `M/D`（例 `10/18`）。年が今年でなければ `YYYY/M/D` |

- 「今日」は端末のローカル日付（`new Date()` の年月日）で求める。`dueDate` との比較は文字列比較ではなく、年月日を数値にして比べる。
- 期限の状態: `dueDate < 今日` かつ未チェック → `overdue`。`dueDate === 今日` かつ未チェック → `today`。それ以外 → `normal`。チェック済みは期限の状態を表示しない。
- 一覧の「最終更新」は `updatedAt` を相対表現にせず、上記の絶対表記で出す。相対表現は端末の時刻ずれで誤解を招くため。

## 3. IndexedDB 設計（Dexie）

### 3.0 IndexedDB とは

ブラウザに標準で組み込まれている、JavaScript から使えるローカルデータベース。本アプリが IndexedDB を選ぶ理由と性質は次のとおり。

| 観点 | 内容 |
| --- | --- |
| 置き場所 | 端末のブラウザの中。サーバーに送られず、オリジン（`https://<host>` と GitHub Pages のパス）ごとに分離される。他のサイトからは読めない |
| 形 | リレーショナルではなく、キーと JavaScript オブジェクトを対にして保存するキーバリュー型。テーブルに相当する「オブジェクトストア」に、`{ id, title, items: [...] }` のような入れ子のオブジェクトをそのまま入れられる。SQL はなく、主キーとインデックスで検索する |
| 容量 | `localStorage`（通常 5 MB 程度、文字列のみ）と違い、数百 MB 以上を扱える。本アプリの想定（リスト 200 件 × 項目 300 件）は余裕で収まる |
| 非同期 | すべての操作が非同期（Promise）で、UI を止めない |
| トランザクション | 読み書きをトランザクションで囲め、複数の更新を原子的に行える（3.2 節で利用） |
| バージョン | DB 自体にバージョン番号があり、スキーマ変更時に `upgrade` 処理を挟める（3.3 節で利用） |
| 寿命 | ブラウザのサイトデータ削除、プライベートブラウジングの終了で消える。ユーザーの明示的な書き出しが唯一のバックアップ（要件 7 章の前提） |
| 対応 | iOS Safari、Android Chrome、PC の主要ブラウザすべてで使える |

素の IndexedDB API はイベントベースで記述量が多いため、本アプリでは薄いラッパである Dexie を通して使う。Dexie は Promise ベースの API、スキーマ宣言、`useLiveQuery` による React への自動反映を提供する。

### 3.1 データベース

| 項目 | 値 |
| --- | --- |
| DB 名 | `checklist` |
| 現在のバージョン | 1 |
| テーブル | `checklists` |

```ts
import Dexie, { type EntityTable } from "dexie";

export const db = new Dexie("checklist") as Dexie & {
  checklists: EntityTable<Checklist, "id">;
};

db.version(1).stores({
  checklists: "id, updatedAt, *tags",
});
```

| インデックス | 用途 |
| --- | --- |
| `id`（主キー） | 取得、更新、削除 |
| `updatedAt` | 一覧の降順並び（`orderBy("updatedAt").reverse()`） |
| `*tags`（マルチエントリ） | タグ一覧の取得（`orderBy("tags").uniqueKeys()`）。絞り込み自体はメモリ上で行う |

`items` は `checklists` に埋め込み、独立したテーブルにしない（仕様書 3.2 節）。

### 3.2 読み書きの規則

- 書き込みはすべて `db.transaction("rw", db.checklists, ...)` の中で行い、読み取り→変更→書き込みを 1 トランザクションにする。`toggleItem` の連打で更新が失われないようにするため。
- 書き込みの直前に必ず `updatedAt = now()` を設定する。
- UI は `useLiveQuery` で購読し、書き込み後の再取得を自分では行わない。

### 3.3 マイグレーション方針

- スキーマ変更は `db.version(n + 1).stores({...}).upgrade(tx => ...)` を**追加**する。過去の `version(n)` 宣言は削除しない。
- フィールド追加は既定値を `upgrade` で埋める。フィールド削除は `upgrade` で取り除く。型変更は新フィールドに移してから旧フィールドを削除する（2 段階）。
- 各バージョンの固定データを `src/test/fixtures/db-v<n>.json` に置き、`fake-indexeddb` で「v<n> のデータを投入 → 最新バージョンで開く → 期待どおり変換される」テストを必ず書く。
- `version` を上げる PR では、本書 3.1 節と仕様書 3.2 節を同時に更新する。

### 3.4 失敗時の扱い

| 事象 | 原因の例 | 挙動 |
| --- | --- | --- |
| DB を開けない | プライベートブラウジング、ストレージ無効、`VersionError`（新しい版で作った DB を古い版で開いた） | 全画面のエラー表示「データを保存できない環境です」。原因の種類と対処（通常モードで開く、ページを再読み込み）を添える。アプリは続行しない |
| 書き込み失敗 | `QuotaExceededError` | 操作を取り消し、トースト「保存できませんでした。空き容量を確認してください」。チェック操作は楽観更新を巻き戻す |
| 読み取り失敗 | 一時的な障害 | 該当画面にエラー表示と「再試行」ボタン |

## 4. ドメイン層 API のデータ遷移

仕様書 6 章の各関数について、入力・前提・書き込み・失敗を確定する。`now()` は `new Date().toISOString()`。

| 関数 | 入力 | 前提条件 | 書き込む内容 | `updatedAt` | 失敗 |
| --- | --- | --- | --- | --- | --- |
| `listChecklists()` | なし | なし | なし | 変更なし | DB 読み取り失敗 |
| `getChecklist(id)` | `id` | なし | なし | 変更なし | 見つからなければ `undefined`（例外にしない） |
| `createChecklist(input)` | `ChecklistInput` | 正規化・検証を通過 | 新規 `id`、各項目に新規 `id`、`checked=false`、`checkedAt=null`、`createdAt=updatedAt=now()` | `now()` | 検証エラー（`ValidationIssue[]`）、DB 書き込み失敗 |
| `updateChecklist(id, input)` | `id`、`ChecklistInput` | リストが存在。正規化・検証を通過 | `title`/`description`/`tags` を置換。`items` は 4.1 節のマージ規則で置換。`createdAt` は保持 | `now()` | 見つからない（`NotFoundError`）、検証エラー、DB 書き込み失敗 |
| `deleteChecklist(id)` | `id` | なし | 該当ドキュメントを削除 | なし | 見つからなくても成功扱い（冪等） |
| `duplicateChecklist(id)` | `id` | リストが存在 | 新規 `id`、タイトルは 4.2 節の規則、`description`/`tags` をコピー、各項目は新規 `id` で `checked=false`、`checkedAt=null`、`createdAt=updatedAt=now()` | `now()` | 見つからない、DB 書き込み失敗 |
| `toggleItem(listId, itemId, checked)` | `listId`、`itemId`、`checked` | リストと項目が存在 | 該当項目の `checked` を引数の値に、`checkedAt` を `checked ? now() : null` に | `now()` | 見つからない、DB 書き込み失敗 |
| `resetChecklist(id)` | `id` | リストが存在 | 全項目を `checked=false`、`checkedAt=null` | `now()` | 見つからない、DB 書き込み失敗 |
| `exportChecklist(id)` | `id` | リストが存在 | なし（5 章の `ExportFile` を返す） | 変更なし | 見つからない |
| `parseImportFile(text)` | ファイル本文 | なし | なし（`Result<ExportFile, ImportError>` を返す） | 変更なし | 5.3 節の `ImportError` |
| `importChecklist(file)` | `ExportFile` | `parseImportFile` を通過 | `createChecklist` と同じ | `now()` | 検証エラー、DB 書き込み失敗 |
| `searchChecklists(query, tags)` | 検索語、タグ配列 | なし | なし | 変更なし | DB 読み取り失敗 |
| `clearAllData()` | なし | なし | `checklists` を全削除し、`localStorage` の `checklist.settings` を削除 | なし | DB 書き込み失敗 |

### 4.1 `updateChecklist` の項目マージ規則

入力の `items` を先頭から順に処理し、出力の `items` を組み立てる。

1. 入力項目に `id` があり、既存リストに同じ `id` の項目がある → 既存項目の `checked` と `checkedAt` を引き継ぎ、`title`/`note`/`url`/`dueDate` は入力で置き換える。
2. 入力項目に `id` がない → 新規項目として `id` を採番し、`checked=false`、`checkedAt=null`。
3. 入力項目に `id` があるが既存リストにない → 不正入力。`ValidationIssue`（`code: "unknown_id"`、path は `["items", i, "id"]`）で拒否する。編集画面は既存項目の `id` を改変しないため、通常は起きない。
4. 既存リストにあって入力にない項目 → 削除。
5. 出力の順序は入力の順序。

### 4.2 複製時のタイトル

```
suffix = " のコピー"
base   = 元タイトル
if length(base + suffix) > 100:
  base = base の先頭 (100 - length(suffix)) 文字   // コードポイント単位
title  = trim(base) + suffix
```

`trim` の結果 `base` が空になることはない（`100 - 5 = 95` 文字は残る）。

### 4.3 検索の照合規則

- 検索語とリストの `title`、各項目の `title` を次の正規化後に比較する: `NFKC` 正規化 → 小文字化（`toLowerCase`）→ ひらがな化はしない。
- 検索語を空白で分割し、すべての語を含むリストだけを返す（AND）。
- `tags` 引数が空でなければ、指定タグをすべて持つリストに絞る（AND）。タグの比較は正規化せず完全一致。
- 結果は `updatedAt` 降順。

## 5. 書き出しファイル

### 5.1 型

```ts
export type ExportFile = {
  format: "checklist-export";
  version: 1;
  exportedAt: string;        // ISO 8601 UTC
  checklist: {
    title: string;
    description: string;
    tags: string[];
    items: {
      title: string;
      note: string;
      url: string | null;
      dueDate: string | null;
    }[];
  };
};
```

### 5.2 zod スキーマ

```ts
import { z } from "zod";

const cpLength = (s: string) => Array.from(s).length;

/**
 * 各検証は boolean で判定し、違反時は custom issue の params.code に
 * ドメインの ValidationIssue.code を入れる。文言はスキーマに書かず、
 * 5.3 節の変換層で画面設計書 6.1 節の表から引く。
 */
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
    const dt = new Date(Date.UTC(y, mo - 1, d));
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
  tags: z.array(z.string().trim().min(1).superRefine(cpMax(30))).max(20).default([]),
  items: z.array(exportItemSchema).max(500).default([]),
});

export const exportFileV1Schema = z.object({
  format: z.literal("checklist-export"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  checklist: exportChecklistSchema,
});
```

- 未知のキーは **無視**する（zod の既定。`strict()` にしない）。同一バージョン内で将来キーが増えても旧版が読めるようにするため。
- `note`、`url`、`dueDate`、`description`、`tags`、`items` は欠けていても既定値で補う。`title` と `format`、`version`、`exportedAt` は必須。
- スキーマは `src/domain/schema.ts` に置き、入力型の検証（1.5 節）にも同じ部品を使う。
- 文字列の長さ判定はすべて `cpMax`（コードポイント数）で行い、zod の `.max()`（UTF-16 コード単位）は文字列に使わない。配列の件数には `.max()` を使う。
- 単体テストで「上限ちょうどは通り、上限 + 1 文字は `too_long` で拒否される」ことを、絵文字を含む文字列（7 章 `emoji-title`）でも確認する。

### 5.3 読み込みの判定順序と `ImportError`

```ts
export type ImportError =
  | { code: "INVALID_JSON" }                              // JSON.parse 失敗
  | { code: "NOT_EXPORT_FILE" }                           // オブジェクトでない、format が違う
  | { code: "UNSUPPORTED_VERSION"; version: unknown }     // version が 1 でない
  | { code: "VALIDATION"; issues: ValidationIssue[] };    // スキーマ違反
```

1. `JSON.parse` に失敗 → `INVALID_JSON`。
2. 値がオブジェクトでない、または `format !== "checklist-export"` → `NOT_EXPORT_FILE`。
3. `version` が整数でない、または `1` でない → `UNSUPPORTED_VERSION`。将来 `version: 2` を導入したら、ここで `1 → 2` の変換関数を挟む。
4. `exportFileV1Schema.safeParse` に失敗 → `VALIDATION`。zod の issue を 5.3.1 節の規則で `ValidationIssue` に変換する。zod の `message` は使わない。
5. 成功 → `ExportFile` を返す。

ファイルサイズは読み込み前に `File.size` で判定し、**20 MB（20,000,000 バイト）** を超えていれば `NOT_EXPORT_FILE` として扱う。

上限の根拠: 各フィールドが上限いっぱいのリストを本アプリ自身が書き出した場合の理論最大を下回ってはならない。最悪ケース（500 項目すべてでタイトル 200 文字・メモ 2000 文字・URL 2000 文字、全文字が 4 バイトの UTF-8 または 6 バイトの JSON エスケープ `\uXXXX` になる場合）で、項目 1 件あたり約 25 KB、リスト全体で約 13 MB（2 スペースの整形を含む）。20 MB はこれに余裕を持たせた値で、仕様書 4.3 節と画面設計書 3.4 節も同じ値にする。上限を変えるときは 3 箇所を同時に直す。

#### 5.3.1 zod の issue から `ValidationIssue` への変換

変換関数 `toValidationIssues(error: z.ZodError): ValidationIssue[]` を `src/domain/schema.ts` に置き、読み込み（5.3 節）と入力検証（1.5 節）の両方で使う。スキーマには文言を書かず、文言はここで画面設計書 6.1 節の表から引く。

**code の決め方**

| zod の issue | 変換後の `code` |
| --- | --- |
| `custom` で `params.code` がある | `params.code` の値（`too_long` / `invalid_url` / `invalid_date`） |
| `too_small`（文字列。`.min(1)` 違反） | `required` |
| `too_big`（配列。`.max(20)` / `.max(500)` 違反） | `too_many` |
| `invalid_type`（`undefined` や `null` を含む型違い）、`invalid_literal`、`invalid_string`（`exportedAt` の datetime 違反）、`invalid_union`、上記以外 | `invalid_type` |

**path**: zod の `path` をそのまま使う（例 `["checklist", "items", 0, "url"]`）。

**フィールド名**: `path` の末尾の文字列要素（配列インデックスは飛ばす）を、親に `items` があるかどうかと合わせて次の表で日本語にする。

| 末尾の要素 | 親に `items` あり | 親に `items` なし |
| --- | --- | --- |
| `title` | 項目名 | タイトル |
| `note` | 補足メモ | — |
| `url` | URL | — |
| `dueDate` | 期限 | — |
| `description` | — | 説明 |
| `tags` | — | タグ |
| `items` | — | 項目 |
| `format` / `version` / `exportedAt` / `checklist` | — | ファイル形式 |

**message**: 画面設計書 6.1 節の表を（`code`, フィールド名）で引く。該当がなければ同表の「汎用」の行を `code` で引く。

**画面への表示**: 読み込み画面では `path` に `items` のインデックス `i` が含まれるとき「項目 i+1 の <フィールド名>: <message>」、含まれないとき「<フィールド名>: <message>」の形で出す。編集画面では `path` に対応する入力欄の直下に `message` だけを出す。

### 5.4 書き出しファイル名

```
checklist-<safeTitle>-<YYYYMMDD>.json
```

- `safeTitle`: タイトルから `\ / : * ? " < > |` と制御文字（U+0000〜U+001F、U+007F）を `_` に置換し、連続する空白を `_` 1 個にまとめ、先頭 50 コードポイントで切る。結果が空なら `untitled`。
- `YYYYMMDD`: 端末のローカル日付。
- 例: タイトル「リリース手順: v2」→ `checklist-リリース手順__v2-20261022.json`。

## 6. 設定データ（localStorage）

| キー | 値 |
| --- | --- |
| `checklist.settings` | `{ "version": 1, "theme": "system" \| "light" \| "dark" }` |

- 読み取り時に JSON として解析できない、`version` が `1` でない、`theme` が 3 値以外のときは、既定値 `{ version: 1, theme: "system" }` で上書きする。
- `localStorage` が使えない環境（例外が出る）では既定値で動作し、変更は保存しない。
- Service Worker の更新通知の状態は永続化しない。

## 7. テストデータ

`src/test/fixtures/` に置く固定データ。単体テストと E2E で共有する。

| 名前 | 内容 | 使う場面 |
| --- | --- | --- |
| `empty-list` | 項目 0 件、タグなし | 空状態の表示、進捗 `0 / 0` |
| `release-steps` | 項目 5 件、うち 2 件チェック済み（`checkedAt` あり）、タグ 2 個、URL あり 1 件 | 詳細画面、進捗、書き出し |
| `with-due-dates` | 項目 3 件。`dueDate` が昨日・今日・明日（テスト時に相対で生成） | 期限の 3 状態 |
| `boundary-max` | タイトル 100 文字、説明 1000 文字、タグ 20 個（各 30 文字）、項目 500 件（タイトル 200 文字、メモ 2000 文字） | 上限の受理、性能 |
| `boundary-over` | 上記をそれぞれ 1 文字・1 個超過 | 上限の拒否と文言 |
| `title-98` | タイトル 98 文字 | 複製時の切り詰め（4.2 節）: 結果が 100 文字になり、末尾が「 のコピー」 |
| `emoji-title` | 絵文字と結合文字を含むタイトル（UTF-16 長 > コードポイント数） | 文字数の数え方（1.1 節） |
| `export-valid.json` | 5.1 節のとおりの正常ファイル | 読み込み成功、プレビュー |
| `export-minimal.json` | `note`/`url`/`dueDate` を省略した項目 | 既定値の補完 |
| `export-not-json.txt` | `{` だけの壊れたファイル | `INVALID_JSON` |
| `export-wrong-format.json` | `format: "other"` | `NOT_EXPORT_FILE` |
| `export-v2.json` | `version: 2` | `UNSUPPORTED_VERSION` |
| `export-invalid-url.json` | `url: "ftp://example.com"` | `VALIDATION`、path `["checklist","items",0,"url"]` |
| `export-invalid-date.json` | `dueDate: "2026-02-30"` | `VALIDATION` |
| `db-v1.json` | バージョン 1 の DB 内容（`release-steps` を含む） | 将来のマイグレーションテストの起点 |

`boundary-max` の 500 件リストは生成関数で作り、ファイルには置かない。

## 8. 未決事項

なし。
