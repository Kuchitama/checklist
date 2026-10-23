# checklist

ローカルファーストのチェックリスト管理 Web アプリ（PWA）。

- ログイン不要。データはブラウザ内に保存します。
- チェックリストを JSON ファイルとして書き出し、別の端末や知人と共有できます。

## 開発

Node.js 26 と pnpm（`package.json` の `packageManager` のバージョン）を使います。

```sh
pnpm install --frozen-lockfile
pnpm dev        # 開発サーバー
pnpm verify     # lint → 型検査 → テスト → ビルド（唯一の合格判定）
```

## ドキュメント

- [要件定義書](./docs/requirements.md)
- [仕様書](./docs/spec.md)
- [画面設計書](./docs/design/screens.md)
- [データ設計書](./docs/design/data.md)
