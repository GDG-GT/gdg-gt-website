import { describe, expect, it } from "vitest";
import {
  directCreate,
  directReply,
  directEdit,
  directThreadAction,
  directReview,
} from "../../shared/direct-messages.mjs";
import { deliveryMessage } from "../../server/delivery.mjs";
describe("direct-message boundaries", () => {
  const create = {
    recipientEmail: " Fictional@Example.test ",
    subject: " A subject ",
    message: " Plain <script>text</script> ",
  };
  it("normalizes recipients and treats markup as bounded plain text", () => {
    expect(directCreate.parse(create)).toEqual({
      recipientEmail: "fictional@example.test",
      subject: "A subject",
      message: "Plain <script>text</script>",
    });
    expect(
      directCreate.safeParse({ ...create, message: "漢".repeat(10000) })
        .success,
    ).toBe(true);
    expect(
      directCreate.safeParse({ ...create, message: "x".repeat(10001) }).success,
    ).toBe(false);
  });
  it("rejects forged sender, participant changes, attachments and control characters", () => {
    for (const extra of [
      { from_user_id: "forged" },
      { threadId: "forged" },
      { attachments: [] },
    ])
      expect(directCreate.safeParse({ ...create, ...extra }).success).toBe(
        false,
      );
    expect(
      directCreate.safeParse({ ...create, message: "hidden\u0000" }).success,
    ).toBe(false);
    expect(
      directReply.safeParse({
        message: "Reply",
        recipientEmail: "different@example.test",
      }).success,
    ).toBe(false);
    expect(directReply.parse({ message: "Reply" }).replyToId).toBeNull();
  });
  it("requires explicit revisions and keeps read cursors distinct", () => {
    expect(
      directEdit.safeParse({ action: "edit", revision: 1, message: "Edit" })
        .success,
    ).toBe(true);
    expect(
      directEdit.safeParse({ action: "delete", revision: 0 }).success,
    ).toBe(false);
    expect(
      directThreadAction.safeParse({ action: "read", revision: 1 }).success,
    ).toBe(false);
    expect(
      directThreadAction.safeParse({
        action: "archive",
        revision: 1,
        userId: "someone",
      }).success,
    ).toBe(false);
  });
  it("requires password and a substantive reason for review without accepting client expiry", () => {
    const body = {
      action: "start",
      currentPassword: "fictional",
      reason: "Fictional authorized review",
    };
    expect(directReview.safeParse(body).success).toBe(true);
    for (const change of [
      { currentPassword: undefined },
      { reason: "short" },
      { expiresAt: "forever" },
    ])
      expect(directReview.safeParse({ ...body, ...change }).success).toBe(
        false,
      );
  });
  it("builds generic private notices using fenced preparation, never message text", async () => {
    let args;
    const db = {
      rpc: async (name, value) => {
        args = [name, value];
        return {
          data: {
            email: "fictional@example.test",
            threadId: "fictional-thread",
          },
        };
      },
    };
    const job = {
      id: "fictional-job",
      kind: "direct_message_notice",
      lease_token: "fictional-lease",
      payload: { message: "DO NOT EXPOSE", subject: "DO NOT EXPOSE" },
    };
    const notice = await deliveryMessage(
      job,
      db,
      { origin: "https://chapter.example" },
      { from: "chapter@example.test" },
    );
    expect(args).toEqual([
      "prepare_direct_notice",
      { p_job: job.id, p_lease: job.lease_token },
    ]);
    expect(JSON.stringify(notice)).not.toContain("DO NOT EXPOSE");
    expect(notice.text).toContain("?tab=messages&thread=fictional-thread");
    expect(
      await deliveryMessage(job, { rpc: async () => ({ data: null }) }, {}, {}),
    ).toBeNull();
  });
});
