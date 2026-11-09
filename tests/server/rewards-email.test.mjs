import { describe, expect, it, vi } from "vitest";
import {
  emailPassTicket,
  verifyEmailPassTicket,
  rewardCredentialMessage,
  emailedPass,
} from "../../server/rewards-email.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
import { emailDocument } from "../../shared/email.mjs";
const id = "e2100000-0000-4000-8000-000000000001",
  credential = "A".repeat(43),
  secret = "fictional-member-mail-encryption-secret";
const config = {
  origin: "https://gdggt.dev",
  rewardsOrigin: "https://leaderboards.gdggt.dev",
  encryptionSecret: secret,
};
const row = {
  id,
  kind: "card",
  name: "Fictional <Member>",
  email: "member@example.test",
  label: "Fictional",
  encryptedToken: encryptPayload({ credential }, secret),
  createdAt: new Date().toISOString(),
};
describe("Member credential mail and limited pass capability", () => {
  it("makes stable short-lived tickets and rejects tampering, expiry and overlong lifetime", () => {
    const now = Date.now(),
      ticket = emailPassTicket(id, new Date(now).toISOString(), secret);
    expect(verifyEmailPassTicket(ticket, secret, now)).toBe(id);
    expect(emailPassTicket(id, new Date(now).toISOString(), secret)).toBe(
      ticket,
    );
    expect(verifyEmailPassTicket(ticket + "A", secret, now)).toBeNull();
    expect(
      verifyEmailPassTicket(ticket, secret, now + 8 * 86400000),
    ).toBeNull();
    expect(verifyEmailPassTicket(ticket, "another-secret", now)).toBeNull();
    expect(
      verifyEmailPassTicket(
        emailPassTicket(id, new Date(now + 86400000).toISOString(), secret),
        secret,
        now,
      ),
    ).toBeNull();
  });
  it("only mails the leased current member and attaches a real PNG, inline and downloadable", async () => {
    const db = { rpc: vi.fn(async () => ({ data: row })) };
    const message = await rewardCredentialMessage(
      { id, lease_token: id, payload: { email: "forged@example.test" } },
      db,
      config,
      { from: "chapter@example.test" },
      {},
    );
    expect(message.to).toBe(row.email);
    expect(message.subject).toContain("card is registered");
    expect(message.html).toContain("cid:gdg-member-qr");
    expect(message.html).toContain("Fictional &lt;Member&gt;");
    expect(message.html).not.toContain("<Member>");
    expect(message.html).not.toContain(credential);
    expect(message.text).toContain("ending 0001");
    expect(message.attachments).toHaveLength(2);
    for (const attachment of message.attachments)
      expect(
        Buffer.from(attachment.content, "base64")
          .subarray(0, 8)
          .toString("hex"),
      ).toBe("89504e470d0a1a0a");
    expect(message.attachments[0].contentId).toBe("gdg-member-qr");
    expect(message.attachments[1].contentId).toBeUndefined();
  });
  it("suppresses revoked, stale or inaccessible queued deliveries", async () => {
    expect(
      await rewardCredentialMessage(
        { id, lease_token: id },
        { rpc: async () => ({ data: null }) },
        config,
        {},
        {},
      ),
    ).toBeNull();
  });
  it("rejects forged capabilities before any database read", async () => {
    const db = { rpc: vi.fn() };
    await expect(
      emailedPass({ ticket: "forged", provider: "qr", db, config, env: {} }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("returns only holder-scoped card metadata and the existing QR", async () => {
    const db = { rpc: async () => ({ data: row }) },
      ticket = emailPassTicket(id, row.createdAt, secret);
    expect(
      await emailedPass({ ticket, provider: "info", db, config, env: {} }),
    ).toEqual({
      name: row.name,
      reference: "0001",
      apple: false,
      google: false,
      googlePending: false,
    });
    expect(
      await emailedPass({ ticket, provider: "qr", db, config, env: {} }),
    ).toEqual({ credential });
    await expect(
      emailedPass({ ticket, provider: "google", db, config, env: {} }),
    ).rejects.toMatchObject({ code: "GOOGLE_WALLET_UNAVAILABLE" });
    await expect(
      emailedPass({
        ticket,
        provider: "qr",
        db: { rpc: async () => ({ data: null }) },
        config,
        env: {},
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("escapes content and rejects dangerous action links in the shared email shell", () => {
    const html = emailDocument({
      subject: "<script>bad()</script>",
      content: "<img src=x>\n\nhttps://gdggt.dev/events",
      actions: [
        { label: "Bad", url: "javascript:bad()" },
        { label: "Events", url: "https://gdggt.dev/events" },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('role="presentation"');
    expect(html).toContain('href="https://gdggt.dev/events"');
  });
});
