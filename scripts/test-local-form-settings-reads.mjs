import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  password = "Fictional-settings-" + randomUUID(),
  email = "fictional-settings-" + actor + "@example.test",
  tests = [];
const checked = (r) => {
  if (r.error) throw Error("Settings fixture database error");
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Settings fixture request failed " + r.status);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
let created = false,
  formId,
  completed = false;
try {
  checked(
    await db
      .from("admin_users")
      .insert({
        id: actor,
        email,
        role: "admin",
        password_hash: await hashSecret(password),
        is_active: true,
        display_name: "Fictional form settings reviewer",
      }),
  );
  created = true;
  data(
    await call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await call("/auth/login", { method: "POST", body: { email, password } }),
  );
  const draft = createTemplate("Fictional settings read review", "blank"),
    { title, description, fields, sections, settings } = draft;
  const form = data(
    await call("/admin/forms", {
      method: "POST",
      body: {
        slug: draft.slug,
        teamId: null,
        definition: { title, description, fields, sections, settings },
      },
    }),
  ).form;
  formId = form.id;
  for (const suffix of ["delivery", "privacy"]) {
    const path = `/admin/forms/${formId}/${suffix}`;
    check(
      (await call(path, { anonymous: true })).status === 401,
      suffix + " read rejects anonymous access",
    );
    const result = await call(path),
      value = data(result);
    check(
      result.headers.get("cache-control")?.includes("no-store") &&
        (suffix === "delivery"
          ? value.formRevision === form.revision &&
            Array.isArray(value.eligible)
          : value.formId === formId &&
            value.held === false &&
            value.draftDays >= 1 &&
            value.draftDays <= 30),
      suffix + " loads current private configuration without a mutation",
    );
    check(
      !/password_hash|token_hash|session_token|emailEncrypted|secretEncrypted/.test(
        result.text,
      ),
      suffix + " projection omits credential and capability material",
    );
  }
  const current = data(await call("/admin/forms/" + formId)).form;
  check(
    current.status === "Draft" &&
      current.revision === form.revision &&
      current.versions.length === 0,
    "configuration reads do not publish, revise or change form availability",
  );
  completed = true;
} finally {
  if (formId) {
    const row = checked(
      await db.from("forms").select("owner_id,state").eq("id", formId).single(),
    );
    if (row.owner_id !== actor)
      throw Error("Fixture ownership changed; cleanup not confirmed");
    if (row.state !== "Archived") {
      const current = data(await call("/admin/forms/" + formId)).form;
      data(
        await call("/admin/forms/" + formId, {
          method: "DELETE",
          body: { revision: current.revision },
        }),
      );
    }
  }
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
    new URL("../.docs/phase0/local-form-settings-reads.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        cleanup: { completed: true },
        note: "Actual loopback reads of delivery/retention for one fresh fictional draft/account. Existing content/accounts/settings untouched. No publication, policy approval, mail, provider, file or quota reset. Owned draft archived/account disabled/sessions revoked.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
