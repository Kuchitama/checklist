# チェックリスト管理ツール 仕様書

- 作成日: 2026-10-18
- ステータス: ドラフト（レビュー待ち）
- 関連文書: [要件定義書](./requirements.md)

## 1. 全体像

ローカルファーストの PWA。サーバーを持たず、すべてのデータをブラウザの IndexedDB に保存する。
GitHub Pages に静的配置し、GitHub Actions で自動デプロイする。

```
ブラウザ
 ├─ React UI（画面）
 ├─ ドメイン層（チェックリスト操作・書き出し/読み込み・検証）
 └─ 永続化層（Dexie → IndexedDB）
        ↑↓ JSON ファイル（書き出し / 読み込み）
```

## 2. 技術スタック

| 分類 | 採用 | 理由 |
| --- | --- | --- |
| 言語 | TypeScript（strict） | 要件 NFR-09 |
| ビルド | Vite | 高速、PWA プラグインが充実 |
| UI | React 19 | 要件 NFR-09。情報量が多く、周辺ライブラリが揃う |
| ルーティング | react-router（HashRouter） | GitHub Pages ではパスベースのルーティングが 404 になるため hash 方式を採る |
| 状態・永続化 | Dexie + dexie-react-hooks | IndexedDB を型付きで扱える。`useLiveQuery` で DB 変更が UI に自動反映される |
| スタイル | Tailwind CSS | レスポンシブとダークモード（`dark:` バリアント）を少ない記述で実現 |
| ドラッグ並び替え | @dnd-kit/core + @dnd-kit/sortable | タッチ対応、キーボード操作対応、軽量 |
| バリデーション | zod | 読み込みファイルの検証と型の共有 |
| ID 生成 | `crypto.randomUUID()` | 追加依存なし |
| PWA | vite-plugin-pwa（Workbox） | Service Worker とマニフェストを自動生成 |
| 単体テスト | Vitest + @testing-library/react + fake-indexeddb | DB 層とコンポーネントをブラウザなしでテスト |
| E2E テスト | Playwright（主要シナリオのみ） | 実機相当の確認。CI では Chromium のみ |
| Lint / Format | Biome | 1 ツールで lint と format を担い設定が少ない |
| CI / CD | GitHub Actions | PR で lint・型検査・テスト・ビルド。main で Pages へデプロイ |
| パッケージ管理 | pnpm（10.16 以上） | ロックファイルを CI で固定。`minimumReleaseAge` による cooldown を使う（2.1 節） |

Node.js は **26**（2026-10-28 に Active LTS 入り。Node 22 / 24 は既に Maintenance）を前提とし、`.node-version` と `package.json` の `engines` で `26` に固定する。CI も同じファイルを参照する。

### 2.1 パッケージ管理ポリシー（pnpm）

- パッケージマネージャは **pnpm に統一**する。`npm` / `yarn` のロックファイルは置かず、`package.json` の `packageManager` フィールドで pnpm のバージョンを固定する（Corepack で自動選択）。
- **cooldown を 24 時間に設定する**。公開から 24 時間経っていないバージョンは依存解決の対象にしない。侵害されたパッケージが公開直後に取り込まれる供給網攻撃への対策。

```yaml
# pnpm-workspace.yaml
minimumReleaseAge: 1440   # 分単位。24 時間
```

- cooldown の例外が必要になった場合（セキュリティ修正を即時に取り込みたいなど）は `minimumReleaseAgeExclude` に対象パッケージを列挙し、理由を PR に書く。
- CI は `pnpm install --frozen-lockfile` のみを使い、ロックファイルと異なる解決を許さない。
- 依存更新は Renovate または Dependabot で PR 化し、cooldown を通過したバージョンだけが提案されるようにする（Renovate の `minimumReleaseAge: '1 day'` を併用）。

## 3. データモデル

### 3.1 型定義

