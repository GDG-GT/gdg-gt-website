import { describe, it, expect } from "vitest";
import { auditQuery } from "../../server/workspace.mjs";
describe("audit query boundaries", () => {
  it("bounds pagination and rejects unknown filters", () => {
    expect(auditQuery.parse({})).toMatchObject({ page: 1, pageSize: 30 });
    for (const value of [
      { page: 0 },
      { pageSize: 101 },
      { secret: "x" },
      { actor: "not-an-id" },
      { action: "x,y" },
      { from: "2026-12-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    ])
      expect(auditQuery.safeParse(value).success).toBe(false);
  });
});
