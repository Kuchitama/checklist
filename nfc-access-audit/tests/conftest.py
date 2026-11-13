"""テスト用の Fake 実装とフィクスチャ。"""

from __future__ import annotations

import pytest

from nfc_audit.ports import ScanResult


class FakeReader:
    """queue() で積んだ結果を poll() が 1 件ずつ返す。空になったら None。"""

    def __init__(self) -> None:
        self._queue: list[ScanResult | None] = []

    def queue(self, *results: ScanResult | None) -> None:
        self._queue.extend(results)

    def poll(self) -> ScanResult | None:
        if self._queue:
            return self._queue.pop(0)
        return None


class FakeDisplay:
    """show() された Screen を記録する。"""

    def __init__(self) -> None:
        self.shown: list = []

    def show(self, screen) -> None:
        self.shown.append(screen)

    @property
    def last(self):
        return self.shown[-1] if self.shown else None

    @property
    def show_count(self) -> int:
        return len(self.shown)


@pytest.fixture
def fake_reader() -> FakeReader:
    return FakeReader()


@pytest.fixture
def fake_display() -> FakeDisplay:
    return FakeDisplay()
