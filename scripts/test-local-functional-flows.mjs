import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox, webkit, expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, token, tokenHash } from "../server/lib/security.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
import { deliveryMessage } from "../server/delivery.mjs";
import { serverConfig } from "../server/config.mjs";
import { createMailTransport } from "../server/lib/mail-transport.mjs";
import { waitForLocalTestCapacity } from "./lib/local-test-capacity.mjs";

// This is an integration exercise against the real loopback API/database.
// No application response is fulfilled, replaced or fabricated in the browser.
// Credentials/capabilities remain in memory; reports contain only check names.
const h = await localHttp(), { db, env } = h;
const options = process.argv.slice(2);
if (options.some((arg) => !["--browser=chromium", "--browser=firefox", "--browser=webkit", "--mobile", "--entry=explicit"].includes(arg)) || options.filter((arg) => arg.startsWith("--browser=")).length > 1)
  throw Error("Use --browser=chromium|firefox|webkit, optional --mobile and --entry=explicit.");
const engine = options.find((arg) => arg.startsWith("--browser="))?.slice(10) || "chromium",
  mobile = options.includes("--mobile"), explicitEntry = options.includes("--entry=explicit"),
  profile = engine + (mobile ? "-mobile" : "-desktop") + (explicitEntry ? "-explicit-entry" : "");
if (env.MAIL_MODE !== "local" || env.EMAIL_SEND_ENABLED === "true" || env.PUSH_SEND_ENABLED === "true")
  throw Error("Functional acceptance requires local mail and disabled real delivery.");
const actor = randomUUID(), marker = actor.slice(0, 8),
  email = `fictional-functional-${actor}@example.test`,
  password = "Fictional-functional-" + randomUUID(),
  origin = env.APP_ORIGIN, tests = [], scenarios = [],
  output = new URL("../artifacts/browser/live-functional-flows/" + profile + "/", import.meta.url),
  owned = { events: [], forms: [], members: [], subscribers: [], notifications: [] };
