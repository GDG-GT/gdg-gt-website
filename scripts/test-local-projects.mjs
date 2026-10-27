import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { projectRecord } from "../shared/projects.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const root = await localHttp(),
  db = root.db,
  accounts = [],
  evidence = [];
let admin, member, outsider, editor, teamId, projectId, communityId;
let ledgerOwned = false;
const ledger = new URL("../.docs/local-project-review.local", import.meta.url);
async function writeEvidence(cleanedUp) {
  await writeFile(
    new URL("../.docs/phase0/local-projects-integration.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback HTTP checks with fictional scoped accounts, team, project and participant. No external links, invitations, mail or providers. Project/member/star history retained; exact fixture accounts/team archived and community participant deactivated. Quotas/jobs never reset.",
        projectId,
        cleanup: { completed: cleanedUp },
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
}
const base = "/admin/projects",
  record = projectRecord.parse({
    title: "Fictional chapter project",
    description:
      "A private fictional project for local workflow review. No real chapter work or external provider is used.",
    short_description: "Fictional private collaboration",
    tech_stack: ["TypeScript", "React"],
    tags: ["fictional"],
    category: "web",
    status: "active",
    team_size: 3,
    is_featured: true,
  });
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
      "Project request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
}
const post = (h, path, body, key = randomUUID()) =>
  h.call(path, { method: "POST", body, key });
async function actor(role) {
  const h = await localHttp(),
    id = randomUUID(),
    email = `fictional-project-${id}@example.test`,
    password = "Fictional-project-" + randomUUID();
  const r = await db.from("admin_users").insert({
    id,
    email,
    password_hash: await hashSecret(password),
    role,
    is_active: true,
    display_name: "Fictional project " + role,
  });
  if (r.error) throw Error("Account fixture failed");
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
const detail = async (h = member) => data(await h.call(base + "/" + projectId));
async function action(name, changes = {}, h = member) {
  const p = (await detail(h)).project;
  return post(h, base + "/" + projectId, {
    action: name,
    revision: p.revision,
    ...(["archive", "restore"].includes(name)
      ? { currentPassword: h.password, confirmation: p.title }
      : {}),
    ...changes,
  });
}
async function teamState(active) {
  const r = await db
    .from("admin_teams")
    .select("revision")
    .eq("id", teamId)
    .single();
  if (r.error) throw Error("Team fixture unavailable");
  const a = await db
    .from("admin_teams")
    .update({ is_active: active, revision: r.data.revision + 1 })
    .eq("id", teamId);
  if (a.error) throw Error("Team transition failed");
}
try {
  admin = await actor("admin");
  member = await actor("team_member");
  outsider = await actor("team_member");
  editor = await actor("blog_editor");
  teamId = randomUUID();
  communityId = randomUUID();
  for (const r of [
    await db.from("admin_teams").insert({
      id: teamId,
      name: "Fictional project team",
      slug: "fictional-project-" + teamId,
      created_by: admin.id,
    }),
    await db
      .from("team_memberships")
      .insert({ team_id: teamId, admin_user_id: member.id, role: "member" }),
    await db.from("team_page_access").insert({
      team_id: teamId,
      page_path: "/admin/projects",
      can_access: true,
    }),
    await db.from("team_permissions").insert({
      team_id: teamId,
      resource_type: "projects",
      permission: "crud",
      can_read: true,
      can_create: true,
      can_update: true,
      can_delete: true,
    }),
    await db.from("members").insert({
      id: communityId,
      name: "Fictional project participant",
      email: "fictional-project-" + communityId + "@example.test",
      is_active: true,
    }),
  ])
    if (r.error) throw Error("Scoped project fixtures unavailable");
  check(
    (await member.call(base, { anonymous: true })).status === 401,
    "anonymous private project listing denied",
  );
  check(
    (await editor.call(base)).status === 403,
    "Blog Editor has no project access",
  );
  check(
    (await post(member, base, { record, teamId, created_by: admin.id }))
      .status === 400,
    "client ownership injection rejected",
  );
  const key = randomUUID(),
    body = { record, teamId };
  projectId = data(await post(member, base, body, key)).id;
  check(
    data(await post(member, base, body, key)).id === projectId,
    "create replay returns the same project",
  );
  check(
    (
      await post(
        member,
        base,
        { record: { ...record, title: "Different" }, teamId },
        key,
      )
    ).status === 409,
    "changed idempotency payload conflicts",
  );
  check(
    data(await outsider.call(base)).total === 0 &&
      (await outsider.call(base + "/" + projectId)).status === 404,
    "outsiders cannot infer private details or counts",
  );
  check(
    data(await member.call(base + "?featured=true")).stats.technologies
      .TypeScript === 1,
    "filtered statistics include only currently authorized projects",
  );
  check(
    (await member.call(base + "?page=1&page=2")).status === 400,
    "duplicate filter keys rejected",
  );
  check(
    (
      await post(member, base + "/" + projectId, {
        action: "update",
        revision: 1,
        record: { ...record, stars_count: 999 },
      })
    ).status === 400,
    "star counters are not client writable",
  );
  check(
    (
      await post(member, base + "/" + projectId, {
        action: "update",
        revision: 1,
        record: { ...record, demo_url: "javascript:alert(1)" },
      })
    ).status === 400,
    "unsafe project URLs rejected",
  );
  check(
    (
      await post(member, base + "/" + projectId + "/members", {
        action: "update",
        revision: 1,
        record,
      })
    ).status === 400,
    "participant endpoint rejects unrelated actions",
  );
  const participant = "fictional-project-" + communityId + "@example.test";
  data(await action("member_save", { email: participant, role: "maintainer" }));
  let d = await detail();
  check(
    d.members.length === 1 &&
      d.members[0].role === "maintainer" &&
      !JSON.stringify(d).includes(participant),
    "participant management omits contact details",
  );
  const firstMember = d.members[0];
  data(await action("member_remove", { memberId: communityId }));
  d = await detail();
  check(
    d.members[0].active === false && d.project.memberCount === 0,
    "participant removal preserves inactive history",
  );
  data(await action("member_save", { email: participant, role: "reviewer" }));
  d = await detail();
  check(
    d.members.length === 1 &&
      d.members[0].id === firstMember.id &&
      d.members[0].active,
    "rejoining reuses the retained participant record",
  );
  check(
    (
      await action("member_save", {
        email: "fictional-absent@example.test",
        role: "contributor",
      })
    ).status === 404,
    "absent community member is not created or invited",
  );
  const revision = d.project.revision;
  data(await action("update", { record: { ...record, status: "completed" } }));
  check(
    (
      await post(member, base + "/" + projectId, {
        action: "update",
        revision,
        record,
      })
    ).status === 409,
    "stale project updates cannot overwrite a newer revision",
  );
  check(
    (
      await post(member, base + "/" + projectId, {
        action: "archive",
        revision: (await detail()).project.revision,
        currentPassword: "wrong",
        confirmation: record.title,
      })
    ).status === 403,
    "incorrect archive confirmation password is denied",
  );
  data(await action("archive"));
  check(
    data(await member.call(base)).total === 0 &&
      data(await member.call(base + "?state=trash")).total === 1,
    "archiving moves the record to scoped trash",
  );
  check(
    (await action("update", { record })).status === 409,
    "archived project cannot be silently rewritten",
  );
  data(await action("restore"));
  check(
    (await detail()).members[0].active,
    "restoring keeps participants and does not publish",
  );
  const star = await db.from("project_stars").insert({
    project_id: projectId,
    user_identifier: "fictional-" + randomUUID(),
  });
  if (star.error) throw Error("Star fixture failed");
  check(
    (await db.from("project_stars").select("id").eq("project_id", projectId))
      .data.length === 1,
    "private star records remain retained",
  );
  if (process.argv.includes("--hold-for-browser")) {
    await writeFile(
      ledger,
      JSON.stringify({
        email: admin.email,
        password: admin.password,
        projectId,
        title: record.title,
      }),
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    await writeEvidence(false);
    console.info(
      "BROWSER_ADMIN http://127.0.0.1:8080/admin/projects?project=" + projectId,
    );
    console.info(
      "Type change to stage an independent update, done to finish revocation checks.",
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
      if (line.trim() === "change") {
        data(
          await action("update", {
            record: {
              ...record,
              description:
                "Independent fictional project revision for stale editor verification.",
            },
          }),
        );
        check(
          true,
          "independent project update delivered during browser review",
        );
      }
    }
  }
  await teamState(false);
  check(
    (await member.call(base + "/" + projectId)).status === 404 &&
      (await detail(admin)).project.actions.join(",") === "read",
    "inactive team revokes ordinary access and keeps admin history read-only",
  );
  await teamState(true);
  check(
    (await member.call(base + "/" + projectId)).status === 200,
    "team restoration restores only explicitly granted private access",
  );
  const revoked = await db
    .from("team_permissions")
    .update({ can_update: false })
    .eq("team_id", teamId)
    .eq("resource_type", "projects");
  if (revoked.error) throw Error("Grant revocation failed");
  check(
    (await action("update", { record })).status === 403,
    "action revocation denies project mutations",
  );
  const removed = await db
    .from("team_memberships")
    .update({ is_active: false })
    .eq("team_id", teamId)
    .eq("admin_user_id", member.id);
  if (removed.error) throw Error("Membership revocation failed");
  check(
    (await member.call(base + "/" + projectId)).status === 404 &&
      data(await member.call(base)).total === 0,
    "membership removal revokes project history and counts",
  );
  check(
    (await admin.call(base + "/" + projectId, { method: "DELETE" })).status ===
      405,
    "permanent deletion has no application endpoint",
  );
  for (const path of ["/projects", "/api/v1/public/projects"]) {
    const r = await fetch(root.env.APP_ORIGIN + path);
    if (path.startsWith("/api"))
      check(r.status === 404, "no anonymous project API is exposed");
  }
} finally {
  if (projectId && admin) {
    const r = await admin.call(base + "/" + projectId);
    if (r.status === 200 && !r.json.data.project.deleted_at)
      data(await action("archive", {}, admin));
  }
  if (communityId) {
    const r = await db
      .from("members")
      .update({ is_active: false })
      .eq("id", communityId);
    if (r.error) throw Error("Community fixture deactivation failed");
  }
  if (teamId) {
    const r = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .maybeSingle();
    if (r.data) {
      const a = await db
        .from("admin_teams")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          revision: r.data.revision + 1,
        })
        .eq("id", teamId);
      if (a.error) throw Error("Team archive failed");
    }
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
    if (a.error || s.error) throw Error("Account archive failed");
  }
  if (ledgerOwned) await unlink(ledger);
  if (process.stdin.isTTY) process.stdin.pause();
}
await writeEvidence(true);
