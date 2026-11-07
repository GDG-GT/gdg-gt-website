import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-selection-" + randomUUID(),
  email = "fictional-selection-" + actor + "@example.test",
  teams = [],
  members = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-member-selection/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleanup = false;
const checked = (r) => {
  if (r.error) throw Error("Owned selection database failure " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned selection API failure " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const post = (path, body) =>
  h.call(path, { method: "POST", body, key: randomUUID() });
await mkdir(output, { recursive: true });
try {
  checked(
    await h.db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      role: "admin",
      is_active: true,
    }),
  );
  created = true;
  const rows = Array.from({ length: 105 }, (_, i) => ({
    id: randomUUID(),
    name:
      "Fictional destination " +
      actor.slice(0, 8) +
      " " +
      String(i).padStart(3, "0"),
    slug: "fictional-selection-" + actor + "-" + i,
    is_active: true,
  }));
  teams.push(...rows.map((r) => r.id));
  checked(await h.db.from("admin_teams").insert(rows));
  const source = {
      id: randomUUID(),
      name: "Fictional selection source " + actor.slice(0, 8),
      email: "fictional-source-" + actor + "@example.test",
      team_id: teams[0],
      is_active: true,
    },
    targets = Array.from({ length: 65 }, (_, i) => ({
      id: randomUUID(),
      name:
        "Eligible " + String(i + 1).padStart(3, "0") + " " + actor.slice(0, 8),
      email: "fictional-target-" + actor + "-" + i + "@example.test",
      team_id: teams[0],
      is_active: true,
    })),
    other = Array.from({ length: 40 }, (_, i) => ({
      id: randomUUID(),
      name: "A outside scope " + i,
      email: "fictional-outside-" + actor + "-" + i + "@example.test",
      team_id: teams[1],
      is_active: true,
    }));
  members.push(...[source, ...targets, ...other].map((r) => r.id));
  checked(await h.db.from("members").insert([source, ...targets, ...other]));
  data(await post("/auth/gate", { code: h.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  const caps = data(await h.call("/admin/members/capabilities"));
  check(
    teams.every((id) => caps.teams.some((t) => t.id === id)),
    "actual capability inventory includes all 105 owned permitted destinations",
  );
  const first = data(
    await h.call("/admin/members/" + source.id + "/merge-candidates?page=1"),
  );
  const last = data(
    await h.call("/admin/members/" + source.id + "/merge-candidates?page=3"),
  );
  check(
    first.total === 65 &&
      first.items.length === 30 &&
      last.items.length === 5 &&
      last.items.some((t) => t.id === targets[64].id),
    "actual candidate filtering precedes all three pages despite 40 other-scope records",
  );
  const exact = data(
    await h.call(
      "/admin/members/" +
        source.id +
        "/merge-candidates?q=" +
        encodeURIComponent(targets[64].name),
    ),
  );
  check(
    exact.total === 1 && exact.items[0].id === targets[64].id,
    "actual later eligible candidate is searchable without a first-page ceiling",
  );
  const selected = data(
    await h.call(
      "/admin/members/" + source.id + "/merge-target/" + targets[64].id,
    ),
  );
  check(
    selected.member.id === targets[64].id &&
      selected.sourceRevision === first.sourceRevision,
    "actual off-page selected target has its own source-bound current lookup",
  );
  const snapshot = async () =>
    JSON.stringify(
      checked(
        await h.db
          .from("members")
          .select("id,name,email,revision,team_id,merged_into_id,deleted_at")
          .in("id", [source.id, targets[64].id])
          .order("id"),
      ),
    );
  const baseline = await snapshot();
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const label = " at " + viewport.width + "×" + viewport.height,
      ctx = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      errors = [],
      unexpected = [],
      routeErrors = [],
      writes = [];
    let failure = false;
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== h.env.APP_ORIGIN) {
            unexpected.push("External request blocked");
            return route.abort();
          }
          if (
            url.pathname.startsWith("/api/v1/admin/members") &&
            request.method() !== "GET"
          ) {
            if (url.pathname !== "/api/v1/admin/members/merge-preview") {
              writes.push("Unexpected record mutation blocked");
              return route.abort();
            }
          }
          if (failure && url.pathname.includes("/merge-target/"))
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "TEMPORARILY_UNAVAILABLE",
                  message: "Fictional selected target outage",
                },
              },
            });
          return route.continue();
        } catch {
          routeErrors.push("Owned selection route failed");
          await route.abort("failed").catch(() => {});
        }
      });
      let r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { code: h.credentials.gateCode },
      });
      if (r.status() !== 200)
        throw Error("Owned browser gate unavailable " + r.status());
      r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { email, password },
      });
      if (r.status() !== 200)
        throw Error("Owned browser login unavailable " + r.status());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(h.env.APP_ORIGIN + "/admin/members?member=" + source.id);
      await expect(
        page.getByRole("button", {
          name: "Review duplicate merge",
          exact: true,
        }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Review duplicate merge", exact: true })
        .click();
      await expect(
        page.getByText(/65 eligible members in this owning scope/),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Next canonical members", exact: true })
        .click();
      await expect(
        page.getByRole("option", {
          name: targets[30].name + " · " + targets[30].email,
        }),
      ).toHaveCount(1);
      await page
        .getByRole("button", { name: "Next canonical members", exact: true })
        .click();
      await expect(
        page.getByRole("option", {
          name: targets[64].name + " · " + targets[64].email,
        }),
      ).toHaveCount(1);
      await page
        .getByLabel("Canonical member to keep")
        .selectOption(targets[64].id);
      await expect(
        page.getByRole("button", {
          name: "Generate current review",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        (await snapshot()) === baseline,
        "native picker reaches and independently verifies candidate 65 without record writes" +
          label,
      );
      await page
        .getByRole("button", { name: "Generate current review", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Compare before merging",
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        page.getByRole("region", { name: "Private member comparison" }),
      ).toHaveAttribute("tabindex", "0");
      failure = true;
      await page
        .getByRole("button", { name: "Recheck merge selection", exact: true })
        .click();
      await expect(
        page.getByText(/Fictional selected target outage/),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Compare before merging",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Confirm retained merge",
          exact: true,
        }),
      ).toBeDisabled();
      check(
        (await snapshot()) === baseline,
        "native selected-target outage retains the reviewed comparison and pauses merge approval" +
          label,
      );
      failure = false;
      await page
        .getByRole("button", { name: "Retry canonical member", exact: true })
        .click();
      await expect(
        page.getByText(/Fictional selected target outage/),
      ).toHaveCount(0);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
      });
      check(
        !violations.length,
        "populated native scoped merge comparison passes measured axe" + label,
      );
      await page.screenshot({
        path: new URL("member-selection-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Close merge review", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("button", { name: "Stay here", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Compare before merging",
          exact: true,
        }),
      ).toBeVisible();
      check(
        (await snapshot()) === baseline &&
          !writes.length &&
          !errors.length &&
          !unexpected.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "native scoped read recovery and declined navigation leave records unchanged without merges egress errors or overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  checked(
    await h.db
      .from("members")
      .update({ team_id: teams[1] })
      .eq("id", targets[64].id),
  );
  const moved = await h.call(
    "/admin/members/" + source.id + "/merge-target/" + targets[64].id,
  );
  check(
    moved.status === 404,
    "actual selected target that changed owning scope is concealed before projection",
  );
  const reviewAudit = checked(
    await h.db
      .from("admin_actions")
      .select("action")
      .eq("target_type", "member")
      .eq("target_id", source.id)
      .in("action", ["members.merge_reviewed", "members.merged"]),
  );
  check(
    reviewAudit.filter((row) => row.action === "members.merge_reviewed")
      .length === 2 &&
      !reviewAudit.some((row) => row.action === "members.merged"),
    "only two owned review preparations were audited and neither record was merged",
  );
  completed = true;
} finally {
  await browser?.close();
  if (members.length)
    checked(
      await h.db
        .from("members")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", members),
    );
  if (teams.length)
    checked(
      await h.db
        .from("admin_teams")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", teams),
    );
  if (created) {
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", actor)
        .is("revoked_at", null),
    );
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", actor),
    );
  }
  cleanup = true;
  await writeFile(
    new URL("../.docs/phase0/local-member-selection.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Dedicated loopback fictional owned account/105 teams/106 directory records only. Native candidate paging/target recovery and two private review preparations; no merge or real/provider sends. One owned target is deliberately moved for source-bound denial testing. Fixture records/teams archived and account disabled/sessions revoked; retained private reviews/audit are not claimed erased. Reports contain no raw contacts, keys, proof or credentials.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
