import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { EMOJI_TITLE, makeBoundaryMaxInput, repeat } from "@/test/fixtures";
import invalidDate from "@/test/fixtures/export-invalid-date.json?raw";
import invalidUrl from "@/test/fixtures/export-invalid-url.json?raw";
import minimal from "@/test/fixtures/export-minimal.json?raw";
import notJson from "@/test/fixtures/export-not-json.txt?raw";
import v2 from "@/test/fixtures/export-v2.json?raw";
import valid from "@/test/fixtures/export-valid.json?raw";
import wrongFormat from "@/test/fixtures/export-wrong-format.json?raw";
import {
  createChecklist,
  exportChecklist,
  importChecklist,
  serializeExportFile,
} from "./checklists";
import { MAX_IMPORT_BYTES, parseImportFile } from "./import";
import type { ExportFile } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 正常ファイルを部分的に変えた文字列を作る */
function variant(change: (file: Record<string, unknown>) => void): string {
  const file = JSON.parse(valid) as Record<string, unknown>;
  change(file);
  return JSON.stringify(file);
}

describe("parseImportFile（データ設計書 5.3 節）", () => {
  it("正常なファイルを ExportFile として返す", () => {
    const result = parseImportFile(valid);

    expect(result).toEqual({
      ok: true,
      file: {
        format: "checklist-export",
        version: 1,
        exportedAt: "2026-10-18T03:00:00.000Z",
        checklist: {
          title: "リリース手順",
          description: "本番リリース前に必ず通す確認",
          tags: ["仕事", "リリース"],
          items: [
            {
              title: "CI が緑であることを確認",
              note: "",
              url: "https://example.com/ci",
              dueDate: null,
            },
            {
              title: "リリースノートを書く",
              note: "前回との差分を箇条書き",
              url: null,
              dueDate: null,
            },
          ],
        },
      },
    });
  });

  it("note / url / dueDate / description / tags が欠けていれば既定値で補う", () => {
    const result = parseImportFile(minimal);

    expect(result).toEqual({
      ok: true,
      file: expect.objectContaining({
        checklist: {
          title: "最小のリスト",
          description: "",
          tags: [],
          items: [{ title: "項目だけ", note: "", url: null, dueDate: null }],
        },
      }),
    });
  });

  it("items が欠けていれば空にし、未知のキーは無視する", () => {
    const text = variant((f) => {
      f.extra = "将来のキー";
      (f.checklist as Record<string, unknown>).items = undefined;
      (f.checklist as Record<string, unknown>).color = "red";
    });

    const result = parseImportFile(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.checklist.items).toEqual([]);
    expect("extra" in result.file).toBe(false);
    expect("color" in result.file.checklist).toBe(false);
  });

  it("JSON として読めなければ INVALID_JSON", () => {
    expect(parseImportFile(notJson)).toEqual({ ok: false, error: { code: "INVALID_JSON" } });
    expect(parseImportFile("")).toEqual({ ok: false, error: { code: "INVALID_JSON" } });
  });

  it.each([
    ["format が違う", wrongFormat],
    ["null", "null"],
    ["配列", "[]"],
    ["文字列", '"checklist-export"'],
    ["数値", "1"],
    ["format がない", variant((f) => delete f.format)],
  ])("オブジェクトでないか format が違えば NOT_EXPORT_FILE（%s）", (_name, text) => {
    expect(parseImportFile(text)).toEqual({ ok: false, error: { code: "NOT_EXPORT_FILE" } });
  });

  it.each([
    ["2", v2, 2],
    ['"1"（文字列）', variant((f) => (f.version = "1")), "1"],
    ["1.5", variant((f) => (f.version = 1.5)), 1.5],
    ["0", variant((f) => (f.version = 0)), 0],
    ["なし", variant((f) => delete f.version), undefined],
  ])("version が整数の 1 でなければ UNSUPPORTED_VERSION（%s）", (_name, text, version) => {
    expect(parseImportFile(text)).toEqual({
      ok: false,
      error: { code: "UNSUPPORTED_VERSION", version },
    });
  });

  it("URL が http(s) でなければ VALIDATION で、path は checklist から始まる", () => {
    expect(parseImportFile(invalidUrl)).toEqual({
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [
          {
            path: ["checklist", "items", 0, "url"],
            code: "invalid_url",
            message: "http または https の URL を入力してください",
          },
        ],
      },
    });
  });

  it("存在しない日付は VALIDATION", () => {
    expect(parseImportFile(invalidDate)).toEqual({
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [
          {
            path: ["checklist", "items", 0, "dueDate"],
            code: "invalid_date",
            message: "存在する日付を入力してください",
          },
        ],
      },
    });
  });

  it("title / exportedAt / checklist の欠落や型違いは VALIDATION", () => {
    const noTitle = parseImportFile(
      variant((f) => delete (f.checklist as Record<string, unknown>).title),
    );
    expect(noTitle).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [{ path: ["checklist", "title"], code: "invalid_type" }],
      },
    });

    const badDate = parseImportFile(variant((f) => (f.exportedAt = "2026-10-18")));
    expect(badDate).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [
          {
            path: ["exportedAt"],
            code: "invalid_type",
            message: "ファイルの形式が正しくありません",
          },
        ],
      },
    });

    const noChecklist = parseImportFile(variant((f) => delete f.checklist));
    expect(noChecklist).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", issues: [{ path: ["checklist"], code: "invalid_type" }] },
    });
  });

  it("上限いっぱい（boundary-max）は通り、1 つ超えると VALIDATION で違反箇所を示す", async () => {
    const max = makeBoundaryMaxInput();
    const file: ExportFile = {
      format: "checklist-export",
      version: 1,
      exportedAt: "2026-10-18T03:00:00.000Z",
      checklist: max,
    };
    expect(parseImportFile(serializeExportFile(file)).ok).toBe(true);

    const over = structuredClone(file);
    over.checklist.title = repeat("あ", 101);
    over.checklist.items[0] = {
      ...over.checklist.items[0],
      note: repeat("あ", 2001),
    } as ExportFile["checklist"]["items"][number];
    const result = parseImportFile(serializeExportFile(over));
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        issues: [
          {
            path: ["checklist", "title"],
            code: "too_long",
            message: "タイトルは 100 文字以内です",
          },
          {
            path: ["checklist", "items", 0, "note"],
            code: "too_long",
            message: "補足メモは 2000 文字以内です",
          },
        ],
      },
    });
  });

  it("文字数はコードポイントで数える（絵文字を含むタイトル）", () => {
    // EMOJI_TITLE は UTF-16 で 12、コードポイントで 8。12 回で 96 コードポイント（UTF-16 では 144）だが通る
    const text = variant(
      (f) => ((f.checklist as Record<string, unknown>).title = repeat(EMOJI_TITLE, 12)),
    );
    expect(parseImportFile(text).ok).toBe(true);
  });

  it("読み込めるファイルの上限は 20,000,000 バイト", () => {
    expect(MAX_IMPORT_BYTES).toBe(20_000_000);
  });
});

