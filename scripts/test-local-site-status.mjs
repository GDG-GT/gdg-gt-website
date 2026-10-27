import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const root = await localHttp(),
  db = root.db,
  accounts = [],
  evidence = [];
let admin,
  member,
  editor,
  outsider,
  teamId,
  profileId,
  original,
  lastRevision,
  changed = false;
const ledger = new URL(
  "../.docs/local-site-status-review.local",
  import.meta.url,
);
let ledgerOwned = false;
async function writeEvidence(cleanedUp) {
  await writeFile(
    new URL(
      "../.docs/phase0/local-site-status-integration.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        note: "Actual dedicated loopback HTTP checks with fictional operators/team/Linktree. Public maintenance was temporarily enabled and the exact original configuration restored with revision fencing. No external destination or provider was loaded and no email was sent. Fixture accounts/team/profile recoverably archived. Rate limits and jobs were not reset.",
        cleanup: { completed: cleanedUp },
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
}
const path = "/admin/site-status",
  username = "fictional-status-" + randomUUID().slice(0, 8),
  message =
    "Fictional local availability review. We are verifying maintenance routing; no real chapter outage or external provider is involved.";
const fields = (s) => ({
  is_live: s.is_live,
  message: s.message,
  redirect_url: s.redirect_url,
  button_text: s.button_text,
  auto_redirect: s.auto_redirect,
});
const record = {
  is_live: false,
  message,
  redirect_url: "https://www.gatech.edu/",
  button_text: "Georgia Tech updates",
  auto_redirect: false,
};
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal.");
function check(ok, name) {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function data(r) {
  if (r.status !== 200)
    throw Error(
      "Status request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
}
const post = (h, p, body, key = randomUUID()) =>
  h.call(p, { method: "POST", body, key });
const patch = (h, body, key = randomUUID()) =>
  h.call(path, { method: "PATCH", body, key });
async function actor(role) {
  const h = await localHttp(),
    id = randomUUID(),
    email = `fictional-status-${id}@example.test`,
    password = "Fictional-status-" + randomUUID();
  const r = await db.from("admin_users").insert({
    id,
    email,
    password_hash: await hashSecret(password),
    role,
    is_active: true,
    display_name: "Fictional status " + role,
  });
  if (r.error) throw Error("Status account fixture failed");
  accounts.push(id);
  data(
    await h.call("/auth/gate", {
      method: "POST",
      body: { code: root.credentials.gateCode },
    }),
  );
  data(
    await h.call("/auth/login", { method: "POST", body: { email, password } }),
  );
  return { ...h, id, email, password };
}
const body = (r, revision = lastRevision) => ({
  revision,
  record: r,
  currentPassword: admin.password,
  confirmation: r.is_live ? "LIVE" : "MAINTENANCE",
});
async function change(r) {
  const saved = data(await patch(admin, body(r)));
  lastRevision = saved.revision;
  changed = true;
  return saved;
}
try {
  admin = await actor("admin");
  member = await actor("team_member");
  editor = await actor("blog_editor");
  outsider = await actor("team_member");
  original = data(await admin.call(path));
  lastRevision = original.revision;
  check(
    (await admin.call(path, { anonymous: true })).status === 401,
    "anonymous access to operator configuration denied",
  );
  check(
    (await editor.call(path)).status === 403 &&
      (await outsider.call(path)).status === 403,
    "ungranted and Blog Editor accounts denied",
  );
  teamId = randomUUID();
  for (const r of [
    await db.from("admin_teams").insert({
      id: teamId,
      name: "Fictional availability operators",
      slug: "fictional-status-" + teamId,
      created_by: admin.id,
    }),
    await db
      .from("team_memberships")
      .insert({ team_id: teamId, admin_user_id: member.id, role: "member" }),
    await db.from("team_page_access").insert({
      team_id: teamId,
      page_path: "/admin/site-status",
      can_access: true,
    }),
    await db.from("team_permissions").insert({
      team_id: teamId,
      resource_type: "site_status",
      permission: "crud",
      can_read: true,
      can_update: false,
    }),
  ])
    if (r.error) throw Error("Status scope fixtures unavailable");
  check(
    data(await member.call(path)).canUpdate === false,
    "read grant does not imply global update authority",
  );
  check(
    (await patch(member, { ...body(record), currentPassword: member.password }))
      .status === 403,
    "read-only team operator cannot change the site",
  );
  check(
    (
      await patch(admin, {
        ...body(record),
        currentPassword: "fictional-wrong",
      })
    ).status === 403,
    "incorrect confirmation password denied",
  );
  check(
    (
      await patch(
        admin,
        body({ ...record, redirect_url: "https://evil.example/" }),
      )
    ).status === 400,
    "non-allowlisted external destinations rejected",
  );
  check(
    (await patch(admin, body({ ...record, auto_redirect: true }))).status ===
      400,
    "automatic off-site redirects rejected",
  );
  check(
    (await patch(admin, { ...body(record), confirmation: "LIVE" })).status ===
      400,
    "typed mode must match the selected state",
  );
  check(
    (await patch(admin, body({ ...record, redirect_url: "/maintenance" })))
      .status === 400,
    "maintenance redirect loops rejected",
  );
  check(
    (
      await patch(
        admin,
        body({ ...record, redirect_url: "/l/fictional-status-unknown" }),
      )
    ).status === 404,
    "unpublished local destinations rejected",
  );
  const key = randomUUID(),
    document = body(record),
    saved = data(await patch(admin, document, key));
  lastRevision = saved.revision;
  changed = true;
  check(
    data(await patch(admin, document, key)).revision === lastRevision,
    "availability changes replay without another revision",
  );
  check(
    (await patch(admin, document)).status === 409,
    "stale status changes cannot overwrite a newer revision",
  );
  let pub = data(await admin.call("/site-status", { anonymous: true }));
  check(
    pub.is_live === false &&
      pub.message === message &&
      !("canUpdate" in pub) &&
      !("updatedAt" in pub) &&
      !("updated_by" in pub),
    "public state excludes operator identity and permissions",
  );
  check(
    data(await admin.call("/health", { anonymous: true })).ok === true,
    "health endpoint remains available during maintenance",
  );
  check(
    (await admin.call(path)).status === 200,
    "authenticated operator route remains available during maintenance",
  );
  check(
    data(
      await admin.call("/newsletter/subscriptions", {
        method: "POST",
        key: randomUUID(),
        body: { email: root.credentials.gateCode },
      }),
    ).gateValid === true,
    "normal footer entry still recognizes the configured gate during maintenance",
  );
  const profileRecord = {
    username,
    displayName: "Fictional maintenance links",
    bio: "Fictional local routing review only.",
    avatarUrl: "",
    background: { type: "color", value: "#f8d8c6" },
    theme: "light",
  };
  profileId = data(
    await post(admin, "/admin/linktree/profiles", {
      teamId: null,
      record: profileRecord,
    }),
  ).id;
  const publish = await post(admin, "/admin/linktree/profiles/" + profileId, {
    action: "publish",
    revision: 1,
    currentPassword: admin.password,
    confirmation: profileRecord.displayName,
  });
  data(publish);
  let hidden = false;
  async function automatic() {
    await change({
      ...record,
      redirect_url: "/l/" + username,
      auto_redirect: true,
    });
    pub = data(await admin.call("/site-status", { anonymous: true }));
    check(
      pub.auto_redirect && pub.redirect_url === "/l/" + username,
      "active local Linktree can be an automatic escape destination",
    );
  }
  async function hide() {
    const d = data(await admin.call("/admin/linktree/profiles/" + profileId));
    data(
      await post(admin, "/admin/linktree/profiles/" + profileId, {
        action: "unpublish",
        revision: d.profile.revision,
        currentPassword: admin.password,
        confirmation: profileRecord.displayName,
      }),
    );
    hidden = true;
    pub = data(await admin.call("/site-status", { anonymous: true }));
    check(
      !pub.auto_redirect && pub.redirect_url === "",
      "deactivated Linktree falls back to maintenance rather than redirecting to a missing page",
    );
  }
  if (process.argv.includes("--hold-for-browser")) {
    await writeFile(
      ledger,
      JSON.stringify({
        email: admin.email,
        password: admin.password,
        accounts,
        teamId,
        profileId,
        original,
        lastRevision,
        message,
      }),
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    await writeEvidence(false);
    console.info("BROWSER_ADMIN http://127.0.0.1:8080/admin/site-status");
    console.info("BROWSER_PUBLIC http://127.0.0.1:8080/events");
    console.info(
      "Type auto to enable the fictional local destination, hide to deactivate it, done to restore the original availability.",
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of rl) {
      if (line.trim() === "done") {
        rl.close();
        break;
      }
      if (line.trim() === "auto") await automatic();
      if (line.trim() === "hide") await hide();
      if (line.trim() === "change") {
        await change({
          ...record,
          button_text: "Fictional revised update link",
        });
        check(
          true,
          "independent availability revision delivered during browser review",
        );
      }
      await writeFile(
        ledger,
        JSON.stringify({
          email: admin.email,
          password: admin.password,
          accounts,
          teamId,
          profileId,
          original,
          lastRevision,
          message,
        }),
        { mode: 0o600 },
      );
    }
  }
  if (
    !data(await admin.call("/site-status", { anonymous: true }))
      .auto_redirect &&
    !hidden
  )
    await automatic();
  if (!hidden) await hide();
  const grant = await db
    .from("team_permissions")
    .update({ can_update: true })
    .eq("team_id", teamId)
    .eq("resource_type", "site_status");
  if (grant.error) throw Error("Operator grant update failed");
  check(
    data(await member.call(path)).canUpdate === true,
    "explicit current team update grant is honored",
  );
  const revoke = await db
    .from("team_memberships")
    .update({ is_active: false })
    .eq("team_id", teamId)
    .eq("admin_user_id", member.id);
  if (revoke.error) throw Error("Operator membership revocation failed");
  check(
    (await member.call(path)).status === 403,
    "membership removal revokes operator access immediately",
  );
} finally {
  if (changed && original && admin) {
    const current = data(await admin.call(path));
    if (current.revision !== lastRevision || current.message !== message)
      throw Error(
        "Availability changed outside this test; original configuration was not overwritten.",
      );
    await change(fields(original));
    changed = false;
    check(
      data(await admin.call(path)).is_live === original.is_live,
      "exact original availability configuration restored",
    );
  }
  if (profileId && admin) {
    const d = data(await admin.call("/admin/linktree/profiles/" + profileId));
    if (!d.profile.deletedAt)
      data(
        await post(admin, "/admin/linktree/profiles/" + profileId, {
          action: "archive",
          revision: d.profile.revision,
          currentPassword: admin.password,
          confirmation: d.profile.displayName,
        }),
      );
  }
  if (teamId) {
    const r = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .single();
    if (r.error) throw Error("Operator fixture state unavailable");
    const a = await db
      .from("admin_teams")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        revision: r.data.revision + 1,
      })
      .eq("id", teamId);
    if (a.error) throw Error("Operator fixture archive failed");
  }
  if (accounts.length) {
    const a = await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", accounts),
      s = await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", accounts)
        .is("revoked_at", null);
    if (a.error || s.error)
      throw Error("Status account fixture archive failed");
  }
  if (ledgerOwned) await unlink(ledger);
  if (process.stdin.isTTY) process.stdin.pause();
}
await writeEvidence(true);
