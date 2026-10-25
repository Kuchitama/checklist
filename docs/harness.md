# ハーネス（開発ループの土台）

- 作成日: 2026-10-23
- ステータス: 確定（2026-10-25 レビュー完了）
- 関連文書: [仕様書](./spec.md)（12.2 節）、[CLAUDE.md](../CLAUDE.md)、[秘密情報の取り扱い](./security.md)

仕様書 12.2 節のハーネス構築フェーズ（H）で整えた仕組みと、その運用規則をまとめる。目的は、エージェントが「計画 → 実装 → 検証 → 修正」を人の介在なしに回し、人は PR だけを見ればよい状態にすること。

## 1. 構成

| 層 | 仕組み | 場所 | 導入 |
| --- | --- | --- | --- |
| H-1 検証 | `pnpm verify`（`biome ci` → `tsc --noEmit` → `vitest run` → `vite build`）が唯一の合格判定。CI も同じコマンドを呼ぶ | `package.json`、`.github/workflows/ci.yml` | M0 |
| H-2 約束事 | 文書の優先順位、既定値、作業手順、レビュー対応の型、禁止事項 | `CLAUDE.md` | H |
| H-3 Git フック | pre-commit で変更ファイルを Biome 整形、pre-push で `pnpm verify`。`pnpm install` 時の `prepare` で有効化 | `lefthook.yml` | H |
| H-3 Claude Code フック | セッション開始時に `pnpm install --frozen-lockfile` で依存をロックファイルに同期（`prepare` で lefthook も有効化）。Bash の禁止コマンド（フックの迂回、テスト削除、main への force push、npm / npx / yarn）を拒否。編集後に Biome 整形 | `.claude/settings.json`、`.claude/hooks/` | H |
| H-3 権限 | pnpm、node、git の日常操作、読み取り系コマンドを事前承認し、確認待ちで止まらないようにする | `.claude/settings.json` | H |
| H-4 作業単位 | Issue テンプレート（目的・受け入れ基準・対象外・関連する仕様の節）、PR テンプレート（対応 Issue・変更内容・検証・レビュー点） | `.github/ISSUE_TEMPLATE/`、`.github/pull_request_template.md` | H |
| H-4 自動レビュー | Copilot のコードレビュー。リポジトリ設定の自動実行は数時間遅れることがあるため、エージェントが PR 作成直後に API（`request_copilot_review`）で依頼する。指摘への対応はエージェントのループに含める | リポジトリ設定、エージェントの作業ループ（2 章） | 導入済み |
| H-4 ブランチ保護 | main への直接 push 禁止。`verify` と `gitleaks` を必須チェックにする | リポジトリ設定（オーナーの操作）。Rulesets の `main` | 導入済み（2026-10-24、Issue #12） |
| 依存更新 | Dependabot が週 1 回、1 日の cooldown を置いて npm と GitHub Actions の更新 PR を出す | `.github/dependabot.yml` | H |
| 秘密情報 | gitleaks の CI と `.gitignore` | `docs/security.md` | 導入済み |

## 2. エージェントの作業ループ

1. Issue の「受け入れ基準」を読む。曖昧なら Issue にコメントで質問し、推奨案を添える。
2. `main` から `feat/<issue 番号>-<要約>` を切る。別の PR の上に積まない。前の PR の CI・レビュー待ちの間に次の Issue をローカルで進めてよいが、push は前の PR がマージされた後に `main` へ載せ替え（`git rebase --onto <新しい土台> <起点> <ブランチ>`。起点は、前のブランチの履歴を書き換える前に `git merge-base <前のブランチ> <ブランチ>` で求めて控えておく。書き換えた後に求めると古い共通祖先になり、マージ済みのコミットまで再適用されて不要な衝突になる。手で SHA を書き写すのも誤りやすい）、`pnpm verify` を通してから行う。載せ替えで衝突したら、解決の後 `git rebase --continue` の前に `pnpm exec biome check` と `pnpm exec tsc --noEmit` を通す（衝突ブロックの外の行を重複させるなどの壊れ方に、その場で気づける）。
3. 受け入れ基準ごとに失敗するテストを先に書く。回帰テストは、実装を 1 箇所壊して失敗することを確かめる。PR を出す前の自己確認は CLAUDE.md 5 章 8。
4. 実装し、`pnpm verify` が通るまで直す。編集のたびに Biome 整形のフックが走る。
5. 論理単位でコミットする。pre-commit で整形、pre-push で `pnpm verify` が走る。
6. PR テンプレートに沿って PR を出し、PR イベントを購読し、Copilot のレビューを API で依頼する（1 章 H-4）。
7. CI と自動レビューの指摘に対応する。1 スレッド 1 コミット、返信に SHA を書く（CLAUDE.md 6 章）。
8. 緑になり、自動レビューの指摘が解決済みで、判断を仰ぐ事項がなければマージする（CLAUDE.md 5 章 7。2026-10-25 にオーナーが決定）。判断を仰ぐ事項があれば人のレビューを待つ。人の差し戻しは「受け入れ基準か CLAUDE.md の不足」として扱い、必要なら両方を直す。
9. M の最後の PR をマージしたら、その M の振り返り（`docs/retrospective-m<番号>.md`）を書き、抽出した学びから必要なハーネス（1 章の構成）を同じ PR で更新する。マージ後に、人に動作確認と次の M への着手を確認する。

