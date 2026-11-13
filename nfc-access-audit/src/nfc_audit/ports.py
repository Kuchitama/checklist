"""ハードウェアとの境界（ポート）。

中核ロジックはここで定義する Protocol にのみ依存し、実機ドライバ（adapters/）を直接
import しない。これによりテストでは Fake 実装を差し込める。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional, Protocol

if TYPE_CHECKING:
    from .display_model import Screen


@dataclass(frozen=True)
class ScanResult:
    """1 回のポーリングで検出したカードの素データ。

    atqa: ATQA（2 バイトを整数化、例: 0x0004）
    sak:  SAK（1 バイト、例: 0x08）
    uid:  UID のバイト列（4 / 7 / 10 バイト）
    """

    atqa: int
    sak: int
    uid: bytes


class NfcReader(Protocol):
    """NFC リーダー。カードがあれば ScanResult、無ければ None を返す。"""

    def poll(self) -> Optional[ScanResult]: ...


class Display(Protocol):
    """画面出力（e-Paper など）。"""

    def show(self, screen: "Screen") -> None: ...
