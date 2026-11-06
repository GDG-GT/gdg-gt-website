import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-merge-" + randomUUID(),
  email = "fictional-merge-" + actor + "@example.test",
  owned = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-member-merge-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleanup = false;
const checked = (r) => {
    if (r.error) throw Error("Owned merge database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned merge API failure " + r.status + " " + r.json?.error?.code,
      );
    return r.json.data;
  },
  check = (ok, name) => {
    if (!ok) throw Error(name);
    tests.push({ name, passed: true });
    console.info("PASS " + name);
  },
  post = (path, body, key = randomUUID()) =>
    h.call(path, { method: "POST", body, key });
async function pair() {
  const source = randomUUID(),
    target = randomUUID();
  checked(
    await h.db.from("members").insert([
      {
        id: source,
        name: "Fictional source " + source.slice(0, 8),
        email: "fictional-source-" + source + "@example.test",
      },
      {
        id: target,
        name: "Fictional canonical " + target.slice(0, 8),
        email: "fictional-canonical-" + target + "@example.test",
      },
    ]),
  );
  owned.push(source, target);
  return { source, target };
}
const snapshot = async (ids) =>
  checked(
    await h.db
      .from("members")
      .select("id,name,email,revision,is_active,deleted_at,merged_into_id")
      .in("id", ids)
      .order("id"),
  );
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
  data(await post("/auth/gate", { code: h.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
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
      egress = [],
      routeErrors = [],
      attempts = [],
      inspections = [];
    let action = "",
      position = "",
      lost = false;
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const r = route.request(),
            url = new URL(r.url());
          if (url.origin !== h.env.APP_ORIGIN) {
            egress.push("External request blocked");
            return route.abort();
          }
          if (
            url.pathname.startsWith("/api/v1/admin/members/merge") &&
            r.method() === "POST"
          ) {
            const capture = {
              path: url.pathname,
              body: r.postData(),
              key: r.headers()["idempotency-key"],
            };
            if (url.pathname.endsWith("/recovery")) {
              inspections.push(capture);
              return route.continue();
            }
            attempts.push(capture);
            const kind = url.pathname.endsWith("/merge-preview")
              ? "preview"
              : "commit";
            if (kind === action && !lost && position === "before") {
              lost = true;
              return route.abort("connectionfailed");
            }
            const response = await route.fetch();
            if (
              kind === action &&
              response.status() === 200 &&
              !lost &&
              position === "after"
            ) {
              lost = true;
              return route.abort("connectionfailed");
            }
            return route.fulfill({ response });
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned merge route failed");
          await route.abort("failed").catch(() => {});
        }
      });
      let r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { code: h.credentials.gateCode },
      });
      if (r.status() !== 200)
        throw Error("Owned merge gate unavailable " + r.status());
      r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { email, password },
      });
      if (r.status() !== 200)
        throw Error("Owned merge login unavailable " + r.status());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      for (action of ["preview", "commit"])
        for (position of ["before", "after"]) {
          const { source, target } = await pair(),
            ids = [source, target],
            begin = attempts.length,
            readBegin = inspections.length;
          lost = false;
          await page.goto(h.env.APP_ORIGIN + "/admin/members?member=" + source);
          await page
            .getByRole("button", {
              name: "Review duplicate merge",
              exact: true,
            })
            .click();
          const canonical = data(
            await h.call("/admin/members/" + target),
          ).member;
          await page
            .getByRole("searchbox", {
              name: "Search canonical members",
              exact: true,
            })
            .fill(canonical.name);
          await expect(
            page.getByRole("option", {
              name: canonical.name + " · " + canonical.email,
              exact: true,
            }),
          ).toHaveCount(1);
          await page
            .getByRole("combobox", { name: /^Canonical member to keep/ })
            .selectOption(target);
          await expect(
            page.getByRole("button", {
              name: "Generate current review",
              exact: true,
            }),
          ).toBeEnabled();
          await page
            .getByRole("button", {
              name: "Generate current review",
              exact: true,
            })
            .click();
          if (action === "commit") {
            await expect(
              page.getByRole("heading", {
                name: "Compare before merging",
                exact: true,
              }),
            ).toBeVisible();
            const original = data(
              await h.call("/admin/members/" + source),
            ).member;
            await page
              .getByRole("textbox", { name: /Source reference/ })
              .fill(original.reference);
            await page
              .getByRole("textbox", { name: /Canonical reference/ })
              .fill(canonical.reference);
            await page
              .getByLabel("Current password *", { exact: true })
              .fill(password);
            await page
              .getByRole("button", {
                name: "Confirm retained merge",
                exact: true,
              })
              .click();
          }
          const region = page.getByRole("region", {
            name: "Unconfirmed merge save",
            exact: true,
          });
          await expect(region).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: "Close merge review",
              exact: true,
            }),
          ).toBeDisabled();
          const original = attempts.at(-1),
            before = JSON.stringify(await snapshot(ids));
          check(
            attempts.length === begin + (action === "commit" ? 2 : 1),
            action +
              " " +
              position +
              " loss freezes exact original merge request" +
              label,
          );
          await page
            .getByRole("button", {
              name: "Check original merge outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            if (action === "commit")
              await page
                .getByLabel("Current password for original merge retry *", {
                  exact: true,
                })
                .fill(password);
            await expect(
              page.getByRole("button", {
                name: "Retry identical merge save",
                exact: true,
              }),
            ).toBeEnabled();
          } else await expect(region).toHaveCount(0);
          check(
            JSON.stringify(await snapshot(ids)) === before &&
              inspections.length === readBegin + 1,
            "read-only " +
              action +
              " inspection leaves both member records unchanged" +
              label,
          );
          const body = JSON.parse(original.body);
          delete body.currentPassword;
          check(
            JSON.stringify(JSON.parse(inspections.at(-1).body)) ===
              JSON.stringify(body) && inspections.at(-1).key === original.key,
            "original " +
              action +
              " inspection preserves body/key without password" +
              label,
          );
          if (position === "before") {
            await page
              .getByRole("button", {
                name: "Retry identical merge save",
                exact: true,
              })
              .click();
            await expect(region).toHaveCount(0);
            const last = attempts.at(-1),
              retried = JSON.parse(last.body);
            delete retried.currentPassword;
            check(
              JSON.stringify(retried) === JSON.stringify(body) &&
                last.key === original.key,
              "explicit " + action + " retry preserves original intent" + label,
            );
          }
          const rows = await snapshot(ids),
            a = rows.find((v) => v.id === source),
            b = rows.find((v) => v.id === target);
          check(
            action === "preview"
              ? a.revision === 1 && b.revision === 1
              : a.revision === 2 &&
                  b.revision === 2 &&
                  a.merged_into_id === target &&
                  !a.is_active &&
                  b.name === canonical.name,
            "one " +
              action +
              " outcome and unchanged canonical fields after " +
              position +
              " loss" +
              label,
          );
          const actions = checked(
            await h.db
              .from("admin_actions")
              .select("id")
              .eq("actor_id", actor)
              .eq("target_id", source)
              .eq(
                "action",
                action === "preview"
                  ? "members.merge_reviewed"
                  : "members.merged",
              ),
          );
          check(
            actions.length === 1,
            "exactly one " + action + " audit outcome" + label,
          );
          if (action === "preview" && position === "after") {
            await page.addScriptTag({
              path: require.resolve("axe-core/axe.min.js"),
            });
            const violations = await page.evaluate(async () => {
              const r = await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa"],
                },
              });
              return r.violations.map((v) => v.id);
            });
            check(
              !violations.length,
              "native populated merge comparison passes automated accessibility" +
                label,
            );
            await page.screenshot({
              path: new URL("review-" + viewport.width + ".png", output)
                .pathname,
              fullPage: true,
              animations: "disabled",
            });
          }
        }
      check(
        !errors.length &&
          !egress.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "native merge recovery has no page errors egress or horizontal overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  const { source, target } = await pair(),
    preview = {
      sourceId: source,
      targetId: target,
      sourceRevision: 1,
      targetRevision: 1,
    },
    key = randomUUID(),
    rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        post("/admin/members/merge-preview", preview, key),
      ),
    ),
    review = data(rs[0]);
  check(
    rs.every(
      (r) => r.status === 200 && r.json.data.reviewId === review.reviewId,
    ),
    "ten simultaneous identical previews create one merge review",
  );
  const a = data(await h.call("/admin/members/" + source)).member,
    b = data(await h.call("/admin/members/" + target)).member,
    commit = {
      reviewId: review.reviewId,
      reviewToken: review.reviewToken,
      sourceConfirmation: a.reference,
      targetConfirmation: b.reference,
    },
    commitKey = randomUUID();
  const cs = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(
        "/admin/members/merge",
        { ...commit, currentPassword: password },
        commitKey,
      ),
    ),
  );
  check(
    cs.every((r) => r.status === 200 && r.json.data.revision === 2) &&
      (await snapshot([source, target])).every((v) => v.revision === 2),
    "ten simultaneous identical merges change each member revision once",
  );
  checked(
    await h.db
      .from("members")
      .update({ name: "Fictional later canonical", revision: 3 })
      .eq("id", target),
  );
  const baseline = JSON.stringify(await snapshot([source, target])),
    inspected = data(
      await post("/admin/members/merge/recovery", commit, commitKey),
    );
  check(
    inspected.committed &&
      inspected.receipt.revision === 2 &&
      JSON.stringify(await snapshot([source, target])) === baseline,
    "accepted merge inspection preserves later canonical revision without password",
  );
  const replay = data(
    await post(
      "/admin/members/merge",
      { ...commit, currentPassword: password },
      commitKey,
    ),
  );
  check(
    replay.revision === 2 &&
      JSON.stringify(await snapshot([source, target])) === baseline,
    "accepted old merge replay preserves later canonical data",
  );
  checked(
    await h.db
      .from("admin_users")
      .update({ role: "team_member" })
      .eq("id", actor),
  );
  check(
    (await post("/admin/members/merge/recovery", commit, commitKey)).status ===
      403,
    "current role loss conceals accepted merge receipt",
  );
  completed = true;
} finally {
  await browser?.close();
  if (owned.length)
    checked(
      await h.db
        .from("members")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", owned),
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
    new URL(
      "../.docs/phase0/local-member-merge-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Loopback owned fictional members/account only. Native merge preview/commit before/after loss, read-only original inspection, fresh-proof explicit retry; ten concurrent same-key previews/merges, accepted old replay and current role loss. No provider/production/real chapter changes. Owned members archived/account disabled/sessions revoked; reviews/audit/tombstones retained under ordinary expiry, no physical-erasure claim. No raw contact/body/key/proof/capability retained in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
