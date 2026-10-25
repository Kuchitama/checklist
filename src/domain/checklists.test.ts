import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import {
  EMOJI_TITLE,
  makeBoundaryMaxInput,
  makeChecklist,
  makeChecklistInput,
  makeItem,
  repeat,
} from "@/test/fixtures";
import {
  createChecklist,
  deleteChecklist,
  duplicateChecklist,
  exportChecklist,
  getChecklist,
  listChecklists,
  resetChecklist,
  searchChecklists,
  serializeExportFile,
  toggleItem,
  updateChecklist,
} from "./checklists";
import { ChecklistNotFoundError, ChecklistValidationError } from "./errors";
import { cpLength, exportFileV1Schema } from "./schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("listChecklists", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  it("リストが 0 件なら空配列を返す", async () => {
    expect(await listChecklists()).toEqual([]);
  });

  it("updatedAt の降順で返す", async () => {
    await db.checklists.bulkPut([
      makeChecklist({ id: "a", title: "古い", updatedAt: "2026-10-01T00:00:00.000Z" }),
      makeChecklist({ id: "b", title: "新しい", updatedAt: "2026-10-03T00:00:00.000Z" }),
      makeChecklist({ id: "c", title: "中間", updatedAt: "2026-10-02T00:00:00.000Z" }),
    ]);

    const titles = (await listChecklists()).map((c) => c.title);

    expect(titles).toEqual(["新しい", "中間", "古い"]);
  });
});

describe("createChecklist", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T01:02:03.004Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db.checklists.clear();
  });

  it("新しい id と作成時刻で保存し、保存したリストを返す", async () => {
    const created = await createChecklist(
      makeChecklistInput({
        title: " 旅行の持ち物 ",
        tags: ["旅行", "旅行"],
        items: [
          { title: "充電器", note: "", url: null, dueDate: null },
          // 入力に id があっても新規作成では採番し直す
          { id: "ignored", title: "傘", note: "", url: "", dueDate: "" },
        ],
      }),
    );

    expect(created).toEqual({
      id: expect.stringMatching(UUID),
      title: "旅行の持ち物",
      description: "",
      tags: ["旅行"],
      items: [
        {
          id: expect.stringMatching(UUID),
          title: "充電器",
          note: "",
          url: null,
          dueDate: null,
          checked: false,
          checkedAt: null,
        },
        {
          id: expect.stringMatching(UUID),
          title: "傘",
          note: "",
          url: null,
          dueDate: null,
          checked: false,
          checkedAt: null,
        },
      ],
      createdAt: "2026-10-23T01:02:03.004Z",
      updatedAt: "2026-10-23T01:02:03.004Z",
    });
    const [first, second] = created.items.map((i) => i.id);
    expect(first).not.toBe(second);
    expect(second).not.toBe("ignored");
    expect(await db.checklists.get(created.id)).toEqual(created);
  });

  it("不正な入力では何も保存せず、ValidationIssue を持つ例外を投げる", async () => {
    const error = await createChecklist(
      makeChecklistInput({
        title: "  ",
        items: [{ title: "", note: "", url: null, dueDate: null }],
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChecklistValidationError);
    expect((error as ChecklistValidationError).issues.map((i) => i.path)).toEqual([
      ["title"],
      ["items", 0, "title"],
    ]);
    expect(await db.checklists.count()).toBe(0);
  });

  it("DB への書き込み失敗は呼び出し元へ伝える", async () => {
    const failure = new DOMException("容量不足", "QuotaExceededError");
    vi.spyOn(db.checklists, "add").mockRejectedValue(failure);

    await expect(createChecklist(makeChecklistInput())).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
  });
});

describe("getChecklist", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  it("保存済みのリストを返す", async () => {
    const checklist = makeChecklist({ id: "a", title: "朝のルーティン" });
    await db.checklists.put(checklist);

    expect(await getChecklist("a")).toEqual(checklist);
  });

  it("存在しなければ undefined を返す", async () => {
    expect(await getChecklist("missing")).toBeUndefined();
  });
});

