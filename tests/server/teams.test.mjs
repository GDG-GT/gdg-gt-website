import { describe, it, expect } from "vitest";
import { teamSchemas } from "../../server/teams.mjs";
import { isAuthorized } from "../../server/lib/authorization.mjs";
const confirmation = {
  currentPassword: "fixture password",
  revision: 1,
  confirmation: "Fictional team",
};
const grant = {
  path: "/admin/resources",
  resource: "resources",
  read: true,
  create: false,
  update: false,
  delete: false,
  extras: [],
};
describe("team administration input fences", () => {
  it("does not accept server identity or active-state mass assignment", () => {
    expect(
      teamSchemas.create.safeParse({
        currentPassword: "fixture",
        record: {
          name: "Fictional team",
          slug: "fictional-team",
          leadId: "d5000000-0000-4000-8000-000000000001",
          is_active: true,
        },
      }).success,
    ).toBe(false);
  });
  it("does not allow security or account grants", () => {
    for (const pair of [
      ["/admin/users", "admin_users"],
      ["/admin/audit-log", "audit"],
      ["/admin/site-status", "security"],
    ])
      expect(
        teamSchemas.action.safeParse({
          ...confirmation,
          action: "permissions",
          grants: [{ ...grant, path: pair[0], resource: pair[1] }],
        }).success,
      ).toBe(false);
  });
  it("requires a page/resource match and unique pages", () => {
    for (const grants of [[{ ...grant, resource: "events" }], [grant, grant]])
      expect(
        teamSchemas.action.safeParse({
          ...confirmation,
          action: "permissions",
          grants,
        }).success,
      ).toBe(false);
  });
  it("requires explicit edit permission for publication and exact special actions", () => {
    for (const change of [
      { extras: ["publish"] },
      { extras: ["manage_access"] },
      { extras: ["send_email"] },
      { extras: ["rotate_gate"] },
    ])
      expect(
        teamSchemas.action.safeParse({
          ...confirmation,
          action: "permissions",
          grants: [{ ...grant, ...change }],
        }).success,
      ).toBe(false);
  });
  it("accepts deliberate scoped forms response grants", () => {
    expect(
      teamSchemas.action.safeParse({
        ...confirmation,
        action: "permissions",
        grants: [
          {
            ...grant,
            path: "/admin/forms",
            resource: "forms",
            extras: ["view_responses", "view_sensitive_responses"],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("does not allow account roles in membership changes", () => {
    expect(
      teamSchemas.action.safeParse({
        currentPassword: "fixture",
        action: "member_add",
        revision: 1,
        email: "fixture@example.test",
        role: "super_admin",
      }).success,
    ).toBe(false);
  });
  it("allows own-team directory view without granting administration", () => {
    const context = {
      user: { id: "one", is_active: true, role: "team_member" },
      resource: "teams",
      memberships: [{ is_active: true, team: { is_active: true } }],
    };
    expect(isAuthorized(context)).toBe(true);
    expect(isAuthorized({ ...context, action: "update" })).toBe(false);
    expect(
      isAuthorized({
        ...context,
        memberships: [{ is_active: true, team: { is_active: false } }],
      }),
    ).toBe(false);
  });
});
