import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  { db } = h,
  actor = randomUUID(),
  email = "fictional-profile-browser-" + actor + "@example.test",
  password = "Fictional-profile-" + randomUUID(),
  output = new URL("../artifacts/browser/live-profile/", import.meta.url),
  tests = [];
const checked = (value) => {
  if (value.error)
    throw Error("Profile browser fixture database error " + value.error.code);
  return value.data;
};
const check = (condition, name) => {
  if (!condition) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
async function login(context) {
  for (const [path, body] of [
    ["/auth/gate", { code: h.credentials.gateCode }],
    ["/auth/login", { email, password }],
  ]) {
    const r = await context.request.post(h.env.APP_ORIGIN + "/api/v1" + path, {
      headers: { Origin: h.env.APP_ORIGIN },
      data: body,
    });
    if (r.status() !== 200)
      throw Error("Profile browser fixture sign-in failed " + r.status());
  }
}
let browser,
  created = false,
  completed = false;
await mkdir(output, { recursive: true });
try {
  checked(
    await db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      is_active: true,
      role: "admin",
      display_name: "Fictional profile browser reviewer",
    }),
  );
  created = true;
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      other = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
    try {
      await login(context);
      await login(other);
      const page = await context.newPage(),
        errors = [],
        denied = [],
        writes = [];
      let dropNextSave = false;
      page.on("pageerror", (error) => errors.push(error.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          denied.push("external origin");
          await route.abort("blockedbyclient");
          return;
        }
        if (
          path.startsWith("/api/") &&
          !["GET", "HEAD"].includes(request.method())
        ) {
          if (
            ["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(
              path,
            )
          ) {
            await route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "TEMPORARILY_UNAVAILABLE",
                  message: "Realtime paused during the owned profile check.",
                },
              },
            });
            return;
          }
          if (
            ![
              "PATCH /api/v1/admin/me",
              "POST /api/v1/auth/password",
              "DELETE /api/v1/auth/sessions",
            ].includes(request.method() + " " + path)
          ) {
            denied.push("unexpected mutation path");
            await route.abort("blockedbyclient");
            return;
          }
          writes.push(request.method() + " " + path);
          if (
            dropNextSave &&
            request.method() === "PATCH" &&
            path === "/api/v1/admin/me"
          ) {
            dropNextSave = false;
            const accepted = await route.fetch();
            if (accepted.status() !== 200)
              throw Error("Owned uncertain-save setup was not accepted.");
            await route.abort("failed");
            return;
          }
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/profile", {
        waitUntil: "networkidle",
      });
      await expect(
        page.getByRole("heading", { name: "My profile" }),
      ).toBeVisible();
      const name = "Fictional browser saved " + viewport.width;
      await page.getByLabel(/^Display name/).fill(name);
      await page.getByRole("button", { name: "Save account details" }).click();
      await expect(
        page.getByText("Your display name is saved.", { exact: true }),
      ).toBeVisible();
      const saved = checked(
        await db
          .from("admin_users")
          .select("display_name")
          .eq("id", actor)
          .single(),
      );
      check(
        saved.display_name === name,
        "actual browser saves only its owned display name" + label,
      );
      const uncertainName = "Fictional uncertain saved " + viewport.width;
      dropNextSave = true;
      await page.getByLabel(/^Display name/).fill(uncertainName);
      await page.getByRole("button", { name: "Save account details" }).click();
      await expect(
        page.getByText(/result could not be confirmed/),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Save account details" }),
      ).toBeDisabled();
      const savesBefore = writes.filter((value) =>
        value.startsWith("PATCH"),
      ).length;
      await page
        .getByRole("button", { name: "Recheck account information" })
        .click();
      await expect(
        page.getByText(/Current account information was refreshed/),
      ).toBeVisible();
      await page
        .getByText("Current saved account values", { exact: true })
        .click();
      await expect(
        page
          .getByText("Saved display name", { exact: true })
          .locator("..")
          .locator("dd"),
      ).toHaveText(uncertainName);
      check(
        writes.filter((value) => value.startsWith("PATCH")).length ===
          savesBefore,
        "an accepted but dropped save is reconciled with visible saved values without resending" +
          label,
      );
      await page
        .locator("input[name=currentPassword]")
        .fill("Fictional-incorrect-current-password");
      await page
        .locator("input[name=newPassword]")
        .fill("Fictional-valid-unsubmitted-next-password");
      await page
        .locator("input[name=confirmPassword]")
        .fill("Fictional-valid-unsubmitted-next-password");
      await page
        .getByRole("button", { name: "Change password", exact: true })
        .click();
      await expect(page.locator("#profile-current-password-error")).toHaveText(
        "Check your current password.",
      );
      await expect(
        page.getByRole("heading", { name: "My profile" }),
      ).toBeVisible();
      check(
        (await page
          .locator("input[name=currentPassword]")
          .getAttribute("aria-invalid")) === "true",
        "incorrect-current-password feedback is attached to its field without losing the account view" +
          label,
      );
      check(
        (
          await other.request.get(h.env.APP_ORIGIN + "/api/v1/auth/session")
        ).status() === 200,
        "wrong current password leaves the other owned browser signed in" +
          label,
      );
      // Discard only fixture password input before reviewing session revocation.
      for (const field of ["currentPassword", "newPassword", "confirmPassword"])
        await page.locator(`input[name=${field}]`).fill("");
      const opener = page.getByRole("button", {
        name: "Sign out other sessions",
        exact: true,
      });
      await opener.click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("heading", { name: "Sign out your other sessions?" }),
      ).toBeVisible();
      check(
        await dialog.getByText(/This device stays signed in/).isVisible(),
        "session sign-out explains its exact consequence before any revocation" +
          label,
      );
      await dialog.getByRole("button", { name: "Cancel review" }).click();
      check(
        (
          await other.request.get(h.env.APP_ORIGIN + "/api/v1/auth/session")
        ).status() === 200,
        "cancelling session review preserves the other owned session" + label,
      );
      await opener.click();
      await dialog
        .getByRole("button", { name: "Confirm other-session sign-out" })
        .click();
      await expect(
        page.getByText("Your other sessions are signed out.", { exact: true }),
      ).toBeVisible();
      check(
        (
          await other.request.get(h.env.APP_ORIGIN + "/api/v1/auth/session")
        ).status() === 401,
        "confirmed browser session review revokes the other owned browser" +
          label,
      );
      check(
        (
          await context.request.get(h.env.APP_ORIGIN + "/api/v1/auth/session")
        ).status() === 200,
        "confirmed session revocation preserves the current browser" + label,
      );
      check(
        writes.filter((value) => value.startsWith("DELETE")).length === 1 &&
          !errors.length &&
          !denied.length,
        "browser workflow performs one reviewed revocation without page errors or unrelated requests" +
          label,
      );
      await page.screenshot({
        path: new URL("profile-confirmed-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
    } finally {
      await context.close();
      await other.close();
      checked(
        await db
          .from("admin_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("admin_user_id", actor)
          .is("revoked_at", null),
      );
    }
  }
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", actor),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", actor)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-profile-browser.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual local browser UI/API/DB profile/password-error/session-review operations on one fresh fictional account and its owned browser sessions at desktop/mobile. All unrelated mutation paths/external origins blocked; realtime paused. Wrong password never accepted; no existing account/password/session, provider, publication, quota reset or production change. Fixture account disabled and sessions revoked; no password/cookie/body retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
