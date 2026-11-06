import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { communityMemberRecord } from "../shared/members.mjs";
const h = await localHttp(),
  actors = [],
  members = [],
  tests = [],
  password = "Fictional-member-read-" + randomUUID(),
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-member-read-recovery/",
    import.meta.url,
  );
let browser,
  completed = false,
  cleanup = false;
const checked = (r) => {
  if (r.error)
    throw Error("Owned member fixture database failure " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Owned member fixture API failure " +
        r.status +
        " " +
        r.json?.error?.code,
    );
  return r.json.data;
};
const post = (path, body) =>
  h.call(path, { method: "POST", body, key: randomUUID() });
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const actor = randomUUID(),
      email = "fictional-member-read-" + actor + "@example.test",
      label = " at " + viewport.width + "×" + viewport.height;
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
    actors.push(actor);
    data(await post("/auth/gate", { code: h.credentials.gateCode }));
    data(await post("/auth/login", { email, password }));
    const record = communityMemberRecord.parse({
      name: "Fictional directory read " + actor.slice(0, 8),
      email: "fictional-directory-" + actor + "@example.test",
      interests: ["Fictional read review"],
    });
    const created = data(
      await post("/admin/members", { record, teamId: null }),
    );
    members.push(created.id);
    const snapshot = async () =>
      JSON.stringify(
        checked(
          await h.db
            .from("members")
            .select("id,name,email,revision,deleted_at")
            .eq("id", created.id)
            .single(),
        ),
      );
    const baseline = await snapshot(),
      ctx = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      errors = [],
      unexpected = [],
      routeErrors = [],
      writes = [];
    let failure = "";
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== h.env.APP_ORIGIN) {
            unexpected.push("External request blocked");
            return route.abort();
          }
          if (url.pathname.startsWith("/api/v1/admin/members")) {
            if (request.method() !== "GET") {
              writes.push("Unexpected directory write blocked");
              return route.abort();
            }
            const kind = url.pathname.endsWith("/capabilities")
              ? "permissions"
              : url.pathname.endsWith("/activity")
                ? "activity"
                : url.pathname.endsWith("/members")
                  ? "inventory"
                  : "detail";
            if (failure === kind)
              return route.fulfill({
                status: 503,
                json: {
                  error: {
                    code: "TEMPORARILY_UNAVAILABLE",
                    message: "Fictional " + kind + " outage",
                  },
                },
              });
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned member route operation failed");
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
      failure = "permissions";
      await page.goto(h.env.APP_ORIGIN + "/admin/members?member=" + created.id);
      await expect(
        page.getByText(/Fictional permissions outage/),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: record.name, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New member", exact: true }),
      ).toBeDisabled();
      check(
        (await snapshot()) === baseline,
        "independent permissions outage preserves current private record without writes" +
          label,
      );
      failure = "";
      await page
        .getByRole("button", { name: "Retry member permissions", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "New member", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Edit member", exact: true })
        .click();
      await page
        .getByLabel("Name *", { exact: true })
        .fill("Unsaved fictional directory proposal " + viewport.width);
      failure = "detail";
      await page
        .getByRole("button", { name: "Recheck member access", exact: true })
        .click();
      await expect(page.getByText(/Fictional detail outage/)).toBeVisible();
      await expect(page.getByLabel("Name *", { exact: true })).toHaveValue(
        "Unsaved fictional directory proposal " + viewport.width,
      );
      await expect(
        page.getByRole("button", { name: "Save member changes", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText(/Showing selected member from/),
      ).toBeVisible();
      check(
        (await snapshot()) === baseline,
        "background detail outage preserves dated snapshot and local proposal only" +
          label,
      );
      failure = "";
      await page
        .getByRole("button", { name: "Retry selected member", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save member changes", exact: true }),
      ).toBeEnabled();
      check(
        (await snapshot()) === baseline,
        "current selected retry restores save availability without changing the proposed or saved record" +
          label,
      );
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
      });
      check(
        !violations.length,
        "populated retained member editor passes measured axe" + label,
      );
      await page.screenshot({
        path: new URL("member-retained-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("button", { name: "Stay here", exact: true })
        .click();
      await expect(page.getByLabel("Name *", { exact: true })).toHaveValue(
        "Unsaved fictional directory proposal " + viewport.width,
      );
      check(
        (await snapshot()) === baseline,
        "declined member navigation retains the proposal without saving" +
          label,
      );
      await page
        .getByRole("button", { name: "Close editor", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Discard and leave", exact: true })
        .click();
      failure = "activity";
      await page
        .getByRole("button", { name: "Recheck member access", exact: true })
        .click();
      await expect(page.getByText(/Fictional activity outage/)).toBeVisible();
      failure = "";
      await page
        .getByRole("button", { name: "Retry member activity", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Retained activity", exact: true }),
      ).toBeVisible();
      check(
        (await snapshot()) === baseline,
        "independent activity retry neither changes records nor reopens the discarded editor" +
          label,
      );
      check(
        !writes.length &&
          !errors.length &&
          !unexpected.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "member read recovery has no writes external egress errors or overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  completed = true;
} finally {
  await browser?.close();
  for (const id of members) {
    const member = data(await h.call("/admin/members/" + id)).member;
    if (!member.deleted_at)
      data(
        await post("/admin/members/" + id, {
          action: "archive",
          revision: member.revision,
          currentPassword: password,
          confirmation: member.reference,
        }),
      );
  }
  if (actors.length) {
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", actors)
        .is("revoked_at", null),
    );
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", actors),
    );
  }
  cleanup = true;
  await writeFile(
    new URL("../.docs/phase0/local-member-read-recovery.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Loopback fictional owned private records/accounts only. Native read outages/retries/proposal/navigation and measured axe at desktop/mobile. No native directory mutations or provider sends. Fixture records archived, accounts disabled and sessions revoked; retained audit/private records are not claimed physically erased. No raw contacts, keys, credentials or proposal bodies in evidence.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
