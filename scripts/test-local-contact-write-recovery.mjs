import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-contact-write-" + randomUUID(),
  email = "fictional-contact-write-" + actor + "@example.test",
  contacts = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-contact-write-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleanup = false;
const checked = (r) => {
    if (r.error) throw Error("Owned contact database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned contact API failure " + r.status + " " + r.json?.error?.code,
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
async function createContact() {
  const id = randomUUID();
  checked(
    await h.db
      .from("contact_submissions")
      .insert({
        id,
        name: "Fictional inquiry " + id.slice(0, 8),
        email: "fictional-sender-" + id + "@example.test",
        inquiry_type: "general",
        message: "Fictional private inquiry for local mutation recovery only.",
        idempotency_key_hash: tokenHash(token()),
        request_hash: tokenHash(token()),
        delivery_state: "sent",
      }),
  );
  contacts.push(id);
  return id;
}
const snapshot = async (id) =>
  checked(
    await h.db
      .from("contact_submissions")
      .select(
        "id,status,revision,retention_hold,hold_reason,resolved_at,name,email,message",
      )
      .eq("id", id)
      .single(),
  );
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
      egress = [],
      routeErrors = [],
      attempts = [],
      inspections = [];
    let position = "",
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
            url.pathname.startsWith("/api/v1/admin/contact-submissions/") &&
            r.method() === "POST"
          ) {
            const capture = {
              body: r.postData(),
              key: r.headers()["idempotency-key"],
            };
            if (url.pathname.endsWith("/recovery")) {
              inspections.push(capture);
              return route.continue();
            }
            attempts.push(capture);
            if (!lost && position === "before") {
              lost = true;
              return route.abort("connectionfailed");
            }
            const response = await route.fetch();
            if (response.status() === 200 && !lost && position === "after") {
              lost = true;
              return route.abort("connectionfailed");
            }
            return route.fulfill({ response });
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned inquiry route failed");
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
      for (position of ["before", "after"])
        for (const action of ["status", "hold", "release"]) {
          const id = await createContact(),
            path = "/admin/contact-submissions/" + id;
          if (action === "release")
            data(
              await post(path, {
                action: "hold",
                revision: 1,
                enabled: true,
                reason: "Fictional independently reviewed hold",
                confirmation: "HOLD CONTACT",
                currentPassword: password,
              }),
            );
          const originalRow = await snapshot(id),
            begin = attempts.length,
            readBegin = inspections.length;
          lost = false;
          await page.goto(
            h.env.APP_ORIGIN +
              "/admin/communications?tab=contact&contact=" +
              id,
          );
          await expect(
            page.getByRole("heading", { name: originalRow.name, exact: true }),
          ).toBeVisible();
          if (action === "status") {
            await page
              .getByRole("combobox", { name: "Inquiry status", exact: true })
              .selectOption("in_progress");
            await page
              .getByRole("button", { name: "Save inquiry status", exact: true })
              .click();
          } else {
            await page
              .getByRole("button", {
                name:
                  action === "release"
                    ? "Review retention-hold release"
                    : "Review retention hold",
                exact: true,
              })
              .click();
            if (action === "hold")
              await page
                .getByLabel("Reason for retention hold *", { exact: true })
                .fill("Fictional original operational need");
            await page
              .getByLabel("Current password *", { exact: true })
              .fill(password);
            await page
              .getByLabel(
                "Type " +
                  (action === "release" ? "RELEASE HOLD" : "HOLD CONTACT") +
                  " to confirm *",
                { exact: true },
              )
              .fill(action === "release" ? "RELEASE HOLD" : "HOLD CONTACT");
            await page
              .getByRole("button", { name: "Confirm hold change", exact: true })
              .click();
          }
          const region = page.getByRole("region", {
            name: "Unconfirmed inquiry save",
            exact: true,
          });
          await expect(region).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Back to inbox", exact: true }),
          ).toBeDisabled();
          check(
            attempts.length === begin + 1,
            action + " " + position + " loss freezes original inquiry" + label,
          );
          const before = JSON.stringify(await snapshot(id));
          await page
            .getByRole("button", {
              name: "Check original inquiry outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            if (action !== "status")
              await page
                .getByLabel("Current password for original inquiry retry *", {
                  exact: true,
                })
                .fill(password);
            await expect(
              page.getByRole("button", {
                name: "Retry identical inquiry save",
                exact: true,
              }),
            ).toBeEnabled();
          } else await expect(region).toHaveCount(0);
          check(
            JSON.stringify(await snapshot(id)) === before &&
              inspections.length === readBegin + 1,
            "read-only " +
              action +
              " " +
              position +
              " outcome inspection leaves saved inquiry unchanged" +
              label,
          );
          const original = JSON.parse(attempts[begin].body);
          delete original.currentPassword;
          check(
            JSON.stringify(JSON.parse(inspections.at(-1).body)) ===
              JSON.stringify(original) &&
              inspections.at(-1).key === attempts[begin].key,
            "inspection preserves " +
              action +
              " document/key without password" +
              label,
          );
          if (position === "before") {
            await page
              .getByRole("button", {
                name: "Retry identical inquiry save",
                exact: true,
              })
              .click();
            await expect(region).toHaveCount(0);
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
          await expect(
            page.getByRole("heading", { name: originalRow.name, exact: true }),
          ).toBeVisible();
          const saved = await snapshot(id);
          check(
            saved.revision === originalRow.revision + 1 &&
              saved.status === (action === "status" ? "in_progress" : "new") &&
              saved.retention_hold === (action === "hold"),
            "one " +
              action +
              " transition commits after " +
              position +
              " loss" +
              label,
          );
          if (action === "hold" && position === "after") {
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
              "native contact hold confirmation passes automated accessibility" +
                label,
            );
            await page.screenshot({
              path: new URL("confirmed-hold-" + viewport.width + ".png", output)
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
        "native inquiry recovery has no page errors egress or horizontal overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  const id = await createContact(),
    path = "/admin/contact-submissions/" + id,
    body = { action: "status", revision: 1, status: "in_progress" },
    key = randomUUID();
  const rs = await Promise.all(
      Array.from({ length: 10 }, () => post(path, body, key)),
    ),
    first = data(rs[0]);
  check(
    rs.every(
      (r) => r.status === 200 && r.json.data.revision === first.revision,
    ) && (await snapshot(id)).revision === 2,
    "ten simultaneous identical contact saves commit once",
  );
  const baseline = JSON.stringify(await snapshot(id)),
    inspection = data(await post(path + "/recovery", body, key));
  check(
    inspection.committed &&
      !inspection.canRetry &&
      inspection.receipt.revision === 2 &&
      JSON.stringify(await snapshot(id)) === baseline,
    "accepted inspection is read-only and returns minimal contact receipt",
  );
  data(await post(path, { action: "status", revision: 2, status: "resolved" }));
  const replay = data(await post(path, body, key));
  check(
    replay.revision === 2 && (await snapshot(id)).status === "resolved",
    "accepted old inquiry replay preserves newer status",
  );
  check(
    (await post(path, body)).status === 409,
    "new stale inquiry save cannot overwrite newer status",
  );
  const hold = {
      action: "hold",
      revision: 3,
      enabled: true,
      reason: "Fictional reviewed retention need",
      confirmation: "HOLD CONTACT",
    },
    holdKey = randomUUID();
  check(
    (await post(path, { ...hold, currentPassword: "incorrect" }, holdKey)).json
      ?.error?.code === "PASSWORD_REQUIRED",
    "new hold rejects incorrect current proof",
  );
  data(await post(path, { ...hold, currentPassword: password }, holdKey));
  const held = JSON.stringify(await snapshot(id));
  check(
    data(await post(path + "/recovery", hold, holdKey)).committed &&
      JSON.stringify(await snapshot(id)) === held,
    "accepted hold inspection needs no retained password and does not mutate",
  );
  checked(
    await h.db
      .from("admin_users")
      .update({ role: "team_member" })
      .eq("id", actor),
  );
  check(
    (await post(path + "/recovery", body, key)).status === 404,
    "current access loss conceals previously accepted inquiry receipt",
  );
  completed = true;
} finally {
  await browser?.close();
  if (contacts.length)
    checked(
      await h.db
        .from("contact_submissions")
        .update({
          name: "Removed contact",
          email: "",
          message: "Removed fictional local inquiry.",
          interests: [],
          status: "redacted",
          redacted_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          retention_hold: false,
          hold_reason: null,
        })
        .in("id", contacts),
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
      "../.docs/phase0/local-contact-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Dedicated loopback owned fictional inquiries/account only. Native status/hold/release before/after loss, readonly original inspection and fresh-proof retry; ten simultaneous saves, accepted old replay, stale conflict and current authority loss. No providers/workers/files/production/real chapter changes. Owned inquiry content redacted and account disabled/sessions revoked; tombstones/audit remain, no physical-erasure claim. No raw contacts/body/proof/keys/credentials in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
