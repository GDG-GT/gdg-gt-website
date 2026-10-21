import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { communityMemberRecord } from "../shared/members.mjs";
import { projectRecord } from "../shared/projects.mjs";
const root = await localHttp(),
  db = root.db,
  accounts = [],
  owned = [],
  profiles = [],
  evidence = [],
  suffix = randomUUID().slice(0, 8);
let admin, lead, outsider, editor, teamId, sourceId, targetId, projectId;
const base = "/admin/members",
  profileBase = "/admin/content-records/team-profiles",
  sourceEmail = "fictional-community-source-" + suffix + "@example.test",
  targetEmail = "fictional-community-target-" + suffix + "@example.test";
const sourceRecord = communityMemberRecord.parse({
    name: "Fictional community source " + suffix,
    email: sourceEmail,
    phone: "Fictional private phone " + suffix,
    year: "Senior",
    major: "Fictional private major",
    category: "member",
    interests: ["Web, AI", "Community"],
    is_core_team: true,
  }),
  targetRecord = communityMemberRecord.parse({
    name: "Fictional canonical member " + suffix,
    email: targetEmail,
    year: "Junior",
    major: "Fictional target major",
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
      "Member request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
}
const post = (h, path, body, key = randomUUID(), method = "POST") =>
  h.call(path, { method, body, key });
async function actor(role) {
  const h = await localHttp(),
    id = randomUUID(),
    email = `fictional-members-${id}@example.test`,
    password = "Fictional-members-" + randomUUID();
  const r = await db
    .from("admin_users")
    .insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role,
      is_active: true,
      display_name: "Fictional community " + role,
    });
  if (r.error) throw Error("Community account fixture failed");
  accounts.push(id);
  data(await post(h, "/auth/gate", { code: root.credentials.gateCode }));
  data(await post(h, "/auth/login", { email, password }));
  return { ...h, id, email, password };
}
const detail = async (id = sourceId, h = lead) =>
  data(await h.call(base + "/" + id)).member;
const projectionFields = (m) =>
  Object.fromEntries(Object.keys(targetRecord).map((k) => [k, m[k] ?? ""]));
