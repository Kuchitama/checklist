"""カード種別の識別。

SAK を一次キーとして MIFARE 系の種別を推定する（NXP AN10833 の識別手順、および
nfc-tools ISO14443A の表に基づく）。ATQA は複数カード同時検出時に衝突しうるため、
種別判定には使わず参考値として保持するだけにする。

注意:
- 現行チップの厳密な確定（Ultralight と NTAG の区別、DESFire と Plus SL3 の区別など）は
  GET_VERSION コマンドが正道で、SAK/ATQA だけでは分離できない。M1 では "系" までに留め、
  詳細確定は後続のマイルストーンで GET_VERSION を使って行う。
- clone_resistance は過剰主張を避けたヒント。確定的な評価ではない。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

# SAK ビットの意味（ISO/IEC 14443-3）
_SAK_UID_NOT_COMPLETE = 0x04  # bit3: アンチコリジョン継続中（UID 未完了）
_SAK_ISO14443_4 = 0x20  # bit6: ISO 14443-4（ISO-DEP）準拠


class CardFamily(Enum):
    MIFARE_CLASSIC_MINI = "MIFARE Mini"
    MIFARE_CLASSIC_1K = "MIFARE Classic 1K"
    MIFARE_CLASSIC_4K = "MIFARE Classic 4K"
    MIFARE_PLUS_SL2_2K = "MIFARE Plus SL2 2K"
    MIFARE_PLUS_SL2_4K = "MIFARE Plus SL2 4K"
    TYPE2_ULTRALIGHT_NTAG = "Ultralight/NTAG"
    ISO14443_4 = "ISO14443-4 (DESFire/Plus SL3等)"
    SMARTMX_CLASSIC_1K = "SmartMX+Classic 1K"
    SMARTMX_CLASSIC_4K = "SmartMX+Classic 4K"
    UID_INCOMPLETE = "UID不完了"
    UNKNOWN = "不明"


class CloneResistance(Enum):
    WEAK = "弱"  # Crypto1 など既知脆弱、または無認証
    STRONG = "強"  # AES/3DES など
    NEEDS_DETAIL = "要詳細"  # GET_VERSION 等で要確定
    UNKNOWN = "不明"


@dataclass(frozen=True)
class CardIdentification:
    family: CardFamily
    sak: int
    atqa: int
    iso14443_4: bool
    clone_resistance: CloneResistance


# SAK -> (family, clone_resistance)
_SAK_TABLE: dict[int, tuple[CardFamily, CloneResistance]] = {
    0x00: (CardFamily.TYPE2_ULTRALIGHT_NTAG, CloneResistance.NEEDS_DETAIL),
    0x08: (CardFamily.MIFARE_CLASSIC_1K, CloneResistance.WEAK),
    0x09: (CardFamily.MIFARE_CLASSIC_MINI, CloneResistance.WEAK),
    0x10: (CardFamily.MIFARE_PLUS_SL2_2K, CloneResistance.NEEDS_DETAIL),
    0x11: (CardFamily.MIFARE_PLUS_SL2_4K, CloneResistance.NEEDS_DETAIL),
    0x18: (CardFamily.MIFARE_CLASSIC_4K, CloneResistance.WEAK),
    0x20: (CardFamily.ISO14443_4, CloneResistance.STRONG),
    0x28: (CardFamily.SMARTMX_CLASSIC_1K, CloneResistance.NEEDS_DETAIL),
    0x38: (CardFamily.SMARTMX_CLASSIC_4K, CloneResistance.NEEDS_DETAIL),
}


def identify_card(atqa: int, sak: int) -> CardIdentification:
    """ATQA と SAK からカード種別を推定する。"""
    iso14443_4 = bool(sak & _SAK_ISO14443_4)

    if sak in _SAK_TABLE:
        family, clone = _SAK_TABLE[sak]
    elif sak & _SAK_UID_NOT_COMPLETE:
        family, clone = CardFamily.UID_INCOMPLETE, CloneResistance.UNKNOWN
    else:
        family, clone = CardFamily.UNKNOWN, CloneResistance.UNKNOWN

    return CardIdentification(
        family=family,
        sak=sak,
        atqa=atqa,
        iso14443_4=iso14443_4,
        clone_resistance=clone,
    )
