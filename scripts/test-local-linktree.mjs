import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const { db, credentials } = await localHttp(),
  evidence = [],
  accounts = [];
const base = "/admin/linktree/profiles",
  username = "fictional-links-" + randomUUID().slice(0, 8);
let teamId, profileId, member, admin, outsider, editor;
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function data(r) {
  if (r.status !== 200)
    throw new Error(
      `Linktree request failed ${r.status} ${r.json?.error?.code || "unavailable"}`,
    );
  return r.json.data;
}
const post = (client, path, body, key = randomUUID(), anonymous = false) =>
  client.call(path, { method: "POST", key, body, anonymous });
async function actor(role, name) {
  const http = await localHttp(),
    id = randomUUID(),
    email = `fictional-links-${id}@example.test`,
    password = "Fictional-links-" + randomUUID();
  const created = await db
    .from("admin_users")
    .insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role,
      display_name: name,
      is_active: true,
    });
  if (created.error) throw new Error("Linktree fixture account unavailable");
  accounts.push(id);
  data(
    await http.call("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    }),
  );
  data(
    await http.call("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  );
  return { ...http, id, password };
}
const profileRecord = (changes = {}) => ({
  username,
  displayName: "Fictional chapter link hub",
  bio: "A fictional chapter page used to verify public links, privacy and safe embeds.",
  avatarUrl: "",
  background: { type: "gradient", from: "#f8d8c6", to: "#e0d6f2", angle: 135 },
  theme: "light",
  ...changes,
});
const linkRecord = (title, url, changes = {}) => ({
  title,
  url,
  description:
    "Fictional test link; no external content is loaded by this test.",
  icon: "link",
  buttonStyle: "default",
  buttonColor: "#f4f5f7",
  textColor: "#25282f",
  embedType: "none",
  showClickCount: false,
  ...changes,
});
const detail = async (client = member) =>
  data(await client.call(base + "/" + profileId));
const publicProfile = () =>
  member.call("/linktree/" + username, { anonymous: true });
async function action(client, name, changes = {}, key = randomUUID()) {
  const d = await detail(client),
    link = changes.linkId && d.links.find((l) => l.id === changes.linkId);
  return post(
    client,
    base + "/" + profileId,
    {
      action: name,
      revision: d.profile.revision,
      currentPassword: client.password,
      confirmation:
        link && name !== "move" ? link.title : d.profile.displayName,
      ...changes,
    },
    key,
  );
}
async function add(title, url, changes) {
  const d = await detail();
  return data(
    await post(member, "/admin/linktree/links", {
      profileId,
      mutation: {
        action: "link_create",
        revision: d.profile.revision,
        record: linkRecord(title, url, changes),
      },
    }),
  ).linkId;
}
async function setTeam(active) {
  const r = await db
    .from("admin_teams")
    .select("revision")
    .eq("id", teamId)
    .single();
  if (r.error) throw new Error("Team fixture state unavailable");
  const changed = await db
    .from("admin_teams")
    .update({ is_active: active, revision: r.data.revision + 1 })
    .eq("id", teamId);
  if (changed.error) throw new Error("Team fixture transition unavailable");
}
try {
  admin = await actor("admin", "Fictional link administrator");
  member = await actor("team_member", "Fictional link curator");
  outsider = await actor("team_member", "Fictional link outsider");
  editor = await actor("blog_editor", "Fictional link editor");
  teamId = randomUUID();
  for (const r of [
    await db
      .from("admin_teams")
      .insert({
        id: teamId,
        name: "Fictional link curation team",
        slug: "fictional-links-" + teamId,
        created_by: admin.id,
      }),
    await db
      .from("team_memberships")
      .insert({ team_id: teamId, admin_user_id: member.id, role: "member" }),
    await db
      .from("team_page_access")
      .insert({
        team_id: teamId,
        page_path: "/admin/linktree",
        can_access: true,
      }),
    await db
      .from("team_permissions")
      .insert({
        team_id: teamId,
        resource_type: "linktree",
        permission: "crud",
        can_read: true,
        can_create: true,
        can_update: true,
        can_delete: true,
      }),
  ])
    if (r.error) throw new Error("Linktree team fixture unavailable");
  check(
    (await member.call(base, { anonymous: true })).status === 401,
    "anonymous callers cannot read the Linktree manager",
  );
  check(
    (await editor.call(base)).status === 403,
    "Blog Editor cannot access Linktree management",
  );
  check(
    (
      await post(member, base, {
        teamId,
        record: { ...profileRecord(), is_active: true },
      })
    ).status === 400,
    "browser cannot forge publication state",
  );
  const key = randomUUID(),
    created = data(
      await post(member, base, { teamId, record: profileRecord() }, key),
    );
  profileId = created.id;
  check(
    data(await post(member, base, { teamId, record: profileRecord() }, key))
      .id === profileId,
    "profile creation retry is idempotent",
  );
  check(
    (await publicProfile()).status === 404,
    "draft profile is not available publicly",
  );
  check(
    (await outsider.call(base + "/" + profileId)).status === 404,
    "outsider cannot read a private profile",
  );
  check(
    data(await outsider.call(base)).total === 0,
    "unauthorized profile counts reveal no team records",
  );
  const original = await detail(),
    xss = '<script>alert("fictional")</script> is plain text here.';
  data(
    await post(member, base + "/" + profileId, {
      action: "update",
      revision: original.profile.revision,
      record: profileRecord({ bio: xss }),
    }),
  );
  check(
    (
      await post(member, base + "/" + profileId, {
        action: "update",
        revision: original.profile.revision,
        record: profileRecord(),
      })
    ).status === 409,
    "stale profile edits cannot overwrite a newer revision",
  );
  check(
    (await action(member, "publish")).status === 403,
    "page and CRUD grants do not imply publication authority",
  );
  const grant = await db
    .from("team_permissions")
    .insert({
      team_id: teamId,
      resource_type: "linktree",
      permission: "publish",
      can_update: true,
    });
  if (grant.error) throw new Error("Fictional publish grant unavailable");
  check(
    (
      await action(member, "publish", {
        currentPassword: "wrong-fictional-password",
      })
    ).status === 403,
    "public activation requires the current password",
  );
  data(await action(member, "publish"));
  const pub = data(await publicProfile()).profile;
  check(
    pub.bio === xss &&
      !JSON.stringify(pub).includes("teamId") &&
      !JSON.stringify(pub).includes("createdBy"),
    "public profile returns plain text without private ownership fields",
  );
  const first = await add(
    "Developer resources",
    "https://developers.google.com/",
    { icon: "code" },
  );
  check(
    data(await publicProfile()).profile.links.length === 0,
    "a draft link stays private even on an active profile",
  );
  data(await action(member, "link_publish", { linkId: first }));
  check(
    data(await publicProfile()).profile.links[0].clickCount === null,
    "hidden public click counts are absent from the public value",
  );
  check(
    (await member.call("/admin/linktree/links/" + first)).status === 200,
    "single-link endpoint authorizes through its actual parent",
  );
  const beforeActivity = (await detail()).profile.revision;
  data(
    await post(
      member,
      "/linktree/" + username + "/views",
      {},
      randomUUID(),
      true,
    ),
  );
  data(
    await post(
      member,
      "/linktree/" + username + "/links/" + first + "/click",
      {},
      randomUUID(),
      true,
    ),
  );
  check(
    (
      await post(
        member,
        "/linktree/" + username + "/links/" + first + "/click",
        {},
        randomUUID(),
        true,
      )
    ).status === 429,
    "repeated clicks from one risk/target are bounded by the real shared rate window",
  );
  check(
    (
      await post(
        member,
        "/linktree/" + username + "/links/" + first + "/click",
        { count: 999, visitor_ip: "127.0.0.1" },
        randomUUID(),
        true,
      )
    ).status === 400,
    "public analytics never accepts arbitrary counts or visitor metadata",
  );
  const report = data(
    await member.call(
      `/admin/linktree/analytics?profileId=${profileId}&days=30`,
    ),
  );
  check(
    report.views === "1" &&
      report.clicks === "1" &&
      (await detail()).profile.revision === beforeActivity,
    "daily aggregate counts agree without invalidating editor revisions",
  );
  check(
    (await outsider.call(`/admin/linktree/analytics?profileId=${profileId}`))
      .status === 404,
    "analytics is scoped to current profile authority",
  );
  const raw = await db
    .from("linktree_analytics")
    .select("visitor_ip,user_agent,referrer,country,city,event_count")
    .eq("profile_id", profileId);
  if (raw.error) throw new Error("Aggregate privacy verification unavailable");
  check(
    raw.data.length === 2 &&
      raw.data.every((r) =>
        [r.visitor_ip, r.user_agent, r.referrer, r.country, r.city].every(
          (v) => v === null,
        ),
      ),
    "stored analytics contains daily aggregates and no raw visitor metadata",
  );
  const current = await detail(),
    liveRecord = linkRecord(
      "Developer resources",
      "https://developers.google.com/",
      { icon: "code", showClickCount: true },
    );
  check(
    (
      await post(member, base + "/" + profileId, {
        action: "link_update",
        revision: current.profile.revision,
        linkId: first,
        record: liveRecord,
      })
    ).status === 400,
    "live link edits require typed/password confirmation",
  );
  data(
    await action(member, "link_update", { linkId: first, record: liveRecord }),
  );
  check(
    data(await publicProfile()).profile.links[0].clickCount === "1",
    "explicit public click-count preference is honored",
  );
  const native = await add("Chapter form", "/forms/fictional-local-form", {
    icon: "form",
  });
  data(await action(member, "link_publish", { linkId: native }));
  const youtube = await add(
    "YouTube preview",
    "https://www.youtube.com/watch?v=abcdefghijk",
    { embedType: "youtube", icon: "video" },
  );
  data(await action(member, "link_publish", { linkId: youtube }));
  const google = await add(
    "Google Forms preview",
    "https://docs.google.com/forms/d/e/fictional12345/viewform",
    { embedType: "google_form", icon: "form" },
  );
  data(await action(member, "link_publish", { linkId: google }));
  const activeLinks = data(await publicProfile()).profile.links;
  check(
    activeLinks
      .find((l) => l.id === youtube)
      .embedUrl.startsWith("https://www.youtube-nocookie.com/embed/") &&
      activeLinks
        .find((l) => l.id === google)
        .embedUrl.endsWith("?embedded=true"),
    "only canonical approved provider embed URLs are serialized",
  );
  const invalid = await detail();
  check(
    (
      await post(member, "/admin/linktree/links", {
        profileId,
        mutation: {
          action: "link_create",
          revision: invalid.profile.revision,
          record: linkRecord("Arbitrary iframe", "https://example.com/", {
            embedType: "youtube",
          }),
        },
      })
    ).status === 400,
    "arbitrary iframe destinations are rejected at the write boundary",
  );
  data(await action(member, "move", { linkId: google, direction: "up" }));
  const order = data(await publicProfile()).profile.links.map((l) => l.id);
  check(
    order.indexOf(google) < order.indexOf(youtube),
    "confirmed link reordering is atomic and visible publicly",
  );
  data(await action(member, "link_archive", { linkId: native }));
  check(
    !data(await publicProfile()).profile.links.some((l) => l.id === native),
    "archived links disappear from the public projection",
  );
  const trash = data(
    await member.call(base + "/" + profileId + "?state=trash"),
  );
  data(
    await post(member, base + "/" + profileId, {
      action: "link_restore",
      revision: trash.profile.revision,
      linkId: native,
      confirmation: "Chapter form",
      currentPassword: member.password,
    }),
  );
  check(
    !data(await publicProfile()).profile.links.some((l) => l.id === native),
    "restoring a link does not silently reactivate it",
  );
  data(await action(member, "link_publish", { linkId: native }));
  // Restore pleasant plain copy for visual review after the stored-XSS fixture.
  data(await action(member, "update", { record: profileRecord() }));
  const publicStatus = (await publicProfile()).status;
  check(
    publicStatus === 200,
    "browser-review fixture is active and contains only explicit fictional links",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "BROWSER_ADMIN http://127.0.0.1:8080/admin/linktree?profile=" + profileId,
    );
    console.info("BROWSER_PUBLIC http://127.0.0.1:8080/l/" + username);
    console.info(
      "Type change for an independent revision update, or done to continue lifecycle checks and archive exact fictional fixtures.",
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
          await action(member, "update", {
            record: profileRecord({
              bio: "Independent fictional update. The browser's unsaved editor must not overwrite this revision.",
            }),
          }),
        );
        check(
          true,
          "independent-session update delivered during browser review",
        );
      }
    }
  }
  await setTeam(false);
  check(
    (await publicProfile()).status === 404 &&
      (await detail(admin)).profile.active === false,
    "team archival automatically unpublishes its Linktree and fences its revision",
  );
  check(
    (await member.call(base + "/" + profileId)).status === 404,
    "inactive-team members lose private Linktree access",
  );
  await setTeam(true);
  check(
    (await publicProfile()).status === 404,
    "team restoration does not silently republish a profile",
  );
  data(await action(member, "publish"));
  const rename = profileRecord({ username: username + "-new" });
  data(await action(member, "update", { record: rename }));
  check(
    (await publicProfile()).status === 404 &&
      (await member.call("/linktree/" + username + "-new", { anonymous: true }))
        .status === 200,
    "username rename activates only the new URL",
  );
  check(
    (await post(admin, base, { record: profileRecord(), teamId: null }))
      .status === 409,
    "a former username cannot be taken over by a different profile",
  );
  data(await action(member, "archive"));
  const inactive = await member.call("/linktree/" + username + "-new", {
      anonymous: true,
    }),
    unknown = await member.call("/linktree/" + username + "-unknown", {
      anonymous: true,
    });
  check(
    inactive.status === 404 &&
      unknown.status === 404 &&
      JSON.stringify(inactive.json.error) ===
        JSON.stringify(unknown.json.error),
    "inactive and unknown public profiles have the same branded-not-found API contract",
  );
  data(await action(member, "restore"));
  check(
    (await member.call("/linktree/" + username + "-new", { anonymous: true }))
      .status === 404,
    "restoring a profile leaves it inactive",
  );
  const removed = await db
    .from("team_memberships")
    .update({ is_active: false })
    .eq("team_id", teamId)
    .eq("admin_user_id", member.id);
  if (removed.error)
    throw new Error("Fictional membership revocation unavailable");
  check(
    (await member.call(base + "/" + profileId)).status === 404 &&
      data(await member.call(base)).total === 0,
    "membership removal revokes details and counts immediately",
  );
  check(
    (await member.call(base + "/" + profileId, { method: "DELETE" })).status ===
      405,
    "unsupported permanent deletion is not available through the API",
  );
} finally {
  if (profileId && admin) {
    const r = await admin.call(base + "/" + profileId);
    if (r.status === 200 && !r.json.data.profile.deletedAt) {
      const p = r.json.data.profile;
      data(
        await post(admin, base + "/" + profileId, {
          action: "archive",
          revision: p.revision,
          confirmation: p.displayName,
          currentPassword: admin.password,
        }),
      );
    }
  }
  if (teamId) {
    const r = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .maybeSingle();
    if (r.data) {
      const archived = await db
        .from("admin_teams")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          revision: r.data.revision + 1,
        })
        .eq("id", teamId);
      if (archived.error)
        throw new Error("Fictional Linktree team archive failed");
    }
  }
  if (accounts.length) {
    const archived = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .in("id", accounts);
    const revoked = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .in("admin_user_id", accounts)
      .is("revoked_at", null);
    if (archived.error || revoked.error)
      throw new Error("Fictional Linktree account archive failed");
  }
}
await writeFile(
  new URL("../.docs/phase0/local-linktree-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual dedicated loopback HTTP checks with fictional isolated accounts/team/profile/links. No provider iframe, external site, email or real visitor data was loaded. Rate limits and jobs were not reset. Profile/team/accounts recoverably archived and username/history preserved.",
      profileId,
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
