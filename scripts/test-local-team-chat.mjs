import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { dockerCommand } from "./lib/disposable-postgres.mjs";
const { db, credentials } = await localHttp(),
  evidence = [],
  accounts = [],
  sockets = [];
let teamId, channelId;
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
const data = (r) => {
  if (r.status !== 200)
    throw new Error(
      "Local team chat request failed " +
        r.status +
        " " +
        (r.json?.error?.code || "unavailable"),
    );
  return r.json.data;
};
const post = (actor, path, body) =>
  actor.call(path, { method: "POST", body, key: randomUUID() });
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
async function actor(role, name) {
  const id = randomUUID(),
    email = `fictional-team-chat-${id}@example.test`,
    password = "Fictional-team-chat-" + randomUUID(),
    http = await localHttp();
  const r = await db.from("admin_users").insert({
    id,
    email,
    password_hash: await hashSecret(password),
    display_name: name,
    role,
    is_active: true,
  });
  if (r.error) throw new Error("Team chat fixture account unavailable");
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
  return { ...http, id, email, password };
}
async function eventually(predicate) {
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}
async function socket(actor, id) {
  const dto = data(
      await post(actor, "/auth/realtime-token", { kind: "channel", id }),
    ),
    events = [],
    client = createClient(dto.url, dto.key, {
      accessToken: async () => dto.token,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: { timeout: 5000 },
    });
  await client.realtime.setAuth(dto.token);
  let finish;
  const ready = new Promise((r) => {
    finish = r;
  });
  const channel = client
    .channel(dto.topic, { config: { private: true } })
    .on("broadcast", { event: "changed" }, ({ payload }) =>
      events.push(payload),
    )
    .subscribe((s) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(s)) finish(s);
    });
  sockets.push({ client, channel });
  const timer = setTimeout(() => finish("TEST_TIMEOUT"), 7000);
  timer.unref();
  const status = await ready;
  clearTimeout(timer);
  return { status, events, topic: dto.topic };
}
async function waitForDatabaseBroadcast(live) {
  // SUBSCRIBED confirms authorization, not readiness of the local database
  // replication worker during a tenant rebalance. Test that transport separately
  // before asserting the real business trigger; never retry a business write.
  if (!/^gdg:channel:[a-f0-9-]{36}$/.test(live.topic))
    throw new Error("Unexpected private fixture topic");
  const probe = randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await dockerCommand(
      [
        "exec",
        "-i",
        "supabase_db_gdg-gt-prd-local",
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-qAt",
        "--set=ON_ERROR_STOP=1",
      ],
      `SELECT realtime.send('{"kind":"test-control","id":"${probe}"}'::jsonb,'changed','${live.topic}',true);`,
    );
    if (result.code !== 0)
      throw new Error("Local database broadcast readiness probe failed");
    if (await eventually(() => live.events.some((e) => e.id === probe))) {
      live.events.length = 0;
      return true;
    }
  }
  return false;
}
async function team(actor) {
  return data(await actor.call("/admin/teams/" + teamId));
}
async function role(admin, user, nextRole) {
  const w = await team(admin),
    m = w.members.find((m) => m.admin_user_id === user.id && m.is_active);
  return data(
    await post(admin, "/admin/teams/" + teamId, {
      action: "member_role",
      revision: w.team.revision,
      membershipId: m.id,
      membershipRevision: m.revision,
      role: nextRole,
      currentPassword: admin.password,
    }),
  );
}
try {
  const admin = await actor("admin", "Fictional team-chat administrator"),
    lead = await actor("team_member", "Fictional original team lead"),
    member = await actor("team_member", "Fictional next team lead"),
    outsider = await actor("team_member", "Fictional unrelated team member");
  const w = data(
    await post(admin, "/admin/teams", {
      currentPassword: admin.password,
      record: {
        name: "Fictional team chat review " + randomUUID().slice(0, 8),
        slug: "fictional-team-chat-" + randomUUID(),
        description: "Local team chat lifecycle review only",
        leadId: lead.id,
      },
    }),
  );
  teamId = w.team.id;
  data(
    await post(admin, "/admin/teams/" + teamId, {
      action: "member_add",
      revision: w.team.revision,
      currentPassword: admin.password,
      email: member.email,
      role: "member",
    }),
  );
  const path = "/admin/teams/" + teamId + "/chat";
  check(
    (await admin.call(path, { anonymous: true })).status === 401,
    "anonymous callers cannot inspect or set up team chat",
  );
  check(
    data(await member.call(path)).channel === null,
    "read-only team-chat inspection does not create a room",
  );
  check(
    (await outsider.call(path)).status === 404,
    "non-members cannot infer the team chat workspace",
  );
  check(
    (
      await post(member, path, {
        currentPassword: member.password,
        confirmation: w.team.name,
      })
    ).status === 403,
    "ordinary members cannot provision the team's shared room",
  );
  const [one, two] = await Promise.all([
    post(lead, path, {
      currentPassword: lead.password,
      confirmation: w.team.name,
    }),
    post(lead, path, {
      currentPassword: lead.password,
      confirmation: w.team.name,
    }),
  ]);
  channelId = data(one).channel.id;
  check(
    data(two).channel.id === channelId,
    "two concurrent setup requests resolve to one stable team conversation",
  );
  const count = await db
    .from("channels")
    .select("id", { head: true, count: "exact" })
    .eq("team_id", teamId)
    .eq("is_team_chat", true);
  check(
    !count.error && count.count === 1,
    "the database enforces exactly one managed chat per team",
  );
  let room = data(await member.call("/admin/channels/" + channelId));
  check(
    room.record.is_team_chat &&
      room.actions.send &&
      !room.actions.manage &&
      !room.actions.manageMembers,
    "current members receive send/read access without secondary room management roles",
  );
  check(
    data(await lead.call("/admin/channels/" + channelId)).actions.manage,
    "current leads manage chat through their team role",
  );
  check(
    (await member.call("/admin/channels/" + channelId + "/members")).status ===
      409,
    "managed-chat membership inventory cannot be mistaken for explicit room membership",
  );
  const changedAudience = await post(admin, "/admin/channels/" + channelId, {
    action: "member_add",
    revision: room.record.revision,
    currentPassword: admin.password,
    email: member.email,
    role: "owner",
  });
  check(
    changedAudience.status === 409 &&
      changedAudience.json.error.code === "TEAM_MANAGED_CHAT",
    "explicit channel roles cannot widen or override team-chat authority",
  );
  check(
    (await outsider.call("/admin/channels/" + channelId)).status === 404 &&
      (
        await post(outsider, "/auth/realtime-token", {
          kind: "channel",
          id: channelId,
        })
      ).status === 404,
    "unrelated accounts cannot read the room or mint a private room token",
  );
  const live = await socket(member, channelId);
  check(
    live.status === "SUBSCRIBED",
    "a normal team member joins the actual private chat socket",
  );
  check(
    await waitForDatabaseBroadcast(live),
    "the local database broadcast worker is ready before the business event assertion",
  );
  const msg = data(
    await post(lead, "/admin/channels/" + channelId + "/messages", {
      message:
        "Fictional team conversation — membership-derived access and live updates.",
    }),
  );
  check(
    await eventually(() =>
      live.events.some((e) => e.kind === "channel" && e.id === channelId),
    ),
    "team chat messages invalidate the real scoped socket",
  );
  check(
    live.events.every((e) =>
      Object.keys(e).every((k) => ["kind", "id"].includes(k)),
    ),
    "team-chat broadcasts contain no private message text or member emails",
  );
  const history = data(
    await member.call("/admin/channels/" + channelId + "/messages"),
  );
  check(
    history.items.some((m) => m.id === msg.id && m.sender_id === lead.id),
    "the authorized HTTP history supplies server-owned message attribution",
  );
  check(
    (await member.call(`/admin/channels/${channelId}/updates?after=-1`))
      .status === 400 &&
      (await outsider.call(`/admin/channels/${channelId}/updates?after=0`))
        .status === 404,
    "catch-up cursors are validated and cannot expose another team's messages",
  );
  const unicode = data(
    await post(member, "/admin/channels/" + channelId + "/messages", {
      message: "漢".repeat(10000),
    }),
  );
  check(
    !!unicode.id,
    "full-length Unicode room messages fit the protected byte limit",
  );
  const recovered = data(
    await member.call(
      `/admin/channels/${channelId}/updates?after=${history.highWaterMark}`,
    ),
  );
  check(
    recovered.items.length === 1 &&
      recovered.items[0].id === unicode.id &&
      !recovered.hasMore,
    "protected HTTP catch-up returns a missed message from the acknowledged history cursor",
  );
  await role(admin, member, "lead");
  await role(admin, lead, "member");
  check(
    !data(await lead.call("/admin/channels/" + channelId)).actions.manage &&
      data(await member.call("/admin/channels/" + channelId)).actions.manage,
    "team role changes immediately transfer room moderation without explicit owner edits",
  );
  check(
    (
      await post(lead, "/admin/channels/" + channelId + "/messages/" + msg.id, {
        action: "pin",
        revision: 1,
        pinned: true,
      })
    ).status === 403,
    "a demoted lead cannot retain message-pinning authority",
  );
  data(
    await post(member, "/admin/channels/" + channelId + "/messages/" + msg.id, {
      action: "pin",
      revision: 1,
      pinned: true,
    }),
  );
  check(
    data(
      await member.call("/admin/channels/" + channelId + "/messages?pinned=1"),
    ).items.some((m) => m.id === msg.id),
    "the current lead can pin a message through its derived moderation scope",
  );
  let latest = await team(admin),
    former = latest.members.find(
      (m) => m.admin_user_id === lead.id && m.is_active,
    );
  data(
    await post(admin, "/admin/teams/" + teamId, {
      action: "member_remove",
      revision: latest.team.revision,
      membershipId: former.id,
      membershipRevision: former.revision,
      role: former.role,
      currentPassword: admin.password,
    }),
  );
  check(
    (await lead.call("/admin/channels/" + channelId)).status === 404 &&
      (
        await post(lead, "/auth/realtime-token", {
          kind: "channel",
          id: channelId,
        })
      ).status === 404,
    "removed teammates lose protected room reads and replacement socket grants",
  );
  room = data(await member.call("/admin/channels/" + channelId));
  data(
    await post(member, "/admin/channels/" + channelId, {
      action: "archive",
      revision: room.record.revision,
      currentPassword: member.password,
      confirmation: room.record.name,
    }),
  );
  room = data(await member.call("/admin/channels/" + channelId));
  check(
    room.record.is_archived && !room.actions.send && room.canRestore,
    "archiving retains a read-only conversation and current-lead recovery",
  );
  data(
    await post(member, "/admin/channels/" + channelId, {
      action: "restore",
      revision: room.record.revision,
      currentPassword: member.password,
      confirmation: room.record.name,
    }),
  );
  check(
    data(await member.call("/admin/channels/" + channelId)).actions.send,
    "the current lead can restore team chat without a chapter-role promotion",
  );
  latest = await team(admin);
  data(
    await post(admin, "/admin/teams/" + teamId, {
      action: "archive",
      revision: latest.team.revision,
      currentPassword: admin.password,
      confirmation: latest.team.name,
    }),
  );
  check(
    (await member.call(path)).status === 404 &&
      !data(await admin.call("/admin/channels/" + channelId)).actions.send,
    "team archival revokes member access and blocks even administrator message writes",
  );
  latest = await team(admin);
  data(
    await post(admin, "/admin/teams/" + teamId, {
      action: "restore",
      revision: latest.team.revision,
      currentPassword: admin.password,
      confirmation: latest.team.name,
    }),
  );
  check(
    data(await member.call(path)).channel.id === channelId,
    "restoring the team retains its existing conversation and message history",
  );
  data(
    await post(
      member,
      "/admin/channels/" + channelId + "/messages/" + unicode.id,
      { action: "delete", revision: 1 },
    ),
  );
  check(
    data(
      await member.call("/admin/channels/" + channelId + "/messages"),
    ).items.find((m) => m.id === unicode.id).message === "",
    "the large Unicode fixture is soft-deleted to a body-free placeholder before browser review",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info("BROWSER_TEAM " + teamId);
    console.info("BROWSER_ROOM " + channelId);
    console.info(
      "Type change for a remote message, or done for recoverable cleanup.",
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
          await post(member, "/admin/channels/" + channelId + "/messages", {
            message:
              "Fictional remote team update — this stays scoped to the current team conversation.",
          }),
        );
        check(
          true,
          "independent-session browser-review team message delivered",
        );
      }
    }
  }
  await admin.logout();
  await lead.logout();
  await member.logout();
  await outsider.logout();
} finally {
  for (const { client, channel } of sockets) {
    channel.teardown();
    client.realtime.disconnect();
    await client.removeAllChannels();
    client.realtime.disconnect();
  }
  if (channelId) {
    const r = await db
      .from("channels")
      .select("revision")
      .eq("id", channelId)
      .single();
    if (r.error) throw new Error("Chat cleanup read failed");
    const archived = await db
      .from("channels")
      .update({ is_archived: true, revision: r.data.revision + 1 })
      .eq("id", channelId);
    if (archived.error) throw new Error("Chat cleanup archive failed");
  }
  if (teamId) {
    const r = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .single();
    if (r.error) throw new Error("Team cleanup read failed");
    await db
      .from("admin_teams")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        revision: r.data.revision + 1,
      })
      .eq("id", teamId);
  }
  if (accounts.length) {
    await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .in("id", accounts);
    await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .in("admin_user_id", accounts)
      .is("revoked_at", null);
  }
}
await writeFile(
  new URL("../.docs/phase0/local-team-chat-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual isolated local HTTP and private WebSocket checks with fictional current/former leads, members and outsiders. Parent team creation, membership changes, archival and restoration use protected APIs. No role promotion outside the fictional team, external messages, quota resets or permanent deletions. All fictional accounts/team/chat recoverably archived.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
