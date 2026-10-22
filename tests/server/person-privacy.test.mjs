import { describe, it, expect } from "vitest";
import { privacyFormHashes } from "../../server/person-privacy.mjs";
import { riskHash } from "../../server/lib/security.mjs";
import { isAuthorized } from "../../server/lib/authorization.mjs";
import {
  personPrivacyReview,
  personPrivacyCommit,
  privacyConfirmation,
} from "../../shared/privacy.mjs";
const id = "f9200000-0000-4000-8000-000000000001";
describe("person-data privacy review", () => {
  const review = {
    email: " Fictional@Example.Test ",
    action: "export",
    purpose: "Fictional independently verified privacy request.",
    identityVerified: true,
    currentPassword: "fixture-only",
  };
  it("requires an explicit identity attestation and bounded exact-email review", () => {
    expect(personPrivacyReview.parse(review)).toMatchObject({
      email: "fictional@example.test",
      responseIds: [],
      includeSensitive: false,
    });
    for (const changes of [
      { identityVerified: false },
      { email: "*@example.test" },
      { purpose: "short" },
      { currentPassword: "" },
      { responseIds: [id, id] },
      { responseIds: Array(21).fill(id) },
      { responseIds: ["any-answer-containing-email"] },
    ])
      expect(
        personPrivacyReview.safeParse({ ...review, ...changes }).success,
      ).toBe(false);
  });
  it("never accepts caller-selected records/scopes or sensitive exports bundled into erasure", () => {
    for (const extra of [
      { recordIds: [id] },
      { includeFinance: true },
      { releaseHolds: true },
      { actorId: id },
      { sessionId: id },
    ])
      expect(
        personPrivacyReview.safeParse({ ...review, ...extra }).success,
      ).toBe(false);
    expect(
      personPrivacyReview.safeParse({
        ...review,
        action: "delete",
        includeSensitive: true,
      }).success,
    ).toBe(false);
  });
  it("final approval contains only a saved review capability and exact typed action/count", () => {
    expect(privacyConfirmation("delete", 5)).toBe("DELETE 5 RECORDS");
    expect(() => privacyConfirmation("archive", 5)).toThrow();
    const commit = {
      reviewId: id,
      reviewToken: "a".repeat(43),
      currentPassword: "fixture",
      confirmation: "DELETE 5 RECORDS",
    };
    expect(personPrivacyCommit.parse(commit)).toEqual(commit);
    expect(
      personPrivacyCommit.safeParse({
        ...commit,
        email: "replacement@example.test",
      }).success,
    ).toBe(false);
    expect(
      personPrivacyCommit.safeParse({ ...commit, reviewToken: id }).success,
    ).toBe(false);
  });
  it("privacy stays Super Admin-only even with a forged ordinary-team page grant", () => {
    for (const role of ["admin", "team_member", "blog_editor"])
      expect(
        isAuthorized({
          user: { id, role, is_active: true },
          resource: "privacy",
          route: "/admin/privacy",
          action: "view",
          grants: [
            {
              resource: "privacy",
              route: "/admin/privacy",
              page_access: true,
              actions: ["view"],
            },
          ],
        }),
      ).toBe(false);
    expect(
      isAuthorized({
        user: { id, role: "super_admin", is_active: true },
        resource: "privacy",
        action: "view",
      }),
    ).toBe(true);
  });
  it("matches historical access using exact per-form HMACs and complete bounded paging", async () => {
    const first = Array.from(
        { length: 500 },
        (_, index) => `fictional-form-${index}`,
      ),
      calls = [],
      secret = "fixture-only-secret";
    const hashes = await privacyFormHashes(
      {
        rpc: async (name, args) => {
          calls.push([name, args.p_offset]);
          return { data: args.p_offset ? [id] : first };
        },
      },
      "person@example.test",
      secret,
    );
    expect(calls).toEqual([
      ["person_privacy_form_keys", 0],
      ["person_privacy_form_keys", 500],
    ]);
    expect(hashes).toHaveLength(501);
    expect(hashes.at(-1)).toEqual({
      formId: id,
      emailHash: riskHash(`form-recipient:${id}:person@example.test`, secret),
    });
    expect(JSON.stringify(hashes)).not.toContain("person@example.test");
  });
  it("never silently returns a truncated historical identity lookup", async () => {
    await expect(
      privacyFormHashes(
        { rpc: async () => ({ data: Array(500).fill(id) }) },
        "person@example.test",
        "fixture-secret",
      ),
    ).rejects.toMatchObject({ code: "PRIVACY_RECORD_LIMIT" });
  });
});
