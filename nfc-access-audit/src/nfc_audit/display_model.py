"""e-Paper に出す表示内容の組み立て（純ロジック）。

実際の描画（フォント・座標・部分更新）は adapters 側の責務。ここでは「何を表示するか」
だけを決め、タイトルと行の列として返す。狭い画面（2.13" = 250x122px 想定）でも読めるよう、
1 行の情報量を絞る。
"""

from __future__ import annotations

from dataclasses import dataclass

from .cards import CardIdentification


@dataclass(frozen=True)
class Screen:
    title: str
    lines: tuple[str, ...]


def idle_screen() -> Screen:
    return Screen(title="読み取りモード", lines=("カードをかざしてください",))


def _format_uid(uid: bytes) -> str:
    return ":".join(f"{b:02X}" for b in uid)


def card_screen(card: CardIdentification, uid: bytes) -> Screen:
    return Screen(
        title="検出",
        lines=(
            f"種別: {card.family.value}",
            f"UID: {_format_uid(uid)}",
            f"ISO14443-4: {'はい' if card.iso14443_4 else 'いいえ'}",
            f"複製耐性: {card.clone_resistance.value}",
        ),
    )
