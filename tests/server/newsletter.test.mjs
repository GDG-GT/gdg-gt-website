import { describe, expect, it } from "vitest";
import { newsletterCsv } from "../../server/newsletter-results.mjs";
import {
  subscriberCreate,
  subscriberMutation,
  newsletterCampaign,
  newsletterList,
  newsletterPreview,
} from "../../shared/newsletter.mjs";
describe("Newsletter boundaries", () => {
  it("keeps spreadsheet formulas inert and quotes exported identities", () => {
    const csv = newsletterCsv([
      {
        email: "fictional@example.test",
        name: '=HYPERLINK("https://example.com")',
        state: "unsubscribed",
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain("token_hash");
  });
  it("only creates safe escaped email links and an individual unsubscribe footer", () => {
    const html = newsletterPreview(
      "Fixture",
      "https://example.com/?q=a&b=c\njavascript:alert(1)\nhttps://user:password@example.com/",
      "https://gdg.example.org/newsletter/unsubscribe#token=fixture",
    );
    expect(html).toContain('href="https://example.com/?q=a&amp;b=c"');
    expect(html).toContain(
      'href="https://gdg.example.org/newsletter/unsubscribe#token=fixture"',
    );
    expect(html).not.toContain('href="https://user:password');
    expect(html).not.toContain('href="javascript:');
  });
  it("never lets an administrator silently activate a subscriber", () => {
    const value = {
      teamId: null,
      email: "fictional@example.test",
      name: "Fixture",
      consentAcknowledged: true,
    };
    expect(subscriberCreate.safeParse(value).success).toBe(true);
    for (const extra of [
      { state: "active" },
      { is_active: true },
      { confirmed_at: new Date().toISOString() },
      { consentAcknowledged: false },
    ])
      expect(subscriberCreate.safeParse({ ...value, ...extra }).success).toBe(
        false,
      );
    expect(
      subscriberMutation.safeParse({
        action: "update",
        revision: 1,
        name: "Fixture",
        email: "other@example.test",
      }).success,
    ).toBe(false);
  });
  it("only accepts bounded confirmed-recipient selectors and plain subject lines", () => {
    const value = {
      subject: "Fictional newsletter",
      content: "Fixture only",
      audience: "all",
      recipientIds: [],
    };
    expect(newsletterCampaign.safeParse(value).success).toBe(true);
    for (const extra of [
      { html_content: "<script>bad</script>" },
      { subject: "Header\r\nBcc: bad" },
      { audience: "custom" },
      { recipientEmails: ["unconfirmed@example.test"] },
    ])
      expect(newsletterCampaign.safeParse({ ...value, ...extra }).success).toBe(
        false,
      );
    expect(newsletterList.safeParse({ page: 10001 }).success).toBe(false);
  });
  it("escapes every untrusted template value with a separate strict email pipeline", () => {
    const html = newsletterPreview(
      '<img src=x onerror="bad()">',
      "<script>bad()</script>\n<a href='javascript:bad'>link</a>",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a href=");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("unsubscribe");
  });
});
