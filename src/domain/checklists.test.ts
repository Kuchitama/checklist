import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { makeChecklist, makeChecklistInput, makeItem } from "@/test/fixtures";
import {
  createChecklist,
  deleteChecklist,
  getChecklist,
  listChecklists,
  resetChecklist,
  toggleItem,
  updateChecklist,
} from "./checklists";
import { ChecklistNotFoundError, ChecklistValidationError } from "./errors";

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
