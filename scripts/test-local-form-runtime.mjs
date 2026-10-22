import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires an isolated fictional session.");
const h = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  tests = [];
const checked = (r) => {
  if (r.error) throw Error("Fixture database failed: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Fixture API failed: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const post = (path, body) =>
  call(path, { method: "POST", body, key: randomUUID() });
let form;
try {
  const email = `fictional-runtime-${actor}@example.test`,
    password = "Fictional-runtime-" + randomUUID();
  checked(
    await db
      .from("admin_users")
      .insert({
        id: actor,
        email,
        display_name: "Fictional Runtime Officer",
        role: "admin",
        is_active: true,
        password_hash: await hashSecret(password),
      }),
  );
  data(await post("/auth/gate", { code: h.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  const f = createTemplate("Fictional runtime " + actor.slice(0, 8), "blank"),
    section = f.sections[0].id;
  const score = {
      ...newField("rating", section),
      label: "Workshop rating",
      required: true,
      min: 1,
      max: 5,
    },
    date = {
      ...newField("datetime", section),
      label: "Preferred local date and time",
      required: true,
      dateFrom: "2026-10-22T12:30",
      dateTo: "2026-10-22T12:31:00.1",
    },
    number = {
      ...newField("number", section),
      label: "Decimal estimate",
      required: true,
    },
    file = {
      ...newField("file", section),
      label: "Optional private attachment",
      description: "Use an allowed private document only.",
      required: false,
    };
  f.fields = [score, date, number, file];
  const definition = {
    title: f.title,
    description: "Fictional local field and accessibility verification.",
    fields: f.fields,
    sections: f.sections,
    settings: f.settings,
  };
  form = data(await post("/admin/forms", { slug: f.slug, definition })).form;
  form = data(
    await post(`/admin/forms/${form.id}/publish`, { revision: form.revision }),
  ).form;
  check(
    form.status === "Open",
    "typed runtime fixture publishes through the real immutable schema",
  );
  const published = data(
    await call(`/forms/${form.slug}`, { anonymous: true }),
  ).form;
  const answers = {
    [score.id]: "3",
    [date.id]: "2026-10-22T12:30:00",
    [number.id]: "2.5",
  };
  const submit = (values) =>
    call(`/forms/${form.slug}/submissions`, {
      anonymous: true,
      method: "POST",
      key: randomUUID(),
      body: {
        versionId: published.versionId,
        respondent: {
          name: "Fictional Runtime Respondent",
          email: "fictional-runtime@example.test",
        },
        answers: values,
      },
    });
  for (const [id, value] of [
    [score.id, "2.5"],
    [score.id, "01"],
    [date.id, "2026-02-30T12:30"],
    [date.id, "2026-10-22T12:30Z"],
    [date.id, "2026-10-22T12:31:00.101"],
    [number.id, "0x10"],
    [number.id, "Infinity"],
  ]) {
    const result = await submit({ ...answers, [id]: value });
    check(
      result.status === 400 && !!result.json.error.fields?.[id],
      "actual server rejects invalid " +
        (id === score.id
          ? "score"
          : id === date.id
            ? "local datetime"
            : "numeric") +
        " value",
    );
  }
  check(
    (await submit(answers)).status === 200,
    "real server accepts decimal input and equivalent inclusive datetime precision",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY)
      throw Error("Browser review requires a terminal.");
    console.info("BROWSER_FORM_RUNTIME_PATH /forms/" + form.slug);
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      terminal.on("line", (line) => {
        if (line.trim() === "done") {
          terminal.close();
          resolve();
        }
      });
      console.info("Enter done after fictional runtime browser review.");
    });
  }
} finally {
  if (form) {
    const r = await call("/admin/forms/" + form.id);
    if (r.status === 200)
      data(
        await call("/admin/forms/" + form.id, {
          method: "DELETE",
          body: { revision: r.json.data.form.revision },
        }),
      );
  }
  await h.logout();
  checked(
    await db.from("admin_users").update({ is_active: false }).eq("id", actor),
  );
}
await writeFile(
  new URL("../.docs/phase0/local-form-runtime.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual local typed response validation; fictional form/account recoverably archived. No provider sends.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