```ts
/** チェックリスト本体。IndexedDB には 1 リスト = 1 ドキュメントで保存する */
export type Checklist = {
  id: string;            // UUID v4
  title: string;         // 1〜100 文字、必須
  description: string;   // 0〜1000 文字。空文字可
  tags: string[];        // 各 1〜30 文字。重複なし。最大 20 個
  items: ChecklistItem[];// 配列の順序 = 表示順
  createdAt: string;     // ISO 8601（UTC）
  updatedAt: string;     // ISO 8601（UTC）。項目のチェックでも更新する
};

export type ChecklistItem = {
  id: string;            // UUID v4。リスト内で一意
  title: string;         // 1〜200 文字、必須
  note: string;          // 0〜2000 文字。複数行可。空文字可
  url: string | null;    // http(s) のみ許可
  dueDate: string | null;// "YYYY-MM-DD"（ローカル日付として解釈）
  checked: boolean;
  checkedAt: string | null; // ISO 8601。checked が false のとき必ず null
};
```

用途（手順書型 / ToDo 型 / 習慣型）を表すフィールドは持たない。必要ならタグで区別する。

### 3.2 IndexedDB スキーマ（Dexie）

```ts
db.version(1).stores({
  checklists: 'id, updatedAt, *tags',
});
```

- `items` は `checklists` ドキュメント内に埋め込む。1 リストあたりの項目数は多くても数百件で、常にリスト単位で読み書きするため分割の利点がない。
- 検索（FR-06）は全件を読み込みメモリ上で部分一致させる。想定規模（NFR-05）では十分に速い。
- 設定（テーマ）は `localStorage` の `checklist.settings` キーに JSON で保存する。

### 3.3 不変条件

- `checked === false` のとき `checkedAt === null`。チェック時に現在時刻を設定し、解除時に `null` に戻す。
- `items[].id` はリスト内で一意。
- `tags` は前後空白を除去し、空文字を除き、重複を除去したうえで保存する。
- すべての書き込みで `updatedAt` を更新する。

## 4. 書き出し・読み込みファイル仕様

### 4.1 形式

- 拡張子 `.json`、UTF-8、MIME `application/json`。
- ファイル名: `checklist-<タイトルをファイル名安全化したもの>-<YYYYMMDD>.json`。

```json
{
  "format": "checklist-export",
  "version": 1,
  "exportedAt": "2026-10-18T03:00:00.000Z",
  "checklist": {
    "title": "リリース手順",
    "description": "本番リリース前に必ず通す確認",
    "tags": ["仕事", "リリース"],
    "items": [
      { "title": "CI が緑であることを確認", "note": "", "url": "https://example.com/ci", "dueDate": null },
      { "title": "リリースノートを書く", "note": "前回との差分を箇条書き", "url": null, "dueDate": null }
    ]
  }
}
```

### 4.2 書き出しルール（FR-31）

- `id`、`createdAt`、`updatedAt`、`checked`、`checkedAt` は含めない。
- 項目の `id` も含めない。読み込み側で採番する。
- 項目の順序はそのまま保持する。

### 4.3 読み込みルール（FR-32〜34）

1. JSON として解析できなければ「JSON ファイルとして読めません」と表示して中断。
2. zod スキーマで検証する。`format` が `checklist-export` でない、または `version` が未対応なら「このアプリの書き出しファイルではありません」と表示して中断。項目の必須違反・文字数超過は該当箇所を示して中断。
3. 検証に通ったらプレビュー（タイトル、タグ、項目一覧）を表示し、「取り込む」で確定する。
4. 取り込み時に新しい `id` と各項目の `id` を採番し、`checked=false`、`checkedAt=null`、`createdAt=updatedAt=現在時刻` で保存する。
5. 同名のリストが既にあっても上書きせず、常に新規追加する（タイトルは変更しない）。

### 4.4 バージョン互換

- `version` は整数。本仕様は `1`。
- 将来フィールドを追加する場合は `version` を上げ、読み込み側は旧バージョンを変換して受け入れる。未知の上位バージョンは拒否する。

## 5. 画面仕様

ルーティングは HashRouter（例: `https://<host>/checklist/#/lists/<id>`）。

| パス | 画面 |
| --- | --- |
| `#/` | 一覧 |
| `#/lists/new` | 新規作成（編集画面と同じフォーム） |
| `#/lists/:id` | 詳細（実行） |
| `#/lists/:id/edit` | 編集 |
| `#/import` | 読み込み |
| `#/settings` | 設定 |

共通: 画面上部にアプリ名と設定へのリンク。幅 640px 未満では 1 カラム、以上では最大幅 720px の中央寄せ。

### 5.1 一覧（`#/`）

