import { describe, expect, it } from "vitest";
import { deliveryMessage } from "../../server/delivery.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
import { newsletterPreview } from "../../shared/newsletter.mjs";

describe("Branded subscription email", () => {
  it("offers one confirmation button with a plain-text alternative and the actual chapter mark", async () => {
    const secret = "fictional-newsletter-mail-secret",
      token = "a".repeat(43);
    const db = {
      from(table) {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          maybeSingle: async () => ({
            data: {
              consumed_at: null,
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            },
          }),
          single: async () => ({
            data: {
              email: "fictional@example.test",
              state: "pending",
              deleted_at: null,
              suppressed_at: null,
              team_id: null,
            },
          }),
        };
        expect(["newsletter_tokens", "newsletter_subscribers"]).toContain(
          table,
        );
        return query;
      },
    };
    const message = await deliveryMessage(
      {
        id: "fictional-job",
        kind: "newsletter_confirmation",
        payload: {
          tokenId: "fictional-token",
          subscriberId: "fictional-subscriber",
        },
        secret_payload: encryptPayload({ token }, secret),
      },
      db,
      { origin: "https://gdggt.dev", encryptionSecret: secret },
      { from: "noreply@example.test" },
    );
    const url = "https://gdggt.dev/newsletter/confirm#token=" + token;
    expect(message.to).toBe("fictional@example.test");
    expect(message.text).toContain(url);
    expect(message.html).toContain(`href="${url}"`);
    expect(message.html).toContain(">Confirm subscription</a>");
    expect(message.html).not.toContain(`>${url}</a>`);
    expect(message.html).toContain('src="https://gdggt.dev/logo.png"');
    expect(message.html).not.toContain("&lt;</span>");
  });
  it("keeps the real unsubscribe action without placeholder instructions", () => {
    const html = newsletterPreview(
      "Chapter update",
      "Fictional news",
      "https://gdggt.dev/newsletter/unsubscribe#token=fictional",
    );
    expect(html).toContain(
      'href="https://gdggt.dev/newsletter/unsubscribe#token=fictional"',
    );
    expect(html).not.toContain("Every campaign email");
    expect(html).not.toContain("confirmed your subscription");
  });
});

describe("transactional email actions", () => {
  const id = "f1510000-0000-4000-8000-000000000003",
    secret = "fictional-formatting-encryption-secret";
  const config = { origin: "https://gdggt.dev", encryptionSecret: secret };
  const mail = { from: "hello@gdggt.dev", chapter: "gdg@gatech.edu" };
  const cases = [
    {
      kind: "workspace_notice_email",
      button: "Open workspace",
      notice: {
        email: "fixture@example.test",
        kind: "due",
        link: "/admin/communications?tab=tasks&task=" + id,
      },
    },
    {
      kind: "chapter_announcement",
      button: "Read announcement",
      notice: { email: "fixture@example.test", announcementId: id },
    },
    {
      kind: "direct_message_notice",
      button: "Read message",
      notice: { email: "fixture@example.test", threadId: id },
    },
    {
      kind: "form_reviewed_email",
      button: "Review response",
      notice: {
        email: "fixture@example.test",
        purpose: "notification",
        title: "Fictional form",
        formId: id,
        version: 1,
        responseId: id,
        submittedAt: new Date().toISOString(),
        answers: [],
      },
    },
    {
      kind: "contact_notification",
      button: "Review inquiry",
      table: {
        name: "Fictional Member",
        email: "fixture@example.test",
        message: "Fictional inquiry",
        inquiry_type: "general",
      },
    },
  ];
  it.each(cases)(
    "renders $kind with one readable action instead of a raw URL",
    async ({ kind, button, notice, table }) => {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        single: async () => ({ data: table }),
      };
      const message = await deliveryMessage(
        { kind, id, lease_token: id, payload: { contactId: id } },
        { rpc: async () => ({ data: notice }), from: () => query },
        config,
        mail,
      );
      expect(message.html).toContain(`>${button}</a>`);
      expect(message.html).not.toContain(">https://gdggt.dev/");
      expect(message.html).toContain('src="https://gdggt.dev/logo.png"');
      expect(message.html).not.toContain("undefined");
    },
  );
});
