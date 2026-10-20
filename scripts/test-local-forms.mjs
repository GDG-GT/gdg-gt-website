import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
import { unzipSync, strFromU8 } from "fflate";
const { call, login, db,logout } = await localHttp(),
  evidence = [];
const check = (value, name) => {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
};
const user = (await login()).user,
  f = createTemplate("Fictional integration survey"),
  definition = {
    title: f.title,
    description: f.description,
    fields: f.fields,
    sections: f.sections,
    settings: f.settings,
  };
definition.settings.limit = 1;
definition.fields[0].sensitive = true;
const extra = newField("short", definition.sections[0].id);
extra.label = "Formula-like test input";
definition.fields.push(extra);
let form;
try {
  let r = await call("/admin/forms", { anonymous: true });
  check(
    r.status === 401,
    "anonymous callers cannot discover private form inventories",
  );
  r = await call("/admin/forms", {
    method: "POST",
    body: { slug: f.slug, definition, ownerId: randomUUID() },
  });
  check(r.status === 400, "form creation rejects client-supplied ownership");
  r = await call("/admin/forms", {
    method: "POST",
    body: { slug: f.slug, definition },
  });
  check(
    r.status === 200 && r.json.data.form.status === "Draft",
    "form creation commits a real server draft",
  );
  form = r.json.data.form;
  r = await call(
    "/admin/access?route=" +
      encodeURIComponent("/admin/forms/" + form.id + "/edit"),
  );
  check(
    r.status === 200 && r.json.data.allowed,
    "builder route authorizes the actual form record",
  );
  r = await call("/forms/" + form.slug, { anonymous: true });
  check(r.status === 404, "unpublished form definitions are concealed");
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(
    r.status === 200 && r.json.data.form.versions.length === 1,
    "publication creates an immutable version",
  );
  form = r.json.data.form;
  r = await call("/forms/" + form.slug, { anonymous: true });
  check(
    r.status === 200 &&
      !r.text.includes("ownerId") &&
      !r.text.includes("responseCount") &&
      !r.text.includes("retentionDays"),
    "public definition excludes private ownership, counts, and retention controls",
  );
  const version = r.json.data.form.versionId,
    answers = {
      [f.fields[0].id]: "Fictional Person",
      [f.fields[1].id]: "form-" + randomUUID() + "@example.test",
      [f.fields[2].id]: f.fields[2].options[0],
      [extra.id]: "=SUM(1,2)",
    };
  r = await call("/forms/" + form.slug + "/drafts", {
    anonymous: true,
    method: "POST",
    body: { versionId: version, answers },
  });
  check(
    r.status === 200 && r.json.data.resumeToken.length === 43,
    "save-and-resume returns a high-entropy private token",
  );
  const resume = r.json.data.resumeToken;
  r = await call("/forms/" + form.slug + "/drafts/load", {
    anonymous: true,
    method: "POST",
    body: { resumeToken: resume },
  });
  check(
    r.status === 200 &&
      r.json.data.answers[f.fields[0].id] === answers[f.fields[0].id],
    "valid resume token restores only its own draft",
  );
  const record = await db
    .from("form_response_drafts")
    .select("resume_token_hash")
    .eq("form_id", form.id)
    .single();
  check(
    !record.error &&
      record.data.resume_token_hash !== resume &&
      record.data.resume_token_hash.length === 64,
    "resume token is stored only as a hash",
  );
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: {
      versionId: version,
      answers: { ...answers, [randomUUID()]: "unknown" },
    },
  });
  check(r.status === 400, "submission rejects unknown field IDs");
  const key = randomUUID(),
    body = { versionId: version, answers, resumeToken: resume, website: "" };
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key,
    body,
  });
  check(
    r.status === 200 && r.json.data.responseId && r.json.data.editToken,
    "final submission commits before returning success",
  );
  const submitted = r.json.data;
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key,
    body,
  });
  check(
    r.status === 200 &&
      r.json.data.responseId === submitted.responseId &&
      r.json.data.editToken === submitted.editToken,
    "submission retries return the same committed result and edit token",
  );
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key,
    body: { ...body, answers: { ...answers, [f.fields[0].id]: "Changed" } },
  });
  check(
    r.status === 409,
    "idempotency key cannot change its submitted payload",
  );
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body,
  });
  check(
    r.status === 409 && r.json.error.code === "FORM_FULL",
    "response limit is enforced inside the transaction",
  );
  r = await call("/forms/" + form.slug + "/drafts/load", {
    anonymous: true,
    method: "POST",
    body: { resumeToken: resume },
  });
  check(r.status === 404, "committed response consumes its resume draft");
  r = await call("/admin/forms/" + form.id + "/responses");
  check(
    r.status === 200 &&
      r.json.data.total === 1 &&
      !r.text.includes("Fictional Person") &&
      !r.text.includes(submitted.editToken),
    "default response projection masks sensitive answers and tokens",
  );
  r = await call("/admin/forms/" + form.id + "/responses?sensitive=true");
  check(
    r.status === 200 && r.text.includes("Fictional Person"),
    "explicit sensitive reveal is separately authorized",
  );
  r = await call(
    "/admin/forms/" +
      form.id +
      "/responses?q=" +
      encodeURIComponent("Fictional Person"),
  );
  check(
    r.status === 200 && r.json.data.total === 0,
    "default search cannot infer sensitive answer values",
  );
  r = await call(
    "/admin/forms/" + form.id + "/responses?version=1&status=complete",
  );
  check(
    r.status === 200 && r.json.data.total === 1,
    "response filters execute on the server",
  );
  r = await call("/admin/forms/" + form.id + "/views", {
    method: "POST",
    body: {
      name: "Fixture review",
      filters: { version: 1 },
      columns: [extra.id],
    },
  });
  check(
    r.status === 200,
    "review preferences persist in a server-owned saved view",
  );
  r = await call("/admin/forms/" + form.id + "/views");
  check(
    r.status === 200 &&
      r.json.data.items.some((v) => v.name === "Fixture review"),
    "saved views are available to their account owner",
  );
  r = await call("/admin/forms/" + form.id + "/analytics");
  check(
    r.status === 200 &&
      !r.text.includes("Fictional Person") &&
      r.json.data.fields.some(
        (v) =>
          v.fieldId === f.fields[2].id &&
          v.counts[f.fields[2].options[0]] === 1,
      ),
    "version-aware summaries exclude sensitive and free-text values",
  );
  r = await call("/admin/forms/" + form.id + "/responses/export?format=csv");
  check(
    r.status === 200 &&
      r.text.includes("'=SUM(1,2)") &&
      r.text.includes(extra.id) &&
      !r.text.includes("Fictional Person"),
    "CSV export preserves stable field IDs and neutralizes spreadsheet formulas",
  );
  r = await call("/admin/forms/" + form.id + "/responses/export?format=json");
  check(
    r.status === 200 &&
      Array.isArray(r.json) &&
      !r.text.includes("Fictional Person"),
    "JSON export is server-authorized and omits sensitive answers",
  );
  r = await call("/admin/forms/" + form.id + "/responses/export?format=xlsx");
  const workbook = unzipSync(r.bytes),
    sheet = strFromU8(workbook["xl/worksheets/sheet1.xml"]);
  check(
    r.status === 200 &&
      sheet.includes("SUM(1,2)") &&
      !sheet.includes("<f>") &&
      !sheet.includes("Fictional Person"),
    "XLSX download contains literal strings rather than executable formulas",
  );
  r = await call("/forms/" + form.slug + "/edits/load", {
    anonymous: true,
    method: "POST",
    body: { editToken: submitted.editToken },
  });
  check(
    r.status === 200 &&
      r.json.data.answers[f.fields[0].id] === "Fictional Person",
    "separate edit token retrieves the respondent’s own committed answers",
  );
  r = await call("/forms/" + form.slug + "/edits", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: {
      editToken: submitted.editToken,
      versionId: version,
      revision: 0,
      answers: { ...answers, [f.fields[0].id]: "Updated fictional person" },
    },
  });
  check(
    r.status === 200 && r.json.data.revision === 1,
    "editing creates a versioned response update",
  );
  const revisions = await db
    .from("form_response_revisions")
    .select("id,answers")
    .eq("response_id", submitted.responseId);
  check(
    !revisions.error &&
      revisions.data.length === 1 &&
      revisions.data[0].answers[f.fields[0].id] === "Fictional Person",
    "old answer values remain only in the protected revision history",
  );
  r = await call("/admin/forms/" + form.id + "/draft", {
    method: "PATCH",
    body: {
      revision: form.revision,
      definition: { ...definition, title: "Renamed draft" },
    },
  });
  check(r.status === 200, "editing a published form changes only its draft");
  form = r.json.data.form;
  r = await call("/forms/" + form.slug, { anonymous: true });
  check(
    r.status === 200 && r.json.data.form.title === definition.title,
    "published definition remains unchanged by draft edits",
  );
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(
    r.status === 200 &&
      r.json.data.form.versions.length === 2 &&
      r.json.data.form.versions[0].title === definition.title,
    "new publication retains historical immutable labels",
  );
  form = r.json.data.form;
  const immutable = await db
    .from("form_versions")
    .update({ definition: {} })
    .eq("form_id", form.id);
  check(
    !!immutable.error,
    "database trigger rejects published-version rewrites",
  );
  r = await call(
    "/admin/forms/" + form.id + "/responses/" + submitted.responseId,
    { method: "PATCH", body: { action: "redact" } },
  );
  check(
    r.status === 200,
    "authorized identity redaction commits through the protected API",
  );
  const redacted = await db
    .from("form_response_revisions")
    .select("answers")
    .eq("response_id", submitted.responseId);
  check(
    !redacted.error &&
      !JSON.stringify(redacted.data).includes("Fictional Person"),
    "redaction removes identity from protected historical revisions",
  );
  r = await call("/forms/" + form.slug + "/edits/load", {
    anonymous: true,
    method: "POST",
    body: { editToken: submitted.editToken },
  });
  check(r.status === 404, "redaction revokes the respondent edit token");
  await db
    .from("admin_users")
    .update({ role: "blog_editor" })
    .eq("id", user.id);
  r = await call("/admin/forms");
  check(
    r.status === 200 && r.json.data.total === 0,
    "Blog Editors cannot discover form definitions or counts",
  );
  r = await call("/admin/forms/" + form.id + "/responses");
  check(
    r.status === 404,
    "role change immediately conceals private form responses",
  );
} finally {
  const restored = await db
    .from("admin_users")
    .update({ role: user.role })
    .eq("id", user.id);
  if (restored.error) throw new Error("Could not restore development role");
  if (form) {
    const current = await call("/admin/forms/" + form.id);
    if (current.status === 200) {
      const r = await call("/admin/forms/" + form.id, {
        method: "DELETE",
        body: { revision: current.json.data.form.revision },
      });
      check(
        r.status === 200,
        "test form archives without deleting its protected responses",
      );
    }
  }
  await logout();
}
await writeFile(
  new URL("../.docs/phase0/local-forms-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real local HTTP/Supabase tests with fictional data, preserved in archived form. No external email sent. Does not certify every Forms requirement.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
