import { describe, expect, it } from "vitest";
import {
  contactUploadIntent,
  contactUploadProof,
  contactSubmission,
  contactMutation,
  contactInboxQuery,
} from "../../shared/contact.mjs";
const proof = "a".repeat(43),
  id = "f8800000-0000-4000-8000-000000000001";
describe("contact boundaries", () => {
  it("permits only one bounded attachment capability and never storage paths", () => {
    const value = {
      filename: "fictional.png",
      mime: "image/png",
      bytes: 100,
      sha256: "a".repeat(64),
      uploadToken: proof,
      website: "",
    };
    expect(contactUploadIntent.safeParse(value).success).toBe(true);
    for (const extra of [
      { bytes: 10485761 },
      { mime: "image/svg+xml" },
      { key: "private/key" },
      { website: "bot" },
      { sha256: "bad" },
    ])
      expect(
        contactUploadIntent.safeParse({ ...value, ...extra }).success,
      ).toBe(false);
    expect(contactUploadProof.safeParse({ uploadToken: "weak" }).success).toBe(
      false,
    );
  });
  it("normalizes contact identity and rejects forged attachment state", () => {
    const value = {
      name: "Fictional Person",
      email: "TEST@EXAMPLE.TEST",
      type: "accessibility",
      message: "A synthetic message long enough to validate.",
      attachment: { uploadId: id, uploadToken: proof },
    };
    expect(contactSubmission.parse(value).email).toBe("test@example.test");
    expect(
      contactSubmission.safeParse({
        ...value,
        attachment: { ...value.attachment, clean: true },
      }).success,
    ).toBe(false);
    expect(
      contactSubmission.safeParse({ ...value, message: "short" }).success,
    ).toBe(false);
    expect(
      contactSubmission.safeParse({ ...value, attachments: [value.attachment] })
        .success,
    ).toBe(false);
  });
  it("requires exact hold confirmation and a meaningful reason", () => {
    const value = {
      action: "hold",
      revision: 1,
      enabled: true,
      reason: "Synthetic operational need",
      currentPassword: "fixture",
      confirmation: "HOLD CONTACT",
    };
    expect(contactMutation.safeParse(value).success).toBe(true);
    for (const extra of [
      { reason: "" },
      { confirmation: "RELEASE HOLD" },
      { revision: 0 },
      { currentPassword: "" },
    ])
      expect(contactMutation.safeParse({ ...value, ...extra }).success).toBe(
        false,
      );
    expect(contactInboxQuery.safeParse({ page: 10001 }).success).toBe(false);
  });
});
