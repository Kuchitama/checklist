import { afterEach, describe, expect, it } from "vitest";
import type { Checklist } from "../domain/types";
import { db } from "./index";

const sample: Checklist = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "リリース手順",
  description: "",
  tags: ["仕事", "リリース"],
  items: [],
  createdAt: "2026-10-23T00:00:00.000Z",
  updatedAt: "2026-10-23T00:00:00.000Z",
};

describe("db", () => {
  afterEach(async () => {
    await db.checklists.clear();
  });

  it("リストを保存して id で取得できる", async () => {
    await db.checklists.put(sample);
    const found = await db.checklists.get(sample.id);
    expect(found).toEqual(sample);
  });

  it("tags のマルチエントリインデックスでタグを列挙できる", async () => {
    await db.checklists.put(sample);
    const tags = await db.checklists.orderBy("tags").uniqueKeys();
    expect(tags).toEqual(["リリース", "仕事"]);
  });
});
