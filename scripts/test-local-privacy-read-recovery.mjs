import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
const h = await localHttp(),
  actor = randomUUID(),
  password = "Fictional-privacy-read-" + randomUUID(),
  email = "fictional-privacy-read-" + actor + "@example.test",
  contacts = [],
  tests = [],
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-privacy-read-recovery/",
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
    const id = randomUUID(),
      subject = "fictional-privacy-subject-" + id + "@example.test",
      label = " at " + viewport.width + "×" + viewport.height;
    checked(
      await h.db.from("contact_submissions").insert({
        id,
        name: "Fictional privacy scope " + viewport.width,
        email: subject,
        inquiry_type: "general",
        message: "Fictional private subject data for read-only privacy review.",
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
            .select(
              "id,name,email,message,status,revision,redacted_at,retention_hold",
            )
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
      commits = [],
      routeErrors = [];
    let failure = true,
      denied = false;
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const r = route.request(),
            url = new URL(r.url());
          if (url.origin !== h.env.APP_ORIGIN) {
            unexpected.push("External request blocked");
            return route.abort();
          }
          if (url.pathname === "/api/v1/admin/privacy/commit") {
            commits.push("Unexpected privacy approval blocked");
            return route.abort();
          }
          if (url.pathname === "/api/v1/admin/privacy" && (failure || denied))
            return route.fulfill({
              status: denied ? 403 : 503,
              json: {
                error: {
                  code: denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
                  message: denied
                    ? "Fictional privacy read denied"
                    : "Fictional privacy read outage",
                },
              },
            });
          return route.continue();
        } catch {
          routeErrors.push("Owned privacy route operation failed");
          await route.abort("failed").catch(() => {});
        }
      });
      let r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { code: h.credentials.gateCode },
      });
      if (r.status() !== 200)
        throw Error("Owned privacy browser gate unavailable " + r.status());
      r = await ctx.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
        headers: { Origin: h.env.APP_ORIGIN },
        data: { email, password },
      });
      if (r.status() !== 200)
        throw Error("Owned privacy browser login unavailable " + r.status());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(h.env.APP_ORIGIN + "/admin/privacy");
      await expect(
        page.getByText("Fictional privacy read outage", { exact: true }),
      ).toBeVisible();
      failure = false;
      await page
        .getByRole("button", {
          name: "Retry privacy cleanup status",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Refresh cleanup status",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        (await snapshot()) === baseline,
        "actual privacy metadata retry leaves subject content unchanged" +
          label,
      );
      await page
        .getByLabel("Exact requester email", { exact: true })
        .fill(subject);
      await page
        .getByRole("textbox", { name: /Request purpose/ })
        .fill(
          "Independently verified fictional local privacy scope, read-only review.",
        );
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
      await expect(
        page.getByRole("heading", {
          name: "2. Inspect the exact record review",
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        page.getByRole("region", {
          name: "Reviewed privacy records",
          exact: true,
        }),
      ).toHaveAttribute("tabindex", "0");
      await expect(
        page.getByRole("button", {
          name: "Refresh cleanup status",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        (await snapshot()) === baseline,
        "native exact subject review is prepared without approval or erasure" +
          label,
      );
      failure = true;
      await page
        .getByRole("button", { name: "Refresh cleanup status", exact: true })
        .click();
      await expect(
        page.getByText("Fictional privacy read outage", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Showing cleanup status from/)).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "2. Inspect the exact record review",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Prepare reviewed JSON",
          exact: true,
        }),
      ).toBeDisabled();
      check(
        (await snapshot()) === baseline,
        "background privacy read outage retains dated review and pauses final approval" +
          label,
      );
      failure = false;
      await page
        .getByRole("button", {
          name: "Retry privacy cleanup status",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Fictional privacy read outage", { exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Back to scope", exact: true })
        .click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page
        .getByRole("button", { name: "Stay here", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "2. Inspect the exact record review",
          exact: true,
        }),
      ).toBeVisible();
      check(
        (await snapshot()) === baseline,
        "declined privacy navigation preserves the review without committing" +
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
        "populated exact privacy review passes measured axe" + label,
      );
      await page.screenshot({
        path: new URL("privacy-review-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      denied = true;
      await page
        .getByRole("button", { name: "Refresh cleanup status", exact: true })
        .click();
      await expect(
        page.getByText(
          /Private scope, reviews and cleanup counters have been cleared/,
        ),
      ).toBeVisible();
      await expect(
        page.getByLabel("Exact requester email", { exact: true }),
      ).toHaveValue("");
      await expect(
        page.getByRole("heading", {
          name: "2. Inspect the exact record review",
          exact: true,
        }),
      ).toHaveCount(0);
      denied = false;
      await page
        .getByRole("button", { name: "Refresh cleanup status", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Refresh cleanup status",
          exact: true,
        }),
      ).toBeEnabled();
      check(
        (await snapshot()) === baseline,
        "current privacy denial clears scope and explicit access recheck never reopens an old private review" +
          label,
      );
      check(
        !commits.length &&
          !errors.length &&
          !unexpected.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "privacy read recovery has no approvals egress errors or page overflow" +
          label,
      );
    } finally {
      await ctx.unrouteAll({ behavior: "wait" });
      await ctx.close();
    }
  }
  const ownedReviews = checked(
    await h.db
      .from("person_privacy_reviews")
      .select("id,used_at")
      .eq("actor_id", actor),
  );
  check(
    ownedReviews.length === 2 && ownedReviews.every((r) => r.used_at === null),
    "exactly two owned privacy reviews exist and neither was approved",
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
          message: "Removed fictional local privacy scope.",
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
      "../.docs/phase0/local-privacy-read-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup,
        scope:
          "Loopback fictional owned Super Admin and two exact-email contact subjects. Native review preparation, metadata retry/outage/denial/navigation and axe only. No privacy approval/download/erasure/provider send or production data change. Owned inquiry content redacted, unapproved private reviews retained under normal expiry/cleanup, actor disabled/sessions revoked; private tombstones/audit retained. No raw subject/contacts/proof/keys/credentials in evidence.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