describe("toggleItem / resetChecklist / deleteChecklist", () => {
  const before = "2026-10-01T00:00:00.000Z";
  const doneAt = "2026-10-02T00:00:00.000Z";

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T01:02:03.004Z"));
    await db.checklists.put(
      makeChecklist({
        id: "list",
        updatedAt: before,
        items: [
          makeItem({ id: "a", title: "パスポート" }),
          makeItem({ id: "b", title: "充電器", checked: true, checkedAt: doneAt }),
          makeItem({ id: "c", title: "傘" }),
        ],
      }),
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.checklists.clear();
  });

  const stored = async () => {
    const list = await db.checklists.get("list");
    if (!list) throw new Error("リストがない");
    return list;
  };

  it("チェックすると checkedAt と updatedAt が現在時刻になり、ほかの項目は変わらない", async () => {
    const original = await stored();

    await toggleItem("list", "a", true);

    const list = await stored();
    expect(list.items[0]).toEqual({
      ...original.items[0],
      checked: true,
      checkedAt: "2026-10-23T01:02:03.004Z",
    });
    expect(list.items.slice(1)).toEqual(original.items.slice(1));
    expect(list.updatedAt).toBe("2026-10-23T01:02:03.004Z");
  });

  it("チェックを外すと checkedAt が null になり、updatedAt が更新される", async () => {
    await toggleItem("list", "b", false);

    const list = await stored();
    expect(list.items[1]).toMatchObject({ checked: false, checkedAt: null });
    expect(list.updatedAt).toBe("2026-10-23T01:02:03.004Z");
  });

  it("別の項目を並行にチェックしても、どちらの更新も失われない", async () => {
    await Promise.all([toggleItem("list", "a", true), toggleItem("list", "c", true)]);

    expect((await stored()).items.map((i) => i.checked)).toEqual([true, true, true]);
  });

  it("同じ項目を true → false と続けて呼ぶと、最後の呼び出しの値になる", async () => {
    await Promise.all([toggleItem("list", "a", true), toggleItem("list", "a", false)]);

    expect((await stored()).items[0]).toMatchObject({ checked: false, checkedAt: null });
  });

  it.each([
    ["リスト", "missing", "a"],
    ["項目", "list", "missing"],
  ])(
    "%sが存在しなければ ChecklistNotFoundError を投げ、何も書き込まない",
    async (_, listId, itemId) => {
      const original = await stored();

      await expect(toggleItem(listId, itemId, true)).rejects.toBeInstanceOf(ChecklistNotFoundError);
      expect(await stored()).toEqual(original);
    },
  );

  it("リセットで全項目が未完了になり、項目の数・順序・内容は変わらない", async () => {
    // beforeEach の項目 b はチェック済み、updatedAt は過去の時刻
    const original = await stored();

    await resetChecklist("list");

    const list = await stored();
    expect(list.items).toEqual(
      original.items.map((i) => ({ ...i, checked: false, checkedAt: null })),
    );
    expect(list.updatedAt).toBe("2026-10-23T01:02:03.004Z");
  });

  it("存在しないリストのリセットは ChecklistNotFoundError を投げる", async () => {
    await expect(resetChecklist("missing")).rejects.toBeInstanceOf(ChecklistNotFoundError);
  });

  it("削除するとリストが消える。存在しない id でも成功する", async () => {
    await deleteChecklist("list");
    expect(await db.checklists.get("list")).toBeUndefined();

    await expect(deleteChecklist("list")).resolves.toBeUndefined();
  });
});

