import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";

const { db, credentials } = await localHttp();
const evidence = [],
  accounts = [],
  requests = [];
let teamId, budgetId, admin, lead, member, outsider, editor;
const base = "/admin/finances";
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
      `Finance request failed ${r.status} ${r.json?.error?.code || "unavailable"}`,
    );
  return r.json.data;
}
const post = (client, path, body, key = randomUUID()) =>
  client.call(path, { method: "POST", body, key });
async function actor(role, name) {
  const http = await localHttp(),
    id = randomUUID(),
    email = `fictional-finance-${id}@example.test`,
    password = "Fictional-finance-" + randomUUID();
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
  if (created.error) throw new Error("Finance fixture account unavailable");
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
const details = (amount, changes = {}) => ({
  transactionType: "expense",
  category: "Event Costs",
  amount,
  currency: "USD",
  description: "Fictional finance verification — not a real expense",
  transactionDate: "2026-10-20",
  budgetId,
  ...changes,
});
const get = async (client, id) =>
  data(await client.call(base + "/" + id)).record;
async function create(client, amount, changes = {}, key = randomUUID()) {
  const result = data(
    await post(client, base, { teamId, record: details(amount, changes) }, key),
  );
  if (!requests.includes(result.id)) requests.push(result.id);
  return get(client, result.id);
}
const decision = (client, f, action, changes = {}, key = randomUUID()) =>
  post(
    client,
    base + "/" + f.id,
    {
      action,
      revision: f.revision,
      currentPassword: client.password,
      confirmation: f.reference,
      ...changes,
    },
    key,
  );
async function advance(client, f, action, changes) {
  data(await decision(client, f, action, changes));
  return get(client, f.id);
}
try {
  admin = await actor("admin", "Fictional finance administrator");
  lead = await actor("team_member", "Fictional finance lead");
  member = await actor("team_member", "Fictional finance member");
  outsider = await actor("team_member", "Fictional finance outsider");
  editor = await actor("blog_editor", "Fictional finance editor");
  teamId = randomUUID();
  for (const r of [
    await db
      .from("admin_teams")
      .insert({
        id: teamId,
        name: "Fictional finance verification",
        slug: "fictional-finance-" + teamId,
        team_lead_id: lead.id,
        created_by: admin.id,
      }),
    await db.from("team_memberships").insert([
      { team_id: teamId, admin_user_id: lead.id, role: "lead" },
      { team_id: teamId, admin_user_id: member.id, role: "member" },
    ]),
    await db
      .from("team_page_access")
      .insert({
        team_id: teamId,
        page_path: "/admin/finances",
        can_access: true,
      }),
    await db
      .from("team_permissions")
      .insert({
        team_id: teamId,
        resource_type: "finances",
        permission: "crud",
        can_read: true,
        can_update: true,
      }),
  ])
    if (r.error) throw new Error("Finance team fixture unavailable");

  check(
    (await member.call(base, { anonymous: true })).status === 401,
    "anonymous ledger access denied",
  );
  check(
    (await editor.call(base)).status === 403,
    "Blog Editor has no finance workspace",
  );
  check(
    data(await member.call(base + "/capabilities")).fundingReferences.length ===
      0,
    "chapter funding references not disclosed to ordinary members",
  );
  const allocation = {
    name: "Fictional exact-cent allocation",
    totalAmount: "100.00",
    fiscalYear: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  };
  check(
    (
      await post(member, "/admin/budgets", {
        teamId,
        record: allocation,
        currentPassword: member.password,
      })
    ).status === 403,
    "ordinary member cannot create an allocation",
  );
  budgetId = data(
    await post(admin, "/admin/budgets", {
      teamId,
      record: allocation,
      currentPassword: admin.password,
    }),
  ).id;
  const budget = async () =>
    data(await admin.call("/admin/budgets/" + budgetId)).record;
  data(
    await post(admin, "/admin/budgets/" + budgetId, {
      action: "activate",
      revision: 1,
      currentPassword: admin.password,
      confirmation: allocation.name,
    }),
  );
  check(
    (await budget()).status === "active",
    "password-confirmed administrator budget activation",
  );
  check(
    (await outsider.call("/admin/budgets/" + budgetId)).status === 404,
    "outsider cannot read a team budget",
  );

  const firstKey = randomUUID();
  let f = await create(member, "40.10", {}, firstKey);
  check(
    (await create(member, "40.10", {}, firstKey)).id === f.id,
    "draft creation retry is idempotent",
  );
  check(
    f.status === "draft" && f.requiresTeamApproval && f.amount === "40.10",
    "new request is a private exact-cent draft requiring team approval",
  );
  check(
    (await lead.call(base + "/" + f.id)).status === 404,
    "another team lead cannot read a private draft",
  );
  check(
    (await outsider.call(base + "/" + f.id)).status === 404,
    "outsider cannot read a private draft",
  );
  check(
    data(await outsider.call(base)).total === 0,
    "outsider counts and totals reveal no private records",
  );
  const update = {
    action: "update",
    revision: f.revision,
    record: details("40.11"),
  };
  data(await post(member, base + "/" + f.id, update));
  check(
    (await post(member, base + "/" + f.id, update)).status === 409,
    "stale draft edit rejected without overwrite",
  );
  f = await get(member, f.id);
  check(
    (
      await decision(member, f, "submit", {
        currentPassword: "incorrect-fictional-password",
      })
    ).status === 403,
    "decision requires the current account password",
  );
  check(
    (await decision(member, f, "submit", { confirmation: "wrong" })).status ===
      400,
    "typed reference confirmation enforced",
  );
  f = await advance(member, f, "submit");
  check(
    f.status === "pending" && f.submittedBy === member.id,
    "submission binds the actual actor and locks financial details",
  );
  check(
    (await post(member, base + "/" + f.id, { ...update, revision: f.revision }))
      .status === 403,
    "submitted amount cannot be edited",
  );
  check(
    (await decision(admin, f, "admin_approve")).status === 403,
    "administrator cannot skip required team approval",
  );
  check(
    (await decision(member, f, "team_approve")).status === 403,
    "submitter cannot approve their own request",
  );
  f = await advance(lead, f, "team_approve");
  const approveKey = randomUUID(),
    beforeApproval = f;
  data(await decision(admin, f, "admin_approve", {}, approveKey));
  check(
    data(await decision(admin, beforeApproval, "admin_approve", {}, approveKey))
      .status === "admin-approved",
    "confirmed approval retry does not duplicate the transition",
  );
  f = await get(admin, f.id);
  check(
    (await budget()).usage.reserved === "40.11",
    "approval reserves exact cents in the linked allocation",
  );
  check(
    (
      await post(admin, "/admin/budgets/" + budgetId, {
        action: "close",
        revision: 2,
        currentPassword: admin.password,
        confirmation: allocation.name,
      })
    ).json?.error?.code === "BUDGET_IN_USE",
    "allocation cannot close around committed requests",
  );
  f = await advance(admin, f, "complete");
  check(
    (await budget()).usage.spent === "40.11" &&
      (await budget()).usage.reserved === "0.00",
    "completion moves reservation to spent without a payment operation",
  );
  const noteKey = randomUUID(),
    note = {
      note: "Fictional completion clarification; no personal spending or actual payment.",
    };
  data(await post(member, base + "/" + f.id + "/notes", note, noteKey));
  data(await post(member, base + "/" + f.id + "/notes", note, noteKey));
  const detail = data(await member.call(base + "/" + f.id));
  check(
    detail.noteTotal === 1 && detail.decisions.length === 4,
    "append-only note retry is unique and all four state decisions are retained",
  );
  check(
    (await member.call(base + "/" + f.id, { method: "DELETE" })).json?.error
      ?.code === "FINANCE_RETAINED",
    "completed records cannot be hard-deleted",
  );
  check(
    (
      await decision(admin, f, "reject", {
        reason: "Fictional rewrite attempt",
      })
    ).status === 403,
    "completed decisions cannot be rewritten",
  );

  const concurrent = [];
  for (let i = 0; i < 2; i++) {
    let candidate = await create(member, "40.00", {
      description: `Fictional concurrent allocation check ${i + 1}`,
    });
    candidate = await advance(member, candidate, "submit");
    concurrent.push(await advance(lead, candidate, "team_approve"));
  }
  const approvals = await Promise.all(
    concurrent.map((candidate) => decision(admin, candidate, "admin_approve")),
  );
  check(
    approvals.filter((r) => r.status === 200).length === 1 &&
      approvals.filter((r) => r.json?.error?.code === "BUDGET_EXCEEDED")
        .length === 1,
    "simultaneous approvals cannot overbook the same budget",
  );
  check(
    (await budget()).usage.reserved === "40.00",
    "concurrent reservation remains within exact available funding",
  );
  for (const candidate of concurrent) {
    const current = await get(admin, candidate.id);
    await advance(
      admin,
      current,
      current.status === "admin-approved" ? "complete" : "reject",
      current.status === "admin-approved"
        ? {}
        : { reason: "Fictional insufficient allocation" },
    );
  }
  check(
    (await budget()).usage.spent === "80.11",
    "only the winning approved request contributes to completed spend",
  );
  const own = data(
    await post(admin, base, {
      teamId: null,
      record: details("0.10", {
        budgetId: null,
        transactionType: "income",
        category: "Donations",
        description: "Fictional own submitted donation",
      }),
    }),
  );
  requests.push(own.id);
  const submittedOwn = await advance(admin, await get(admin, own.id), "submit");
  check(
    (await decision(admin, submittedOwn, "admin_approve")).status === 403,
    "global administrator cannot self-approve a chapter request",
  );
  await advance(admin, submittedOwn, "cancel");
  const summary = data(await member.call(base + "?teamId=" + teamId));
  check(
    summary.summary.completedExpenses === "80.11" &&
      summary.summary.net === "-80.11",
    "reports exclude rejected requests and preserve exact scoped totals",
  );
  const report = data(await member.call(base + "/report?teamId=" + teamId));
  check(
    report.months.some((m) => m.expenses === "80.11"),
    "monthly completed report agrees with the exact ledger",
  );
  const csv = await member.call(base + "/export?teamId=" + teamId);
  check(
    csv.status === 200 &&
      csv.text.includes('"40.11"') &&
      !csv.text.includes("fictional-finance-"),
    "authorized export contains cents and names, not account emails",
  );
  check(
    (await outsider.call(base + "/export?teamId=" + teamId)).text
      .split("\r\n")
      .filter(Boolean).length === 1,
    "outsider export returns only headers, not team records",
  );
  const audit = await db
    .from("admin_actions")
    .select("action")
    .eq("actor_id", member.id)
    .eq("action", "finances.export");
  if (audit.error) throw new Error("Finance audit query unavailable");
  check(audit.data.length >= 1, "financial export is audited");

  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "BROWSER_URL http://127.0.0.1:8080/admin/finances?request=" + f.id,
    );
    console.info(
      "Type done after browser review to archive fictional accounts and team. Financial records will be retained.",
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of rl)
      if (line.trim() === "done") {
        rl.close();
        break;
      }
  }
  const removed = await db
    .from("team_memberships")
    .update({ is_active: false })
    .eq("team_id", teamId)
    .eq("admin_user_id", member.id);
  if (removed.error)
    throw new Error("Finance membership revocation fixture unavailable");
  check(
    (await member.call(base + "/" + f.id)).status === 404,
    "membership removal revokes historical team finance access immediately",
  );
  check(
    data(await member.call(base + "?teamId=" + teamId)).total === 0,
    "revocation clears scoped counts as well as details",
  );
  data(
    await post(admin, "/admin/budgets/" + budgetId, {
      action: "close",
      revision: 2,
      currentPassword: admin.password,
      confirmation: allocation.name,
    }),
  );
  check(
    (await budget()).status === "closed",
    "allocation closes only after all requests leave approval and reserved states",
  );
} finally {
  // Keep immutable financial evidence. Only archive exactly this invocation's fixtures.
  if (teamId) {
    const current = await db
      .from("admin_teams")
      .select("revision")
      .eq("id", teamId)
      .maybeSingle();
    if (current.data) {
      const archived = await db
        .from("admin_teams")
        .update({
          is_active: false,
          deleted_at: new Date().toISOString(),
          revision: current.data.revision + 1,
        })
        .eq("id", teamId);
      if (archived.error)
        throw new Error("Finance fixture team archive failed");
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
      throw new Error("Finance fixture account archive failed");
  }
}
await writeFile(
  new URL("../.docs/phase0/local-finances-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Dedicated loopback HTTP checks with fictional isolated accounts/team/allocations. No payment, external email, imported data, quota reset or permanent deletion. Financial records and append-only decisions remain retained; fixture accounts and team recoverably archived.",
      retainedFixtureRequestIds: requests,
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