- **表示**: リストをカードで縦に並べる。カードにはタイトル、タグ、進捗（`3 / 10` と進捗バー）、最終更新日時を出す。`updatedAt` の降順。
- **検索**: 上部の検索ボックスに入力すると、リスト名または項目名に部分一致（大文字小文字と全角半角は区別しない）するリストだけを表示する。入力は 150ms デバウンス。
- **タグ絞り込み**: 存在するタグをチップで並べ、選択したタグをすべて含むリスト（AND）に絞る。検索と併用可。
- **操作**: 「新規作成」「読み込み」ボタン。カードのタップで詳細へ。
- **空状態**: リストが 0 件なら作成と読み込みへの導線を中央に出す。

### 5.2 詳細（`#/lists/:id`）

- **ヘッダー**: タイトル、説明、タグ、進捗バー、「編集」ボタン。
- **項目**: 各行にチェックボックス、タイトル、補足メモ（折りたたみなしでそのまま表示。空なら非表示）、リンク（アイコン付きで別タブに開く）、期限、完了日時。
  - 期限が今日より前で未チェックなら赤系で「期限超過」を示す。今日が期限なら橙系で「今日」を示す。
  - チェック済みはタイトルに取り消し線、完了日時を `10/18 09:30` の形式で表示する。
- **操作メニュー**（右上の「…」）: リセット、複製、書き出し、削除。
  - **リセット**: 「すべてのチェックを外しますか？」の確認後、全項目を `checked=false, checkedAt=null` にする。
  - **複製**: 「<タイトル> のコピー」というタイトルで、チェック状態を除いた複製を作り、その詳細へ遷移する。接尾辞を付けた結果が 100 文字（3.1 節）を超える場合は、元タイトルの末尾を切り詰めて接尾辞込みで 100 文字に収める。
  - **書き出し**: 4 章のファイルをダウンロードする。
  - **削除**: 確認後に削除し一覧へ戻る。
- **全件完了時**: 進捗バーの横に「すべて完了」を表示し、リセットを促す。
- 存在しない `id` なら「リストが見つかりません」と一覧へのリンクを出す。

### 5.3 編集（`#/lists/:id/edit`、`#/lists/new`）

- **リスト情報**: タイトル（必須）、説明（複数行）、タグ（入力して Enter またはカンマで追加、チップで削除）。
- **項目**: 1 行ずつ、タイトル・補足メモ・URL・期限を編集できる。補足メモ以下は「詳細」で開閉する。
  - 行末の「追加」で末尾に空行を追加し、フォーカスを移す。タイトル入力中の Enter でも次の行を追加する。
  - 各行にドラッグハンドルと削除ボタン。ドラッグ（マウス・タッチ）とキーボード（ハンドルにフォーカスして Space → 矢印 → Space）で並び替えられる。
- **保存**: 入力はローカル状態に持ち、「保存」で一括保存して詳細へ戻る。「キャンセル」は変更を破棄（変更があれば確認）。編集画面だけは明示的な保存を採る（要件 FR-41 の例外）。編集途中で誤って項目を消したときに戻せるようにするため。
  - 既存項目の `id`・`checked`・`checkedAt` は保持する。新規項目は `checked=false`。
- **バリデーション**: タイトル空、文字数超過、URL が http(s) 以外のときは該当フィールド直下にエラーを出し保存を止める。

### 5.4 読み込み（`#/import`）

- ファイル選択（`accept=".json,application/json"`）とドラッグ＆ドロップ領域。
- 検証結果とプレビューを表示し、「取り込む」で保存して詳細へ遷移。エラー時は理由を表示してやり直せる。

### 5.5 設定（`#/settings`）

- テーマ: 「OS に合わせる / ライト / ダーク」。
- 全データ削除: 2 段階確認（ボタン → 「削除」と入力）で IndexedDB を初期化する。
- アプリ情報: バージョン、リポジトリへのリンク。

## 6. ドメイン層 API

UI から呼ぶ関数をひとつのモジュール（`src/domain/`）にまとめ、ここだけが Dexie を触る。