## 3. 計測（H-5）

ループが遅いと検証が省略され始めるため、速度を品質要件として扱う。

| 指標 | 目標 | 超えたら |
| --- | --- | --- |
| `pnpm verify` の所要時間（手元） | 2 分以内 | テストの分割、ビルドのキャッシュ、重い検査の pre-push からの分離 |
| CI（`verify` ジョブ）の所要時間 | 5 分以内 | 依存のキャッシュ、ジョブの並列化 |
| 1 Issue あたりの人による差し戻し回数 | 2 回以内 | 受け入れ基準の書き方か `CLAUDE.md` の記述を直す |

記録は PR 本文の「検証」節に `pnpm verify` の所要時間を書き、差し戻し回数はフェーズごとの振り返り（`docs/retrospective-*.md`）で集計する。

現在値（2026-10-23、Issue #8 完了時点）: `pnpm verify` 約 6 秒（手元、テスト 10 件）、CI の `verify` ジョブ約 30 秒。

現在値（2026-10-25、M1 完了時点）: `pnpm verify` 約 12〜14 秒（手元、テスト 114 件）、CI の `verify` ジョブ約 30 秒。M1 の Issue 7 件で人の差し戻し 1 回、自動レビューの指摘 11 件（誤検知 0）。集計と学びは `docs/retrospective-m1.md`。

現在値（2026-10-25、M2 完了時点）: `pnpm verify` 約 13〜17 秒（手元、テスト 164 件）、CI の `verify` ジョブ約 35 秒。M2 の Issue 5 件で人の差し戻し 0 回、自動レビューの指摘 10 件（誤検知 0）。5 件の PR すべてを CLAUDE.md 5 章 7 の条件でエージェントがマージした。集計と学びは `docs/retrospective-m2.md`。

現在値（2026-10-25、M3 完了時点）: `pnpm verify` 約 18〜23 秒（手元、テスト 228 件）、CI の `verify` ジョブ約 40〜45 秒。M3 の Issue 5 件で人の差し戻し 0 回、自動レビューの指摘 3 件（誤検知 0）。5 件の PR すべてを CLAUDE.md 5 章 7 の条件でエージェントがマージした。集計と学びは `docs/retrospective-m3.md`。

現在値（2026-10-25、M4 完了時点）: `pnpm verify` 約 20〜24 秒（手元、テスト 258 件）、CI の `verify` ジョブ約 40〜45 秒。M4 の Issue 5 件で人の差し戻し 0 回、自動レビューの指摘（集計待ち）件（誤検知 0）。5 件の PR すべてを CLAUDE.md 5 章 7 の条件でエージェントがマージした。集計と学びは `docs/retrospective-m4.md`。

## 4. 完了条件（仕様書 12.2 節）と状態

| 条件 | 状態 |
| --- | --- |
| クリーンな環境で `pnpm install --frozen-lockfile && pnpm verify` が通る | CI で毎回確認。M0 で達成 |
| `CLAUDE.md`、Issue / PR テンプレート、lefthook、`.claude/settings.json` がそろっている | 本フェーズで達成 |
| ブランチ保護が有効で、CI 緑と自動レビューの解決が必須になっている | 達成（2026-10-24、Issue #12。4.3 節） |
| M1 の一部を Issue 化し、エージェントが人の操作なしに PR を作り、`pnpm verify` と自動レビューを通せる | 達成（Issue #8、PR #11。4.1 節） |

### 4.1 実地試験の記録（Issue #8 / PR #11、2026-10-23）

| 項目 | 結果 |
| --- | --- |
| 題材 | 一覧画面に保存済みリストのタイトルを `updatedAt` 降順で表示する（M1 の一部） |
| 進め方 | Issue テンプレートで起票 → 受け入れ基準ごとのテストを先に書いて失敗を確認 → 実装 → `pnpm verify` → フック経由でコミット・push → PR → CI と Copilot レビューに対応 |
| 人の操作 | PR のレビューとマージの指示のみ。実装・テスト・CI 対応・自動レビュー対応はエージェントが行った |
| CI | `verify` と `gitleaks` が全コミットで緑。赤になった push はなし |
| 自動レビュー | Copilot の指摘 1 件（DB のオープン・読み取り失敗時のエラー状態がない）に対応 |
| 人の差し戻し | 1 回（予期しないエラー画面の案内文が過剰）。目標の 2 回以内 |
| `pnpm verify` | 約 6 秒（目標 2 分以内） |

