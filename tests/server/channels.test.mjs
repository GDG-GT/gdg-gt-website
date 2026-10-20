import { describe, it, expect } from "vitest";
import { channelRecord, messageRecord } from "../../server/channels.mjs";
describe("channel input fences", () => {
  it("defaults new rooms to private", () => {
    expect(channelRecord.parse({ name: "Fictional room" })).toMatchObject({
      visibility: "private",
      teamId: null,
    });
  });
  it("requires a team exactly when selecting a team audience", () => {
    expect(
      channelRecord.safeParse({ name: "Fictional room", visibility: "team" })
        .success,
    ).toBe(false);
    expect(
      channelRecord.safeParse({
        name: "Fictional room",
        visibility: "internal",
        teamId: "d9000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });
  it("does not accept client ownership or archive state", () => {
    for (const key of ["created_by", "is_archived", "revision"])
      expect(
        channelRecord.safeParse({ name: "Fictional room", [key]: "forged" })
          .success,
      ).toBe(false);
  });
  it("binds senders to the session, not message input", () => {
    for (const key of ["sender_id", "attachment_url", "is_pinned", "read_by"])
      expect(
        messageRecord.safeParse({
          message: "Fictional message",
          [key]: "forged",
        }).success,
      ).toBe(false);
  });
  it("rejects blank, oversized and control-bearing text", () => {
    for (const message of ["   ", "x".repeat(10001), "bad\u0000message"])
      expect(messageRecord.safeParse({ message }).success).toBe(false);
  });
});
