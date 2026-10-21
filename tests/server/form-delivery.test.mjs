import { describe, it, expect } from "vitest";
import { deliveryPolicyInput } from "../../server/form-delivery.mjs";
import { deliveryMessage } from "../../server/delivery.mjs";
const id = "f6500000-0000-4000-8000-000000000001";
const policy = () => ({ formRevision: 1, policyRevision: 0, receipts: true, receiptAnswers: false,
  notificationUsers: [id], chapterInbox: false, notificationAnswers: false,
  confirmation: `DELIVERY ${id}`, currentPassword: "fictional-test-password" });
describe("reviewed Forms delivery", () => {
  it("accepts only explicit bounded account identities and review fields", () => {
    expect(deliveryPolicyInput.safeParse(policy()).success).toBe(true);
    for (const patch of [{ to: "stranger@example.test" }, { reviewedBy: id }, { policyRevision: -1 },
      { notificationUsers: ["stranger@example.test"] }, { notificationUsers: [id, id] },
      { currentPassword: "" }, { receipts: false, receiptAnswers: true }])
      expect(deliveryPolicyInput.safeParse({ ...policy(), ...patch }).success).toBe(false);
  });
  it("never constructs mail for a suppressed delivery", async () => {
    expect(await deliveryMessage({ kind: "form_reviewed_email", id, lease_token: id },
      { rpc: async () => ({ data: null, error: null }) }, {}, {})).toBe(null);
  });
  it("uses only the prepared recipient and escapes answer content in HTML", async () => {
    const notice = { purpose: "notification", email: "reviewer@example.test", formId: id, responseId: id,
      title: "Fictional form", version: 2, submittedAt: "2026-10-21T12:00:00Z",
      answers: [{ label: "<script>Question</script>", value: "<img src=x onerror=alert(1)>" }] };
    const message = await deliveryMessage({ kind: "form_reviewed_email", id, lease_token: id, payload: { email: "forged@example.test" } },
      { rpc: async (name) => { expect(name).toBe("prepare_form_reviewed_email"); return { data: notice, error: null }; } },
      { origin: "http://127.0.0.1:8080" }, { from: "chapter@example.test" });
    expect(message.to).toBe("reviewer@example.test");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toContain("<img src=x");
    expect(message.text).toContain(`/admin/forms/${id}/responses`);
  });
  it("marks oversized answer sets as omitted, without pretending to send answers", async () => {
    const message = await deliveryMessage({ kind: "form_reviewed_email", id, lease_token: id },
      { rpc: async () => ({ data: { purpose: "receipt", email: "person@example.test", title: "Form", responseId: id,
        submittedAt: "2026-10-21T12:00:00Z", version: 1, answers: [], answersOmitted: true }, error: null }) },
      { origin: "http://127.0.0.1:8080" }, { from: "chapter@example.test" });
    expect(message.text).toContain("Answers were omitted");
    expect(message.text).not.toContain("Reviewed non-sensitive answers:");
  });
});