**見つかった問題と対処**

- **テストの後片付けが効いていなかった。** Vitest の globals を使っていないため Testing Library の自動クリーンアップが登録されず、前のテストの DOM が残っていた。`src/test/setup.ts` で `cleanup` を明示的に登録した。
- **Issue の受け入れ基準からエラー状態が漏れていた。** 設計書（画面設計書 3.1 節、データ設計書 3.4 節）には書かれていたが、起票時に写していなかった。自動レビューで見つかり、Issue #8 に追記した。次からは Issue を書くときに、設計書の「状態」の表（空・エラー・ローディング）を受け入れ基準に写す。

### 4.2 完了条件 3 を残したまま M1 に進む例外（2026-10-23）

- **決定**: オーナーの判断で、完了条件 3（ブランチ保護）が未達のまま M1 に着手する。設定はオーナーがすぐには行えないため、Issue #12 で引き続き追う。
- **理由**: 残りはリポジトリ設定の操作だけで、エージェントのループ（条件 1・2・4）は動いている。待つあいだ M1 を止める利点が小さい。
- **保護がないあいだの代替**: main へ直接コミットしない規則（CLAUDE.md 3 章）、`guard-bash` による main への force push の拒否、pre-push の `pnpm verify`、PR 上の CI（`verify`、`gitleaks`）と Copilot レビュー、マージはオーナーの指示があったときだけ行う規則（CLAUDE.md 8 章）。CI が赤の PR はマージしない。
- **解除**: Issue #12 が完了したら、1 章と 4 章の表を「導入済み」に更新し、この節は記録として残す。
- **解除済み（2026-10-24）**: Issue #12 の完了で例外を解除した（4.3 節）。

### 4.3 ブランチ保護の設定（2026-10-24 確認）

リポジトリ設定の Rulesets にある `main` で設定した。GitHub の API（`/repos/{owner}/{repo}/rules/branches/main`）で、main に効いていることを確認した。

| 設定 | 内容 |
| --- | --- |
| 対象 | デフォルトブランチ（`main`） |
| PR 必須 | main へは PR 経由でしかマージできない。承認数は 0（個人リポジトリでは自分の PR を承認できないため） |
| 必須チェック | `verify`（CI）と `gitleaks`（Secret scan） |
| force push・削除 | 禁止 |
| 例外（bypass） | なし |

- **自動レビューの解決**: 「Require conversation resolution before merging」はオンにしていない（オーナーの判断）。Copilot の指摘は、エージェントが対応してから解決済みにする運用（CLAUDE.md 6 章）で扱う。人のコメントは人が解決する。

## 5. 既知の制約

- Claude Code のフックは、セッション開始時に `.claude/settings.json` が存在していた場合にだけ自動で読み込まれる。このファイルを初めて取り込んだ後は、`/hooks` を一度開くかセッションを再起動する。
- `guard-bash` はコマンド文字列をシェル風に単語分割し、各単純コマンドの先頭語と引数で判定する。ヒアドキュメントの本文は判定しない。引用された引数（`rm "a.test.ts"`）は引用を外して判定する。`echo "rm a.test.ts"` のように引数の中に禁止語があるだけでは拒否しない。`sudo` や `VAR=x` の前置き、`/usr/bin/git` のようなパスつき呼び出しにも対応する。判定の網羅性には限りがあるため、最後の砦はブランチ保護と CI である（禁止を解除する設定は置かない）。
- lefthook は `git commit` / `git push` を行う環境に Node.js と pnpm があることを前提にする。GitHub の Web UI からのマージには関与しない。
- 計測に使う headless Chromium（Playwright）では、`download` 属性に日本語を含むファイル名を与えると `suggestedFilename()` が `download` になる（ASCII の名前は正しい。2026-10-25、PR #48 で確認）。日本語のファイル名は実機のブラウザで確かめる。
- Vitest のフェイクタイマー（`vi.useFakeTimers()`）の下では、Dexie / fake-indexeddb を使う購読（`useLiveQuery`）が完了せずテストがタイムアウトする（2026-10-25、PR #59 で確認）。時間の境界（デバウンスの 149ms / 150ms など）は、DB を触らない純粋なフックや関数の単体テストでフェイクタイマーにより確かめ、画面のテストは実時間で挙動だけを確かめる。
