import { describe, it, expect } from "vitest";
import { formPrivacyInput, responsePrivacyInput } from "../../server/form-privacy.mjs";
const doc = { revision: 0, held: true, reason: "Fictional operational review", confirmation: "HOLD fixture", currentPassword: "fixture-password" };
describe("Forms retention review inputs", () => {
  it("bounds incomplete-draft retention to 1–30 days", () => {
    for (const draftDays of [1, 7, 30]) expect(formPrivacyInput.safeParse({ ...doc, draftDays }).success).toBe(true);
    for (const draftDays of [0, 31, 1.5, "7"]) expect(formPrivacyInput.safeParse({ ...doc, draftDays }).success).toBe(false);
  });
  it("requires review metadata and rejects caller-defined authority or deadlines", () => {
    expect(responsePrivacyInput.safeParse(doc).success).toBe(true);
    for (const patch of [{ ownerId: "forged" }, { expiresAt: "2020-01-01" }, { reason: "" }, { currentPassword: "" }, { revision: -1 }, { draftDays: 7 }])
      expect(responsePrivacyInput.safeParse({ ...doc, ...patch }).success).toBe(false);
  });
});
