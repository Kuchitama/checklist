"""読み取りループの状態遷移（自動読み取り）。

step() を繰り返し呼ぶ設計にして、ループ本体（sleep やポーリング間隔）は app.py / アダプタ側に
置く。これにより状態遷移だけを純粋にテストできる。

M1 の方針:
- カードを検出したら種別を特定して表示する。
- 同一カード（UID 一致）を連続検出しても再描画しない（デバウンス）。
- カードが外れたら待機画面に戻す。
"""

from __future__ import annotations

from .cards import identify_card
from .display_model import card_screen, idle_screen
from .ports import Display, NfcReader


class ReadLoopController:
    def __init__(self, reader: NfcReader, display: Display) -> None:
        self._reader = reader
        self._display = display
        self._current_uid: bytes | None = None

    def start(self) -> None:
        """待機画面を出して読み取り開始状態にする。"""
        self._current_uid = None
        self._display.show(idle_screen())

    def step(self) -> None:
        """1 回ポーリングして、必要なら画面を更新する。"""
        result = self._reader.poll()

        if result is None:
            if self._current_uid is not None:
                self._current_uid = None
                self._display.show(idle_screen())
            return

        if result.uid == self._current_uid:
            return  # 同一カード → デバウンス

        card = identify_card(result.atqa, result.sak)
        self._current_uid = result.uid
        self._display.show(card_screen(card, result.uid))