async function change(
  action,
  changes = {},
  id = sourceId,
  h = lead,
  key = randomUUID(),
) {
  const m = await detail(id, h),
    body = {
      action,
      revision: m.revision,
      ...(["archive", "restore", "sync_profile", "unmerge"].includes(action)
        ? {
            currentPassword: h.password,
            confirmation: m.reference,
            ...(action === "sync_profile" && m.publicProfile
              ? { profileRevision: m.publicProfile.revision }
              : {}),
          }
        : {}),
      ...changes,
    };
  return post(h, base + "/" + id, body, key);
}
async function create(record, h = lead, team = teamId) {
  const r = data(await post(h, base, { record, teamId: team }));
  owned.push(r.id);
  return r.id;
}
async function grantProfile(read = true) {
  const current = await db
    .from("team_permissions")
    .select("id")
    .eq("team_id", teamId)
    .eq("resource_type", "team_members")
    .eq("permission", "crud")
    .maybeSingle();
  if (current.error) throw Error("Profile grant state unavailable");
  if (!current.data) {
    for (const r of [
      await db
        .from("team_page_access")
        .insert({
          team_id: teamId,
          page_path: "/admin/team",
          can_access: true,
        }),
      await db
        .from("team_permissions")
        .insert({
          team_id: teamId,
          resource_type: "team_members",
          permission: "crud",
          can_read: read,
          can_create: true,
          can_update: true,
          can_delete: true,
        }),
    ])
      if (r.error) throw Error("Profile fixture grant unavailable");
  } else {
    const r = await db
      .from("team_permissions")
      .update({ can_read: read })
      .eq("id", current.data.id);
    if (r.error) throw Error("Profile grant transition failed");
  }
}
async function profile(id = profiles[0]) {
  return data(await admin.call(profileBase + "/" + id)).record;
}
async function profileAction(action, id = profiles[0]) {
  const p = await profile(id);
  return post(
    admin,
    profileBase + "/" + id,
    { action, revision: p.revision },
    randomUUID(),
    action === "archive" ? "DELETE" : "POST",
  );
}
async function teamState(active) {
  const r = await db
    .from("admin_teams")
    .select("revision")
    .eq("id", teamId)
    .single();
  if (r.error) throw Error("Community team state unavailable");
  const a = await db
    .from("admin_teams")
    .update({ is_active: active, revision: r.data.revision + 1 })
    .eq("id", teamId);
  if (a.error) throw Error("Community team transition failed");
}
async function preview(h = admin, key = randomUUID(), target = targetId) {
  const a = await detail(sourceId, h),
    b = await detail(target, h);
  return post(
    h,
    base + "/merge-preview",
    {
      sourceId: a.id,
      targetId: b.id,
      sourceRevision: a.revision,
      targetRevision: b.revision,
    },
    key,
  );
}
try {
  admin = await actor("admin");
  lead = await actor("team_member");
  outsider = await actor("team_member");
  editor = await actor("blog_editor");
  teamId = randomUUID();
  for (const r of [
    await db
      .from("admin_teams")
      .insert({
        id: teamId,
        name: "Fictional community team " + suffix,
        slug: "fictional-community-" + teamId,
        created_by: admin.id,
      }),
    await db
      .from("team_memberships")
      .insert({ team_id: teamId, admin_user_id: lead.id, role: "lead" }),
    await db
      .from("team_page_access")
      .insert({
        team_id: teamId,
        page_path: "/admin/members",
        can_access: true,
      }),
    await db
      .from("team_permissions")
      .insert({
        team_id: teamId,
        resource_type: "members",
        permission: "crud",
        can_read: true,
        can_create: true,
        can_update: true,
        can_delete: true,
      }),
  ])
    if (r.error) throw Error("Community scope fixtures unavailable");
  check(
    (await lead.call(base, { anonymous: true })).status === 401,
    "anonymous community inventory denied",
  );
  check(
    (await editor.call(base)).status === 403,
    "Blog Editor cannot read community records",
  );
  check(
    (
      await post(lead, base, {
        record: { ...sourceRecord, admin_user_id: admin.id },
        teamId,
      })
    ).status === 400,
    "community creation rejects account linkage injection",
  );
  const createKey = randomUUID(),
    createBody = {
      record: {
        ...sourceRecord,
        email: "  " + sourceEmail.toUpperCase() + "  ",
      },
      teamId,
    };
  sourceId = data(await post(lead, base, createBody, createKey)).id;
  owned.push(sourceId);
  check(
    data(await post(lead, base, createBody, createKey)).id === sourceId,
    "community create retries return the same record",
  );
  check(
    (await detail()).email === sourceEmail,
    "community emails are normalized server-side",
  );
  check(
    (
      await post(
        lead,
        base,
        {
          record: { ...sourceRecord, name: "Changed fictional identity" },
          teamId,
        },
        createKey,
      )
    ).status === 409,
    "changed create payload conflicts with a reused key",
  );
  check(
    (
      await post(lead, base, {
        record: { ...sourceRecord, email: sourceEmail.toUpperCase() },
        teamId,
      })
    ).status === 409,
    "case-insensitive duplicate email creation is blocked",
  );
  targetId = await create(targetRecord);
  check(
    (await outsider.call(base + "/" + sourceId)).status === 404 &&
      data(await outsider.call(base)).total === 0,
    "outsiders cannot infer private community details or counts",
  );
  check(
    data(await lead.call(base + "?core=true&year=Senior")).total === 1,
    "community filters and statistics honor the permitted scope",
  );
  check(
    (await lead.call(base + "?page=1&page=2")).status === 400,
    "duplicate community filter keys rejected",
  );
  check(
    (await detail()).publicProfile === null,
    "core-community flag does not implicitly create a public profile",
  );
  const linked = await db
    .from("admin_users")
    .select("id")
    .in("email", [sourceEmail, targetEmail]);
  if (linked.error) throw Error("Account separation check failed");
  check(
    linked.data.length === 0,
    "creating community people does not create officer accounts",
  );
  check(
    (await change("sync_profile")).status === 403,
    "member edit authority does not imply public-profile authority",
  );
  await grantProfile();
  const original = await detail(),
    syncKey = randomUUID(),
    syncBody = {
      action: "sync_profile",
      revision: original.revision,
      currentPassword: lead.password,
      confirmation: original.reference,
    };
  profiles.push(
    data(await post(lead, base + "/" + sourceId, syncBody, syncKey)).profileId,
  );
  check(
    data(await post(lead, base + "/" + sourceId, syncBody, syncKey))
      .profileId === profiles[0],
    "profile synchronization replays without duplicating a profile",
  );
  let p = await profile();
  check(
    !p.is_active &&
      p.name === sourceRecord.name &&
      p.member_id === sourceId &&
      !p.bio,
    "profile synchronization creates only a linked unpublished draft",
  );
  await grantProfile(false);
  check(
    (await post(lead, base + "/" + sourceId, syncBody, syncKey)).status === 403,
    "profile permission revocation also fences synchronization replays",
  );
  await grantProfile();
  check(
    (
      await post(lead, profileBase + "/" + profiles[0], {
        revision: p.revision,
        action: "publish",
      })
    ).status === 403,
    "profile publication still needs its separate action grant",
  );
  data(await profileAction("publish"));
  let publicTeam = data(
    await lead.call("/team?pageSize=100", { anonymous: true }),
  );
  check(
    publicTeam.items.some((v) => v.id === profiles[0]) &&
      !JSON.stringify(publicTeam).includes(sourceEmail) &&
      !JSON.stringify(publicTeam).includes(sourceRecord.phone),
    "approved public profile omits private contact and academic data",
  );
  let m = await detail();
  data(
    await change("update", {
      record: {
        ...sourceRecord,
        phone: "Changed fictional private phone " + suffix,
      },
    }),
  );
  check(
    (await profile()).is_active,
    "private phone-only updates do not unpublish unchanged public identity",
  );
  check(
    (
      await post(lead, base + "/" + sourceId, {
        action: "update",
        revision: m.revision,
        record: sourceRecord,
      })
    ).status === 409,
    "stale member updates cannot overwrite a newer revision",
  );
  data(
    await change("update", { record: { ...sourceRecord, is_active: false } }),
  );
  check(
    !(await profile()).is_active,
    "community deactivation atomically unpublishes linked profiles",
  );
  check(
    (await profileAction("publish")).status === 409,
    "an inactive community member cannot be republished through content APIs",
  );
  data(await change("update", { record: sourceRecord }));
  check(
    !(await profile()).is_active,
    "reactivating a community record does not republish a profile",
  );
  const beforeProfileEdit = await detail(),
    privateProfile = await profile();
  data(
    await post(
      admin,
      profileBase + "/" + profiles[0],
      {
        revision: privateProfile.revision,
        record: { name: "Independent fictional public profile" },
      },
      randomUUID(),
      "PATCH",
    ),
  );
  check(
    (
      await post(lead, base + "/" + sourceId, {
        action: "sync_profile",
        revision: beforeProfileEdit.revision,
        profileRevision: beforeProfileEdit.publicProfile.revision,
        currentPassword: lead.password,
        confirmation: beforeProfileEdit.reference,
      })
    ).status === 409,
    "profile revision fences independent public-profile edits",
  );
  data(await change("sync_profile"));
  check(
    (await preview(lead)).status === 403,
    "ordinary team accounts cannot review identity merges",
  );
  const otherId = await create(
    {
      ...targetRecord,
      name: "Fictional other-scope member",
      email: "fictional-community-other-" + suffix + "@example.test",
    },
    admin,
    null,
  );
  check(
    (await preview(admin, randomUUID(), otherId)).status === 409,
    "cross-scope identity merging is rejected",
  );
  check(
    (await preview()).json.error.code === "MEMBER_LINK_REVIEW",
    "current linked public profiles must be reviewed before merge",
  );
  data(await profileAction("archive"));
  const project = projectRecord.parse({
    title: "Fictional membership review project " + suffix,
    description: "Retained project membership test only.",
  });
  projectId = data(
    await post(admin, "/admin/projects", { record: project, teamId }),
  ).id;
  data(
    await post(admin, "/admin/projects/" + projectId, {
      action: "member_save",
      revision: 1,
      email: sourceEmail,
      role: "fictional contributor",
    }),
  );
  check(
    (await detail()).activeProjectCount === 0 &&
      (await detail(sourceId, admin)).activeProjectCount === 1,
    "project relationship counts do not cross project-read scope",
  );
  check(
    (await preview()).json.error.code === "MEMBER_LINK_REVIEW",
    "active project roles must be reviewed before merging a person",
  );
  data(
    await post(admin, "/admin/projects/" + projectId, {
      action: "member_remove",
      revision: 2,
      memberId: sourceId,
    }),
  );
  const reviewKey = randomUUID(),
    review = data(await preview(admin, reviewKey));
  check(
    data(await preview(admin, reviewKey)).reviewToken === review.reviewToken,
    "merge review retries preserve the session-bound opaque proof",
  );
  const mergeBody = {
    reviewId: review.reviewId,
    reviewToken: review.reviewToken,
    sourceConfirmation: review.source.reference,
    targetConfirmation: review.target.reference,
    currentPassword: admin.password,
  };
  check(
    (
      await post(admin, base + "/merge", {
        ...mergeBody,
        currentPassword: "fictional-wrong",
      })
    ).status === 403,
    "merge confirmation requires the current password",
  );
  check(
    (
      await post(admin, base + "/merge", {
        ...mergeBody,
        sourceConfirmation: "wrong-reference",
      })
    ).status === 400,
    "both exact member references are required",
  );
  const clone = await localHttp();
  data(await post(clone, "/auth/gate", { code: root.credentials.gateCode }));
  data(
    await post(clone, "/auth/login", {
      email: admin.email,
      password: admin.password,
    }),
  );
  check(
    (await post(clone, base + "/merge", mergeBody)).status === 403,
    "a merge proof cannot be used by another session of the same administrator",
  );
  const beforeTarget = projectionFields(await detail(targetId, admin)),
    mergeKey = randomUUID(),
    merged = data(await post(admin, base + "/merge", mergeBody, mergeKey));
  check(
    merged.id === targetId &&
      data(await post(admin, base + "/merge", mergeBody, mergeKey)).revision ===
        merged.revision,
    "retained merges are idempotent",
  );
  m = await detail(sourceId, admin);
  check(
    m.merged_into_id === targetId &&
      !m.is_active &&
      !!m.deleted_at &&
      m.phone === sourceRecord.phone &&
      JSON.stringify(projectionFields(await detail(targetId, admin))) ===
        JSON.stringify(beforeTarget),
    "merge retains source fields and keeps canonical data unchanged",
  );
  check(
    (await change("restore", {}, sourceId, admin)).status === 409,
    "merged records require an explicit unmerge rather than restore",
  );
  data(await change("unmerge", {}, sourceId, admin));
  m = await detail(sourceId, admin);
  check(
    !m.merged_into_id && !m.is_active && !m.deleted_at,
    "unmerge recovers an independent inactive record without publication",
  );
  const rows = await db
    .from("project_members")
    .select("member_id,is_active")
    .eq("project_id", projectId);
  if (rows.error) throw Error("Retained project history unavailable");
  check(
    rows.data.length === 1 &&
      rows.data[0].member_id === sourceId &&
      !rows.data[0].is_active,
    "identity review does not rewrite retained project membership history",
  );
  data(await change("archive", {}, sourceId, admin));
  check(
    data(await lead.call(base + "?state=trash")).items.some(
      (v) => v.id === sourceId,
    ),
    "community archive appears only in scoped retained inventory",
  );
  data(await change("restore", {}, sourceId, admin));
  check(
    !(await detail()).is_active,
    "restoring a member leaves the person inactive",
  );
  const targetSync = data(await change("sync_profile", {}, targetId, admin));
  profiles.push(targetSync.profileId);
  data(await profileAction("publish", targetSync.profileId));
  await teamState(false);
  check(
    (await lead.call(base + "/" + sourceId)).status === 404 &&
      !(await profile(targetSync.profileId)).is_active &&
      (await detail(targetId, admin)).actions.join(",") === "read",
    "team archival revokes community access and unpublishes linked people",
  );
  await teamState(true);
  check(
    !(await profile(targetSync.profileId)).is_active,
    "team restoration never republishes member profiles",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "BROWSER_SOURCE http://127.0.0.1:8080/admin/members?member=" + sourceId,
    );
    console.info("BROWSER_TARGET " + targetId);
    console.info(
      "Type change for an independent private edit, done to complete revocation checks and archive fixtures.",
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
        const current = await detail(sourceId, admin);
        data(
          await change(
            "update",
            {
              record: {
                ...projectionFields(current),
                major: "Independent fictional academic update",
              },
            },
            sourceId,
            admin,
          ),
        );
        check(
          true,
          "independent private member update delivered during browser review",
        );
      }
    }
  }
  const revoked = await db
    .from("team_permissions")
    .update({ can_update: false })
    .eq("team_id", teamId)
    .eq("resource_type", "members");
  if (revoked.error) throw Error("Community grant revocation failed");
  m = await detail();
  check(
    (
      await change("update", {
        record: { ...projectionFields(m), name: "Attempted fictional rewrite" },
      })
    ).status === 403,
    "revoked member update authority is enforced immediately",
  );
  const removed = await db
    .from("team_memberships")
    .update({ is_active: false })
    .eq("team_id", teamId)
    .eq("admin_user_id", lead.id);
  if (removed.error) throw Error("Community membership revocation failed");
  check(
    (await lead.call(base + "/" + sourceId)).status === 404 &&
      data(await lead.call(base)).total === 0,
    "team removal revokes private history and filtered totals",
  );
  check(
    (
      await admin.call(base + "/" + sourceId, {
        method: "DELETE",
        body: { action: "update", revision: m.revision, record: sourceRecord },
        key: randomUUID(),
      })
    ).status === 400,
    "DELETE supports only password-confirmed recoverable archive",
  );
} finally {
  if (teamId) {
    const t = await db
      .from("admin_teams")
      .select("is_active,deleted_at")
      .eq("id", teamId)
      .maybeSingle();
    if (t.data && !t.data.is_active && !t.data.deleted_at)
      await teamState(true);
  }
  if (admin) {
    for (const id of owned) {
      const r = await admin.call(base + "/" + id);
      if (r.status === 200 && !r.json.data.member.deleted_at)
        data(await change("archive", {}, id, admin));
    }
    for (const id of profiles) {
      const r = await admin.call(profileBase + "/" + id);
      if (r.status === 200 && !r.json.data.record.deleted_at)
        data(await profileAction("archive", id));
    }
    if (projectId) {
      const p = data(await admin.call("/admin/projects/" + projectId)).project;
      if (!p.deleted_at)
        data(
          await post(admin, "/admin/projects/" + projectId, {
            action: "archive",
            revision: p.revision,
            confirmation: p.title,
            currentPassword: admin.password,
          }),
        );
    }
  }
  if (teamId) {
    const t = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .maybeSingle();
    if (t.data) {
      const r = await db
        .from("admin_teams")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          revision: t.data.revision + 1,
        })
        .eq("id", teamId);
      if (r.error) throw Error("Community team fixture archive failed");
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
    if (a.error || s.error)
      throw Error("Community account fixture archive failed");
  }
}
await writeFile(
  new URL("../.docs/phase0/local-members-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual isolated loopback HTTP checks with fictional community people, accounts/team, public profiles and private project history. Merge review is session-bound and sources/history retained. Exact fixtures recoverably archived; no real person, officer access, external provider or email used. Rate limits and job history were not reset.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
