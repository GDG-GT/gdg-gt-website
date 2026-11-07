import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
const h = await localHttp(),
  actors = [randomUUID(), randomUUID()],
  forms = [],
  tests = [],
  password = "Fictional-respondent-recovery-" + randomUUID(),
  email = (id) => "fictional-respondent-write-" + id + "@example.test",
  require = createRequire(import.meta.url),
  output = new URL(
    "../artifacts/browser/live-respondent-write-recovery/",
    import.meta.url,
  );
let browser,
  created = false,
  completed = false,
  cleaned = false;
const checked = (r) => {
    if (r.error)
      throw Error("Owned respondent database failure " + r.error.code);
    return r.data;
  },
  data = (r) => {
    if (r.status !== 200)
      throw Error(
        "Owned respondent API failure " + r.status + " " + r.json?.error?.code,
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
      .insert(
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
    data(await post("/auth/gate", { code: h.credentials.gateCode }));
    data(await post("/auth/login", { email: email(actor), password }));
    const t = createTemplate(
        "Fictional respondent write " +
          viewport.width +
          " " +
          actor.slice(0, 8),
        "blank",
      ),
      field = newField("short", t.sections[0].id);
    field.label = "Fictional respondent answer";
    field.required = true;
    t.fields = [field];
    Object.assign(t.settings, {
      access: "internal",
      review: false,
      resume: true,
      editing: true,
      receipts: false,
      oneResponse: false,
      limit: 0,
    });
    let form = data(
      await post("/admin/forms", {
        slug: t.slug,
        definition: {
          title: t.title,
          description: t.description,
          fields: t.fields,
          sections: t.sections,
          settings: t.settings,
        },
      }),
    ).form;
    forms.push(form.id);
    form = data(
      await post("/admin/forms/" + form.id + "/publish", {
        revision: form.revision,
      }),
    ).form;
    const ctx = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      }),
      attempts = [],
      inspections = [],
      unexpected = [],
      errors = [],
      routeErrors = [],
      prefix = "/api/v1/forms/" + form.slug;
    let mode = "",
      position = "",
      lost = false,
      editCapability,
      draftPacket;
    async function snapshot() {
      const responses = checked(
          await h.db
            .from("form_responses")
            .select("id,revision")
            .eq("form_id", form.id),
        ),
        drafts = checked(
          await h.db
            .from("form_response_drafts")
            .select("id,revision")
            .eq("form_id", form.id),
        );
      return JSON.stringify({
        responses: responses.sort((a, b) => a.id.localeCompare(b.id)),
        drafts: drafts.sort((a, b) => a.id.localeCompare(b.id)),
      });
    }
    const navigate = async (page, url) => {
      try {
        await page.goto(url);
      } catch {
        throw Error(
          "Owned respondent runtime navigation failed; private fragment omitted",
        );
      }
    };
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
            url.pathname.startsWith(prefix + "/") &&
            request.method() === "POST"
          ) {
            const isMutation = url.pathname === prefix + "/" + mode;
            if (url.pathname.endsWith("/recovery"))
              inspections.push({
                body: request.postData(),
                key: request.headers()["idempotency-key"],
              });
            if (isMutation) {
              attempts.push({
                body: request.postData(),
                key: request.headers()["idempotency-key"],
              });
              if (!lost && position === "before") {
                lost = true;
                return route.abort("connectionfailed");
              }
              const response = await route.fetch();
              if (response.status() !== 200) return route.fulfill({ response });
              const result = (await response.json()).data;
              if (result.editToken) editCapability = result.editToken;
              if (mode === "drafts")
                draftPacket = JSON.parse(request.postData());
              if (!lost && position === "after") {
                lost = true;
                return route.abort("connectionfailed");
              }
              return route.fulfill({ response });
            }
          }
          return route.continue();
        } catch {
          routeErrors.push("Owned respondent route operation failed");
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
        throw Error(
          "Owned respondent browser gate unavailable " + gate.status(),
        );
      const login = await ctx.request.post(
        h.env.APP_ORIGIN + "/api/v1/auth/login",
        {
          headers: { Origin: h.env.APP_ORIGIN },
          data: { email: email(actor), password },
        },
      );
      if (login.status() !== 200)
        throw Error(
          "Owned respondent browser session unavailable " + login.status(),
        );
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      for (mode of ["drafts", "submissions", "edits"])
        for (position of ["before", "after"]) {
          lost = false;
          const begin = attempts.length,
            readBegin = inspections.length,
            kind =
              mode === "drafts"
                ? "draft save"
                : mode === "edits"
                  ? "response edit"
                  : "submission";
          let fragment = "";
          if (mode === "edits") {
            if (!editCapability)
              throw Error("Owned edit capability unavailable");
            fragment = "#edit=" + editCapability;
          }
          if (mode === "drafts" && position === "after") {
            if (!draftPacket) throw Error("Owned resume context unavailable");
            fragment =
              "#" +
              new URLSearchParams({
                resume: draftPacket.resumeToken,
                upload: draftPacket.uploadToken,
              });
          }
          await navigate(
            page,
            h.env.APP_ORIGIN + "/forms/" + form.slug + fragment,
          );
          await expect(
            page.getByRole("heading", { name: t.title, exact: true }),
          ).toBeVisible();
          if (mode !== "edits")
            await page
              .getByLabel("Your name *", { exact: true })
              .fill("Fictional respondent");
          await expect(
            page.getByLabel("Your email *", { exact: false }),
          ).toHaveValue(email(actor));
          await page
            .getByLabel("Fictional respondent answer", { exact: false })
            .fill(
              "Owned original " + mode + " " + position + " " + viewport.width,
            );
          await page
            .getByRole("button", {
              name:
                mode === "drafts" ? "Save and resume later" : "Submit response",
              exact: true,
            })
            .click();
          const recovery = page.getByRole("region", {
            name: "Unconfirmed form request",
          });
          await expect(recovery).toBeVisible();
          await expect(page.getByRole("alert")).toBeVisible();
          const original = attempts[begin],
            body = JSON.parse(original.body),
            beforeInspection = await snapshot();
          check(
            !!original.key &&
              body.respondent.email === email(actor) &&
              body.copyRequested === false,
            mode +
              " " +
              position +
              " freezes original identity/answers/choice/key" +
              label,
          );
          if (position === "after") {
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
              "populated " +
                mode +
                " original-outcome recovery passes measured axe" +
                label,
            );
            await page.screenshot({
              path: new URL(
                "respondent-" + mode + "-" + viewport.width + ".png",
                output,
              ).pathname,
              fullPage: true,
              animations: "disabled",
            });
          }
          await recovery
            .getByRole("button", {
              name: "Check original " + kind + " outcome",
              exact: true,
            })
            .click();
          if (position === "before")
            await expect(
              recovery.getByRole("button", {
                name: "Retry original " + kind,
                exact: true,
              }),
            ).toBeEnabled();
          else await expect(recovery).toHaveCount(0);
          check(
            (await snapshot()) === beforeInspection &&
              inspections.length === readBegin + 1 &&
              inspections.at(-1).body === original.body &&
              inspections.at(-1).key === original.key,
            mode +
              " " +
              position +
              " inspection changes no draft/response record and preserves exact original request" +
              label,
          );
          if (position === "before")
            await recovery
              .getByRole("button", {
                name: "Retry original " + kind,
                exact: true,
              })
              .click();
          await expect(recovery).toHaveCount(0);
          await expect(
            page.getByRole("heading", {
              name:
                mode === "drafts"
                  ? "Your private resume link"
                  : "Response submitted.",
              exact: true,
            }),
          ).toBeVisible();
          check(
            attempts.length === begin + (position === "before" ? 2 : 1) &&
              attempts
                .slice(begin)
                .every(
                  (a) => a.key === original.key && a.body === original.body,
                ),
            mode +
              " " +
              position +
              " reconciles or explicitly retries identical bytes/key only" +
              label,
          );
        }
      // Genuine simultaneous saves prove token stability and stale-write protection.
      const root = "/forms/" + form.slug + "/drafts",
        pub = data(await h.call("/forms/" + form.slug)).form,
        body = {
          versionId: pub.versionId,
          answers: { [field.id]: "Owned concurrent draft" },
          respondent: { name: "Fictional respondent", email: email(actor) },
          copyRequested: false,
          resumeToken: token(),
          uploadToken: token(),
          draftRevision: 0,
        },
        key = randomUUID();
      const result = await Promise.all(
          Array.from({ length: 10 }, () => post(root, body, key)),
        ),
        saved = result.map((r) => data(r)),
        record = checked(
          await h.db
            .from("form_response_drafts")
            .select("id,revision,answers")
            .eq("form_id", form.id)
            .eq("resume_token_hash", tokenHash(body.resumeToken))
            .single(),
        );
      check(
        new Set(saved.map((r) => r.resumeToken + ":" + r.revision)).size ===
          1 && record.revision === saved[0].revision,
        "ten simultaneous identical draft saves create one token/record revision" +
          label,
      );
      const newer = {
          ...body,
          draftRevision: record.revision,
          answers: { [field.id]: "Newer owned draft answer" },
        },
        current = data(await post(root, newer));
      data(await post(root, body, key));
      const after = checked(
        await h.db
          .from("form_response_drafts")
          .select("revision,answers")
          .eq("id", record.id)
          .single(),
      );
      check(
        after.revision === current.revision &&
          after.answers[field.id] === newer.answers[field.id] &&
          (await post(root, body)).status === 409,
        "accepted old draft retry preserves a newer save and a new stale request conflicts" +
          label,
      );
      const receipt = data(await post(root + "/recovery", body, key));
      check(
        receipt.committed &&
          receipt.currentRevision === current.revision &&
          receipt.receipt.revision === record.revision &&
          !Object.keys(receipt.receipt).some((k) =>
            ["resumeToken", "answers", "respondent"].includes(k),
          ),
        "actual draft receipt inspection is minimal and reports current revision" +
          label,
      );
      // An actual concurrent save leaves the native proposal intact until review.
      mode = "drafts";
      position = "";
      lost = false;
      await navigate(
        page,
        h.env.APP_ORIGIN +
          "/forms/" +
          form.slug +
          "#" +
          new URLSearchParams({
            resume: body.resumeToken,
            upload: body.uploadToken,
          }),
      );
      await expect(
        page.getByLabel("Fictional respondent answer", { exact: false }),
      ).toHaveValue(newer.answers[field.id]);
      await page
        .getByLabel("Fictional respondent answer", { exact: false })
        .fill("Unsaved native stale proposal");
      const external = {
          ...newer,
          draftRevision: current.revision,
          answers: { [field.id]: "Externally updated owned draft" },
        },
        externalSaved = data(await post(root, external));
      await page
        .getByRole("button", { name: "Save and resume later", exact: true })
        .click();
      await expect(
        page.getByText("This record changed. Reload before saving.", {
          exact: false,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Fictional respondent answer", { exact: false }),
      ).toHaveValue("Unsaved native stale proposal");
      await page
        .getByText("Review loading current saved answers", { exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Load current draft and discard typed changes",
          exact: true,
        })
        .click();
      await expect(
        page.getByLabel("Fictional respondent answer", { exact: false }),
      ).toHaveValue(external.answers[field.id]);
      await page
        .getByRole("button", { name: "Save and resume later", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your private resume link",
          exact: true,
        }),
      ).toBeVisible();
      const final = checked(
        await h.db
          .from("form_response_drafts")
          .select("revision,answers")
          .eq("id", record.id)
          .single(),
      );
      check(
        final.revision > externalSaved.revision &&
          final.answers[field.id] === external.answers[field.id],
        "native known conflict preserves proposal until reviewed current-draft reload then saves current revision" +
          label,
      );
      const responses = checked(
        await h.db.from("form_responses").select("id").eq("form_id", form.id),
      );
      check(
        responses.length === 2 &&
          !checked(
            await h.db
              .from("form_respondent_copies")
              .select("id")
              .in(
                "response_id",
                responses.map((r) => r.id),
              ),
          ).length,
        "recovery creates exactly the intended responses and no unrequested respondent-copy jobs" +
          label,
      );
      check(
        !unexpected.length &&
          !errors.length &&
          !routeErrors.length &&
          (await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          )),
        "respondent writes have no unexpected egress/errors/page overflow" +
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
      checked(
        await h.db
          .from("form_responses")
          .update({ edit_token_hash: null, edit_secret_encrypted: null })
          .in("form_id", forms),
      );
      checked(
        await h.db
          .from("form_response_drafts")
          .update({
            expires_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .in("form_id", forms),
      );
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
  await writeFile(
    new URL(
      "../.docs/phase0/local-respondent-write-recovery.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: cleaned,
        scope:
          "Dedicated loopback; fresh owned fictional private forms/accounts/answers only. Exact before/after-loss draft/submission/edit and simultaneous draft saves. No providers/mail workers or real chapter/production changes. Owned forms archived/edit capabilities revoked/drafts expired/accounts disabled/sessions revoked; fictional response/audit rows retained privately, no physical-erasure claim. No raw token/key/body/answer/email/capability retained in report.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
