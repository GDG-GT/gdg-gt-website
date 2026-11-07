import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const require = createRequire(import.meta.url),
  h = await localHttp(),
  other = await localHttp(),
  actor = randomUUID(),
  target = randomUUID(),
  marker = actor.slice(0, 8),
  password = "Fictional-account-write-" + randomUUID(),
  email = (id) => "fictional-account-write-" + id + "@example.test",
  query = new URLSearchParams({
    q: email(target),
    state: "current",
    page: "1",
  }).toString(),
  directoryPath = "/admin/users?" + query,
  sessionsPath = "/admin/users/" + target + "/sessions",
  output = new URL("../artifacts/browser/live-user-writes/", import.meta.url),
  tests = [];
let created = false,
  completed = false,
  browser;
const checked = (result) => {
  if (result.error)
    throw Error("Directory fixture DB operation failed " + result.error.code);
  return result.data;
};
const data = (result) => {
  if (result.status !== 200)
    throw Error(
      "Directory fixture API operation failed " +
        result.status +
        " " +
        result.json?.error?.code,
    );
  return result.json.data;
};
const check = (value, name) => {
  if (!value) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
async function login(client, id) {
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await client.call("/auth/login", {
      method: "POST",
      body: { email: email(id), password },
    }),
  );
}
const { execFileSync } = await import("node:child_process");
const processes = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" });
if (
  processes
    .split("\n")
    .some((line) =>
      /(?:node|npm).*scripts\/(?:local-jobs|local-delivery)\.mjs/.test(line),
    )
)
  throw Error(
    "A local sender/scheduler is running; no fixture created. Pause that worker before account receipt verification.",
  );
