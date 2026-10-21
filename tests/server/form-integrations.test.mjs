import { describe, it, expect } from "vitest";
import { formIntegrationInput } from "../../server/form-integrations.mjs";
const value = { revision: 0, formId: "f7100000-0000-4000-8000-000000000001", versionPolicy: "latest_published", label: "Open form" };
describe("Internal form-reference boundary", () => {
  it("requires an explicit published-only version policy", () => {
    expect(formIntegrationInput.safeParse(value).success).toBe(true);
    for (const versionPolicy of ["draft", "latest", 1, undefined]) expect(formIntegrationInput.safeParse({ ...value, versionPolicy }).success).toBe(false);
  });
  it("does not accept copied definitions, access tokens or caller authority", () => {
    for (const extra of [{ definition: {} }, { accessToken: "fake" }, { actorId: value.formId }, { teamId: value.formId }, { ownerId: value.formId }])
      expect(formIntegrationInput.safeParse({ ...value, ...extra }).success).toBe(false);
  });
  it("bounds labels and optimistic revisions", () => {
    for (const patch of [{ label: " " }, { label: "x".repeat(81) }, { revision: -1 }, { revision: "0" }, { formId: "bad" }])
      expect(formIntegrationInput.safeParse({ ...value, ...patch }).success).toBe(false);
  });
});