```ts
listChecklists(): Promise<Checklist[]>                     // updatedAt 降順
getChecklist(id): Promise<Checklist | undefined>
createChecklist(input: ChecklistInput): Promise<Checklist>
updateChecklist(id, input: ChecklistInput): Promise<void>  // 既存項目のチェック状態を保持してマージ
deleteChecklist(id): Promise<void>
duplicateChecklist(id): Promise<Checklist>
toggleItem(listId, itemId, checked: boolean): Promise<void>
resetChecklist(id): Promise<void>
exportChecklist(id): Promise<ExportFile>                   // 4 章の形式
parseImportFile(text: string): Result<ExportFile, ImportError>
importChecklist(file: ExportFile): Promise<Checklist>
searchChecklists(query: string, tags: string[]): Promise<Checklist[]>
clearAllData(): Promise<void>
```

`ChecklistInput` は `Checklist` から `id / createdAt / updatedAt` を除き、項目から `checked / checkedAt` を省略可にした型。

## 7. PWA

- `manifest.webmanifest`: 名前「チェックリスト」、`display: standalone`、`start_url: ./`、アイコン 192 / 512px（maskable 含む）、テーマカラーはライト・ダーク両対応。
- Service Worker: `generateSW` 方式。ビルド成果物をプリキャッシュし、ナビゲーションは `index.html` にフォールバック。
- 更新: 新しい SW を検出したら画面下部に「新しいバージョンがあります。再読み込み」を出し、ユーザー操作で反映する（自動リロードはしない）。

## 8. テーマ・デザイン方針

- Tailwind の `darkMode: 'class'` を使い、設定が「OS に合わせる」のときは `prefers-color-scheme` を監視して `html` の `dark` クラスを付け外しする。
- 色は CSS 変数（背景、文字、アクセント、危険、警告）で定義し、両テーマでコントラスト比 4.5:1 以上を保つ。
- タップ領域は最小 44px。チェックボックスは行全体をタップ可能にする。
- フォントはシステムフォント。アイコンは lucide-react。

## 9. ディレクトリ構成

