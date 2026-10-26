import { describe, it, expect } from "vitest";
import {
  eventInput,
  registrationInput,
  calendarFile,
} from "../../server/events.mjs";
import { csvCell } from "../../server/lib/csv.mjs";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
import { mailConfig } from "../../server/delivery.mjs";
describe("event and delivery safety", () => {
  it("rejects unsafe URLs, invalid slugs, and client-owned columns", () => {
    for (const row of [
      { event_link: "javascript:alert(1)" },
      { image_url: "http://insecure.example.test/p.jpg" },
      { slug: "../admin" },
      { created_by: "forged" },
      { publication_status: "published" },
      { revision: 99 },
      { previous_start_at: "2000-01-01T00:00:00Z" },
      { timezone: "Not/AZone" },
    ])
      expect(eventInput.safeParse(row).success).toBe(false);
    expect(
      eventInput.safeParse({
        event_link: "https://example.org/event",
        image_url: "/assets/event-community.jpg",
      }).success,
    ).toBe(true);
  });
  it("requires explicit registration consent and normalizes email", () => {
    const row = {
      name: "  Fixture Person ",
      email: " Person@Example.Test ",
      consent: true,
    };
    expect(registrationInput.parse(row)).toEqual({
      name: "Fixture Person",
      email: "person@example.test",
      consent: true,
      website: "",
    });
    for (const value of [
      { ...row, consent: false },
      { ...row, notes: "x".repeat(2001) },
      { ...row, role: "admin" },
    ])
      expect(registrationInput.safeParse(value).success).toBe(false);
  });
  it("escapes and folds calendar content by UTF-8 octets and carries sequence/timezone", () => {
    const content = calendarFile(
      {
        id: "fixture",
        slug: "fixture",
        title: "A, title;\nInjected: " + "学".repeat(60),
        description: "Line1\nLine2",
        start_at: "2026-11-01T10:00:00-05:00",
        end_at: "2026-11-01T11:00:00-05:00",
        updated_at: "2026-10-19T12:00:00Z",
        timezone: "America/New_York",
        revision: 4,
        location: "Room, 2",
      },
      "https://chapter.example.test",
    );
    expect(content).toContain("DTSTART:20261101T150000Z");
    expect(content).toContain("SEQUENCE:4");
    expect(content).toContain("X-WR-TIMEZONE:America/New_York");
    for (const line of content.split("\r\n"))
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(content).toContain("SUMMARY:A\\, title\\;\\nInjected:");
    expect(content).toContain("STATUS:CONFIRMED");
  });
  it("exports a cancellation status without changing stable calendar identity", () => {
    const event = {
      id: "fixture",
      slug: "fixture",
      title: "Fictional cancelled",
      description: "Cancelled fixture",
      start_at: "2030-01-01T18:00:00Z",
      updated_at: "2026-10-26T00:00:00Z",
      timezone: "America/New_York",
      revision: 9,
      publication_status: "cancelled",
    };
    const content = calendarFile(event, "https://chapter.example.test");
    expect(content).toContain("STATUS:CANCELLED");
    expect(content).toContain("UID:fixture@chapter.example.test");
    expect(content).toContain("SEQUENCE:9");
  });
  it("neutralizes spreadsheet formula prefixes in every exported string", () => {
    for (const value of [
      "=SUM(1,2)",
      "+1",
      "-1",
      "@A1",
      "\tformula",
      "\rformula",
    ])
      expect(csvCell(value)).toBe("\"'" + value.replace(/"/g, '""') + '"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("encrypts queued tokens with authentication and rejects tampering or a wrong key", () => {
    const secret = "test-secret-for-encryption-only-12345",
      value = { token: "not-a-real-token" };
    const encrypted = encryptPayload(value, secret);
    expect(encrypted).not.toContain(value.token);
    expect(decryptPayload(encrypted, secret)).toEqual(value);
    expect(() => decryptPayload(encrypted, secret + "wrong")).toThrow();
    expect(() =>
      decryptPayload(encrypted.slice(0, -4) + "AAAA", secret),
    ).toThrow();
  });
  it("cannot use the local mail catcher with production or a remote database", () => {
    for (const env of [
      {
        NODE_ENV: "production",
        MAIL_MODE: "local",
        SUPABASE_URL: "http://127.0.0.1:54361",
      },
      {
        NODE_ENV: "development",
        MAIL_MODE: "local",
        SUPABASE_URL: "https://remote.example.test",
      },
    ])
      expect(() => mailConfig(env)).toThrow();
    expect(() =>
      mailConfig({
        MAIL_MODE: "resend",
        RESEND_API_KEY: "unapproved",
        FROM_EMAIL: "chapter@example.test",
      }),
    ).toThrow();
  });
});
