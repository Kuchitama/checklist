# ハーネス（開発ループの土台）

- 作成日: 2026-10-23
- ステータス: ドラフト（レビュー待ち）
- 関連文書: [仕様書](./spec.md)（12.2 節）、[CLAUDE.md](../CLAUDE.md)、[秘密情報の取り扱い](./security.md)

仕様書 12.2 節のハーネス構築フェーズ（H）で整えた仕組みと、その運用規則をまとめる。目的は、エージェントが「計画 → 実装 → 検証 → 修正」を人の介在なしに回し、人は PR だけを見ればよい状態にすること。

## 1. 構成

| 層 | 仕組み | 場所 | 導入 |
| --- | --- | --- | --- |
| H-1 検証 | `pnpm verify`（`biome ci` → `tsc --noEmit` → `vitest run` → `vite build`）が唯一の合格判定。CI も同じコマンドを呼ぶ | `package.json`、`.github/workflows/ci.yml` | M0 |
| H-2 約束事 | 文書の優先順位、既定値、作業手順、レビュー対応の型、禁止事項 | `CLAUDE.md` | H |
| H-3 Git フック | pre-commit で変更ファイルを Biome 整形、pre-push で `pnpm verify`。`pnpm install` 時の `prepare` で有効化 | `lefthook.yml` | H |
| H-3 Claude Code フック | セッション開始時に依存を導入。Bash の禁止コマンド（フックの迂回、テスト削除、main への force push、npm / npx / yarn）を拒否。編集後に Biome 整形 | `.claude/settings.json`、`.claude/hooks/` | H |
| H-3 権限 | pnpm、node、git の日常操作、読み取り系コマンドを事前承認し、確認待ちで止まらないようにする | `.claude/settings.json` | H |
| H-4 作業単位 | Issue テンプレート（目的・受け入れ基準・対象外・関連する仕様の節）、PR テンプレート（対応 Issue・変更内容・検証・レビュー点） | `.github/ISSUE_TEMPLATE/`、`.github/pull_request_template.md` | H |
| H-4 自動レビュー | Copilot のコードレビューを PR 作成時に自動実行。指摘への対応はエージェントのループに含める | リポジトリ設定 | 導入済み |
| H-4 ブランチ保護 | main への直接 push 禁止。`verify` と `gitleaks` を必須チェックにする | リポジトリ設定（オーナーの操作） | 要設定 |
| 依存更新 | Dependabot が週 1 回、1 日の cooldown を置いて npm と GitHub Actions の更新 PR を出す | `.github/dependabot.yml` | H |
| 秘密情報 | gitleaks の CI と `.gitignore` | `docs/security.md` | 導入済み |

## 2. エージェントの作業ループ

1. Issue の「受け入れ基準」を読む。曖昧なら Issue にコメントで質問し、推奨案を添える。
2. `main` から `feat/<issue 番号>-<要約>` を切る。
3. 受け入れ基準ごとに失敗するテストを先に書く。
4. 実装し、`pnpm verify` が通るまで直す。編集のたびに Biome 整形のフックが走る。
5. 論理単位でコミットする。pre-commit で整形、pre-push で `pnpm verify` が走る。
6. PR テンプレートに沿って PR を出し、PR イベントを購読する。
7. CI と自動レビューの指摘に対応する。1 スレッド 1 コミット、返信に SHA を書く（CLAUDE.md 6 章）。
8. 緑になったら人のレビューを待つ。人の差し戻しは「受け入れ基準か CLAUDE.md の不足」として扱い、必要なら両方を直す。

## 3. 計測（H-5）

ループが遅いと検証が省略され始めるため、速度を品質要件として扱う。

| 指標 | 目標 | 超えたら |
| --- | --- | --- |
| `pnpm verify` の所要時間（手元） | 2 分以内 | テストの分割、ビルドのキャッシュ、重い検査の pre-push からの分離 |
| CI（`verify` ジョブ）の所要時間 | 5 分以内 | 依存のキャッシュ、ジョブの並列化 |
| 1 Issue あたりの人による差し戻し回数 | 2 回以内 | 受け入れ基準の書き方か `CLAUDE.md` の記述を直す |

記録は PR 本文の「検証」節に `pnpm verify` の所要時間を書き、差し戻し回数はフェーズごとの振り返り（`docs/retrospective-*.md`）で集計する。

現在値（2026-10-23、M0 完了時点）: `pnpm verify` 約 5 秒（手元）、CI の `verify` ジョブ約 30 秒。

## 4. 完了条件（仕様書 12.2 節）と状態

| 条件 | 状態 |
| --- | --- |
| クリーンな環境で `pnpm install --frozen-lockfile && pnpm verify` が通る | CI で毎回確認。M0 で達成 |
| `CLAUDE.md`、Issue / PR テンプレート、lefthook、`.claude/settings.json` がそろっている | 本フェーズで達成 |
| ブランチ保護が有効で、CI 緑と自動レビューの解決が必須になっている | オーナーの操作待ち |
| M1 の一部を Issue 化し、エージェントが人の操作なしに PR を作り、`pnpm verify` と自動レビューを通せる | 本フェーズのマージ後に実施（Issue を起票して記録する） |

## 5. 既知の制約

- Claude Code のフックは、セッション開始時に `.claude/settings.json` が存在していた場合にだけ自動で読み込まれる。このファイルを初めて取り込んだ後は、`/hooks` を一度開くかセッションを再起動する。
- `guard-bash` の禁止判定は正規表現による。ヒアドキュメントと引用文字列の中身は判定しないが、コマンド位置に禁止語が来る書き方は拒否される。その場合は別の書き方にする（禁止を解除する設定は置かない）。
- lefthook は `git commit` / `git push` を行う環境に Node.js と pnpm があることを前提にする。GitHub の Web UI からのマージには関与しない。
