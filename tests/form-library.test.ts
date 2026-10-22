import { describe, it, expect } from "vitest";
import { createTemplate } from "../shared/forms";
import {
  formLibraryQuerySchema,
  formLibraryOptionsSchema,
  formTemplateSchema,
  formTemplateLabels,
} from "../shared/form-library.mjs";

describe("FORM-018 authorized library filter contracts", () => {
  it("keeps valid legacy empty requests and bounded paging", () => {
    expect(formLibraryQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    for (const input of [
      { page: 0 },
      { pageSize: 101 },
      { page: 10001 },
      { q: "x".repeat(101) },
      { q: "nul" + String.fromCharCode(0) },
      { secret: "no" },
    ])
      expect(formLibraryQuerySchema.safeParse(input).success).toBe(false);
  });
  it("supports exact owner/team/chapter and template origin without accepting SQL syntax or arbitrary identifiers", () => {
    const owner = crypto.randomUUID(),
      team = crypto.randomUUID();
    expect(
      formLibraryQuerySchema.parse({
        owner,
        team,
        template: "feedback",
        state: "Archived",
      }),
    ).toMatchObject({ owner, team, template: "feedback" });
    expect(
      formLibraryQuerySchema.parse({ team: "chapter", template: "unspecified" })
        .team,
    ).toBe("chapter");
    for (const input of [
      { owner: "someone@example.test" },
      { team: "other" },
      { template: "private-template" },
      { state: "all" },
    ])
      expect(formLibraryQuerySchema.safeParse(input).success).toBe(false);
  });
  it("uses real calendar days with inclusive same-day bounds and rejects reversed or malformed ranges", () => {
    for (const input of [
      { updatedFrom: "2024-02-29" },
      { updatedFrom: "2026-10-22", updatedTo: "2026-10-22" },
      { updatedTo: "9999-12-31" },
    ])
      expect(formLibraryQuerySchema.safeParse(input).success).toBe(true);
    for (const input of [
      { updatedFrom: "2026-02-29" },
      { updatedTo: "2026-02-30" },
      { updatedTo: "not-a-day" },
      { updatedFrom: "2026-10-23", updatedTo: "2026-10-22" },
      { updatedFrom: "2026-10-22T00:00:00Z" },
    ])
      expect(formLibraryQuerySchema.safeParse(input).success).toBe(false);
  });
  it("provides paginated/searchable owner and team options only, never a broad account-directory API", () => {
    expect(
      formLibraryOptionsSchema.parse({
        kind: "owner",
        q: "  Fictional  ",
        page: "2",
        pageSize: "20",
      }),
    ).toEqual({ kind: "owner", q: "Fictional", page: 2, pageSize: 20 });
    for (const input of [
      { kind: "email" },
      { kind: "owner", pageSize: 101 },
      { kind: "team", includePrivate: true },
      {},
    ])
      expect(formLibraryOptionsSchema.safeParse(input).success).toBe(false);
  });
  it("records each known template origin without inferring origins for historical forms", () => {
    for (const kind of formTemplateSchema.options) {
      expect(createTemplate("Fictional template", kind).templateKey).toBe(kind);
      expect(formTemplateLabels[kind]).toBeTruthy();
    }
    expect(formTemplateSchema.safeParse("unspecified").success).toBe(false);
  });
});
