import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  safeUrl,
  imageUrl,
  text,
  parse,
  queryValues,
  idempotency,
  databaseResult,
} from "../../server/lib/validation.mjs";

describe("SEC strict shared API validation and sanitized database failures", () => {
  it("allows empty optional URLs, HTTPS public links and known local assets, never credentials or private hosts", () => {
    expect(safeUrl.parse("")).toBe("");
    expect(safeUrl.parse("https://developers.google.com/docs")).toBeTruthy();
    expect(imageUrl.parse(null)).toBeNull();
    expect(imageUrl.parse("/assets/fictional-photo.webp")).toBe(
      "/assets/fictional-photo.webp",
    );
    for (const value of [
      "http://public.example.com",
      "https://u:p@example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://localhost",
      "https://private.internal",
      "https://name.test",
      "/assets/../private",
      "not a URL",
    ])
      expect(imageUrl.safeParse(value).success).toBe(false);
  });
  it("trims bounded text while preserving legitimate whitespace and rejects control or oversized payloads", () => {
    expect(text(20, 2).parse("  Fictional café  ")).toBe("Fictional café");
    expect(text(20).parse("line\nnext\tcolumn")).toBeTruthy();
    for (const value of [
      "a",
      "x".repeat(21),
      "ab" + String.fromCharCode(0),
      "ab" + String.fromCharCode(127),
    ])
      expect(text(20, 2).safeParse(value).success).toBe(false);
    expect(() =>
      parse(z.object({ allowed: z.string() }).strict(), {
        private: "untrusted secret",
      }),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        message: "Check the supplied fields.",
      }),
    );
  });
  it("rejects repeated or inherited-property query keys and accepts only exact typed shape", () => {
    expect(
      queryValues(
        new URLSearchParams("page=2"),
        z.object({ page: z.coerce.number() }).strict(),
      ),
    ).toEqual({ page: 2 });
    for (const query of [
      "page=1&page=2",
      "__proto__=value",
      "constructor=value",
    ])
      expect(() =>
        queryValues(
          new URLSearchParams(query),
          z.object({ page: z.string().optional() }).strict(),
        ),
      ).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("requires a bounded header idempotency key, never a body or repeated header substitute", () => {
    expect(
      idempotency({ headers: { "idempotency-key": "fictional-key-123456" } }),
    ).toBe("fictional-key-123456");
    for (const value of [
      undefined,
      [],
      ["fictional-key-123456"],
      "short",
      "a".repeat(129),
      "fictional key with spaces",
    ])
      expect(() =>
        idempotency({ headers: { "idempotency-key": value } }),
      ).toThrow(expect.objectContaining({ status: 400 }));
  });
  it("maps expected concurrency, constraints and policy errors without leaking database details", () => {
    expect(databaseResult({ data: { fixture: true }, error: null })).toEqual({
      fixture: true,
    });
    for (const [error, status, code] of [
      [{ code: "40P01", message: "private deadlock detail" }, 409, "CONFLICT"],
      [
        { code: "40001", message: "private serialization detail" },
        409,
        "CONFLICT",
      ],
      [{ code: "23505", message: "private unique detail" }, 409, "DUPLICATE"],
      [{ code: "42501", message: "private ACL detail" }, 403, "FORBIDDEN"],
      [{ code: "P0001", message: "FORBIDDEN" }, 403, "FORBIDDEN"],
      ...["23514", "23502", "22P02", "22023"].map((code) => [
        { code, message: "private constraint detail" },
        400,
        "VALIDATION_ERROR",
      ]),
      [{ code: "P0001", message: "RETENTION_HOLD" }, 409, "RETENTION_HOLD"],
      [{ code: "P0001", message: "FORM_FULL" }, 409, "FORM_FULL"],
      [
        { code: "42P01", message: "private schema detail" },
        503,
        "TEMPORARILY_UNAVAILABLE",
      ],
    ]) {
      try {
        databaseResult({ data: null, error });
        throw Error("Accepted failed query");
      } catch (result) {
        expect(result).toMatchObject({ status, code });
        expect(result.message).not.toContain("private");
      }
    }
  });
});
