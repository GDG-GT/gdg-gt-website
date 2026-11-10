import { expect, it, vi } from "vitest";
import { token } from "../../server/lib/security.mjs";
import { eventRoutes } from "../../server/events.mjs";
const actor = "f1700000-0000-4000-8000-000000000001",
  team = "f1700000-0000-4000-8000-000000000002";
it.each(["admin", "team_member"])("searches event names without broadening %s access", async (role) => {
  const query = {};
  for (const method of ["select", "order", "ilike", "in"])
    query[method] = vi.fn(() => query);
  query.range = vi.fn(async () => ({ data: [], count: 0 }));
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async (name) => ({ data: name === "can_operate_event" ? true : { records: [], teams: [], globalCreate: role === "admin" } })),
  };
  const store = {
    validateSession: vi.fn(async () => ({ sessionId: actor, user: { id: actor, role, is_active: true } })),
    memberships: vi.fn(async () => [{ team_id: team }]),
  };
  const request = {
    method: "GET", url: "/api/v1/admin/events?" + new URLSearchParams({ q: "Hack_100%", page: "2" }),
    headers: { cookie: "__Host-gdg_session=" + token() },
  };
  const response = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await eventRoutes(request, response, { db, store, config: { origin: "https://chapter.example.test", sessionCookie: "__Host-gdg_session" }, requestId: actor });
  expect(query.ilike).toHaveBeenCalledWith("title", "%Hack\\_100\\%%");
  expect(query.range).toHaveBeenCalledWith(50, 99);
  if (role === "admin") expect(query.in).not.toHaveBeenCalled();
  else {
    expect(query.in).toHaveBeenCalledWith("team_id", [team]);
    expect(db.rpc).toHaveBeenCalledWith("can_operate_event", { p_actor: actor, p_action: "read", p_team: team });
  }
  expect(response.body.data).toMatchObject({ items: [], total: 0 });
});
