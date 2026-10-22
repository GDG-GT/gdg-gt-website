import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { runDelivery, mailConfig } from "../server/delivery.mjs";
const root = await localHttp(),
  { call, db, env } = root,
  evidence = [];
if (!mailConfig(env).local) throw Error("Loopback SMTP only.");
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Forms API failed: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const post = (path, body, key = randomUUID(), anonymous = true) =>
  call(path, { method: "POST", body, key, anonymous });
const respondent = {
  name: "Fictional Copy Respondent",
  email: `fictional-copy-${randomUUID()}@example.test`,
};
let form;
try {
  await root.login();
  const t = createTemplate("Fictional respondent copy check");
  const definition = {
    title: t.title,
    description: t.description,
    sections: t.sections,
    fields: t.fields.slice(0, 2),
    settings: {
      ...t.settings,
      limit: 0,
      editing: true,
      resume: true,
      receipts: false,
    },
  };
  definition.fields[0].sensitive = true;
  form = data(
    await post(
      "/admin/forms",
      { slug: t.slug, definition },
      randomUUID(),
      false,
    ),
  ).form;
  form = data(
    await post(
      `/admin/forms/${form.id}/publish`,
      { revision: form.revision },
      randomUUID(),
      false,
    ),
  ).form;
  const publicForm = data(
    await call(`/forms/${form.slug}`, { anonymous: true }),
  ).form;
  check(
    publicForm.copyAvailable &&
      publicForm.respondentContext.source === "self_reported",
    "public form requires declared identity without pretending it is verified",
  );
  const body = {
    versionId: publicForm.versionId,
    respondent,
    answers: {
      [definition.fields[0].id]: "Exact sensitive answer, first revision",
      [definition.fields[1].id]: respondent.email,
    },
  };
  const { respondent: omitted, ...missing } = body;
  check(
    (await post(`/forms/${form.slug}/submissions`, missing)).status === 400,
    "missing system identity rejected even if questions contain name and email",
  );
  check(
    (
      await post(`/forms/${form.slug}/submissions`, {
        ...body,
        respondent: { ...respondent, verified: true },
      })
    ).status === 400,
    "client cannot forge identity verification",
  );
  const draft = data(
    await post(`/forms/${form.slug}/drafts`, { ...body, copyRequested: true }),
  );
  const restored = data(
    await post(`/forms/${form.slug}/drafts/load`, {
      resumeToken: draft.resumeToken,
    }),
  );
  check(
    restored.respondent.email === respondent.email && restored.copyRequested,
    "private saved draft restores name, email and copy preference",
  );
  const noCopy = data(await post(`/forms/${form.slug}/submissions`, body));
  let copies = await db
    .from("form_respondent_copies")
    .select("id")
    .eq("response_id", noCopy.responseId);
  check(
    !copies.error && copies.data.length === 0 && !noCopy.copyQueued,
    "unchecked copy option queues no respondent email",
  );
  const key = randomUUID(),
    committed = data(
      await post(
        `/forms/${form.slug}/submissions`,
        { ...body, copyRequested: true },
        key,
      ),
    );
  check(
    committed.copyQueued,
    "copy queues immediately to entered email without email confirmation or sign-in",
  );
  check(
    data(
      await post(
        `/forms/${form.slug}/submissions`,
        { ...body, copyRequested: true },
        key,
      ),
    ).responseId === committed.responseId,
    "ambiguous submission retry returns the same committed response",
  );
  copies = await db
    .from("form_respondent_copies")
    .select("id")
    .eq("response_id", committed.responseId);
  check(
    !copies.error && copies.data.length === 1,
    "submission retries create only one copy job",
  );
  const loaded = data(
    await post(`/forms/${form.slug}/edits/load`, {
      editToken: committed.editToken,
    }),
  );
  check(
    loaded.respondent.email === respondent.email &&
      loaded.form.respondentContext.locked,
    "edit link restores and locks the original respondent identity",
  );
  const edit = {
    ...body,
    editToken: committed.editToken,
    revision: 0,
    answers: {
      ...body.answers,
      [definition.fields[0].id]: "Changed second revision",
    },
    copyRequested: false,
  };
  check(
    (
      await post(`/forms/${form.slug}/edits`, {
        ...edit,
        respondent: { ...respondent, email: "stranger@example.test" },
      })
    ).status === 400,
    "edit capability cannot redirect copies to another email address",
  );
  data(await post(`/forms/${form.slug}/edits`, edit));
  const reviewed = data(
    await call(
      `/admin/forms/${form.id}/responses?q=${encodeURIComponent(respondent.email)}`,
    ),
  );
  check(
    reviewed.total === 2 &&
      reviewed.items.every(
        (r) =>
          r.respondent.email === respondent.email &&
          r.respondent.source === "self_reported",
      ),
    "authorized review can search the captured respondent without marking it verified",
  );
  const exported = await call(
    `/admin/forms/${form.id}/responses/export?format=json`,
  );
  check(
    exported.status === 200 &&
      JSON.parse(exported.text).every(
        (r) =>
          r.respondentEmail === respondent.email &&
          r.respondentSource === "self_reported",
      ),
    "JSON export includes declared name, email and truthful provenance",
  );
  for (let i = 0; i < 5; i++) {
    await runDelivery({ db, env, limit: 25 });
    const job = await db
      .from("delivery_jobs")
      .select("state,provider_message_id,payload")
      .eq("kind", "form_respondent_copy")
      .eq("payload->>copyId", copies.data[0].id)
      .single();
    if (job.data?.state === "completed" && job.data.provider_message_id) break;
  }
  const messages = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
    (r) => r.json(),
  );
  const own = messages.messages.filter((m) =>
    m.To?.some((to) => to.Address === respondent.email),
  );
  check(
    own.length === 1,
    "local SMTP receives exactly one respondent-requested copy",
  );
  const actual = await fetch(
    `http://127.0.0.1:54364/api/v1/message/${own[0].ID}`,
  ).then((r) => r.json());
  check(
    actual.Text.includes("Exact sensitive answer, first revision") &&
      !actual.Text.includes("Changed second revision"),
    "copy contains the exact submitted revision including its sensitive answer even after an edit",
  );
  check(
    actual.To.length === 1 &&
      !actual.Cc?.length &&
      !actual.Bcc?.length &&
      !actual.Text.includes("/admin/"),
    "copy goes only to entered recipient with no chapter CC, BCC or private review link",
  );
  const legacy = await db.rpc("submit_form_response", {
    p_form: form.id,
    p_version: publicForm.versionId,
    p_schema_hash: "a".repeat(64),
    p_answers: {},
    p_key_hash: "b".repeat(64),
    p_request_hash: "c".repeat(64),
    p_access_hash: null,
    p_identity_hash: null,
    p_actor: null,
    p_edit_hash: null,
    p_edit_secret: null,
    p_resume_hash: null,
    p_upload_hash: null,
  });
  check(
    legacy.error?.code === "42501",
    "legacy anonymous RPC execution denied to API service",
  );
} finally {
  if (form) {
    const current = data(await call(`/admin/forms/${form.id}`)).form;
    if (current.status !== "Archived")
      await call(`/admin/forms/${form.id}`, {
        method: "DELETE",
        body: { revision: current.revision },
      });
  }
  await root.logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-form-respondent-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: "loopback SMTP; fictional identities only",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
console.info(
  `${evidence.length} actual respondent identity/copy checks passed.`,
);
