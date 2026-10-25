import { describe, expect, it } from "vitest";
import { EMOJI_TITLE, repeat } from "@/test/fixtures";
import { exportFileName } from "./exportFileName";

const date = new Date(2026, 9, 22, 12, 0, 0); // 2026-10-22 のローカル時刻

describe("exportFileName（データ設計書 5.4 節）", () => {
  it("checklist-<safeTitle>-<YYYYMMDD>.json の形にする", () => {
    expect(exportFileName("リリース手順", date)).toBe("checklist-リリース手順-20261022.json");
  });

  it("ファイル名に使えない文字を _ にし、連続する空白を _ 1 個にまとめる", () => {
    expect(exportFileName("リリース手順: v2", date)).toBe(
      "checklist-リリース手順__v2-20261022.json",
    );
    expect(exportFileName('a\\b/c:d*e?f"g<h>i|j', date)).toBe(
      "checklist-a_b_c_d_e_f_g_h_i_j-20261022.json",
    );
    expect(exportFileName("a \t\n  b", date)).toBe("checklist-a_b-20261022.json");
  });

  it("制御文字（U+0000〜U+001F、U+007F）を _ にする", () => {
    expect(exportFileName("a\u0000b\u001fc\u007fd", date)).toBe("checklist-a_b_c_d-20261022.json");
  });

  it("先頭 50 コードポイントで切る。絵文字と結合文字もコードポイントで数える", () => {
    expect(exportFileName(repeat("あ", 51), date)).toBe(
      `checklist-${repeat("あ", 50)}-20261022.json`,
    );
    // EMOJI_TITLE は 8 コードポイント。6 回で 48、7 回目の先頭 2 コードポイントまで残る
    const title = repeat(EMOJI_TITLE, 7);
    const expected = Array.from(title).slice(0, 50).join("");
    expect(exportFileName(title, date)).toBe(`checklist-${expected}-20261022.json`);
  });

  it("空白や禁止文字だけのタイトルは untitled にする", () => {
    expect(exportFileName("   ", date)).toBe("checklist-untitled-20261022.json");
    expect(exportFileName("", date)).toBe("checklist-untitled-20261022.json");
  });

  it("日付は端末のローカル日付。0 時と年またぎでも UTC にずれない", () => {
    expect(exportFileName("a", new Date(2026, 0, 1, 0, 0, 0))).toBe("checklist-a-20260101.json");
    expect(exportFileName("a", new Date(2026, 11, 31, 23, 59, 59))).toBe(
      "checklist-a-20261231.json",
    );
    expect(exportFileName("a", new Date(2026, 2, 5, 0, 0, 0))).toBe("checklist-a-20260305.json");
  });

  it("西暦 1000 年未満でも年を 4 桁にそろえる（Date の 0〜99 年は setFullYear で作る）", () => {
    const year99 = new Date(2000, 0, 2);
    year99.setFullYear(99);
    expect(exportFileName("a", year99)).toBe("checklist-a-00990102.json");
    const year999 = new Date(999, 11, 31);
    expect(exportFileName("a", year999)).toBe("checklist-a-09991231.json");
  });
});