describe("updateChecklist", () => {
  const existing = () =>
    makeChecklist({
      id: "list",
      title: "旅行の持ち物",
      description: "前回の反省",
      tags: ["旅行"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      items: [
        makeItem({
          id: "a",
          title: "パスポート",
          checked: true,
          checkedAt: "2026-10-02T00:00:00.000Z",
        }),
        makeItem({ id: "b", title: "充電器", note: "モバイルバッテリーも" }),
        makeItem({ id: "c", title: "傘" }),
      ],
    });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T01:02:03.004Z"));
    await db.checklists.put(existing());
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db.checklists.clear();
  });

  it("タイトル・説明・タグを置き換え、createdAt を保って updatedAt を現在時刻にする", async () => {
    const updated = await updateChecklist(
      "list",
      makeChecklistInput({
        title: " 出張の持ち物 ",
        description: "来週の分\r\n忘れずに",
        tags: ["出張", " 出張 ", "仕事"],
        items: [{ id: "a", title: "パスポート", note: "", url: null, dueDate: null }],
      }),
    );

    expect(updated).toMatchObject({
      id: "list",
      title: "出張の持ち物",
      description: "来週の分\n忘れずに",
      tags: ["出張", "仕事"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-10-23T01:02:03.004Z",
    });
    expect(await db.checklists.get("list")).toEqual(updated);
  });

  it("id のある項目はチェック状態を引き継いで内容を置き換え、id のない項目は新規に採番し、入力にない項目は消す。順序は入力順", async () => {
    const updated = await updateChecklist(
      "list",
      makeChecklistInput({
        items: [
          { title: "新しい項目", note: "", url: null, dueDate: null },
          {
            id: "a",
            title: "パスポート（更新）",
            note: "期限を確認",
            url: "https://example.com/p",
            dueDate: "2026-12-01",
          },
          { id: "b", title: "充電器", note: "", url: null, dueDate: null },
        ],
      }),
    );

    expect(updated.items).toEqual([
      {
        id: expect.stringMatching(UUID),
        title: "新しい項目",
        note: "",
        url: null,
        dueDate: null,
        checked: false,
        checkedAt: null,
      },
      {
        id: "a",
        title: "パスポート（更新）",
        note: "期限を確認",
        url: "https://example.com/p",
        dueDate: "2026-12-01",
        checked: true,
        checkedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "b",
        title: "充電器",
        note: "",
        url: null,
        dueDate: null,
        checked: false,
        checkedAt: null,
      },
    ]);
    expect(updated.items[0]?.id).not.toBe("c");
    expect(await db.checklists.get("list")).toEqual(updated);
  });

  it("既存にない id を持つ項目は unknown_id で拒否し、何も保存しない", async () => {
    const error = await updateChecklist(
      "list",
      makeChecklistInput({
        items: [
          { id: "a", title: "パスポート", note: "", url: null, dueDate: null },
          { id: "missing", title: "どこかの項目", note: "", url: null, dueDate: null },
        ],
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChecklistValidationError);
    expect((error as ChecklistValidationError).issues).toEqual([
      {
        path: ["items", 1, "id"],
        code: "unknown_id",
        message: "項目の識別子が不正です。画面を再読み込みしてください",
      },
    ]);
    expect(await db.checklists.get("list")).toEqual(existing());
  });

  it("同じ id を 2 回含む入力は、2 回目を unknown_id で拒否し、何も保存しない", async () => {
    const error = await updateChecklist(
      "list",
      makeChecklistInput({
        items: [
          { id: "a", title: "パスポート", note: "", url: null, dueDate: null },
          { id: "a", title: "パスポート（複製）", note: "", url: null, dueDate: null },
        ],
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChecklistValidationError);
    expect((error as ChecklistValidationError).issues).toEqual([
      {
        path: ["items", 1, "id"],
        code: "unknown_id",
        message: "項目の識別子が不正です。画面を再読み込みしてください",
      },
    ]);
    expect(await db.checklists.get("list")).toEqual(existing());
  });

  it("検証エラーは createChecklist と同じ形で返し、何も保存しない", async () => {
    const error = await updateChecklist(
      "list",
      makeChecklistInput({
        title: "",
        items: [{ id: "a", title: " ", note: "", url: null, dueDate: null }],
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChecklistValidationError);
    expect((error as ChecklistValidationError).issues.map((i) => [i.path, i.code])).toEqual([
      [["title"], "required"],
      [["items", 0, "title"], "required"],
    ]);
    expect(await db.checklists.get("list")).toEqual(existing());
  });

  it("存在しないリストは ChecklistNotFoundError を投げ、何も書き込まない", async () => {
    await expect(updateChecklist("missing", makeChecklistInput())).rejects.toBeInstanceOf(
      ChecklistNotFoundError,
    );
    expect(await db.checklists.count()).toBe(1);
    expect(await db.checklists.get("list")).toEqual(existing());
  });

  it("DB への書き込み失敗は呼び出し元へ伝える", async () => {
    vi.spyOn(db.checklists, "put").mockRejectedValue(
      new DOMException("容量不足", "QuotaExceededError"),
    );

    await expect(updateChecklist("list", makeChecklistInput({ items: [] }))).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
  });
});

describe("exportChecklist / serializeExportFile", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T01:02:03.004Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.checklists.clear();
  });

  const stored = () =>
    makeChecklist({
      id: "list",
      title: "リリース手順",
      description: "本番リリース前に必ず通す確認",
      tags: ["仕事", "リリース"],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      items: [
        makeItem({
          id: "a",
          title: "CI が緑であることを確認",
          url: "https://example.com/ci",
          checked: true,
          checkedAt: "2026-10-02T00:00:00.000Z",
        }),
        makeItem({ id: "b", title: "リリースノートを書く", note: "前回との差分を箇条書き" }),
        makeItem({ id: "c", title: "タグを打つ", dueDate: "2026-12-31" }),
      ],
    });

  it("仕様書 4 章の形式にし、id・時刻・チェック状態を含めず、項目の順序を保つ", async () => {
    await db.checklists.put(stored());

    const file = await exportChecklist("list");

    expect(file).toEqual({
      format: "checklist-export",
      version: 1,
      exportedAt: "2026-10-25T01:02:03.004Z",
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
          { title: "タグを打つ", note: "", url: null, dueDate: "2026-12-31" },
        ],
      },
    });
    // 含めてはいけないキーが、どの階層にもない
    const keys = new Set<string>();
    JSON.stringify(file, (key, value) => {
      keys.add(key);
      return value;
    });
    for (const key of ["id", "createdAt", "updatedAt", "checked", "checkedAt"]) {
      expect(keys.has(key)).toBe(false);
    }
  });

  it("存在しないリストは ChecklistNotFoundError を投げる", async () => {
    await expect(exportChecklist("missing")).rejects.toBeInstanceOf(ChecklistNotFoundError);
  });

  it("2 スペース整形の JSON 文字列にし、読み戻すとスキーマを通って同じ値になる", async () => {
    await db.checklists.put(stored());
    const file = await exportChecklist("list");

    const text = serializeExportFile(file);

    expect(text.startsWith('{\n  "format": "checklist-export",\n  "version": 1,')).toBe(true);
    expect(text.endsWith("\n")).toBe(true);
    const parsed = exportFileV1Schema.safeParse(JSON.parse(text));
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(file);
  });

  it("上限いっぱいのリスト（boundary-max）も書き出して読み戻せる", async () => {
    const created = await createChecklist(makeBoundaryMaxInput());

    const text = serializeExportFile(await exportChecklist(created.id));

    const parsed = exportFileV1Schema.safeParse(JSON.parse(text));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.checklist.items).toHaveLength(500);
    expect(parsed.data?.checklist.tags).toHaveLength(20);
  });
});