await mkdir(output, { recursive: true });
try {
  const passwordHash = await hashSecret(password);
  checked(
    await h.db.from("admin_users").insert(
      [actor, target].map((id) => ({
        id,
        email: email(id),
        password_hash: passwordHash,
        role: id === actor ? "super_admin" : "team_member",
        is_active: true,
        display_name:
          "Fictional account read reviewer " +
          (id === actor ? "admin " : "target ") +
          marker,
      })),
    ),
  );
  created = true;
  await login(h, actor);
  await login(other, target);
  for (const path of [directoryPath, sessionsPath]) {
    check(
      (await h.call(path, { anonymous: true })).status === 401,
      "anonymous account read denied for " +
        (path === directoryPath ? "directory" : "sessions"),
    );
    check(
      (await other.call(path)).status === 403,
      "ordinary member account read denied for " +
        (path === directoryPath ? "directory" : "sessions"),
    );
  }
  const directory = await h.call(directoryPath),
    sessions = await h.call(sessionsPath);
  check(
    directory.headers.get("cache-control")?.includes("no-store") &&
      data(directory).items.length === 1 &&
      data(directory).items[0].id === target &&
      !directory.text.includes("password_hash"),
    "authorized account directory returns the literal filtered uncached safe projection",
  );
  check(
    sessions.headers.get("cache-control")?.includes("no-store") &&
      data(sessions).items.length === 1 &&
      !sessions.text.includes("token_hash") &&
      !sessions.text.includes("ip_address"),
    "authorized selected-account sessions are uncached and omit bearer/IP data",
  );
  const prefix = "/admin/users/" + target;
  const createDocument = {
    email: "fictional-created-account-" + marker + "@example.test",
    display_name: "Fictional concurrent account " + marker,
    role: "team_member",
  };
  check(
    (
      await h.call("/admin/users", {
        method: "POST",
        key: null,
        body: { currentPassword: password, record: createDocument },
      })
    ).status === 400,
    "actual account creation rejects a missing retry identity",
  );
  const createKey = randomUUID(),
    creations = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.call("/admin/users", {
          method: "POST",
          key: createKey,
          body: { currentPassword: password, record: createDocument },
        }),
      ),
    );
  const ids = new Set(creations.map((result) => data(result).record.id));
  check(
    ids.size === 1,
    "ten concurrent identical account creates return one account",
  );
  const createdId = [...ids][0];
  const jobsFor = async (id) =>
    checked(
      await h.db
        .from("delivery_jobs")
        .select("id,state")
        .eq("kind", "account_access")
        .contains("payload", { userId: id }),
    );
  check(
    (await jobsFor(createdId)).length === 1 &&
      checked(
        await h.db
          .from("account_access_tokens")
          .select("id")
          .eq("admin_user_id", createdId),
      ).length === 1 &&
      checked(
        await h.db
          .from("admin_actions")
          .select("id")
          .eq("target_id", createdId)
          .eq("action", "users.create"),
      ).length === 1,
    "concurrent creation commits one setup capability, delivery job and audit",
  );
  check(
    (
      await h.call("/admin/users", {
        method: "POST",
        key: createKey,
        body: {
          currentPassword: password,
          record: {
            ...createDocument,
            display_name: "Changed original intent",
          },
        },
      })
    ).status === 409,
    "changed account intent cannot reuse an accepted key",
  );
  const beforeReset = data(await h.call(prefix)).record,
    resetKey = randomUUID(),
    resetBody = {
      action: "reset",
      revision: beforeReset.revision,
      confirmation: email(target),
      currentPassword: password,
    };
  const reset = data(
    await h.call(prefix, { method: "POST", key: resetKey, body: resetBody }),
  ).record;
  const replay = data(
    await h.call(prefix, { method: "POST", key: resetKey, body: resetBody }),
  ).record;
  check(
    reset.revision === beforeReset.revision + 1 &&
      replay.revision === reset.revision &&
      (await jobsFor(target)).length === 1,
    "explicit reset replay queues one setup link and advances one revision",
  );
  browser = await chromium.launch();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    try {
      for (const [path, body] of [
        ["/auth/gate", { code: h.credentials.gateCode }],
        ["/auth/login", { email: email(actor), password }],
      ]) {
        const response = await context.request.post(
          h.env.APP_ORIGIN + "/api/v1" + path,
          { headers: { Origin: h.env.APP_ORIGIN }, data: body },
        );
        if (response.status() !== 200)
          throw Error(
            "Owned account write browser sign-in failed " + response.status(),
          );
      }
      const page = await context.newPage(),
        errors = [],
        forbidden = [],
        writes = [];
      let drop = true;
      page.on("pageerror", (error) => errors.push(error.name));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (url.origin !== h.env.APP_ORIGIN) {
          forbidden.push("external origin");
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
                  message:
                    "Realtime paused for owned account write verification.",
                },
              },
            });
            return;
          }
          if (path !== "/api/v1" + prefix || request.method() !== "PATCH") {
            forbidden.push("unexpected mutation");
            await route.abort("blockedbyclient");
            return;
          }
          const { currentPassword, ...intent } = request.postDataJSON();
          if (currentPassword !== password)
            throw Error("Owned browser used incorrect fixture proof");
          writes.push({ key: request.headers()["idempotency-key"], intent });
          const response = await route.fetch();
          if (response.status() !== 200)
            throw Error("Owned account mutation rejected " + response.status());
          if (drop) {
            drop = false;
            await route.abort("connectionfailed");
          } else await route.fulfill({ response });
          return;
        }
        await route.continue();
      });
      const label = " at " + viewport.width + "×" + viewport.height;
      await page.goto(h.env.APP_ORIGIN + "/admin/users", {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("searchbox", { name: "Search account emails" })
        .fill(email(target));
      const row = page.getByRole("row").filter({ hasText: email(target) });
      await expect(
        row.getByRole("button", { name: "Edit", exact: true }),
      ).toBeEnabled();
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeEnabled();
      const before = data(await h.call(prefix)).record,
        name = "Fictional updated account " + viewport.width + " " + marker;
      await page.getByLabel(/^Display name/).fill(name);
      await page.getByLabel(/^Confirm your own password/).fill(password);
      await page
        .getByRole("button", { name: "Save account", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(email(target));
      await expect(page.getByRole("dialog")).toContainText(
        "sign out existing sessions",
      );
      check(
        writes.length === 0,
        "actual account edit reviews identity and session consequence before a write" +
          label,
      );
      await page
        .getByRole("button", { name: "Confirm account change" })
        .click();
      await expect(
        page.getByRole("button", { name: "Recheck saved account values" }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Current password for retry/)).toHaveValue(
        "",
      );
      check(
        writes.length === 1,
        "accepted-but-lost account update clears proof and pauses blind retry" +
          label,
      );
      await page
        .getByRole("button", { name: "Recheck saved account values" })
        .click();
      await expect(
        page.getByText("Inspect current saved account values", { exact: true }),
      ).toBeVisible();
      await page.getByLabel(/^Current password for retry/).fill(password);
      await expect(
        page.getByRole("button", { name: "Retry original account operation" }),
      ).toBeEnabled();
      check(
        writes.length === 1,
        "account recovery rechecks saved values without another write" + label,
      );
      await page
        .getByRole("button", { name: "Retry original account operation" })
        .click();
      await expect(
        page.getByText(/Account update confirmed by the server/),
      ).toBeVisible();
      const after = data(await h.call(prefix)).record;
      check(
        writes.length === 2 &&
          writes[0].key === writes[1].key &&
          JSON.stringify(writes[0].intent) ===
            JSON.stringify(writes[1].intent) &&
          after.revision === before.revision + 1 &&
          after.display_name === name,
        "identical account replay acknowledges one revision with fresh password confirmation" +
          label,
      );
      await expect(
        row.getByRole("button", { name: "Edit", exact: true }),
      ).toBeEnabled();
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeEnabled();
      const retainedDraft = "Fictional retained conflict " + viewport.width;
      await page.getByLabel(/^Display name/).fill(retainedDraft);
      const remoteName = "Fictional other saved account " + viewport.width;
      data(
        await h.call(prefix, {
          method: "PATCH",
          body: {
            revision: after.revision,
            currentPassword: password,
            record: { display_name: remoteName, role: "team_member" },
          },
        }),
      );
      await page
        .getByRole("button", { name: "Refresh selected account" })
        .click();
      await expect(
        page.getByRole("button", { name: "Review loading saved account" }),
      ).toBeVisible();
      await expect(page.getByLabel(/^Display name/)).toHaveValue(retainedDraft);
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Review loading saved account" })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "No server write occurs",
      );
      await page.getByRole("button", { name: "Load saved account" }).click();
      await expect(page.getByLabel(/^Display name/)).toHaveValue(remoteName);
      check(
        writes.length === 2,
        "actual selected-account revision conflict preserves fields until reviewed read-only replacement" +
          label,
      );
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(page.getByRole("dialog")).toContainText(
        "Saved records will not change",
      );
      await page.getByRole("button", { name: "Discard unsaved input" }).click();
      check(
        writes.length === 2,
        "internal editor cancellation reviews discarded input without a write" +
          label,
      );
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Save account", exact: true }),
      ).toBeEnabled();
      await page
        .getByLabel(/^Display name/)
        .fill("Fictional unsubmitted review " + viewport.width);
      await page.getByLabel(/^Confirm your own password/).fill(password);
      await page
        .getByRole("button", { name: "Save account", exact: true })
        .click();
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((item) => item.id),
      );
      check(
        !violations.length,
        "populated account consequence review passes measured axe checks" +
          label +
          (violations.length ? ": " + violations.join(",") : ""),
      );
      await page.screenshot({
        path: new URL("account-write-review-" + viewport.width + ".png", output)
          .pathname,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Keep editing" }).click();
      check(
        !errors.length &&
          !forbidden.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "account mutation workflow has no page error, unintended mutation, external request or page overflow" +
          label,
      );
    } finally {
      await context.close();
    }
  }
  check(
    checked(
      await h.db
        .from("admin_actions")
        .select("id")
        .eq("target_id", target)
        .eq("action", "users.update"),
    ).length === 4,
    "two accepted-and-lost browser saves plus two explicit remote fixtures create four update audits only",
  );
  completed = true;
} finally {
  await browser?.close();
  if (created) {
    const owned = checked(
      await h.db.from("admin_users").select("id").eq("created_by", actor),
    ).map((row) => row.id);
    const ids = [...new Set([actor, target, ...owned])];
    checked(
      await h.db
        .from("delivery_jobs")
        .update({
          state: "dead",
          secret_payload: null,
          last_error_code: "FICTIONAL_FIXTURE_CLEANUP",
        })
        .eq("kind", "account_access")
        .in("payload->>userId", ids)
        .in("state", ["pending", "failed"]),
    );
    checked(
      await h.db
        .from("account_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", ids)
        .is("consumed_at", null)
        .is("revoked_at", null),
    );
    checked(
      await h.db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", ids),
    );
    checked(
      await h.db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", ids)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL(
      "../.docs/phase0/local-user-mutation-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback API/DB and Chromium desktop/mobile account mutations, ten identical concurrent creates, setup/reset receipt deduplication and accepted-but-lost update replay. Only fresh fictional accounts touched. Owned setup/reset jobs marked dead with encrypted secrets cleared and capabilities revoked before accounts disabled/sessions revoked. Browser allows only owned target PATCH; every other mutation/external origin blocked and realtime paused. No worker/provider send, existing account/session or production change. Captures ignored/private; no passwords, credentials or response bodies retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
