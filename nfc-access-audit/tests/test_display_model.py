"""e-Paper に出す表示内容の組み立て（純ロジック）。"""

from nfc_audit.cards import identify_card
from nfc_audit.display_model import Screen, card_screen, idle_screen


def test_idle_screen_shows_read_mode():
    screen = idle_screen()
    assert isinstance(screen, Screen)
    assert screen.title == "読み取りモード"
    assert any("かざして" in line for line in screen.lines)


def test_card_screen_contains_type_and_uid():
    card = identify_card(0x0004, 0x08)  # MIFARE Classic 1K
    uid = bytes([0xDE, 0xAD, 0xBE, 0xEF])
    screen = card_screen(card, uid)
    joined = screen.title + " " + " ".join(screen.lines)
    assert "MIFARE Classic 1K" in joined
    assert "DE:AD:BE:EF" in joined


def test_card_screen_uid_is_uppercase_colon_hex():
    card = identify_card(0x0044, 0x00)
    uid = bytes([0x04, 0x1A, 0x2B])
    screen = card_screen(card, uid)
    assert "04:1A:2B" in " ".join(screen.lines)


def test_card_screen_shows_iso14443_4_line():
    card = identify_card(0x0344, 0x20)  # DESFire 系
    screen = card_screen(card, bytes([1, 2, 3, 4]))
    assert any("ISO14443-4" in line for line in screen.lines)
