import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const h = await localHttp(),
  other = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  outsider = randomUUID(),
  inactive = randomUUID(),
  editor = randomUUID(),
  team = randomUUID(),
  members = Array.from({ length: 105 }, () => randomUUID()),
  accounts = [actor, outsider, inactive, editor, ...members],
  marker = actor.slice(0, 8),
  prefix = "Fictional access " + marker,
  password = "Fictional-access-" + randomUUID(),
  tests = [];
let created = false,
  teamCreated = false,
  form,
  completed = false;
const checked = (result) => {
  if (result.error) throw Error("Fixture database error " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Fixture API error " + result.status + " " + result.json?.error?.code,
    );
  return result.json.data;
};
const check = (condition, name) => {
  if (!condition) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
async function login(client, id) {
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await client.call("/auth/login", {
      method: "POST",
      body: { email: "fictional-access-" + id + "@example.test", password },
    }),
  );
}
try {
  const passwordHash = await hashSecret(password);
  checked(
    await db.from("admin_users").insert(
      accounts.map((id, i) => ({
        id,
        email: "fictional-access-" + id + "@example.test",
        password_hash: passwordHash,
        role:
          id === actor
            ? "admin"
            : id === editor
              ? "blog_editor"
              : "team_member",
        is_active: id !== inactive,
        display_name:
          prefix +
          (i < 4
            ? [" owner", " outsider", " inactive", " editor"][i]
            : " candidate " + String(i - 4).padStart(3, "0")),
      })),
    ),
  );
  created = true;
  checked(
    await db
      .from("admin_teams")
      .insert({ id: team, name: prefix, slug: "fictional-access-" + marker }),
  );
  teamCreated = true;
  checked(
    await db
      .from("team_memberships")
      .insert(
        [...members, inactive, editor].map((id) => ({
          team_id: team,
          admin_user_id: id,
        })),
      ),
  );
  await login(h, actor);
  const draft = createTemplate(prefix, "blank"),
    { title, description, fields, sections, settings } = draft;
  form = data(
    await call("/admin/forms", {
      method: "POST",
      body: {
        slug: draft.slug,
        teamId: team,
        definition: { title, description, fields, sections, settings },
      },
    }),
  ).form;
  const root = `/admin/forms/${form.id}`,
    candidates = (values = {}) =>
      `${root}/collaborator-candidates?` +
      new URLSearchParams({ q: prefix + " candidate", ...values });
  check(
    (await call(candidates(), { anonymous: true })).status === 401,
    "candidate directory rejects anonymous access",
  );
  await login(other, outsider);
  check(
    (await other.call(candidates())).status === 404,
    "candidate directory conceals a form from an unrelated officer",
  );
  const pages = [];
  for (let page = 1; page <= 4; page++) {
    const response = await call(candidates({ page: String(page) })),
      value = data(response);
    check(
      value.total === 105 &&
        value.page === page &&
        value.pageSize === 30 &&
        value.items.length === (page < 4 ? 30 : 15),
      "eligible candidate page " + page + " retains the full count beyond 100",
    );
    check(
      response.headers.get("cache-control")?.includes("no-store") &&
        !/password_hash|token_hash|session_token|@example\.test/.test(
          response.text,
        ),
      "candidate page " +
        page +
        " is uncached and contains only safe account projections",
    );
    pages.push(...value.items.map((row) => row.id));
  }
  check(
    new Set(pages).size === 105 && members.every((id) => pages.includes(id)),
    "all eligible candidates appear once across stable pages",
  );
  const last = data(
    await call(candidates({ q: prefix.toUpperCase() + " CANDIDATE 104" })),
  );
  check(
    last.total === 1 && last.items[0].id === members[104],
    "case-insensitive literal search reaches the account beyond the old cutoff",
  );
  for (const label of ["outsider", "owner", "inactive", "editor", "%"])
    check(
      data(await call(candidates({ q: prefix + " " + label }))).total === 0,
      "candidate search excludes " + label,
    );
  for (const query of [
    "page=0",
    "pageSize=101",
    "q=" + "x".repeat(101),
    "actor=" + actor,
  ])
    check(
      (await call(root + "/collaborator-candidates?" + query)).status === 400,
      "candidate query rejects " + query.split("=")[0] + " misuse",
    );
  data(
    await call(root + "/collaborators", {
      method: "PATCH",
      body: { userId: members[104], actions: ["view"] },
    }),
  );
  const collabs = data(await call(root + "/collaborators?page=1&pageSize=1"));
  check(
    collabs.total === 1 &&
      collabs.items[0].admin_user_id === members[104] &&
      collabs.items[0].display_name.endsWith("104") &&
      collabs.items[0].actions.join() === "view",
    "collaborator inventory supplies paged labels independently of the candidate page",
  );
  check(
    data(
      await call(candidates({ q: prefix + " candidate 104" })),
    ).items[0].actions.join() === "view",
    "selected late-page account carries its current explicit actions",
  );
  checked(
    await db
      .from("team_memberships")
      .update({ is_active: false })
      .eq("team_id", team)
      .eq("admin_user_id", members[104]),
  );
  checked(
    await db
      .from("admin_users")
      .update({ is_active: false })
      .eq("id", members[104]),
  );
  check(
    data(await call(candidates({ q: prefix + " candidate 104" }))).total === 0,
    "deactivated departed account disappears from candidates",
  );
  check(
    (
      await call(root + "/collaborators", {
        method: "PATCH",
        body: { userId: members[104], actions: ["view"] },
      })
    ).status === 409,
    "inactive out-of-team account cannot receive a new grant",
  );
  data(
    await call(root + "/collaborators", {
      method: "DELETE",
      body: { userId: members[104] },
    }),
  );
  check(
    data(await call(root + "/collaborators")).total === 0,
    "manager can remove a stored grant after its recipient leaves and becomes inactive",
  );
  const unchanged = data(await call(root)).form;
  check(
    unchanged.status === "Draft" &&
      unchanged.revision === form.revision &&
      unchanged.versions.length === 0,
    "access inventory and grant checks do not publish or revise the private draft",
  );
  completed = true;
} finally {
  if (form) {
    const owned = checked(
      await db
        .from("forms")
        .select("owner_id,state")
        .eq("id", form.id)
        .single(),
    );
    if (owned.owner_id !== actor)
      throw Error("Fixture ownership changed; cleanup not confirmed");
    if (owned.state !== "Archived") {
      const latest = data(await call(`/admin/forms/${form.id}`)).form;
      data(
        await call(`/admin/forms/${form.id}`, {
          method: "DELETE",
          body: { revision: latest.revision },
        }),
      );
    }
  }
  if (teamCreated) {
    checked(
      await db
        .from("team_memberships")
        .update({ is_active: false })
        .eq("team_id", team),
    );
    checked(
      await db
        .from("admin_teams")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", team),
    );
  }
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", accounts),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", accounts)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-form-access-inventory.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback candidate/collaborator inventory and grant checks with 109 fresh fictional accounts, one team and one private draft. Owned form/team archived; all fixture accounts disabled and sessions revoked. Existing accounts/content untouched; no publication, email/provider job, quota reset or production change.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
