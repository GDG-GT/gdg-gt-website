import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-inbox-read-" + randomUUID(),
  email = "fictional-inbox-read-" + actor + "@example.test",
  contacts = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-contact-inbox-reads/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleanup = false;
const checked = (r) => {
    if (r.error) throw Error("Owned inbox database failure " + r.error.code);
    return r.data;
  },
  check = (ok, name) => {
    if (!ok) throw Error(name);
    tests.push({ name, passed: true });
    console.info("PASS " + name);
  };
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
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const id = randomUUID(),
      name = "Fictional inquiry " + viewport.width + " " + actor.slice(0, 8),
      label = " at " + viewport.width + "×" + viewport.height;
    checked(
      await h.db
        .from("contact_submissions")
        .insert({
          id,
          name,
          email: "fictional-sender-" + id + "@example.test",
          inquiry_type: "general",
          message:
            "Fictional private inquiry for local recovery verification only.",
          idempotency_key_hash: tokenHash(token()),
          request_hash: tokenHash(token()),
          delivery_state: "sent",
        }),
    );
    contacts.push(id);
    const snapshot = async () =>
      JSON.stringify(
        checked(
          await h.db
            .from("contact_submissions")
            .select("id,status,revision,name,email,message,retention_hold")
            .eq("id", id)
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
      writes = [],
      routeErrors = [];
    let failure = true;
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
            url.pathname.startsWith("/api/v1/admin/contact-submissions") &&
            request.method() !== "GET"
          ) {
            writes.push("Unexpected inquiry write blocked");
            return route.abort();
          }
          if (
            failure &&
            url.pathname === "/api/v1/admin/contact-submissions/" + id
          )
            return route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "TEMPORARILY_UNAVAILABLE",
                  message: "Fictional selected inquiry outage",
                },
              },
            });
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
      await page.goto(
        h.env.APP_ORIGIN + "/admin/communications?tab=contact&contact=" + id,
      );
      await expect(
        page.getByText("Fictional selected inquiry outage", { exact: true }),
      ).toBeVisible();
      failure = false;
      await page
        .getByRole("button", { name: "Retry selected inquiry", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      check(
        (await snapshot()) === baseline,
        "initial selected inquiry retry leaves the saved record unchanged" +
          label,
      );
      await page
        .getByRole("combobox", { name: "Inquiry status", exact: true })
        .selectOption("in_progress");
      failure = true;
      await page
        .getByRole("button", { name: "Refresh inquiry", exact: true })
        .click();
      await expect(
        page.getByText("Fictional selected inquiry outage", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveValue("in_progress");
      await expect(
        page.getByRole("button", { name: "Save inquiry status", exact: true }),
      ).toBeDisabled();
      await expect(page.getByText(/Showing inquiries from/)).toBeVisible();
      check(
        (await snapshot()) === baseline,
        "failed private inquiry refresh retains proposal and dated snapshot without saving" +
          label,
      );
      failure = false;
      await page
        .getByRole("button", { name: "Retry selected inquiry", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save inquiry status", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Back to inbox", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("button", { name: "Stay here", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveValue("in_progress");
      check(
        (await snapshot()) === baseline,
        "inquiry retry and declined navigation preserve proposal without a status mutation" +
          label,
      );
      checked(
        await h.db
          .from("contact_submissions")
          .update({
            status: "resolved",
            revision: 2,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      await page
        .getByRole("button", { name: "Refresh inquiry", exact: true })
        .click();
      await expect(page.getByText(/This inquiry changed/)).toBeVisible();
      await expect(
        page.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveValue("in_progress");
      await page
        .getByRole("button", {
          name: "Review loading current inquiry",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Discard and leave", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveValue("resolved");
      check(
        true,
        "explicit reviewed reload adopts only the current saved inquiry revision" +
          label,
      );
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact }));
      });
      check(
        !violations.length,
        "populated private inquiry passes measured axe" + label,
      );
      await page.screenshot({
        path: new URL("contact-inquiry-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      checked(
        await h.db
          .from("contact_submissions")
          .update({
            name: "Removed contact",
            email: "",
            message: "Removed by contact retention.",
            interests: [],
            revision: 3,
            status: "redacted",
            redacted_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
      await page
        .getByRole("button", { name: "Refresh inquiry", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Removed contact", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(name, { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveCount(0);
      check(
        true,
        "current redaction metadata removes old private review fields immediately" +
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
        "inquiry read recovery has no native writes egress errors or page overflow" +
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
    new URL("../.docs/phase0/local-contact-inbox-reads.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Loopback fictional owned inquiries/account only. Native private read/retry/proposal/navigation/axe at desktop/mobile. Deliberate owned status/revision/redaction changes simulate another editor/retention; no native mutations/provider sends/workers/files. Fixture inquiry content redacted and actor disabled/sessions revoked; tombstones/audit retained, no physical-erasure claim. No contacts/proof/keys/credentials in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
