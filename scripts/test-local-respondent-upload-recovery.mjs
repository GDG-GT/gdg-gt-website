import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
import { runUploadWorker } from "../server/upload-worker.mjs";
import { objectStorage } from "../server/lib/object-storage.mjs";
const h = await localHttp(),
  actors = [randomUUID(), randomUUID()],
  password = "Fictional-upload-recovery-" + randomUUID(),
  forms = [],
  owned = new Set(),
  tests = [],
  require = createRequire(import.meta.url),
  bytes = Buffer.from(
    "Fictional local upload recovery. No personal information or executable content.\n",
  ),
  output = new URL(
    "../artifacts/browser/live-respondent-upload-recovery/",
    import.meta.url,
  ),
  storage = objectStorage(h.env),
  email = (id) => "fictional-upload-recovery-" + id + "@example.test";
let browser,
  created = false,
  completed = false,
  cleaned = false;
const checked = (r) => {
    if (r.error) throw Error("Owned upload database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned upload API failure " + r.status + " " + r.json?.error?.code,
      );
    return r.json.data;
  },
  check = (ok, name) => {
    if (!ok) throw Error(name);
    tests.push({ name, passed: true });
    console.info("PASS " + name);
  };
async function scanOwned(id) {
  const row = checked(
    await h.db
      .from("upload_intents")
      .select("state,form_id")
      .eq("id", id)
      .single(),
  );
  if (!owned.has(id) || !forms.includes(row.form_id))
    throw Error("Refusing unowned scan");
  if (row.state !== "queued") return;
  const queued = checked(
    await h.db
      .from("delivery_jobs")
      .select("kind,payload")
      .in("kind", ["upload_scan", "contact_upload_scan"])
      .in("state", ["pending", "running"]),
  );
  if (queued.some((job) => !owned.has(job.payload.uploadId)))
    throw Error("Unrelated scan queue present; refusing to claim jobs");
  await runUploadWorker({ env: h.env, db: h.db, limit: 1 });
  const file = checked(
    await h.db.from("form_uploads").select("scan_state").eq("id", id).single(),
  );
  if (file.scan_state !== "clean")
    throw Error("Owned generated text did not pass local scanning");
}
await mkdir(output, { recursive: true });
try {
  checked(
    await h.db.from("admin_users").insert(
      await Promise.all(
        actors.map(async (id) => ({
          id,
          email: email(id),
          password_hash: await hashSecret(password),
          role: "admin",
          is_active: true,
        })),
      ),
    ),
  );
  created = true;
  browser = await chromium.launch();
  for (const [index, viewport] of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ].entries()) {
    const actor = actors[index],
      label = " at " + viewport.width + "×" + viewport.height;
    data(
      await h.call("/auth/gate", {
        method: "POST",
        body: { code: h.credentials.gateCode },
      }),
    );
    data(
      await h.call("/auth/login", {
        method: "POST",
        body: { email: email(actor), password },
      }),
    );
    const t = createTemplate(
        "Fictional upload recovery " + viewport.width + " " + actor.slice(0, 8),
        "blank",
      ),
      field = newField("file", t.sections[0].id);
    field.label = "Fictional private document";
    field.required = true;
    field.maxFiles = 1;
    field.allowedMime = ["text/plain"];
    t.fields = [field];
    t.settings.access = "internal";
    t.settings.receipts = false;
    t.settings.review = false;
    let form = data(
      await h.call("/admin/forms", {
        method: "POST",
        body: {
          slug: t.slug,
          definition: {
            title: t.title,
            description: t.description,
            fields: t.fields,
            sections: t.sections,
            settings: t.settings,
          },
        },
      }),
    ).form;
    forms.push(form.id);
    form = data(
      await h.call("/admin/forms/" + form.id + "/publish", {
        method: "POST",
        body: { revision: form.revision },
      }),
    ).form;
    const ctx = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      prefix = "/api/v1/forms/" + form.slug + "/uploads",
      attempts = [],
      egress = [],
      errors = [],
      routeErrors = [];
    let mode = "",
      lost = false;
    const storageOrigin = new URL(h.env.S3_ENDPOINT).origin;
    try {
      await ctx.route("**/*", async (route) => {
        try {
          const r = route.request(),
            url = new URL(r.url());
          if (![h.env.APP_ORIGIN, storageOrigin].includes(url.origin)) {
            egress.push(url.origin);
            return route.abort();
          }
          if (url.pathname.startsWith(prefix) && r.method() === "POST") {
            const body = r.postDataJSON();
            if (url.pathname.endsWith("/prepare")) {
              attempts.push({
                key: r.headers()["idempotency-key"],
                body: JSON.stringify(body),
              });
              if (!lost && mode === "prepare-before") {
                lost = true;
                return route.abort("connectionfailed");
              }
              const response = await route.fetch(),
                json = await response.json();
              if (response.status() !== 200)
                throw Error(
                  "Owned preparation failed " +
                    response.status() +
                    " " +
                    json.error?.code,
                );
              owned.add(json.data.uploadId);
              if (!lost && mode === "prepare-after") {
                lost = true;
                return route.abort("connectionfailed");
              }
              return route.fulfill({ response });
            }
            if (url.pathname.endsWith("/complete")) {
              if (!lost && mode === "complete-before") {
                lost = true;
                return route.abort("connectionfailed");
              }
              const response = await route.fetch();
              if (response.status() !== 200)
                throw Error("Owned completion failed " + response.status());
              await scanOwned(url.pathname.split("/").at(-2));
              if (!lost && mode === "complete-after") {
                lost = true;
                return route.abort("connectionfailed");
              }
              return route.fulfill({ response });
            }
            return route.continue();
          }
          if (url.origin === storageOrigin && r.method() === "PUT") {
            const response = await route.fetch();
            if (response.status() !== 200)
              throw Error("Owned object transfer failed " + response.status());
            if (!lost && mode === "put") {
              lost = true;
              return route.abort("connectionfailed");
            }
            return route.fulfill({ response });
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned route operation failed");
          await route.abort("failed").catch(() => {});
        }
      });
      const gate = await ctx.request.post(
        h.env.APP_ORIGIN + "/api/v1/auth/gate",
        {
          headers: { Origin: h.env.APP_ORIGIN },
          data: { code: h.credentials.gateCode },
        },
      );
      if (gate.status() !== 200)
        throw Error("Owned browser gate unavailable " + gate.status());
      const signin = await ctx.request.post(
        h.env.APP_ORIGIN + "/api/v1/auth/login",
        {
          headers: { Origin: h.env.APP_ORIGIN },
          data: { email: email(actor), password },
        },
      );
      if (signin.status() !== 200)
        throw Error("Owned browser session unavailable " + signin.status());
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      for (mode of [
        "prepare-before",
        "prepare-after",
        "put",
        "complete-before",
        "complete-after",
      ]) {
        lost = false;
        const before = attempts.length;
        await page.goto(h.env.APP_ORIGIN + "/forms/" + form.slug);
        await expect(
          page.getByRole("heading", { name: t.title, exact: true }),
        ).toBeVisible();
        await page.locator('input[type="file"]').setInputFiles({
          name: "fictional.txt",
          mimeType: "text/plain",
          buffer: bytes,
        });
        const recovery = page.getByRole("region", {
          name: "Unconfirmed file operation",
        });
        await expect(recovery).toBeVisible();
        await expect(page.getByRole("alert")).toBeVisible();
        await expect(
          recovery.getByRole("button", {
            name: "Continue original upload",
            exact: true,
          }),
        ).toBeDisabled();
        const original = attempts[before];
        check(
          !!original?.key &&
            JSON.parse(original.body).sha256 ===
              createHash("sha256").update(bytes).digest("hex"),
          mode +
            " freezes exact selected-file bytes and original request" +
            label,
        );
        if (mode === "complete-after") {
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
            return r.violations.map((v) => v.id);
          });
          check(
            !violations.length,
            "populated unconfirmed respondent file passes measured axe" + label,
          );
          await page.screenshot({
            path: new URL(
              "respondent-file-recovery-" + viewport.width + ".png",
              output,
            ).pathname,
            fullPage: true,
            animations: "disabled",
          });
        }
        await recovery
          .getByRole("button", {
            name: "Check original file outcome",
            exact: true,
          })
          .click();
        if (mode !== "complete-after")
          await recovery
            .getByRole("button", {
              name: "Continue original upload",
              exact: true,
            })
            .click();
        await expect(recovery).toHaveCount(0);
        await expect(
          page.getByText("Ready for submission", { exact: true }),
        ).toBeVisible();
        const rows = checked(
          await h.db
            .from("upload_intents")
            .select("id,proof_hash,quarantine_key")
            .eq("form_id", form.id)
            .is("deleted_at", null),
        );
        check(
          rows.length === 1 &&
            attempts
              .slice(before)
              .every((a) => a.key === original.key && a.body === original.body),
          mode +
            " recovers with identical intent and one persisted upload" +
            label,
        );
        const jobs = checked(
          await h.db
            .from("delivery_jobs")
            .select("id,state")
            .eq("kind", "upload_scan")
            .eq("payload->>uploadId", rows[0].id),
        );
        check(
          jobs.length === 1 && jobs[0].state === "completed",
          mode +
            " creates one completed local scanner job and a clean attachment" +
            label,
        );
        await page.getByRole("button", { name: "Remove", exact: true }).click();
        await expect(
          page.getByText("Ready for submission", { exact: true }),
        ).toHaveCount(0);
      }
      // Genuine concurrent requests use a separate proof, one field slot and key.
      const publicForm = data(await h.call("/forms/" + form.slug)).form,
        proof = randomUUID().replaceAll("-", "") + "F".repeat(11),
        body = {
          versionId: publicForm.versionId,
          uploadToken: proof,
          fieldId: field.id,
          filename: "fictional-concurrent.txt",
          mime: "text/plain",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
        key = randomUUID(),
        root = "/forms/" + form.slug + "/uploads";
      const responses = await Promise.all(
          Array.from({ length: 10 }, () =>
            h.call(root + "/prepare", { method: "POST", body, key }),
          ),
        ),
        ids = responses.map((r) => data(r).uploadId);
      ids.forEach((id) => owned.add(id));
      check(
        new Set(ids).size === 1 &&
          checked(
            await h.db.from("upload_intents").select("id").eq("id", ids[0]),
          ).length === 1,
        "ten simultaneous identical preparations create one upload and preserve the one-file quota" +
          label,
      );
      const noWrite = data(
        await h.call(root + "/recovery", { method: "POST", body, key }),
      );
      check(
        noWrite.committed &&
          noWrite.uploadId === ids[0] &&
          !Object.keys(noWrite).some((k) =>
            ["url", "headers", "filename", "proof"].includes(k),
          ),
        "actual original-preparation inspection is minimal and read-only" +
          label,
      );
      check(
        !checked(
          await h.db.from("form_responses").select("id").eq("form_id", form.id),
        ).length &&
          !checked(
            await h.db
              .from("delivery_jobs")
              .select("id")
              .eq("payload->>formId", form.id)
              .neq("kind", "upload_scan"),
          ).length,
        "recovery creates no responses or mail/provider jobs" + label,
      );
      check(
        !egress.length &&
          !errors.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "respondent recovery has no unexpected egress/errors/page overflow" +
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
  if (created) {
    if (forms.length) {
      const rows = checked(
        await h.db
          .from("upload_intents")
          .select("id,form_id,proof_hash,bucket,quarantine_key,clean_key")
          .in("form_id", forms),
      );
      for (const row of rows) {
        checked(
          await h.db.rpc("remove_form_upload", {
            p_form: row.form_id,
            p_id: row.id,
            p_proof: row.proof_hash,
          }),
        );
        await storage.delete(row.bucket, row.quarantine_key);
        if (row.clean_key) await storage.delete(row.bucket, row.clean_key);
      }
      for (const id of forms) {
        const f = data(await h.call("/admin/forms/" + id)).form;
        if (f.status !== "Archived")
          data(
            await h.call("/admin/forms/" + id, {
              method: "DELETE",
              body: { revision: f.revision },
            }),
          );
      }
    }
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
    cleaned = true;
  }
  storage.close();
  await writeFile(
    new URL(
      "../.docs/phase0/local-respondent-upload-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: cleaned,
        scope:
          "Dedicated loopback; two fresh owned fictional private publications/accounts, generated harmless text, exact one-object storage and local scanner only. No final responses/mail/provider sends/existing chapter or production changes. Owned upload references removed and exact owned objects deleted; forms archived/accounts disabled/sessions revoked. No raw proof, key, signed URL, body or capability retained.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
