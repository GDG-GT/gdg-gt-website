import { describe, expect, it } from "vitest";
import {
  chapterAnnouncementRecord,
  chapterAnnouncementAction,
  chapterAnnouncementConfirm,
} from "../../shared/announcements.mjs";
import { deliveryMessage } from "../../server/delivery.mjs";
describe("chapter announcement validation and notice privacy", () => {
  const record = {
    title: "Fictional announcement",
    message: "Plain <script>text</script>",
    audience: { type: "all" },
  };
  it("requires explicit bounded audiences and server-owned state", () => {
    expect(chapterAnnouncementRecord.parse(record)).toMatchObject({
      emailEnabled: false,
      scheduledFor: null,
      expiresAt: null,
    });
    for (const change of [
      { state: "Published" },
      { author_id: "forged" },
      { audience: { type: "roles", roles: [] } },
      { audience: { type: "roles", roles: ["admin", "admin"] } },
      {
        audience: {
          type: "users",
          emails: Array(101).fill("fixture@example.test"),
        },
      },
    ])
      expect(
        chapterAnnouncementRecord.safeParse({ ...record, ...change }).success,
      ).toBe(false);
  });
  it("normalizes exact emails without accepting account-ID or raw-SQL targeting", () => {
    expect(
      chapterAnnouncementRecord.parse({
        ...record,
        audience: { type: "users", emails: [" Fictional@Example.test "] },
      }).audience.emails,
    ).toEqual(["fictional@example.test"]);
    for (const audience of [
      { type: "users", userIds: ["forged"] },
      { type: "sql", where: "true" },
      { type: "teams", teamIds: ["invalid"] },
    ])
      expect(
        chapterAnnouncementRecord.safeParse({ ...record, audience }).success,
      ).toBe(false);
  });
  it("checks calendar instants and expiry order while preserving full Unicode bodies", () => {
    expect(
      chapterAnnouncementRecord.safeParse({
        ...record,
        scheduledFor: "0000-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      chapterAnnouncementRecord.safeParse({
        ...record,
        message: "漢".repeat(10000),
      }).success,
    ).toBe(true);
    expect(
      chapterAnnouncementRecord.safeParse({ ...record, message: "x\u0000" })
        .success,
    ).toBe(false);
    expect(
      chapterAnnouncementRecord.safeParse({
        ...record,
        scheduledFor: "2026-10-21T13:00:00Z",
        expiresAt: "2026-10-21T12:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("requires a session-bound preview, password, typed confirmation and revisions", () => {
    expect(
      chapterAnnouncementConfirm.safeParse({
        revision: 1,
        previewId: "ef000000-0000-4000-8000-000000000001",
        confirmation: "Fictional announcement",
        currentPassword: "fixture",
      }).success,
    ).toBe(true);
    expect(
      chapterAnnouncementConfirm.safeParse({
        revision: 1,
        confirmation: "Fictional announcement",
        currentPassword: "fixture",
      }).success,
    ).toBe(false);
    expect(
      chapterAnnouncementAction.safeParse({
        action: "read",
        publicationVersion: 1,
        userId: "forged",
      }).success,
    ).toBe(false);
    expect(
      chapterAnnouncementAction.safeParse({
        action: "archive",
        revision: 0,
        confirmation: "Fictional announcement",
      }).success,
    ).toBe(false);
  });
  it("prepares generic email through fenced SQL and supports in-app-only publication", async () => {
    const job = {
        id: "fixture",
        lease_token: "fixture-lease",
        kind: "chapter_announcement",
        payload: { message: "private-text", subject: "private-subject" },
      },
      config = { origin: "https://chapter.example" },
      mail = { from: "chapter@example.test" };
    let called;
    const r = await deliveryMessage(
      job,
      {
        rpc: async (name, args) => {
          called = [name, args];
          return {
            data: {
              email: "fixture@example.test",
              announcementId: "fixture-announcement",
            },
          };
        },
      },
      config,
      mail,
    );
    expect(called).toEqual([
      "prepare_chapter_announcement_notice",
      { p_job: job.id, p_lease: job.lease_token },
    ]);
    expect(r.text).toContain(
      "?tab=announcements&announcement=fixture-announcement",
    );
    expect(JSON.stringify(r)).not.toContain("private-text");
    expect(JSON.stringify(r)).not.toContain("private-subject");
    expect(
      await deliveryMessage(
        job,
        { rpc: async () => ({ data: { email: null } }) },
        config,
        mail,
      ),
    ).toBeNull();
  });
});
