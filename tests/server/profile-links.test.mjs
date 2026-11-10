import { describe, expect, it } from "vitest";
import { normalizeProfileLink } from "../../shared/profile-links.mjs";
import { safeUrl } from "../../server/lib/validation.mjs";
describe("pasted profile web addresses", () => {
  it("accepts a pasted LinkedIn domain without changing already qualified links", () => {
    expect(normalizeProfileLink(" www.linkedin.com/in/fictional-person ")).toBe("https://www.linkedin.com/in/fictional-person");
    expect(normalizeProfileLink("github.com/fictional")).toBe("https://github.com/fictional");
    expect(normalizeProfileLink("https://example.org/path")).toBe("https://example.org/path");
    expect(normalizeProfileLink("/assets/profile.png")).toBe("/assets/profile.png"); expect(normalizeProfileLink("")).toBe("");
  });
  it("preserves validation for unsafe schemes, credentials and internal addresses", () => {
    for (const input of ["javascript:alert(1)", "http://example.org", "https://user:pass@example.org", "localhost", "127.0.0.1", "file:///etc/passwd"])
      expect(safeUrl.safeParse(normalizeProfileLink(input)).success, input).toBe(false);
  });
});
