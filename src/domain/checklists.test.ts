import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { makeChecklist } from "@/test/fixtures";
import { listChecklists } from "./checklists";

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
