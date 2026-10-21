import { describe, expect, it } from "vitest";
import { mediaFolderCreate, mediaFolderUpdate, mediaListQuery } from "../../shared/media.mjs";
const value = { name: "Fixture", description: "Fictional", teamId: null, parentId: null };
describe("Private media folder boundary", () => {
  it("requires explicit destination scope and rejects object keys or forged authority", () => {
    expect(mediaFolderCreate.safeParse(value).success).toBe(true);
    for (const extra of [{ path: "private/key" }, { actorId: "forged" }, { bucket: "public" }, { name: "" }, { name: "bad\u0000name" }]) expect(mediaFolderCreate.safeParse({ ...value, ...extra }).success).toBe(false);
  });
  it("does not allow folder update to rewrite ownership, revision or scope", () => {
    expect(mediaFolderUpdate.safeParse({ action: "update", revision: 1, name: "Fixture" }).success).toBe(true);
    for (const extra of [{ teamId: null }, { createdBy: "forged" }, { revision: 0 }]) expect(mediaFolderUpdate.safeParse({ action: "update", revision: 1, name: "Fixture", ...extra }).success).toBe(false);
  });
  it("bounds metadata reads and accepts only known selectors", () => {
    expect(mediaListQuery.safeParse({ team: "chapter", folder: "root" }).success).toBe(true);
    for (const extra of [{ pageSize: 101 }, { path: "../private" }, { team: "foreign" }, { type: "script" }, { starred: true }]) expect(mediaListQuery.safeParse(extra).success).toBe(false);
  });
});
