import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
const { call, login, logout } = await localHttp(),
  evidence = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
await login();
let form;
try {
  const f = createTemplate("Fictional branch verification"),
    second = { id: randomUUID(), title: "Additional detail", description: "" },
    third = { id: randomUUID(), title: "Closing", description: "" };
  f.sections.push(second, third);
  const detail = newField("short", second.id),
    last = newField("short", third.id);
  detail.label = "Required additional detail";
  detail.required = true;
  last.label = "Closing note";
  last.required = true;
  f.fields.push(detail, last);
  const choice = f.fields[2],
    rule = {
      id: randomUUID(),
      fieldId: choice.id,
      value: choice.options[0],
      target: third.id,
    };
  f.sections[0].rules = [rule];
  const { title, description, fields, sections, settings } = f,
    definition = { title, description, fields, sections, settings };
  let r = await call("/admin/forms", {
    method: "POST",
    body: { slug: f.slug, definition },
  });
  check(r.status === 200, "branch rules persist in a real mutable draft");
  form = r.json.data.form;
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(r.status === 200, "valid forward section branching can be published");
  form = r.json.data.form;
  r = await call("/forms/" + form.slug, { anonymous: true });
  const versionId = r.json.data.form.versionId;
  check(
    r.status === 200 && r.json.data.form.sections[0].rules[0].id === rule.id,
    "respondents receive the same immutable versioned rule used by the server",
  );
  const answers = {
    [f.fields[0].id]: "Fictional Branch Reviewer",
    [f.fields[1].id]: "branch@example.test",
    [choice.id]: choice.options[0],
    [last.id]: "Complete",
  };
  const submit = (body) =>
    call("/forms/" + form.slug + "/submissions", {
      anonymous: true,
      method: "POST",
      key: randomUUID(),
      body: { ...body, respondent: { name: "Fictional Branch Respondent", email: "fictional-branch@example.test" } },
    });
  r = await submit({
    versionId,
    answers: { ...answers, [detail.id]: "Attempted hidden answer" },
  });
  check(
    r.status === 400 && r.json.error.fields[detail.id],
    "server rejects answers to a skipped section",
  );
  const missing = { ...answers };
  delete missing[last.id];
  r = await submit({ versionId, answers: missing });
  check(
    r.status === 400 && r.json.error.fields[last.id],
    "server still requires the visible destination section",
  );
  r = await submit({ versionId, answers });
  check(
    r.status === 200,
    "skipping a section does not require its hidden required questions",
  );
  const responseId = r.json.data.responseId;
  f.sections[0].rules[0].target = "end";
  r = await call("/admin/forms/" + form.id + "/draft", {
    method: "PATCH",
    body: { revision: form.revision, definition },
  });
  check(r.status === 200, "end-form behavior is saved only to the next draft");
  form = r.json.data.form;
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(
    r.status === 200,
    "early ending publishes a separate immutable version",
  );
  form = r.json.data.form;
  r = await submit({ versionId, answers });
  check(
    r.status === 409,
    "the prior version cannot accept new submissions after republication",
  );
  r = await call("/forms/" + form.slug, { anonymous: true });
  const nextVersion = r.json.data.form.versionId;
  r = await submit({ versionId: nextVersion, answers: missing });
  check(
    r.status === 200,
    "early ending commits without demanding later required sections",
  );
  r = await call("/admin/forms/" + form.id + "/responses/" + responseId);
  check(
    r.status === 200 && r.json.data.items[0]?.version === 1,
    "historical responses retain their original branching version",
  );
} finally {
  if (form) {
    const r = await call("/admin/forms/" + form.id);
    if (r.status === 200)
      await call("/admin/forms/" + form.id, {
        method: "DELETE",
        body: { revision: r.json.data.form.revision },
      });
  }
  await logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-form-branches-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real local API submissions use the shared immutable branch schema. Fictional form archived without removing historical responses.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