```
.
├── .github/workflows/
│   ├── ci.yml          # PR: lint, typecheck, test, build
│   └── deploy.yml      # main: build → GitHub Pages
├── docs/               # 本仕様書
├── public/             # アイコン、manifest 用画像
├── src/
│   ├── app/            # ルーティング、レイアウト、テーマ適用
│   ├── pages/          # 画面単位のコンポーネント（ListIndex, ListDetail, ListEdit, Import, Settings）
│   ├── components/     # 再利用部品（Checkbox 行, TagChip, ProgressBar, ConfirmDialog など）
│   ├── domain/         # 型、zod スキーマ、操作関数、書き出し/読み込み
│   ├── db/             # Dexie 定義
│   ├── lib/            # 日付整形、文字列正規化、ファイルダウンロードなどの小道具
│   └── test/           # テスト用セットアップ
├── e2e/                # Playwright
├── biome.json
├── pnpm-workspace.yaml  # minimumReleaseAge（cooldown）
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

## 10. テスト方針

| 種別 | 対象 | 観点 |
| --- | --- | --- |
| 単体（domain） | 操作関数、書き出し/読み込み、検索 | 不変条件（3.3）、ファイル形式（4 章）、エラー分類 |
| 単体（UI） | 編集フォーム、項目行、タグ入力 | バリデーション表示、キーボード操作 |
| E2E | US-1, US-4, US-5 相当 | 作成→チェック→リセット、書き出し→読み込み |

CI では単体テストを必須、E2E は Chromium のみ実行する。

## 11. CI / CD

- **ci.yml**: `pull_request` と `push`（main 以外）で `pnpm install --frozen-lockfile` → `biome ci` → `tsc --noEmit` → `vitest run` → `vite build` → `pnpm exec playwright install --with-deps chromium` → `pnpm exec playwright test`（Chromium のみ）。
  - Playwright は `playwright.config.ts` の `webServer` で `vite preview` を起動し、ビルド済み成果物に対して実行する。失敗時は `playwright-report` を `actions/upload-artifact` で保存する。
  - E2E 工程は M5 で追加する。それまでの CI は `vite build` までで終わる。
- **deploy.yml**: `push` to `main` で `vite build --base=/checklist/` → `actions/upload-pages-artifact` → `actions/deploy-pages`。
- `base` はリポジトリ名に合わせ `/checklist/` とし、HashRouter を使うため SPA フォールバックは不要。

## 12. 開発計画（マイルストーン）

実装（M0 以降）に入る前に詳細設計フェーズ（D）を置き、画面とデータを確定させる。各実装マイルストーンは単独で動く状態で main にマージできる粒度にする。

| M | 内容 | 完了条件 |
| --- | --- | --- |
| D | 詳細設計（12.1 節）: 画面設計とデータ設計を文書化し、本仕様書との差分を反映する | 設計書 2 本がレビューを経て main にマージされ、未決事項が残っていない |
| M0 | プロジェクト初期化: Vite + React + TS、Tailwind、Biome、Vitest、CI、Pages デプロイ | 空のアプリが Pages で表示され、CI が緑 |
| M1 | データ層と一覧・詳細: Dexie スキーマ、domain 関数、一覧表示、新規作成（リストのタイトルと、項目タイトルの追加・削除だけの最小フォーム）、チェック／解除、完了日時、リセット、削除 | US-1 / US-2 が通る |
| M2 | 編集画面の完成: 項目タイトルの編集、補足メモ・URL・期限、タグ入力、ドラッグ並び替え、期限表示、バリデーション | FR-10〜15 が動く |
| M3 | 書き出し・読み込み: ファイル形式、zod 検証、プレビュー、取り込み | US-4 / US-5 が通る |
| M4 | 整理機能: タグ、タグ絞り込み、検索、複製 | US-6 / US-7 が通る |
| M5 | PWA・テーマ・仕上げ: Service Worker、マニフェスト、更新通知、ダークモード、設定画面、E2E | 受け入れ基準（要件 8 章）をすべて満たす |

### 12.1 詳細設計フェーズ（D）の成果物

本仕様書は「何を作るか」を定めるもので、実装者がそのまま手を動かせる粒度ではない。D フェーズで次の 2 本を `docs/design/` に作り、レビューを経て確定する。確定した内容と本仕様書が食い違う場合は本仕様書を修正する。

**画面設計書（`docs/design/screens.md`）**

- 画面遷移図: 5 章の 6 画面と、ダイアログ（確認、更新通知）の遷移を 1 枚で示す。
- 各画面のワイヤーフレーム: スマートフォン幅（360px）と PC 幅（720px）の 2 パターン。表示要素、空状態、エラー状態、ローディング状態を含む。
- コンポーネント一覧: 画面を構成する部品の名前、受け取る props、発火するイベント。9 章の `components/` の内容を確定する。
- 操作仕様: 各ボタン・入力の挙動、バリデーションの文言、確認ダイアログの文言、キーボード操作、フォーカス移動。
- 状態遷移: 編集画面のローカル状態（未変更 / 変更あり / 保存中 / エラー）と、チェック操作の楽観更新。

**データ設計書（`docs/design/data.md`）**

- エンティティ定義: 3 章の型を基に、各フィールドの型・制約・既定値・必須可否・正規化規則（空白除去、タグ重複除去など）を表で確定する。
- IndexedDB 設計: Dexie のテーブル、インデックス、バージョン番号、マイグレーション方針（スキーマ変更時の `upgrade` 手順）。
- 書き出しファイルの JSON Schema: 4 章の形式を zod スキーマとして確定し、バージョン互換の変換規則を記す。
- 操作ごとのデータ遷移: 6 章の各 API について、入力・前提条件・書き込む内容・`updatedAt` 更新の有無・失敗時の挙動を表で示す。
- 設定データ: `localStorage` に置くキーと値の形式。
- テストデータ: 単体テストと E2E で使う固定データ（境界値を含む）。

### M0 の具体的な初期タスク

1. `pnpm create vite` で React + TypeScript テンプレートを生成し、`tsconfig` を strict にする。`packageManager` を設定し、`pnpm-workspace.yaml` に `minimumReleaseAge: 1440` を置く。
2. Tailwind、Biome、Vitest、@testing-library/react、fake-indexeddb を導入し、サンプルテストを 1 本通す。
3. `ci.yml` と `deploy.yml` を追加し、リポジトリ設定で Pages のソースを GitHub Actions にする。
4. `src/domain/types.ts` と `src/db/index.ts` に 3 章の型とスキーマを置く。

## 13. 未決事項

なし。レビューで変更があればここに記録する。
