import { describe, it, expect } from "vitest";
import { eventMailReview, eventMailApproval } from "../../server/events.mjs";
import { deliveryMessage } from "../../server/delivery.mjs";
const id = "f8900000-0000-4000-8000-000000000001";
describe("reviewed event email", () => {
  it("cannot inject recipients, ownership or raw delivery options into a review", () => {
    const body = {
      subject: "Fictional subject",
      message: "A fictional event email only.",
    };
    expect(eventMailReview.parse(body)).toEqual(body);
    for (const extra of [
      { to: ["outsider@example.test"] },
      { count: 1 },
      { from: "spoof@example.test" },
      { html: "<script>" },
    ])
      expect(eventMailReview.safeParse({ ...body, ...extra }).success).toBe(
        false,
      );
    expect(
      eventMailReview.safeParse({ ...body, message: "tiny" }).success,
    ).toBe(false);
  });
  it("approves only a saved review, current password and typed count, not replacement content", () => {
    const body = {
      reviewId: id,
      currentPassword: "fictional",
      confirmation: "SEND 1",
    };
    expect(eventMailApproval.parse(body)).toEqual(body);
    for (const value of [
      { ...body, subject: "replacement" },
      { ...body, currentPassword: "" },
      { ...body, confirmation: "send 1" },
      {
        subject: "Old",
        message: "Old message",
        expectedRecipientCount: 1,
        confirmed: true,
      },
    ])
      expect(eventMailApproval.safeParse(value).success).toBe(false);
  });
  it("prepares under the current SQL lease and escapes the frozen text", async () => {
    const calls = [],
      db = {
        rpc: async (name, args) => {
          calls.push([name, args]);
          return {
            data: {
              email: "fixture@example.test",
              subject: "Fictional",
              message: "<img src=x onerror=alert(1)>",
            },
          };
        },
      };
    const message = await deliveryMessage(
      {
        kind: "event_message",
        id,
        lease_token: id,
        payload: { email: "forged@example.test" },
      },
      db,
      {},
      { from: "chapter@example.test" },
    );
    expect(calls).toEqual([["prepare_event_mail", { p_job: id, p_lease: id }]]);
    expect(message.to).toBe("fixture@example.test");
    expect(message.html).toContain("&lt;img");
    expect(message.html).not.toContain("<img");
    expect(
      await deliveryMessage(
        { kind: "event_message", id, lease_token: id },
        { rpc: async () => ({ data: null }) },
        {},
        {},
      ),
    ).toBeNull();
  });
});
