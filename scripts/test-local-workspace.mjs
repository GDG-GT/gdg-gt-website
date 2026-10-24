import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { call, login, db } = await localHttp(),
  evidence = [];
const check = (value, name) => {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
};
const sql = ({ data, error }) => {
  if (error) throw new Error("Local fixture operation failed: " + error.code);
  return data;
};
const { user } = await login();
const foreign = randomUUID(),
  own = randomUUID(),
  other = randomUUID();
try {
  sql(
    await db
      .from("admin_users")
      .insert({
        id: foreign,
        email: "notification-fixture-" + foreign + "@example.test",
        role: "team_member",
        is_active: false,
        password_hash: "disabled-fixture-not-a-password",
      }),
  );
  sql(
    await db.from("notifications").insert([
      {
        id: own,
        user_id: user.id,
        type: "system",
        title: "Fictional notification",
        message: "Local test only",
        metadata: { privateTestMarker: "never-return-this" },
        link: "https://example.test/unsafe",
      },
      {
        id: other,
        user_id: foreign,
        type: "system",
        title: "Foreign account notification",
        message: "Must stay private",
      },
    ]),
  );
  let r = await call("/admin/dashboard", { anonymous: true });
  check(r.status === 401, "dashboard rejects anonymous readers");
  r = await call("/admin/dashboard");
  check(
    r.status === 200 &&
      r.json.data.widgets.events.state === "ready" &&
      r.json.data.widgets.activity.state === "ready",
    "dashboard loads real authorized widgets",
  );
  r = await call("/admin/me/sessions");
  check(
    r.status === 200 &&
      r.json.data.items.some((s) => s.current) &&
      !r.text.includes("token_hash"),
    "session list never exposes bearer hashes",
  );
  r = await call("/admin/me", { method: "PATCH", body: { role: "admin" } });
  check(r.status === 400, "self-service profile rejects privilege fields");
  r = await call("/admin/notifications");
  check(
    r.status === 200 &&
      r.json.data.items.some((n) => n.id === own) &&
      !r.text.includes(other),
    "notifications are account-scoped",
  );
  check(
    !r.text.includes("never-return-this") &&
      r.json.data.items.find((n) => n.id === own).link === null,
    "notification metadata and unsafe links are omitted",
  );
  r = await call("/admin/notifications/" + other, {
    method: "PATCH",
    body: { is_read: true },
  });
  check(r.status === 404, "cross-account notification mutation is concealed");
  r = await call("/admin/notifications/" + own, {
    method: "PATCH",
    body: { is_read: true },
  });
  check(
    r.status === 200 &&
      sql(
        await db.from("notifications").select("is_read").eq("id", own).single(),
      ).is_read,
    "own notification mutation persists",
  );
  r = await call("/admin/notifications", {
    method: "PATCH",
    body: { is_read: false },
  });
  check(r.status === 400, "notification mutation rejects unsupported state");
  r = await call("/admin/audit");
  check(
    r.status === 200 &&
      r.json.data.items.length > 0 &&
      !r.text.includes("password_hash"),
    "audit list returns bounded safe projections",
  );
  r = await call("/admin/audit/export?action=notifications.read");
  check(
    r.status === 200 &&
      r.headers.get("content-type").includes("text/csv") &&
      r.text.includes("notifications.read"),
    "audit export uses server-side filters",
  );
  r = await call(
    "/admin/audit?from=2026-12-01T00:00:00Z&to=2026-01-01T00:00:00Z",
  );
  check(r.status === 400, "audit rejects inverted date ranges");
  sql(
    await db
      .from("admin_users")
      .update({ role: "team_member" })
      .eq("id", user.id),
  );
  r = await call("/admin/dashboard");
  check(
    r.status === 200 &&
      !r.json.data.widgets.events &&
      r.json.data.widgets.finances?.state === "ready" &&
      r.json.data.allowedRoutes.includes("/admin/finances") &&
      r.json.data.allowedRoutes.includes("/admin/communications") &&
      !r.json.data.allowedRoutes.includes("/admin/users"),
    "revoked role removes ungranted event and user data while retaining SQL-scoped personal finances and communications",
  );
  r = await call("/admin/audit");
  check(r.status === 403, "current role is rechecked for audit access");
  r = await call("/admin/notifications");
  check(r.status === 200, "members retain access to their own notifications");
} finally {
  sql(
    await db.from("admin_users").update({ role: user.role }).eq("id", user.id),
  );
  await call("/admin/notifications/" + own, { method: "DELETE" });
  // Fixture account is inactive; retained audit records are not rewritten.
  sql(await db.from("notifications").delete().eq("id", other));
  await call("/auth/session", { method: "DELETE" });
}
await writeFile(
  new URL("../.docs/phase0/local-workspace-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real loopback HTTP and PostgreSQL. Only fictional development accounts and notifications used; role restored in finally. No external delivery.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
