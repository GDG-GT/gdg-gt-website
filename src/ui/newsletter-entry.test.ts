import { describe, expect, it } from "vitest";
import { newsletterEntryIntent } from "./newsletter-entry";

describe("newsletter and officer entry intent", () => {
  it("keeps ordinary email submissions in the newsletter flow", () => {
    expect(newsletterEntryIntent("student@example.test")).toBe("newsletter");
  });
  it("uses the shared server entry for email-shaped codes, with an optional direct gate shortcut", () => {
    expect(newsletterEntryIntent("fictional-officer@example.test")).toBe(
      "newsletter",
    );
    expect(newsletterEntryIntent("fictional-officer@example.test", true)).toBe(
      "gate",
    );
  });
  it("preserves the existing non-email gate entry", () => {
    expect(newsletterEntryIntent("fictional-access-code")).toBe("gate");
  });
});
