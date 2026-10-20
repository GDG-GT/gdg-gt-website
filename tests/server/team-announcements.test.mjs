import { describe, it, expect } from "vitest";
import { announcementRecord } from "../../server/team-announcements.mjs";
const record = {
  title: "Fictional announcement",
  message: "Local verification only",
};
describe("team announcement input contract", () => {
  it("defaults to a normal, unpinned, unscheduled draft document", () => {
    expect(announcementRecord.parse(record)).toEqual({
      ...record,
      priority: "normal",
      pinned: false,
      scheduledFor: null,
      expiresAt: null,
    });
  });
  it("rejects author, publication and audience mass assignment", () => {
    for (const key of ["author_id", "is_published", "read_by", "audience"])
      expect(
        announcementRecord.safeParse({ ...record, [key]: "forged" }).success,
      ).toBe(false);
  });
  it("rejects invalid priorities and inverted scheduling windows", () => {
    expect(
      announcementRecord.safeParse({ ...record, priority: "emergency" })
        .success,
    ).toBe(false);
    expect(
      announcementRecord.safeParse({
        ...record,
        scheduledFor: "2026-11-02T12:00:00Z",
        expiresAt: "2026-11-01T12:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("bounds text and rejects controls without rendering HTML as markup", () => {
    expect(
      announcementRecord.safeParse({ ...record, message: "bad\u0000message" })
        .success,
    ).toBe(false);
    expect(
      announcementRecord.safeParse({ ...record, message: "x".repeat(10001) })
        .success,
    ).toBe(false);
    expect(
      announcementRecord.parse({ ...record, message: "<b>Plain text</b>" })
        .message,
    ).toBe("<b>Plain text</b>");
  });
});
