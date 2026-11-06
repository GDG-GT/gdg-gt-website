import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";

if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const h = await localHttp(),
  other = await localHttp(),
  { call, db } = h,
  actor = randomUUID(),
  member = randomUUID(),
  team = randomUUID(),
  hiddenTeam = randomUUID(),
  marker = actor.slice(0, 8),
  tests = [],
  forms = [];
const password = "Fictional-library-" + randomUUID();
const checked = (r) => {
  if (r.error) throw Error("Fixture database failed: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Fixture API failed: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const post = (path, body) =>
  call(path, { method: "POST", body, key: randomUUID() });
const title = "Fictional library " + marker;
const query = (values) =>
  "/admin/forms?" + new URLSearchParams({ q: title, ...values });
async function create(label, template, teamId) {
  const f = createTemplate(title + " " + label, template || "blank"),
    { title: formTitle, description, fields, sections, settings } = f;
  const form = data(
    await post("/admin/forms", {
      slug: f.slug,
      ...(template ? { template } : {}),
      teamId: teamId || null,
      definition: { title: formTitle, description, fields, sections, settings },
    }),
  ).form;
  forms.push(form.id);
  return form;
}
try {
  checked(
    await db.from("admin_users").insert([
      {
        id: actor,
        email: `fictional-library-${actor}@example.test`,
        display_name: "Fictional Library " + marker,
        password_hash: await hashSecret(password),
        role: "admin",
        is_active: true,
      },
      {
        id: member,
        email: `fictional-library-${member}@example.test`,
        display_name: "Fictional Scoped " + marker,
        password_hash: await hashSecret(password),
        role: "team_member",
        is_active: true,
      },
    ]),
  );
  checked(
    await db.from("admin_teams").insert([
      {
        id: team,
        name: "Fictional Visible " + marker,
        slug: "fictional-library-" + marker,
      },
      {
        id: hiddenTeam,
        name: "Fictional Hidden " + marker,
        slug: "fictional-library-hidden-" + marker,
      },
    ]),
  );
  checked(
    await db
      .from("team_memberships")
      .insert({ team_id: team, admin_user_id: member, is_active: true }),
  );
  checked(
    await db
      .from("team_page_access")
      .insert({ team_id: team, page_path: "/admin/forms", can_access: true }),
  );
  checked(
    await db
      .from("team_permissions")
      .insert({
        team_id: team,
        resource_type: "forms",
        permission: "forms.edit",
        can_read: true,
        can_create: true,
        can_update: true,
      }),
  );
  for (const [client, id] of [
    [h, actor],
    [other, member],
  ]) {
    data(
      await client.call("/auth/gate", {
        method: "POST",
        body: { code: h.credentials.gateCode },
      }),
    );
    data(
      await client.call("/auth/login", {
        method: "POST",
        body: { email: `fictional-library-${id}@example.test`, password },
      }),
    );
  }
  check(
    (await call(query({}), { anonymous: true })).status === 401 &&
      (await call("/admin/forms/filters?kind=owner", { anonymous: true }))
        .status === 401,
    "anonymous clients cannot read forms or filter options",
  );
  const feedback = await create("Feedback", "feedback", team),
    legacy = await create("Historical unknown"),
    hidden = await create("Restricted", "interest", hiddenTeam);
  check(
    feedback.templateKey === "feedback" && legacy.templateKey === null,
    "actual creation persists explicit template origin and preserves unknown legacy origin",
  );
  const copy = data(
    await post(`/admin/forms/${feedback.id}/duplicate`, {
      slug: feedback.slug + "-copy",
      revision: feedback.revision,
    }),
  ).form;
  forms.push(copy.id);
  check(
    copy.templateKey === "feedback" && copy.responseCount === 0,
    "duplication preserves provenance but never copies response data",
  );
  checked(
    await db
      .from("forms")
      .update({ updated_at: "2026-10-22T23:59:59.999999Z" })
      .eq("id", feedback.id),
  );
  checked(
    await db
      .from("forms")
      .update({ updated_at: "2026-10-22T00:00:00Z" })
      .eq("id", legacy.id),
  );
  checked(
    await db
      .from("forms")
      .update({ updated_at: "2026-10-23T00:00:00Z" })
      .in("id", [copy.id, hidden.id]),
  );
  let result = data(
    await call(
      query({
        updatedFrom: "2026-10-22",
        updatedTo: "2026-10-22",
        pageSize: "1",
      }),
    ),
  );
  check(
    result.total === 2 &&
      result.items.length === 1 &&
      result.items[0].id === feedback.id,
    "inclusive UTC day filters and server pagination include both boundaries, not the next day",
  );
  result = data(
    await call(
      query({
        updatedFrom: "2026-10-22",
        updatedTo: "2026-10-22",
        pageSize: "1",
        page: "2",
      }),
    ),
  );
  check(
    result.total === 2 && result.items[0].id === legacy.id,
    "the next filtered page retains the full matching total and deterministic order",
  );
  result = data(
    await call(query({ template: "feedback", owner: actor, team })),
  );
  check(
    result.total === 2 &&
      result.items.every(
        (f) =>
          f.teamId === team &&
          f.templateKey === "feedback" &&
          f.ownerLabel === "Fictional Library " + marker,
      ),
    "owner, team and template filters combine on the server with safe display labels",
  );
  result = data(
    await call(query({ template: "unspecified", team: "chapter" })),
  );
  check(
    result.total === 1 && result.items[0].id === legacy.id,
    "chapter-only and unspecified historical origin filters remain distinct",
  );
  for (const suffix of [
    "updatedFrom=2026-02-30",
    "updatedFrom=2026-10-23&updatedTo=2026-10-22",
    "owner=not-a-user",
    "template=unknown",
    "team=unknown",
    "pageSize=101",
    "owner=" + actor + "&owner=" + actor,
  ])
    check(
      (await call("/admin/forms?" + suffix)).status === 400,
      "invalid library query rejected: " + suffix.split("=")[0],
    );
  const scoped = data(await other.call(query({}))),
    guessed = data(await other.call(query({ team: hiddenTeam })));
  check(
    scoped.total === 2 &&
      scoped.items.every((f) => f.teamId === team) &&
      guessed.total === 0,
    "actual Team Member session sees only current permitted forms even with a guessed team filter",
  );
  const teams = data(
      await other.call(
        "/admin/forms/filters?" +
          new URLSearchParams({ kind: "team", q: marker, pageSize: "1" }),
      ),
    ),
    owners = data(await other.call("/admin/forms/filters?kind=owner"));
  check(
    teams.total === 1 &&
      teams.items[0].id === team &&
      owners.total === 1 &&
      owners.items[0].id === actor &&
      !JSON.stringify(owners).includes("@"),
    "filter options disclose only referenced accessible teams/owners, without email addresses",
  );
  check(
    data(
      await other.call(
        "/admin/forms/filters?" +
          new URLSearchParams({
            kind: "team",
            q: marker,
            pageSize: "1",
            page: "2",
          }),
      ),
    ).items.length === 0,
    "filter option pagination does not repeat the first page",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY)
      throw Error("Browser review requires a terminal.");
    console.info("BROWSER_FORM_LIBRARY_QUERY " + title);
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      terminal.on("line", (line) => {
        if (line.trim() === "done") {
          terminal.close();
          resolve();
        }
      });
      console.info("Enter done after fictional library browser review.");
    });
  }
  checked(
    await db
      .from("team_memberships")
      .update({ is_active: false })
      .eq("team_id", team)
      .eq("admin_user_id", member),
  );
  check(
    data(await other.call(query({}))).total === 0 &&
      data(await other.call("/admin/forms/filters?kind=owner")).total === 0,
    "membership revocation immediately removes both inventory and owner filter options",
  );
} finally {
  for (const id of forms) {
    const current = await call("/admin/forms/" + id);
    if (current.status === 200 && current.json.data.form.status !== "Archived")
      data(
        await call("/admin/forms/" + id, {
          method: "DELETE",
          body: { revision: current.json.data.form.revision },
        }),
      );
  }
  await h.logout();
  await other.logout();
  checked(
    await db
      .from("team_memberships")
      .update({ is_active: false })
      .eq("admin_user_id", member),
  );
  checked(
    await db
      .from("admin_teams")
      .update({ is_active: false })
      .in("id", [team, hiddenTeam]),
  );
  checked(
    await db
      .from("admin_users")
      .update({ is_active: false })
      .in("id", [actor, member]),
  );
}
await writeFile(
  new URL("../.docs/phase0/local-form-library.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual loopback HTTP and PostgreSQL fixtures; generated dates/names only, forms/accounts/teams recoverably archived. No external sends.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