let browser, context, page, created = false, completed = false, stage = "initialization", step = "initialization";
const pageErrors = [];
const windowErrors = [], requestFailures = [];
const checked = (r) => { if (r.error) throw Error("Fixture database operation failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Fixture API operation failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const check = (ok, name) => { if (!ok) throw Error(name); tests.push({ name, passed: true }); console.info("PASS " + name); };
const post = (path, body, method = "POST") => h.call(path, { method, body, key: randomUUID() });
const main = () => page.locator("#workspace-content");
const navigate = async (url) => {
  // A completed workflow includes its visible read refreshes. Settle those
  // before deliberately replacing the entire document for the next scenario;
  // abrupt pending-fetch/unload behavior has separate cancellation unit tests.
  await page.waitForLoadState("networkidle");
  await page.goto(url);
};
async function scenario(name, run) {
  stage = name;
  const start = tests.length;
  try { await run(); scenarios.push({ name, passed: true, checks: tests.length - start }); }
  catch (error) {
    scenarios.push({ name, passed: false, checks: tests.length - start, errorType: error.name });
    // Locator diagnostics exclude input values and response bodies.
    await writeFile(new URL("failure-" + scenarios.length + ".json", output), JSON.stringify({
      stage, step, errorType: error.name,
      firstLine: String(error.message).split("\n")[0]
        .replaceAll(h.credentials.gateCode, "[private gate]")
        .replaceAll(h.credentials.password, "[private password]")
        .replaceAll(password, "[fixture password]")
        .replaceAll(h.credentials.email, "[private email]"),
      controls: page && !page.isClosed() ? await page.locator("h1,h2,[role=alert],button").allTextContents().catch(() => []) : [],
    }, null, 2) + "\n");
    console.error("FAIL " + name + " (" + error.name + ")");
  }
}
async function clickAndAccept(locator, path, method = "POST") {
  const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1" + path && r.request().method() === method);
  await locator.click();
  const r = await response;
  if (r.status() !== 200) throw Error("Browser operation rejected " + r.status());
  return (await r.json()).data;
}
await mkdir(output, { recursive: true });
await waitForLocalTestCapacity(db, { subscriptions: explicitEntry ? 0 : 1 });
try {
  checked(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "super_admin", is_active: true, display_name: "Fictional functional reviewer " + marker }));
  created = true;
  data(await post("/auth/gate", { code: h.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  browser = await ({ chromium, firefox, webkit })[engine].launch();
  context = await browser.newContext({ viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 }, reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
  await context.exposeBinding("gdgObserveFunctionalError", (_source, event) => {
    windowErrors.push({ type: event.type, name: String(event.name || "Error"), scenario: stage });
  });
  await context.addInitScript(() => {
    window.addEventListener("error", (event) => {
      if (event instanceof ErrorEvent) void window.gdgObserveFunctionalError({ type: "error", name: event.error?.name || "Error" });
    });
    window.addEventListener("unhandledrejection", (event) => {
      void window.gdgObserveFunctionalError({ type: "unhandledrejection", name: event.reason?.name || "Error" });
    });
  });
  // Leave the real same-origin transport entirely unintercepted. Only
  // disallowed external origins are routed; cancellation diagnostics and
  // actual window errors remain observable without response substitution.
  await context.route((url) => ![origin, "http://127.0.0.1:54361"].includes(url.origin),
    (route) => route.abort("blockedbyclient"));
  page = await context.newPage();
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === "/api/v1/admin/notifications")
      requestFailures.push({ path: url.pathname + url.search, method: request.method(), error: request.failure()?.errorText, scenario: stage });
  });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => pageErrors.push({ name: error.name,
    message: String(error.message).split("\n")[0]
      .replaceAll(h.credentials.gateCode, "[private gate]")
      .replaceAll(h.credentials.password, "[private password]")
      .replaceAll(password, "[fixture password]")
      .replaceAll(h.credentials.email, "[private email]"),
    scenario: stage,
  }));
  await scenario("Hidden entrance and real browser authentication", async () => {
    step = "open public page";
    await navigate(origin + "/");
    step = "wait for current availability";
    await expect(page.locator(".gt-availability-frame")).toHaveJSProperty("inert", false);
    const field = page.getByLabel("Email address", { exact: true });
    step = "fill hidden entrance";
    await field.fill(h.credentials.gateCode);
    step = "submit with Enter";
    await field.press(explicitEntry ? "Shift+Enter" : "Enter");
    const dialog = page.getByRole("dialog", { name: "Admin Access" });
    step = "wait for sign-in dialog";
    await expect(dialog).toBeVisible();
    step = "fill fixture sign-in";
    await dialog.getByLabel("Email Address", { exact: true }).fill(email);
    await dialog.getByLabel("Password", { exact: true }).fill(password);
    step = "submit fixture sign-in";
    await dialog.getByRole("button", { name: "Login", exact: true }).click();
    step = "wait for authenticated workspace";
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(main()).toBeVisible();
    check((await context.cookies()).some((c) => c.httpOnly && /session/.test(c.name)), `real hidden entrance accepts ${explicitEntry ? "Shift+Enter" : "Enter"} and issues an HttpOnly session`);
    check(!await page.evaluate(() => Object.keys(localStorage).some((key) => /token|csrf|password|gate/i.test(key))), "browser sign-in stores no authentication secret in localStorage");
  });
  if (!scenarios[0]?.passed) throw Error("Browser authentication prerequisite failed");

  await scenario("Event authoring, publication and public registration", async () => {
    const title = "Fictional functional event " + marker, slug = "fictional-functional-" + marker;
    await navigate(origin + "/admin/events");
    await main().getByRole("button", { name: "Create event", exact: true }).click();
    await main().getByLabel("Event title", { exact: false }).fill(title);
    await main().getByLabel("URL slug", { exact: false }).fill(slug);
    await main().getByLabel("Start (UTC)", { exact: false }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
    await main().getByLabel("Venue or online label", { exact: false }).fill("Fictional local test room");
    await main().getByLabel("Description", { exact: false }).fill("Fictional local end-to-end verification. This is not a real chapter event.");
    const saved = await clickAndAccept(main().getByRole("button", { name: "Save draft changes", exact: true }), "/admin/events");
    owned.events.push(saved.event.id);
    await main().getByRole("button", { name: "Publish", exact: true }).click();
    const review = page.getByRole("dialog");
    await clickAndAccept(review.getByRole("button", { name: "Confirm", exact: true }), `/admin/events/${saved.event.id}/publish`);
    check(checked(await db.from("events").select("publication_status").eq("id", saved.event.id).single()).publication_status === "published", "browser-authored event is published in the real database");
    await navigate(origin + "/events/" + slug);
    await expect(page.locator("h1")).toHaveText(title);
    const registration = page.locator("#registration");
    await registration.getByLabel("Full name", { exact: false }).fill("Fictional attendee " + marker);
    await registration.getByLabel("Email address", { exact: false }).fill(`fictional-attendee-${marker}@example.test`);
    await registration.getByRole("checkbox", { name: /I agree to be contacted/ }).check();
    await registration.getByRole("button", { name: "Complete registration", exact: true }).click();
    await expect(registration.getByRole("heading", { name: /registered|You're in|You’re in|confirmed/i })).toBeVisible();
    check(checked(await db.from("event_attendance").select("id").eq("event_id", saved.event.id)).length === 1, "public browser registration commits exactly one real attendee");
    const calendar = await context.request.get(origin + `/api/v1/events/${slug}/calendar.ics`);
    check(calendar.status() === 200 && (await calendar.text()).includes("BEGIN:VEVENT"), "published browser-authored event has a real calendar download");
  });

  await scenario("Community member creation, edit, CSV import and export", async () => {
    const name = "Fictional functional member " + marker, memberEmail = `fictional-functional-member-${marker}@example.test`;
    await navigate(origin + "/admin/members");
    await main().getByRole("button", { name: "New member", exact: true }).click();
    const editor = main().locator("form.gt-event-editor");
    await editor.getByLabel("Name", { exact: false }).fill(name);
    await editor.getByLabel("Email", { exact: false }).fill(memberEmail);
    const saved = await clickAndAccept(editor.getByRole("button", { name: "Save member changes" }), "/admin/members");
    owned.members.push(saved.id);
    check(checked(await db.from("members").select("name,email").eq("id", saved.id).single()).email === memberEmail, "browser member creation commits the declared identity");
    await main().getByLabel("Search private members").fill(name);
    await main().getByRole("button", { name: "Edit member", exact: true }).click();
    await editor.getByLabel("Major (optional)", { exact: true }).fill("Fictional functional major");
    await clickAndAccept(editor.getByRole("button", { name: "Save member changes" }), "/admin/members/" + saved.id);
    check(checked(await db.from("members").select("major").eq("id", saved.id).single()).major === "Fictional functional major", "browser member edit persists through the real mutation contract");
    await main().getByRole("button", { name: "Import CSV", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Import community members" });
    await dialog.getByLabel("Member CSV file").setInputFiles({ name: "fictional-members.csv", mimeType: "text/csv", buffer: Buffer.from(`name,email\r\nFictional imported ${marker},fictional-imported-${marker}@example.test\r\n`) });
    await dialog.getByRole("button", { name: "Review import", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: /1 new record/ })).toBeVisible();
    await dialog.getByLabel("Import confirmation").fill("IMPORT 1");
    await dialog.getByLabel("Current password", { exact: true }).fill(password);
    const imported = await clickAndAccept(dialog.getByRole("button", { name: "Confirm import", exact: true }), "/admin/members/import");
    owned.members.push(...imported.createdIds);
    check(imported.created === 1 && imported.createdIds.length === 1, "reviewed browser CSV upload imports exactly one member");
    await main().getByLabel("Search private members").fill(marker);
    await main().getByRole("button", { name: "Export CSV", exact: true }).click();
    const exportDialog = page.getByRole("dialog", { name: "Export community members" });
    await exportDialog.getByLabel("Include private email, phone, year, major and interests").check();
    const download = page.waitForEvent("download");
    await exportDialog.getByRole("button", { name: "Download filtered CSV" }).click();
    const file = await download, stream = await file.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString("utf8");
    check(csv.includes(memberEmail) && csv.includes(`fictional-imported-${marker}@example.test`), "actual browser CSV download includes both filtered owned records");
    await file.delete();
  });

  await scenario("Declared-identity form submission and exact response-copy queue", async () => {
    const draft = createTemplate("Fictional functional form " + marker, "blank"), question = newField("short", draft.sections[0].id);
    question.label = "Fictional acceptance answer"; question.required = true;
    const definition = { title: draft.title, description: "Fictional local functional verification.", fields: [question], sections: draft.sections, settings: { ...draft.settings, receipts: false, editing: true, resume: true } };
    let form = data(await post("/admin/forms", { slug: draft.slug, definition })).form;
    owned.forms.push(form.id);
    form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
    await navigate(origin + "/forms/" + form.slug);
    await page.getByLabel("Your name *", { exact: true }).fill("Fictional form respondent " + marker);
    await page.getByLabel("Your email *", { exact: false }).fill(`fictional-form-respondent-${marker}@example.test`);
    await page.getByLabel(question.label, { exact: false }).fill("Exact fictional response " + marker);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Email me a copy of my completed response").check();
    const response = await clickAndAccept(page.getByRole("button", { name: "Submit response", exact: true }), `/forms/${form.slug}/submissions`);
    await expect(page.getByText(/A copy of your questions and answers is queued/)).toBeVisible();
    check(response.copyQueued === true, "real browser form submission queues the requested respondent copy");
    const stored = checked(await db.from("form_responses").select("respondent_email").eq("id", response.responseId).single());
    check(stored.respondent_email === `fictional-form-respondent-${marker}@example.test`, "form submission persists the declared respondent email");
    const copies = checked(await db.from("form_respondent_copies").select("id").eq("response_id", response.responseId));
    check(copies.length === 1, "one real submitted response queues exactly one copy");
    // Lease only this response's explicitly owned fixture job. Never run the
    // global worker over unrelated pending chapter mail during acceptance.
    const pending = checked(await db.from("delivery_jobs").select("id").eq("kind", "form_respondent_copy").eq("payload->>copyId", copies[0].id).eq("state", "pending").single());
    const lease = randomUUID(), job = checked(await db.from("delivery_jobs").update({ state: "running", lease_token: lease, locked_until: new Date(Date.now() + 300000).toISOString(), attempt_count: 1 }).eq("id", pending.id).eq("state", "pending").select("*").single());
    const transport = createMailTransport(env);
    try {
      const message = await deliveryMessage(job, db, serverConfig(env), transport.config);
      check(message?.to === `fictional-form-respondent-${marker}@example.test` && message.text.includes(question.label) && message.text.includes("Exact fictional response " + marker) && !message.cc && !message.bcc && !message.text.includes("/admin/"), "real copy renderer addresses only the respondent and includes their exact question and answer");
      const providerId = await transport.send(message, { jobId: job.id, idempotencyKey: "gdg-job-" + job.id });
      check(checked(await db.rpc("finish_delivery_job", { p_id: job.id, p_lease: lease, p_success: true, p_provider_id: providerId, p_error_code: null })), "owned response-copy job completes through the actual local SMTP transport");
    } finally { transport.close(); }
    const messages = await fetch("http://127.0.0.1:54364/api/v1/messages").then((r) => r.json()),
      ownMessages = messages.messages.filter((m) => m.To?.some((to) => to.Address === `fictional-form-respondent-${marker}@example.test`));
    check(ownMessages.length === 1, "local mail inbox receives exactly one requested response copy");
    const actualMail = await fetch("http://127.0.0.1:54364/api/v1/message/" + ownMessages[0].ID).then((r) => r.json());
    check(actualMail.Text.includes(question.label) && actualMail.Text.includes("Exact fictional response " + marker) && actualMail.To.length === 1 && !actualMail.Cc?.length && !actualMail.Bcc?.length, "received local email preserves exact answers and a single recipient");
    await navigate(origin + `/admin/forms/${form.id}/responses`);
    await expect(main().getByRole("heading", { name: "1 matching responses", exact: true })).toBeVisible();
    check((await h.call(`/admin/forms/${form.id}/responses`)).status === 200, "browser-submitted response is available through the protected response workspace");
  });

  await scenario("Notification read-all changes to dismiss-all", async () => {
    const id = randomUUID(); owned.notifications.push(id);
    checked(await db.from("notifications").insert({ id, user_id: actor, type: "system", title: "Fictional functional notification " + marker, message: "Owned verification fixture only", is_read: false }));
    await navigate(origin + "/admin");
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const dialog = page.getByRole("dialog", { name: "Notifications", exact: true });
    await dialog.getByRole("button", { name: "Mark all read", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Dismiss all", exact: true })).toBeVisible();
    check(checked(await db.from("notifications").select("is_read").eq("id", id).single()).is_read, "notification read-all reaches the real saved inbox");
    await dialog.getByRole("button", { name: "Dismiss all", exact: true }).click();
    await expect(dialog.getByText(/no notifications|all caught up|nothing here/i).first()).toBeVisible();
    const removed = checked(await db.from("notifications").select("id").eq("id", id));
    check(removed.length === 0, "notification dismiss-all removes the real read notification");
  });

  await scenario("Newsletter capability review, confirm and unsubscribe", async () => {
    const id = randomUUID(), confirm = token(), unsubscribe = token(); owned.subscribers.push(id);
    checked(await db.from("newsletter_subscribers").insert({ id, email: `fictional-functional-newsletter-${marker}@example.test`, state: "pending", is_active: false, consent_at: new Date().toISOString() }));
    checked(await db.from("newsletter_tokens").insert([
      { subscriber_id: id, purpose: "confirm", token_hash: tokenHash(confirm), expires_at: new Date(Date.now() + 3600000).toISOString() },
      { subscriber_id: id, purpose: "unsubscribe", token_hash: tokenHash(unsubscribe), expires_at: new Date(Date.now() + 3600000).toISOString() },
    ]));
    await navigate(origin + "/newsletter/confirm#token=" + confirm);
    await expect(page.getByRole("button", { name: "Confirm subscription", exact: true })).toBeVisible();
    check(checked(await db.from("newsletter_subscribers").select("state").eq("id", id).single()).state === "pending", "opening a real confirmation link does not subscribe the person");
    await page.getByRole("button", { name: "Confirm subscription", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("You’re on the list.");
    check(checked(await db.from("newsletter_subscribers").select("state").eq("id", id).single()).state === "active", "explicit browser newsletter confirmation activates the real subscriber");
    await navigate(origin + "/newsletter/unsubscribe#token=" + unsubscribe);
    await expect(page.getByRole("button", { name: "Unsubscribe", exact: true })).toBeVisible();
    check(checked(await db.from("newsletter_subscribers").select("state").eq("id", id).single()).state === "active", "opening a real unsubscribe link leaves the subscription active");
    await page.getByRole("button", { name: "Unsubscribe", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("You’re unsubscribed.");
    check(checked(await db.from("newsletter_subscribers").select("state").eq("id", id).single()).state === "unsubscribed", "explicit browser unsubscribe persists the real preference");
  });
  check(pageErrors.length === 0, "real functional flows produce no uncaught browser exceptions");
  completed = scenarios.every((s) => s.passed);
} finally {
  await context?.close(); await browser?.close();
  // Keep retained histories; only this invocation's explicitly owned fixtures
  // are archived or disabled. Existing chapter records/accounts are untouched.
  for (const id of owned.events) checked(await db.from("events").update({ publication_status: "archived", registration_enabled: false }).eq("id", id).eq("created_by", actor));
  for (const id of owned.forms) checked(await db.from("forms").update({ state: "Archived", archived_at: new Date().toISOString() }).eq("id", id).eq("owner_id", actor));
  for (const id of owned.members) checked(await db.from("members").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", id));
  for (const id of owned.subscribers) checked(await db.from("newsletter_subscribers").delete().eq("id", id));
  for (const id of owned.notifications) checked(await db.from("notifications").delete().eq("id", id).eq("user_id", actor));
  if (created) {
    await h.logout();
    checked(await db.from("admin_users").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", actor));
    checked(await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_user_id", actor).is("revoked_at", null));
  }
  await writeFile(new URL("../.docs/phase0/local-functional-flows-" + profile + ".json", import.meta.url), JSON.stringify({
    generatedAt: new Date().toISOString(), completed, profile, stage, scenarios, tests, pageErrors, windowErrors, requestFailures,
    scope: "Real loopback browser/UI/API/database round trips, fresh fictional account and explicitly owned records. No application responses mocked; external origins blocked, local mail only, real email/push delivery disabled. Credentials/capabilities are memory-only; original chapter data/gate/account unchanged. Owned retained records archived, test account disabled/sessions revoked. Not physical-device push or human screen-reader acceptance.",
  }, null, 2) + "\n");
}
if (!completed) process.exitCode = 1;
