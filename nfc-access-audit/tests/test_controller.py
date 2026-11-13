"""読み取りループの状態遷移（自動読み取り）。"""

from nfc_audit.controller import ReadLoopController
from nfc_audit.ports import ScanResult


def test_start_shows_idle(fake_reader, fake_display):
    controller = ReadLoopController(fake_reader, fake_display)
    controller.start()
    assert fake_display.last.title == "読み取りモード"


def test_card_detected_shows_card_screen(fake_reader, fake_display):
    fake_reader.queue(ScanResult(atqa=0x0004, sak=0x08, uid=bytes([1, 2, 3, 4])))
    controller = ReadLoopController(fake_reader, fake_display)
    controller.start()
    controller.step()
    assert "MIFARE Classic 1K" in " ".join(fake_display.last.lines)


def test_same_card_is_debounced(fake_reader, fake_display):
    card = ScanResult(atqa=0x0004, sak=0x08, uid=bytes([1, 2, 3, 4]))
    fake_reader.queue(card, card)
    controller = ReadLoopController(fake_reader, fake_display)
    controller.start()
    controller.step()
    count_after_first = fake_display.show_count
    controller.step()  # 同一カード → 再描画しない
    assert fake_display.show_count == count_after_first


def test_card_removed_returns_to_idle(fake_reader, fake_display):
    card = ScanResult(atqa=0x0004, sak=0x08, uid=bytes([1, 2, 3, 4]))
    fake_reader.queue(card, None)
    controller = ReadLoopController(fake_reader, fake_display)
    controller.start()
    controller.step()  # 検出
    controller.step()  # 外した → 待機へ
    assert fake_display.last.title == "読み取りモード"


def test_different_card_rerenders(fake_reader, fake_display):
    fake_reader.queue(
        ScanResult(atqa=0x0004, sak=0x08, uid=bytes([1, 2, 3, 4])),
        ScanResult(atqa=0x0044, sak=0x00, uid=bytes([9, 9, 9, 9])),
    )
    controller = ReadLoopController(fake_reader, fake_display)
    controller.start()
    controller.step()
    controller.step()
    assert "Ultralight/NTAG" in " ".join(fake_display.last.lines)