describe("duplicateChecklist", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T01:02:03.004Z"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.checklists.clear();
  });

  const source = (title = "リリース手順") =>
    makeChecklist({
      id: "list",
      title,
      description: "本番前の確認",
      tags: ["仕事", "リリース"],
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
      items: [
        makeItem({
          id: "a",
          title: "CI を確認",
          url: "https://example.com/ci",
          checked: true,
          checkedAt: "2026-10-02T00:00:00.000Z",
        }),
        makeItem({ id: "b", title: "タグを打つ", note: "v2", dueDate: "2026-12-31" }),
      ],
    });

  it("「<タイトル> のコピー」で、説明・タグ・項目をコピーし、チェック状態を引き継がない", async () => {
    await db.checklists.put(source());

    const copy = await duplicateChecklist("list");

    expect(copy.id).toMatch(UUID);
    expect(copy.id).not.toBe("list");
    expect(copy.title).toBe("リリース手順 のコピー");
    expect(copy.description).toBe("本番前の確認");
    expect(copy.tags).toEqual(["仕事", "リリース"]);
    expect(copy.createdAt).toBe("2026-10-25T01:02:03.004Z");
    expect(copy.updatedAt).toBe("2026-10-25T01:02:03.004Z");
    expect(
      copy.items.map((i) => [i.title, i.note, i.url, i.dueDate, i.checked, i.checkedAt]),
    ).toEqual([
      ["CI を確認", "", "https://example.com/ci", null, false, null],
      ["タグを打つ", "v2", null, "2026-12-31", false, null],
    ]);
    for (const item of copy.items) {
      expect(item.id).toMatch(UUID);
      expect(["a", "b"]).not.toContain(item.id);
    }
    expect(await db.checklists.get(copy.id)).toEqual(copy);
    // 元のリストは変わらない
    expect(await db.checklists.get("list")).toEqual(source());
    expect(await db.checklists.count()).toBe(2);
  });

  it("接尾辞込みで 100 文字を超えるタイトルは、先頭 95 コードポイントを trim して接尾辞を付ける", async () => {
    // title-98（データ設計書 7 章）: 98 + 5 = 103 > 100 → 95 + 5 = 100
    await db.checklists.put(source(repeat("あ", 98)));
    const copy98 = await duplicateChecklist("list");
    expect(cpLength(copy98.title)).toBe(100);
    expect(copy98.title).toBe(`${repeat("あ", 95)} のコピー`);

    await db.checklists.put(source(repeat("い", 100)));
    expect((await duplicateChecklist("list")).title).toBe(`${repeat("い", 95)} のコピー`);

    // 95 文字ちょうど + 接尾辞 = 100 は切り詰めない
    await db.checklists.put(source(repeat("う", 95)));
    expect((await duplicateChecklist("list")).title).toBe(`${repeat("う", 95)} のコピー`);

    // 切った先頭 95 文字の末尾が空白なら trim される
    await db.checklists.put(source(`${repeat("え", 94)} ${repeat("お", 5)}`));
    expect((await duplicateChecklist("list")).title).toBe(`${repeat("え", 94)} のコピー`);
  });

  it("絵文字と結合文字を含むタイトルはコードポイントで数える", async () => {
    // EMOJI_TITLE は 8 コードポイント（UTF-16 では 12）。12 回で 96 コードポイント → 95 に切る
    await db.checklists.put(source(repeat(EMOJI_TITLE, 12)));

    const copy = await duplicateChecklist("list");

    expect(copy.title).toBe(
      `${Array.from(repeat(EMOJI_TITLE, 12)).slice(0, 95).join("")} のコピー`,
    );
    expect(cpLength(copy.title)).toBe(100);
  });

  it("存在しないリストは ChecklistNotFoundError を投げ、何も書き込まない", async () => {
    await expect(duplicateChecklist("missing")).rejects.toBeInstanceOf(ChecklistNotFoundError);
    expect(await db.checklists.count()).toBe(0);
  });
});

