import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-privacy-write-" + randomUUID(),
  email = "fictional-privacy-write-" + actor + "@example.test",
  contacts = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-person-privacy-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleanup = false;
const checked = (r) => {
    if (r.error) throw Error("Owned privacy database failure " + r.error.code);
    return r.data;
  },
  check = (ok, name) => {
    if (!ok) throw Error(name);
    tests.push({ name, passed: true });
    console.info("PASS " + name);
  };
async function contact() {
  const id = randomUUID(),
    address = "fictional-privacy-subject-" + id + "@example.test";
  checked(
    await h.db.from("contact_submissions").insert({
      id,
      name: "Fictional privacy subject",
      email: address,
      inquiry_type: "general",
      message: "Fictional private content for local recovery only.",
      idempotency_key_hash: tokenHash(token()),
      request_hash: tokenHash(token()),
      delivery_state: "sent",
    }),
  );
  contacts.push(id);
  return { id, address };
}
const snapshot = async (id) =>
  checked(
    await h.db
      .from("contact_submissions")
      .select("id,name,email,message,status,revision,redacted_at")
      .eq("id", id)
      .single(),
  );
await mkdir(output, { recursive: true });
try {
  checked(
    await h.db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      role: "super_admin",
      is_active: true,
    }),
  );
  created = true;
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
    let phase = "",
      position = "",
      lost = false,
      csrf;
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
            url.pathname.startsWith("/api/v1/admin/privacy/") &&
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
            const kind = url.pathname.endsWith("/review") ? "review" : "commit";
            if (kind === phase && !lost && position === "before") {
              lost = true;
              return route.abort("connectionfailed");
            }
            const response = await route.fetch();
            if (
              kind === phase &&
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
          routeErrors.push("Owned privacy route failed");
          await route.abort("failed").catch(() => {});
        }
      });
      let r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { code: h.credentials.gateCode },
      });
      if (r.status() !== 200)
        throw Error("Owned privacy gate unavailable " + r.status());
      r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { email, password },
      });
      if (r.status() !== 200)
        throw Error("Owned privacy login unavailable " + r.status());
      const session = await ctx.request.get(
        h.env.APP_ORIGIN + "/api/v1/auth/session",
      );
      if (session.status() !== 200)
        throw Error("Owned privacy session unavailable");
      csrf = (await session.json()).data.csrfToken;
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      const cases = [
        { phase: "review", position: "before", action: "redact" },
        { phase: "review", position: "after", action: "redact" },
        { phase: "commit", position: "before", action: "redact" },
        { phase: "commit", position: "after", action: "redact" },
        ...(viewport.width === 1440
          ? [
              { phase: "commit", position: "after", action: "export" },
              { phase: "commit", position: "none", action: "export" },
            ]
          : []),
      ];
      for (const scenario of cases) {
        phase = scenario.phase;
        position = scenario.position;
        const action = scenario.action,
          { id, address } = await contact(),
          begin = attempts.length,
          readBegin = inspections.length;
        lost = false;
        await page.goto(h.env.APP_ORIGIN + "/admin/privacy");
        await expect(
          page.getByRole("button", {
            name: "Refresh cleanup status",
            exact: true,
          }),
        ).toBeEnabled();
        await page
          .getByLabel("Exact requester email", { exact: true })
          .fill(address);
        await page
          .getByRole("combobox", { name: /Requested action/ })
          .selectOption(action);
        await page
          .getByRole("textbox", { name: /Request purpose/ })
          .fill("Fictional independently verified local recovery request.");
        await page
          .getByRole("checkbox", { name: /I independently verified/ })
          .check();
        await page
          .getByLabel("Current password for scope review", { exact: true })
          .fill(password);
        await page
          .getByRole("button", {
            name: "Generate exact record review",
            exact: true,
          })
          .click();
        if (phase === "commit") {
          await expect(
            page.getByRole("heading", {
              name: "2. Inspect the exact record review",
              exact: true,
            }),
          ).toBeVisible();
          await page
            .getByRole("textbox", { name: /Privacy action confirmation/ })
            .fill(action.toUpperCase() + " 1 RECORDS");
          await page
            .getByLabel("Current password for final approval", { exact: true })
            .fill(password);
          await page
            .getByRole("button", {
              name:
                action === "export"
                  ? "Prepare reviewed JSON"
                  : "Confirm " + action,
              exact: true,
            })
            .click();
        }
        const region = page.getByRole("region", {
            name: "Unconfirmed privacy request",
            exact: true,
          }),
          original = attempts.at(-1);
        if (position !== "none") {
          await expect(region).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: "Refresh cleanup status",
              exact: true,
            }),
          ).toBeDisabled();
          check(
            attempts.length === begin + (phase === "commit" ? 2 : 1),
            phase +
              " " +
              action +
              " " +
              position +
              " loss freezes original scope/review" +
              label,
          );
          const before = JSON.stringify(await snapshot(id));
          await page
            .getByRole("button", {
              name: "Check original privacy outcome",
              exact: true,
            })
            .click();
          if (position === "before") {
            await page
              .getByLabel("Current password for original privacy retry *", {
                exact: true,
              })
              .fill(password);
            await expect(
              page.getByRole("button", {
                name: "Retry identical privacy request",
                exact: true,
              }),
            ).toBeEnabled();
          } else await expect(region).toHaveCount(0);
          check(
            JSON.stringify(await snapshot(id)) === before &&
              inspections.length === readBegin + 1,
            "read-only " +
              phase +
              " " +
              action +
              " inspection preserves source record" +
              label,
          );
          const body = JSON.parse(original.body);
          delete body.currentPassword;
          check(
            JSON.stringify(JSON.parse(inspections.at(-1).body)) ===
              JSON.stringify(body) && inspections.at(-1).key === original.key,
            "original " +
              phase +
              " inspection uses exact document/key without proof" +
              label,
          );
          if (position === "before") {
            await page
              .getByRole("button", {
                name: "Retry identical privacy request",
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
              "explicit " +
                phase +
                " retry preserves original scope/review/key" +
                label,
            );
          }
        }
        const row = await snapshot(id);
        check(
          phase === "review" || action === "export"
            ? row.revision === 1 && row.email === address
            : row.revision === 2 && row.email === "" && !!row.redacted_at,
          "one " +
            phase +
            " " +
            action +
            " outcome after " +
            position +
            " loss" +
            label,
        );
        if (phase === "review")
          await expect(
            page.getByRole("heading", {
              name: "2. Inspect the exact record review",
              exact: true,
            }),
          ).toBeVisible();
        else
          await expect(
            page.getByRole("heading", {
              name:
                action === "export"
                  ? "Export prepared"
                  : "Reviewed records processed",
              exact: true,
            }),
          ).toBeVisible();
        if (action === "export") {
          const link = page.getByRole("link", {
            name: "Download prepared privacy export",
            exact: true,
          });
          if (position === "after") {
            await expect(link).toHaveCount(0);
            check(
              true,
              "accepted lost export confirms preparation without replaying private bytes" +
                label,
            );
          } else {
            await expect(link).toBeVisible();
            const [file] = await Promise.all([
              page.waitForEvent("download"),
              link.click(),
            ]);
            check(
              file.suggestedFilename().startsWith("privacy-export-") &&
                file.suggestedFilename().endsWith(".json"),
              "prepared private export waits for explicit native download" +
                label,
            );
            await file.delete();
            await page
              .getByRole("button", {
                name: "Clear prepared export",
                exact: true,
              })
              .click();
            await expect(link).toHaveCount(0);
            check(
              true,
              "clearing private export removes its memory-only handoff" + label,
            );
          }
        }
        if (phase === "review" && position === "after") {
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
            "native privacy comparison passes automated accessibility" + label,
          );
          await page.screenshot({
            path: new URL("review-" + viewport.width + ".png", output).pathname,
            fullPage: true,
            animations: "disabled",
          });
        }
        if (
          viewport.width === 375 &&
          phase === "commit" &&
          position === "after"
        ) {
          const key = original.key,
            body = JSON.parse(original.body);
          delete body.currentPassword;
          const currentSession = await ctx.request.get(
            h.env.APP_ORIGIN + "/api/v1/auth/session",
          );
          if (currentSession.status() !== 200)
            throw Error("Owned final privacy session unavailable");
          csrf = (await currentSession.json()).data.csrfToken;
          const response = await ctx.request.post(
            h.env.APP_ORIGIN + original.path + "/recovery",
            {
              headers: {
                Origin: h.env.APP_ORIGIN,
                "X-CSRF-Token": csrf,
                "Idempotency-Key": key,
              },
              data: body,
            },
          );
          check(
            response.status() === 200 && (await response.json()).data.committed,
            "same current browser session can inspect accepted privacy outcome" +
              label,
          );
          checked(
            await h.db
              .from("admin_users")
              .update({ role: "admin" })
              .eq("id", actor),
          );
          const denied = await ctx.request.post(
            h.env.APP_ORIGIN + original.path + "/recovery",
            {
              headers: {
                Origin: h.env.APP_ORIGIN,
                "X-CSRF-Token": csrf,
                "Idempotency-Key": key,
              },
              data: body,
            },
          );
          check(
            denied.status() === 403,
            "current Super Admin loss conceals accepted privacy outcome" +
              label,
          );
        }
      }
      check(
        !errors.length &&
          !egress.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "native privacy recovery has no page errors egress or overflow" + label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
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
      "../.docs/phase0/local-person-privacy-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Loopback fictional owned subject inquiries and officer only. Native original review/approval before/after loss at desktop/mobile, readonly unchanged-source inspection, exact proof-free body/key and fresh explicit retry; lost export metadata vs explicit native handoff/clear, current Super Admin loss. Ten scope reviews maximum under existing quota, no resets/bypass. No providers/workers/production or real chapter changes. Owned contacts redacted, actor disabled/sessions revoked; unused reviews/audit expire under ordinary rules, no direct protected review changes or physical-erasure claim. No raw subject/proof/body/key/capability/export content in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
