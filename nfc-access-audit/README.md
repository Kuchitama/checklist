# nfc-access-audit

Raspberry Pi Zero + PN532 NFC module v3 + Waveshare 2.13 inch e-Paper HAT+ で動く、
**認可されたアクセス制御カードの複製耐性アセスメント器**。

かざしたカードの方式（MIFARE Classic / Ultralight / DESFire など）を特定し、
e-Paper に状態と結果を表示する。MIFARE Classic など複製に弱い方式に対しては、
鍵回復 → ダンプ → magic タグへの複製 → 読み戻し一致の検証まで行い、
「この入退室カードは複製に耐えるか」を評価する。

## 利用範囲（重要）

本ツールは、**自組織が所有し、検証の正式な認可を得たアクセス制御システム**に対する
セキュリティ検証（脆弱性の発見と是正）のためだけに使う。第三者のカードや、
認可範囲外のシステムに対して使ってはならない。検知回避の目的には使わない。

## ハードウェア構成（計画）

- Raspberry Pi Zero v1.1
- Waveshare 2.13 inch e-Paper HAT+（SPI0 + 一部 GPIO を占有、250x122px 想定）
- PN532 NFC module v3 — **I2C 接続**（e-Paper と SPI が競合しないため）
- PN532 は 13.56MHz 専用。125kHz 系（HID Prox / EM4100 等）は読めない。

## 技術的前提（PN532 の制約）

- PN532 は MIFARE Classic / Ultralight を **カードエミュレートできない**（Crypto1 非対応、
  target mode は ISO-DEP 止まり）。「同じタグとして振る舞う」は **物理 magic タグへの複製**で実現する。
- MIFARE DESFire / Plus SL3 等（AES/3DES）は複製不可 = 複製に強い、という評価結果になる。

## 開発

ハードウェア（libnfc / e-Paper / GPIO）はポート（`ports.py` の Protocol）の裏に隔離し、
中核ロジック（`cards.py` / `display_model.py` / `controller.py`）はハード非依存に保つ。
これにより実機なしで pytest を回せる。実機ドライバは `adapters/` に薄く置き、ユニットテスト対象外。

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
pytest
```

## マイルストーン

- **M1**: 読み取り/特定ツール（自動読み取り、e-Paper 表示）。複製機能なし。← 現在
- **M2**: MIFARE Classic ダンプ（鍵既知）+ 保存
- **M3**: 鍵回復（mfoc/mfcuk 連携、脆弱カードのみ）
- **M4**: magic タグへ複製 + 読み戻し一致の検証
- **M5**: e-Paper UI 仕上げ・モード遷移・ボタン操作