describe("searchChecklists（データ設計書 4.3 節）", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  const seed = () =>
    db.checklists.bulkPut([
      makeChecklist({
        id: "release",
        title: "リリース手順",
        tags: ["仕事", "リリース"],
        updatedAt: "2026-10-03T00:00:00.000Z",
        items: [
          makeItem({ id: "r1", title: "CI を確認" }),
          makeItem({ id: "r2", title: "Tag を打つ" }),
        ],
      }),
      makeChecklist({
        id: "travel",
        title: "旅行の持ち物",
        tags: ["家", "旅行"],
        updatedAt: "2026-10-02T00:00:00.000Z",
        items: [
          makeItem({ id: "t1", title: "パスポート" }),
          makeItem({ id: "t2", title: "ＡＢＣ 充電器" }),
        ],
      }),
      makeChecklist({
        id: "morning",
        title: "朝のルーティン",
        tags: ["家", "習慣"],
        updatedAt: "2026-10-01T00:00:00.000Z",
        items: [makeItem({ id: "m1", title: "ストレッチ" })],
      }),
    ]);

  const ids = async (query: string, tags: string[] = []) =>
    (await searchChecklists(query, tags)).map((c) => c.id);

  it("検索語もタグも空なら全件を updatedAt 降順で返す", async () => {
    await seed();
    expect(await ids("")).toEqual(["release", "travel", "morning"]);
    expect(await ids("   　 ")).toEqual(["release", "travel", "morning"]);
  });

  it("リスト名または項目名に部分一致するリストを返す", async () => {
    await seed();
    expect(await ids("手順")).toEqual(["release"]);
    expect(await ids("パスポート")).toEqual(["travel"]);
  });

  it("全角半角と大文字小文字を区別しない（NFKC → 小文字）", async () => {
    await seed();
    expect(await ids("abc")).toEqual(["travel"]);
    expect(await ids("ＡＢＣ")).toEqual(["travel"]);
    expect(await ids("tag")).toEqual(["release"]);
    expect(await ids("ＴＡＧ")).toEqual(["release"]);
  });

  it("空白で区切った語はすべて含むリストだけを返す（順不同）。全角空白でも区切る", async () => {
    await seed();
    expect(await ids("リリース CI")).toEqual(["release"]);
    expect(await ids("CI リリース")).toEqual(["release"]);
    expect(await ids("リリース　CI")).toEqual(["release"]);
    expect(await ids("リリース パスポート")).toEqual([]);
  });

  it("タグは指定したものをすべて持つリストに絞り、完全一致で比べる", async () => {
    await seed();
    expect(await ids("", ["家"])).toEqual(["travel", "morning"]);
    expect(await ids("", ["家", "習慣"])).toEqual(["morning"]);
    expect(await ids("", ["家", "仕事"])).toEqual([]);
    // 正規化せず完全一致。部分一致や大文字小文字の同一視はしない
    expect(await ids("", ["リリー"])).toEqual([]);
  });

  it("検索語とタグを併用できる", async () => {
    await seed();
    expect(await ids("ストレッチ", ["家"])).toEqual(["morning"]);
    expect(await ids("ストレッチ", ["仕事"])).toEqual([]);
  });

  it("一致しなければ空配列", async () => {
    await seed();
    expect(await ids("存在しない語")).toEqual([]);
  });

  it("DB の読み取り失敗は呼び出し元へ伝える", async () => {
    vi.spyOn(db.checklists, "orderBy").mockImplementation(() => {
      throw new DOMException("読み取り失敗", "UnknownError");
    });
    await expect(searchChecklists("a", [])).rejects.toBeInstanceOf(DOMException);
    vi.restoreAllMocks();
  });
});
