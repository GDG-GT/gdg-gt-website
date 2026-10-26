import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate } from "../shared/forms.ts";

if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const owner = await localHttp(),
  viewer = await localHttp(),
  { db } = owner;
const hold = process.argv.includes("--hold-for-browser"),
  ledger = new URL("../.docs/local-form-viewing.local", import.meta.url);
if (process.argv.slice(2).some((arg) => arg !== "--hold-for-browser"))
  throw Error("Unknown test option");
if (hold && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal");
const actor = randomUUID(),
  member = randomUUID(),
  password = "Fictional-viewing-" + randomUUID(),
  email = `fictional-viewing-${member}@example.test`,
  evidence = [],
  forms = [];
let ledgerOwned = false,
  terminal;
const checked = (result) => {
  if (result.error)
    throw Error("Fixture database failed: " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Fixture API failed: " + result.status + " " + result.json?.error?.code,
    );
  return result.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
};
try {
  checked(
    await db.from("admin_users").insert([
      {
        id: actor,
        email: `fictional-viewing-${actor}@example.test`,
        password_hash: await hashSecret(password),
        role: "admin",
        is_active: true,
        display_name: "Fictional Forms Owner",
      },
      {
        id: member,
        email,
        password_hash: await hashSecret(password),
        role: "team_member",
        is_active: true,
        display_name: "Fictional Forms Viewer",
      },
    ]),
  );
  for (const [client, address] of [
    [owner, `fictional-viewing-${actor}@example.test`],
    [viewer, email],
  ]) {
    data(
      await client.call("/auth/gate", {
        method: "POST",
        body: { code: client.credentials.gateCode },
      }),
    );
    data(
      await client.call("/auth/login", {
        method: "POST",
        body: { email: address, password },
      }),
    );
  }
  const template = createTemplate(
      "Fictional view-only " + actor.slice(0, 8),
      "blank",
    ),
    { title, description, fields, sections, settings } = template;
  const form = data(
    await owner.call("/admin/forms", {
      method: "POST",
      key: randomUUID(),
      body: {
        slug: template.slug,
        definition: { title, description, fields, sections, settings },
      },
    }),
  ).form;
  forms.push(form.id);
  const base = "/admin/forms/" + form.id;
  data(
    await owner.call(base + "/collaborators", {
      method: "PATCH",
      body: { userId: member, actions: ["view"] },
    }),
  );
  const definition = data(await viewer.call(base)).form;
  check(
    JSON.stringify(definition.actions) === '["view"]' &&
      definition.responseCount === null,
    "view collaborator reads definition without response capability/count",
  );
  const inventory = data(
    await viewer.call("/admin/forms?q=" + encodeURIComponent(title)),
  );
  check(
    inventory.canCreate === false &&
      inventory.total === 1 &&
      inventory.items[0].canDuplicate === false &&
      inventory.items[0].responseCount === null,
    "inventory disables creation/copy and preserves restricted response count",
  );
  const access = (path) =>
    viewer.call("/admin/access?" + new URLSearchParams({ route: path }));
  check(
    data(await access(base + "/edit")).allowed === true &&
      data(await access(base + "/responses")).allowed === false,
    "definition route permits inspection while response route remains denied",
  );
  check(
    data(await viewer.call("/admin/access")).accessibleRoutes.includes(
      "/admin/forms",
    ),
    "view collaborator can discover Forms in workspace navigation",
  );
  for (const [suffix, method, body, name] of [
    [
      "/draft",
      "PATCH",
      {
        revision: form.revision,
        definition: {
          title: "Forbidden fictional edit",
          description,
          fields,
          sections,
          settings,
        },
      },
      "draft editing",
    ],
    ["/publish", "POST", { revision: form.revision }, "publishing"],
    ["/responses", "GET", undefined, "response review"],
    ["/collaborators", "GET", undefined, "access management"],
    [
      "/duplicate",
      "POST",
      { slug: "fictional-denied-" + member },
      "duplication",
    ],
  ]) {
    const result = await viewer.call(base + suffix, {
      method,
      body,
      key: method === "POST" ? randomUUID() : undefined,
    });
    check(
      [403, 404].includes(result.status),
      "view-only " + name + " denied by actual server",
    );
  }
  const missing = await viewer.call("/admin/forms/" + randomUUID());
  check(missing.status === 404, "ungranted form remains concealed");
  const unchanged = data(await owner.call(base)).form;
  check(
    unchanged.title === title &&
      unchanged.revision === form.revision &&
      unchanged.status === "Draft",
    "denied operations leave original definition/revision/state intact",
  );
  if (hold) {
    await writeFile(
      ledger,
      JSON.stringify({ email, password, formId: form.id, title }) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    console.info(
      "Fictional view-only review ready. Credentials remain in the private local ledger. Enter done after browser review.",
    );
    terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of terminal) if (line.trim() === "done") break;
  }
  await writeFile(
    new URL("../.docs/phase0/local-form-viewing.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback HTTP/database checks with isolated fictional accounts; no provider sends or deployment. Browser observations recorded separately.",
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  terminal?.close();
  if (ledgerOwned) await unlink(ledger);
  for (const id of forms)
    checked(
      await db
        .from("forms")
        .update({ state: "Archived" })
        .eq("id", id)
        .eq("owner_id", actor),
    );
  for (const client of [owner, viewer]) await client.logout();
  checked(
    await db
      .from("admin_users")
      .update({ is_active: false })
      .in("id", [actor, member]),
  );
  console.info(
    "Only invocation-owned forms archived and fictional accounts disabled.",
  );
}
