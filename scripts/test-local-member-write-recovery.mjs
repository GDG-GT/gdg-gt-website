import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { communityMemberRecord } from "../shared/members.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-member-write-" + randomUUID(),
  email = "fictional-member-write-" + actor + "@example.test",
  owned = new Set(),
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-member-write-recovery/",
    import.meta.url,
  );
let created = false,
  browser,
  completed = false,
  cleanup = false;
const checked = (r) => {
    if (r.error)
      throw Error("Owned member write database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned member write API failure " +
          r.status +
          " " +
          r.json?.error?.code,
      );
    return r.json.data;
  },
  check = (ok, name) => {
    if (!ok) throw Error(name);
    tests.push({ name, passed: true });
    console.info("PASS " + name);
  };
const post = (path, body, key = randomUUID()) =>
  h.call(path, { method: "POST", body, key });
await mkdir(output, { recursive: true });
try {
  checked(
    await h.db
      .from("admin_users")
      .insert({
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
      unexpected = [],
      routeErrors = [],
      attempts = [],
      inspections = [];
    let action = "",
      position = "",
      lost = false,
      currentId;
    const snapshot = async () =>
      JSON.stringify(
        checked(
          await h.db
            .from("members")
            .select("id,revision,name,email,deleted_at,is_active")
            .in("id", [...owned])
            .order("id"),
        ),
      );
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const r = route.request(),
            url = new URL(r.url());
          if (url.origin !== h.env.APP_ORIGIN) {
            unexpected.push("External request blocked");
            return route.abort();
          }
          if (
            url.pathname.startsWith("/api/v1/admin/members") &&
            r.method() === "POST"
          ) {
            if (url.pathname.endsWith("/recovery")) {
              inspections.push({
                body: r.postData(),
                key: r.headers()["idempotency-key"],
              });
              return route.continue();
            }
            attempts.push({
              body: r.postData(),
              key: r.headers()["idempotency-key"],
            });
            if (!lost && position === "before") {
              lost = true;
              return route.abort("connectionfailed");
            }
            const response = await route.fetch();
            if (response.status() === 200) {
              const result = (await response.json()).data;
              if (result.id) {
                owned.add(result.id);
                currentId = result.id;
              }
              if (!lost && position === "after") {
                lost = true;
                return route.abort("connectionfailed");
              }
            }
            return route.fulfill({ response });
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned member write route failed");
          await route.abort("failed").catch(() => {});
        }
      });
      let r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { code: h.credentials.gateCode },
      });
      if (r.status() !== 200)
        throw Error("Owned member browser gate unavailable " + r.status());
      r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { email, password },
      });
      if (r.status() !== 200)
        throw Error("Owned member browser login unavailable " + r.status());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      for (position of ["before", "after"])
        for (action of ["create", "update", "archive"]) {
          lost = false;
          const begin = attempts.length,
            readBegin = inspections.length;
          await page.goto(
            h.env.APP_ORIGIN +
              "/admin/members" +
              (action === "create" ? "" : "?member=" + currentId),
          );
          await expect(
            page.getByRole("button", { name: "New member", exact: true }),
          ).toBeEnabled();
          if (action === "create") {
            await page
              .getByRole("button", { name: "New member", exact: true })
              .click();
            await page
              .getByLabel("Name *", { exact: true })
              .fill(
                "Fictional original " +
                  viewport.width +
                  " " +
                  position +
                  " " +
                  actor.slice(0, 8),
              );
            await page
              .getByLabel("Email *", { exact: true })
              .fill(
                "fictional-member-" +
                  actor +
                  "-" +
                  viewport.width +
                  "-" +
                  position +
                  "@example.test",
              );
          } else if (action === "update") {
            await page
              .getByRole("button", { name: "Edit member", exact: true })
              .click();
            await page
              .getByLabel("Name *", { exact: true })
              .fill(
                "Fictional original updated " + viewport.width + " " + position,
              );
          } else {
            const reference = data(await h.call("/admin/members/" + currentId))
              .member.reference;
            await page
              .getByRole("button", { name: "Archive member", exact: true })
              .click();
            await page
              .getByRole("textbox", { name: /Exact member reference/ })
              .fill(reference);
            await page
              .getByLabel("Current password *", { exact: true })
              .fill(password);
          }
          await page
            .getByRole("button", { name: "Save member changes", exact: true })
            .click();
          const region = page.getByRole("region", {
            name: "Unconfirmed member save",
            exact: true,
          });
          await expect(region).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: "Save member changes",
              exact: true,
            }),
          ).toBeDisabled();
          check(
            attempts.length === begin + 1,
            action +
              " " +
              position +
              " lost reply freezes original request" +
              label,
          );
          const before = await snapshot();
          await page
            .getByRole("button", {
              name: "Check original member outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            if (action === "archive")
              await page
                .getByLabel("Current password for original member retry *", {
                  exact: true,
                })
                .fill(password);
            await expect(
              page.getByRole("button", {
                name: "Retry identical member save",
                exact: true,
              }),
            ).toBeEnabled();
          } else
            await expect(
              page.getByText("Original community member save confirmed.", {
                exact: true,
              }),
            ).toBeVisible();
          check(
            (await snapshot()) === before &&
              inspections.length === readBegin + 1,
            "read-only " +
              action +
              " " +
              position +
              " inspection leaves saved rows unchanged" +
              label,
          );
          const original = JSON.parse(attempts[begin].body);
          delete original.currentPassword;
          check(
            JSON.stringify(JSON.parse(inspections.at(-1).body)) ===
              JSON.stringify(original) &&
              inspections.at(-1).key === attempts[begin].key,
            "original " +
              action +
              " " +
              position +
              " inspection uses exact document/key without password" +
              label,
          );
          if (position === "before") {
            await page
              .getByRole("button", {
                name: "Retry identical member save",
                exact: true,
              })
              .click();
            await expect(
              page.getByText("Original community member save confirmed.", {
                exact: true,
              }),
            ).toBeVisible();
            const retried = JSON.parse(attempts.at(-1).body);
            delete retried.currentPassword;
            check(
              JSON.stringify(retried) === JSON.stringify(original) &&
                attempts.at(-1).key === attempts[begin].key,
              "explicit " +
                action +
                " retry preserves original fields/key" +
                label,
            );
          }
          const saved = checked(
            await h.db
              .from("members")
              .select("revision,deleted_at,name,email")
              .eq("id", currentId)
              .single(),
          );
          check(
            saved.revision ===
              (action === "create" ? 1 : action === "update" ? 2 : 3) &&
              !!saved.deleted_at === (action === "archive"),
            "only one " +
              action +
              " transition commits after " +
              position +
              " loss" +
              label,
          );
          if (action === "update" && position === "after") {
            await page.addScriptTag({
              path: require.resolve("axe-core/axe.min.js"),
            });
            const violations = await page.evaluate(async () => {
              const r = await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
                },
              });
              return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
            });
            check(
              !violations.length,
              "confirmed real member recovery passes measured axe" + label,
            );
            await page.screenshot({
              path: new URL("member-write-" + viewport.width + ".png", output)
                .pathname,
              fullPage: true,
              animations: "disabled",
            });
          }
        }
      check(
        !errors.length &&
          !unexpected.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "member write recovery has no unexpected egress errors or overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  const record = communityMemberRecord.parse({
      name: "Fictional simultaneous member",
      email: "fictional-concurrent-" + actor + "@example.test",
    }),
    body = { record, teamId: null },
    key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 10 }, () => post("/admin/members", body, key)),
  );
  for (const result of results)
    if (result.status === 200) owned.add(result.json.data.id);
  check(
    results.every((r) => r.status === 200) &&
      new Set(results.map((r) => r.json?.data?.id)).size === 1,
    "ten simultaneous identical member creates return one owned record",
  );
  const first = data(results[0]),
    revision = first.revision;
  const update = {
      action: "update",
      revision,
      record: { ...record, name: "Fictional accepted update" },
    },
    updateKey = randomUUID();
  const updated = data(
    await post("/admin/members/" + first.id, update, updateKey),
  );
  data(
    await post("/admin/members/" + first.id, {
      ...update,
      revision: updated.revision,
      record: { ...record, name: "Fictional later saved member" },
    }),
  );
  const replay = data(
      await post("/admin/members/" + first.id, update, updateKey),
    ),
    current = data(await h.call("/admin/members/" + first.id)).member;
  check(
    replay.revision === updated.revision &&
      current.name === "Fictional later saved member",
    "accepted old member replay preserves a newer saved edit",
  );
  const stale = await post("/admin/members/" + first.id, update);
  check(
    stale.status === 409,
    "new stale member request conflicts instead of overwriting current record",
  );
  completed = true;
} finally {
  await browser?.close();
  if (owned.size)
    checked(
      await h.db
        .from("members")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", [...owned]),
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
      "../.docs/phase0/local-member-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Dedicated loopback owned fictional records/account only. Native create/update/archive before/after loss, read-only original inspection and fresh-proof retry, ten simultaneous creates and stale/old replay. No provider/production/real chapter changes. Fixture records archived, account disabled/sessions revoked; private tombstones/audit remain, no physical-erasure claim. No raw contacts/proof/body/keys/credentials retained in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