describe("importChecklist（仕様書 4.3 節）", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T01:02:03.004Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.checklists.clear();
  });

  const parsed = (): ExportFile => {
    const result = parseImportFile(valid);
    if (!result.ok) throw new Error("fixture が不正");
    return result.file;
  };

  it("新しい id を採番し、未完了・現在時刻で保存して返す", async () => {
    const checklist = await importChecklist(parsed());

    expect(checklist.id).toMatch(UUID);
    expect(checklist.createdAt).toBe("2026-10-25T01:02:03.004Z");
    expect(checklist.updatedAt).toBe("2026-10-25T01:02:03.004Z");
    expect(checklist.title).toBe("リリース手順");
    expect(checklist.tags).toEqual(["仕事", "リリース"]);
    expect(checklist.items.map((i) => [i.title, i.checked, i.checkedAt])).toEqual([
      ["CI が緑であることを確認", false, null],
      ["リリースノートを書く", false, null],
    ]);
    for (const item of checklist.items) expect(item.id).toMatch(UUID);
    expect(await db.checklists.get(checklist.id)).toEqual(checklist);
  });

  it("同名のリストがあっても上書きせず、常に新規に追加する", async () => {
    const first = await importChecklist(parsed());
    const second = await importChecklist(parsed());

    expect(second.id).not.toBe(first.id);
    expect(second.title).toBe(first.title);
    expect(await db.checklists.count()).toBe(2);
  });

  it("正規化を通す（前後の空白と重複タグ）", async () => {
    const file = parsed();
    file.checklist.title = "  空白つき  ";
    file.checklist.tags = ["a", " a ", "b"];

    const checklist = await importChecklist(file);

    expect(checklist.title).toBe("空白つき");
    expect(checklist.tags).toEqual(["a", "b"]);
  });

  it("書き出したファイルを読み込むと、チェック状態を除いて同じ内容の別のリストになる", async () => {
    const source = await createChecklist(makeBoundaryMaxInput());
    await db.checklists.update(source.id, {
      items: source.items.map((i) => ({
        ...i,
        checked: true,
        checkedAt: "2026-10-25T00:00:00.000Z",
      })),
    });
    const text = serializeExportFile(await exportChecklist(source.id));

    const result = parseImportFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = await importChecklist(result.file);

    expect(imported.id).not.toBe(source.id);
    expect(imported.items).toHaveLength(500);
    expect(imported.items.every((i) => !i.checked && i.checkedAt === null)).toBe(true);
    expect(imported.items.map((i) => i.title)).toEqual(source.items.map((i) => i.title));
  });
});
