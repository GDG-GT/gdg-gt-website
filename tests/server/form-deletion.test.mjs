import { describe, it, expect } from "vitest";
import { formDeletionInput, formDeletionReviewInput } from "../../server/form-deletion.mjs";
import { token } from "../../server/lib/security.mjs";
const value = { revision: 1, reviewId: "f7200000-0000-4000-8000-000000000001", reviewToken: token(), confirmation: "DELETE FORM fixture", exportWarningAcknowledged: true, currentPassword: "fictional" };
describe("Permanent Forms deletion boundary", () => {
  it("requires a recent review capability, current password and explicit export warning", () => {
    expect(formDeletionInput.safeParse(value).success).toBe(true);
    for (const patch of [{ exportWarningAcknowledged: false }, { currentPassword: "" }, { reviewToken: "bad" }, { reviewId: "bad" }, { revision: 0 }])
      expect(formDeletionInput.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it("rejects caller-supplied retention waivers and authority", () => {
    for (const extra of [{ ignoreHold: true }, { actorId: value.reviewId }, { skipRetention: true }, { force: true }])
      expect(formDeletionInput.safeParse({ ...value, ...extra }).success).toBe(false);
    expect(formDeletionReviewInput.safeParse({ revision: 1, retain: false }).success).toBe(false);
  });
});
