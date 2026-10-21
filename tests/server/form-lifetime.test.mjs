import { describe, it, expect } from "vitest";
import { draftDaysRemaining } from "../../server/lib/form-lifetime.mjs";
const day = 86400000, now = Date.parse("2026-10-21T12:00:00Z");
describe("Stored incomplete-form expiry display", () => {
  it("does not inflate a two-day lifetime when database time is slightly ahead", () => {
    expect(draftDaysRemaining(now + 100, now + 100 + 2 * day, now)).toBe(2);
  });
  it("uses the actual remaining deadline for an older saved draft", () => {
    expect(draftDaysRemaining(now - 6 * day, now + 0.25 * day, now)).toBe(1);
    expect(draftDaysRemaining(now - 8 * day, now - day, now)).toBe(0);
  });
  it("never invents a deadline from malformed timestamps", () => {
    expect(draftDaysRemaining("bad", "bad", now)).toBe(0);
  });
});
