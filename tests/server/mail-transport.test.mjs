import { afterEach, describe, expect, it, vi } from "vitest";
import { deliveryCategory } from "../../server/delivery.mjs";
import {
  createMailTransport,
  mailConfig,
} from "../../server/lib/mail-transport.mjs";
const env = {
  MAIL_MODE: "resend",
  EMAIL_SEND_ENABLED: "true",
  RESEND_API_KEY: "re_fictional_unit_test_only",
  FROM_EMAIL: "chapter@example.test",
  REPLY_TO_EMAIL: "reply@example.test",
};
afterEach(() => vi.unstubAllGlobals());
describe("shared server mail transport", () => {
  it("sends with server-owned sender, stable provider retry key and bounded abort signal", async () => {
    const fake = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "fictional-provider-id" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fake);
    const transport = createMailTransport(env);
    expect(
      await transport.send(
        {
          to: "fictional@example.test",
          subject: "Fixture",
          text: "Only a unit test",
          from: "forged@example.test",
          replyTo: "forged@example.test",
          attachments: [
            {
              filename: "member-inline.png",
              content: "ZmFrZQ==",
              contentType: "image/png",
              contentId: "gdg-member-qr",
            },
            {
              filename: "member.png",
              content: "ZmFrZQ==",
              contentType: "image/png",
            },
          ],
        },
        { jobId: "fixture", idempotencyKey: "gdg-newsletter-fixture" },
      ),
    ).toBe("fictional-provider-id");
    const [url, options] = fake.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.get("Idempotency-Key")).toBe(
      "gdg-newsletter-fixture",
    );
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({
      from: env.FROM_EMAIL,
      reply_to: env.REPLY_TO_EMAIL,
    });
    expect(options.body).not.toContain("forged@");
    expect(JSON.parse(options.body).attachments).toEqual([
      {
        filename: "member-inline.png",
        content: "ZmFrZQ==",
        content_type: "image/png",
        content_id: "gdg-member-qr",
      },
      {
        filename: "member.png",
        content: "ZmFrZQ==",
        content_type: "image/png",
      },
    ]);
    transport.close();
  });
  it("maps permanent provider rejects without retaining their sensitive response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              name: "validation_error",
              message: "fixture private email payload",
            }),
            { status: 400 },
          ),
      ),
    );
    const transport = createMailTransport(env);
    const error = await transport
      .send(
        { to: "fictional@example.test", subject: "Fixture", text: "Test" },
        { jobId: "fixture", idempotencyKey: "gdg-newsletter-fixture" },
      )
      .catch((e) => e);
    expect(error.permanent).toBe(true);
    expect(error.message).not.toContain("private");
    transport.close();
  });
  it("rejects header injection, a remote local-mail target and disabled production sends", () => {
    expect(() =>
      mailConfig({
        ...env,
        REPLY_TO_EMAIL: "test@example.test\r\nBcc:bad@example.test",
      }),
    ).toThrow();
    expect(() =>
      mailConfig({
        ...env,
        MAIL_MODE: "local",
        NODE_ENV: "production",
        SUPABASE_URL: "http://127.0.0.1:54361",
      }),
    ).toThrow();
    expect(() => mailConfig({ ...env, EMAIL_SEND_ENABLED: "false" })).toThrow();
  });
});

describe("purpose-specific chapter senders", () => {
  it.each([
    "forms",
    "newsletter",
    "contact",
    "id",
    "accounts",
    "events",
    "workspace",
  ])(
    "uses the verified sender domain for %s and routes replies to the chapter",
    async (category) => {
      const fake = vi.fn(
        async () =>
          new Response(JSON.stringify({ id: "fictional-provider" }), {
            status: 200,
          }),
      );
      vi.stubGlobal("fetch", fake);
      const transport = createMailTransport({
        ...env,
        FROM_EMAIL: "hello@gdggt.dev",
        REPLY_TO_EMAIL: "gdg@gatech.edu",
      });
      await transport.send(
        {
          to: "fictional@example.test",
          subject: "Fixture",
          text: "Fixture",
          from: "spoof@other.test",
        },
        { jobId: "fixture", idempotencyKey: "fictional-" + category, category },
      );
      expect(JSON.parse(fake.mock.calls[0][1].body)).toMatchObject({
        from: `GDG at Georgia Tech <${category}@gdggt.dev>`,
        reply_to: "gdg@gatech.edu",
      });
      transport.close();
    },
  );
  it("rejects arbitrary category values before making a provider request", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);
    const transport = createMailTransport(env);
    await expect(
      transport.send(
        { to: "fixture@example.test" },
        {
          jobId: "fixture",
          idempotencyKey: "fixture",
          category: "spoof@other.test",
        },
      ),
    ).rejects.toThrow("Unknown server email category");
    expect(fake).not.toHaveBeenCalled();
    transport.close();
  });
});

describe("transactional job sender routing", () => {
  it.each([
    ["form_access", "forms"],
    ["form_reviewed_email", "forms"],
    ["form_respondent_copy", "forms"],
    ["newsletter_confirmation", "newsletter"],
    ["newsletter_campaign", "newsletter"],
    ["newsletter_test", "newsletter"],
    ["contact_acknowledgment", "contact"],
    ["contact_notification", "contact"],
    ["reward_credential_email", "id"],
    ["account_access", "accounts"],
    ["team_invite", "accounts"],
    ["event_confirmation", "events"],
    ["event_message", "events"],
    ["event_push_verification", "events"],
    ["workspace_notice_email", "workspace"],
    ["chapter_announcement", "workspace"],
    ["direct_message_notice", "workspace"],
  ])("routes %s through %s", (kind, category) =>
    expect(deliveryCategory(kind)).toBe(category),
  );
});
