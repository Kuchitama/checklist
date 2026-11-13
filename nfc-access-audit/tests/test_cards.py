"""カード種別の識別（SAK ベース, NXP AN10833 / nfc-tools ISO14443A に基づく）。"""

import pytest

from nfc_audit.cards import CardFamily, CloneResistance, identify_card

# (atqa, sak, 期待 family, 期待 iso14443_4, 期待 clone_resistance)
# iso14443_4 は SAK bit6(0x20) で決まる。
KNOWN_CASES = [
    (0x0004, 0x08, CardFamily.MIFARE_CLASSIC_1K, False, CloneResistance.WEAK),
    (0x0002, 0x18, CardFamily.MIFARE_CLASSIC_4K, False, CloneResistance.WEAK),
    (0x0004, 0x09, CardFamily.MIFARE_CLASSIC_MINI, False, CloneResistance.WEAK),
    (0x0044, 0x00, CardFamily.TYPE2_ULTRALIGHT_NTAG, False, CloneResistance.NEEDS_DETAIL),
    (0x0344, 0x20, CardFamily.ISO14443_4, True, CloneResistance.STRONG),
    (0x0004, 0x10, CardFamily.MIFARE_PLUS_SL2_2K, False, CloneResistance.NEEDS_DETAIL),
    (0x0002, 0x11, CardFamily.MIFARE_PLUS_SL2_4K, False, CloneResistance.NEEDS_DETAIL),
    (0x0004, 0x28, CardFamily.SMARTMX_CLASSIC_1K, True, CloneResistance.NEEDS_DETAIL),
    (0x0002, 0x38, CardFamily.SMARTMX_CLASSIC_4K, True, CloneResistance.NEEDS_DETAIL),
]


@pytest.mark.parametrize("atqa,sak,family,iso4,clone", KNOWN_CASES)
def test_identify_known(atqa, sak, family, iso4, clone):
    result = identify_card(atqa, sak)
    assert result.family is family
    assert result.iso14443_4 is iso4
    assert result.clone_resistance is clone
    assert result.sak == sak
    assert result.atqa == atqa


def test_unknown_sak_is_unknown():
    result = identify_card(0x0000, 0x02)
    assert result.family is CardFamily.UNKNOWN
    assert result.clone_resistance is CloneResistance.UNKNOWN


def test_cascade_bit_means_uid_incomplete():
    # SAK bit3(0x04) が立ち、既知値でない場合は UID 未完了（アンチコリジョン継続中）
    result = identify_card(0x0004, 0x04)
    assert result.family is CardFamily.UID_INCOMPLETE


def test_iso14443_4_flag_tracks_bit6():
    assert identify_card(0x0344, 0x20).iso14443_4 is True
    assert identify_card(0x0004, 0x08).iso14443_4 is False
