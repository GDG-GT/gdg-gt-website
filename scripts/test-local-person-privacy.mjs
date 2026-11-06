import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import {
  hashSecret,
  token,
  tokenHash,
  riskHash,
} from "../server/lib/security.mjs";
import { encryptPayload } from "../server/lib/encryption.mjs";
import { objectStorage } from "../server/lib/object-storage.mjs";
import { runFormExportWorker } from "../server/form-export-worker.mjs";
import { privacyConfirmation } from "../shared/privacy.mjs";

const h = await localHttp(),
  { db, env } = h,
  marker = randomUUID().slice(0, 8),
  evidence = [],
  accounts = [],
  email = `fictional-privacy-subject-${marker}@example.test`,
  peerEmail = `fictional-privacy-peer-${marker}@example.test`,
  storage = objectStorage(env);
if (env.MAIL_MODE !== "local" || env.PUSH_SEND_ENABLED === "true")
  throw Error(
    "Dedicated loopback test environment with external sending disabled is required.",
  );
const sql = (r) => {
  if (r.error) throw Error("Privacy fixture database error: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Privacy API error: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
const post = (client, path, body, key = randomUUID(), anonymous = false) =>
  client.call(path, { method: "POST", body, key, anonymous });
async function account(role) {
  const client = await localHttp(),
    id = randomUUID(),
    address = `fictional-privacy-${role}-${id}@example.test`,
    password = "Privacy-fixture-" + randomUUID();
  sql(
    await db
      .from("admin_users")
      .insert({
        id,
        email: address,
        password_hash: await hashSecret(password),
        role,
        is_active: true,
        display_name: "Fictional privacy test officer",
      }),
  );
  accounts.push({ client, id });
  data(await post(client, "/auth/gate", { code: h.credentials.gateCode }));
  data(await post(client, "/auth/login", { email: address, password }));
  return { client, id, email: address, password };
}
let sa, form, event, upload, exportJob, response, contact;
try {
  sa = await account("super_admin");
  const admin = await account("admin");
  check(
    (await h.call("/admin/privacy", { anonymous: true })).status === 401,
    "anonymous callers cannot discover person-data privacy requests",
  );
  check(
    (await admin.client.call("/admin/privacy")).status === 403 &&
      !data(await admin.client.call("/admin/access?route=%2Fadmin%2Fprivacy"))
        .allowed,
    "ordinary Admin is denied both the privacy route and API",
  );
  check(
    data(await sa.client.call("/admin/access?route=%2Fadmin%2Fprivacy"))
      .allowed,
    "Super Admin privacy navigation is server-authorized",
  );
  check(
    (await sa.client.call("/admin/privacy/status/not-a-uuid")).status === 400,
    "malformed privacy request IDs are validation errors, not server crashes",
  );
  check(
    (await sa.client.call("/admin/privacy?email=do-not-log@example.test"))
      .status === 400,
    "privacy inventory rejects email and unrecognized query controls",
  );
  event = data(
    await post(sa.client, "/admin/events", {
      event: {
        title: "Fictional person privacy event",
        slug: `fictional-person-privacy-${marker}`,
        description: "Local fictional privacy verification only.",
        start_at: new Date(Date.now() + 172800000).toISOString(),
        location: "Fictional venue",
        registration_enabled: true,
        registration_type: "internal",
      },
    }),
  ).event;
  event = data(
    await post(sa.client, `/admin/events/${event.id}/publish`, {
      revision: event.revision,
      event: {},
    }),
  ).event;
  const registration = data(
    await post(
      h,
      `/events/${event.slug}/registrations`,
      {
        name: "Fictional privacy subject",
        email,
        consent: true,
        notes: "Own fictional registration notes.",
      },
      randomUUID(),
      true,
    ),
  );
  data(
    await post(
      h,
      `/events/${event.slug}/registrations`,
      { name: "Unrelated privacy peer", email: peerEmail, consent: true },
      randomUUID(),
      true,
    ),
  );
  data(
    await post(
      h,
      "/newsletter/subscriptions",
      { email, name: "Fictional privacy subject" },
      randomUUID(),
      true,
    ),
  );
  data(
    await post(
      h,
      "/contact",
      {
        name: "Fictional privacy subject",
        email,
        type: "general",
        message:
          "Fictional private inquiry to verify a privacy erasure request.",
      },
      randomUUID(),
      true,
    ),
  );
  contact = sql(
    await db
      .from("contact_submissions")
      .select("id,revision")
      .eq("email", email)
      .single(),
  );
  const t = createTemplate("Fictional person privacy form"),
    fields = t.fields.slice(0, 2),
    definition = {
      title: t.title,
      description: t.description,
      sections: t.sections,
      fields,
      settings: { ...t.settings, limit: 0, resume: true, editing: true },
    };
  fields[1].sensitive = true;
  form = data(
    await post(sa.client, "/admin/forms", { slug: t.slug, definition }),
  ).form;
  form = data(
    await post(sa.client, `/admin/forms/${form.id}/publish`, {
      revision: form.revision,
    }),
  ).form;
  const publicForm = data(
      await h.call(`/forms/${form.slug}`, { anonymous: true }),
    ).form,
    body = {
      versionId: publicForm.versionId,
      respondent: { name: "Fictional privacy subject", email },
      answers: {
        [fields[0].id]: "Fictional public answer",
        [fields[1].id]: email,
      },
      copyRequested: true,
    };
  response = data(
    await post(h, `/forms/${form.slug}/submissions`, body, randomUUID(), true),
  );
  data(await post(h, `/forms/${form.slug}/drafts`, body, randomUUID(), true));
  // Deliberately synthetic historical verified-access fixture, not a claim that
  // the public form performed email verification. It exercises the old HMAC lookup.
  const accessId = randomUUID();
  sql(
    await db
      .from("form_access_tokens")
      .insert({
        id: accessId,
        form_id: form.id,
        token_type: "verified",
        token_hash: tokenHash(token()),
        email_hash: riskHash(
          `form-recipient:${form.id}:${email}`,
          env.RISK_HASH_SECRET,
        ),
        intended_email_encrypted: encryptPayload(
          { email },
          env.DATA_ENCRYPTION_KEY,
        ),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }),
  );
  sql(
    await db
      .from("push_subscriptions")
      .insert({
        event_id: event.id,
        registration_id: registration.registrationId,
        registration_email_hash: tokenHash(email),
        endpoint_hash: tokenHash("fictional-endpoint-" + marker),
        management_hash: tokenHash("fictional-management-" + marker),
        endpoint_encrypted: encryptPayload(
          { endpoint: "fictional-only" },
          env.DATA_ENCRYPTION_KEY,
        ),
      }),
  );
  // Static generated PNG is a storage/erasure fixture. Scanner behavior is tested
  // separately; these setup inserts do not claim to exercise malware scanning.
  const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#c85b48" },
    })
      .png()
      .toBuffer(),
    id = randomUUID();
  upload = {
    id,
    quarantine: `quarantine/${id}/${randomUUID()}`,
    clean: `clean/${id}/${randomUUID()}`,
  };
  await storage.put("contact-attachments", upload.clean, bytes, "image/png");
  sql(
    await db
      .from("upload_intents")
      .insert({
        id,
        purpose: "contact",
        bucket: "contact-attachments",
        proof_hash: tokenHash(token()),
        quarantine_key: upload.quarantine,
        clean_key: upload.clean,
        contact_clean_candidate: upload.clean,
        filename: `fictional-privacy-${marker}.png`,
        declared_mime: "image/png",
        expected_bytes: bytes.length,
        expected_sha256: tokenHash(bytes),
        contact_risk_hash: tokenHash("fictional-risk-" + marker),
        state: "clean",
        contact_id: contact.id,
      }),
  );
  sql(
    await db
      .from("contact_submissions")
      .update({ attachment_upload_id: id, revision: contact.revision + 1 })
      .eq("id", contact.id),
  );
  check(
    (await storage.head("contact-attachments", upload.clean)).ContentLength ===
      bytes.length,
    "actual invocation-owned private attachment bytes exist before privacy review",
  );
  const queued = sql(
    await db
      .from("form_export_jobs")
      .select("id")
      .in("state", ["pending", "running"]),
  );
  if (queued.length)
    throw Error(
      "Run this suite with no unrelated active export jobs; it never claims or purges unrelated work.",
    );
  exportJob = data(
    await post(sa.client, `/admin/forms/${form.id}/exports`, {
      format: "json",
      filters: { selected: [response.responseId] },
      sensitive: true,
    }),
  ).job;
  await runFormExportWorker({ db, env });
  check(
    data(
      await sa.client.call(`/admin/forms/${form.id}/exports/${exportJob.id}`),
    ).job.state === "ready",
    "real sensitive response export artifact exists before privacy review",
  );
  const reviewBody = {
    email,
    action: "export",
    purpose:
      "Fictional independently verified person-data request for integration testing.",
    identityVerified: true,
    currentPassword: sa.password,
  };
  check(
    (
      await post(sa.client, "/admin/privacy/review", {
        ...reviewBody,
        identityVerified: false,
      })
    ).status === 400,
    "scope review requires independent ownership attestation",
  );
  check(
    (
      await post(sa.client, "/admin/privacy/review", {
        ...reviewBody,
        currentPassword: "incorrect-fixture-password",
      })
    ).status === 403,
    "scope disclosure requires the actual current password",
  );
  let review = data(await post(sa.client, "/admin/privacy/review", reviewBody));
  check(
    review.count === 7 &&
      review.heldCount === 0 &&
      review.records.some((r) => r.kind === "form_access"),
    "exact review resolves seven own workflow records including legacy HMAC access",
  );
  check(
    !JSON.stringify(review).match(
      /email_hash|key_hash|fingerprint|v1\.|quarantine\/|clean\//,
    ),
    "review DTO excludes cryptographic state, storage keys and encrypted capabilities",
  );
  const commit = (r, patch = {}) => ({
    reviewId: r.reviewId,
    reviewToken: r.reviewToken,
    confirmation: privacyConfirmation(r.action, r.count),
    currentPassword: sa.password,
    ...patch,
  });
  check(
    (
      await post(
        sa.client,
        "/admin/privacy/commit",
        commit(review, { confirmation: "DELETE 7 RECORDS" }),
      )
    ).status === 400,
    "typed approval cannot change the reviewed action",
  );
  const sameOfficer = await localHttp();
  data(await post(sameOfficer, "/auth/gate", { code: h.credentials.gateCode }));
  data(
    await post(sameOfficer, "/auth/login", {
      email: sa.email,
      password: sa.password,
    }),
  );
  check(
    (await post(sameOfficer, "/admin/privacy/commit", commit(review)))
      .status === 404,
    "another valid same-account session cannot reuse a privacy capability",
  );
  await sameOfficer.logout();
  let exported = data(
    await post(sa.client, "/admin/privacy/commit", commit(review)),
  );
  check(
    exported.export.length === 7 &&
      !JSON.stringify(exported.export).includes(peerEmail),
    "actual privacy JSON contains only the independently reviewed person's records",
  );
  check(
    !JSON.stringify(exported.export).match(
      /endpoint_encrypted|resume_token|edit_token|private_object_key|quarantine\/|clean\//,
    ) &&
      exported.export
        .find((r) => r.kind === "form_response")
        .data.answers.some((a) => a.masked && a.value === null),
    "default privacy export masks sensitive answers and omits private capabilities and file URLs",
  );
  review = data(
    await post(sa.client, "/admin/privacy/review", {
      ...reviewBody,
      includeSensitive: true,
    }),
  );
  exported = data(
    await post(sa.client, "/admin/privacy/commit", commit(review)),
  );
  check(
    exported.export
      .find((r) => r.kind === "form_response")
      .data.answers.some((a) => a.value === email),
    "separate explicit sensitive export reveals only the own authorized response answer",
  );
  sql(
    await db
      .from("contact_submissions")
      .update({ retention_hold: true })
      .eq("id", contact.id),
  );
  review = data(
    await post(sa.client, "/admin/privacy/review", {
      ...reviewBody,
      action: "redact",
    }),
  );
  check(
    review.heldCount === 1 &&
      (await post(sa.client, "/admin/privacy/commit", commit(review))).json
        ?.error?.code === "RETENTION_HOLD",
    "a contact operational hold blocks the entire cross-workflow erasure",
  );
  check(
    sql(
      await db
        .from("event_attendance")
        .select("attendee_email")
        .eq("id", registration.registrationId)
        .single(),
    ).attendee_email === email,
    "blocked erasure made no partial changes to another workflow",
  );
  sql(
    await db
      .from("contact_submissions")
      .update({ retention_hold: false })
      .eq("id", contact.id),
  );
  review = data(
    await post(sa.client, "/admin/privacy/review", {
      ...reviewBody,
      action: "redact",
    }),
  );
  data(
    await post(
      h,
      `/forms/${form.slug}/edits`,
      {
        ...body,
        copyRequested: false,
        editToken: response.editToken,
        revision: 0,
        answers: {
          ...body.answers,
          [fields[0].id]: "Changed after privacy review",
        },
      },
      randomUUID(),
      true,
    ),
  );
  check(
    (await post(sa.client, "/admin/privacy/commit", commit(review))).json?.error
      ?.code === "PRIVACY_REVIEW_CHANGED",
    "a real concurrent response edit invalidates the frozen privacy review",
  );
  review = data(
    await post(sa.client, "/admin/privacy/review", {
      ...reviewBody,
      action: "redact",
    }),
  );
  const key = randomUUID(),
    approved = data(
      await post(sa.client, "/admin/privacy/commit", commit(review), key),
    );
  check(
    approved.count === 7 &&
      approved.remainingMatches === 0 &&
      approved.pendingFiles === 1 &&
      approved.pendingExports === 1,
    "real erasure commits seven records and truthfully reports private file/export cleanup pending",
  );
  check(
    data(await post(sa.client, "/admin/privacy/commit", commit(review), key))
      .count === 7,
    "lost-response erasure retry returns the committed result without another mutation",
  );
  check(
    (
      await post(
        sa.client,
        `/admin/forms/${form.id}/exports/${exportJob.id}/download`,
        {},
      )
    ).status === 404,
    "old generated export cannot be downloaded after person-data erasure",
  );
  const answered = sql(
    await db
      .from("form_answers")
      .select("id")
      .eq("response_id", response.responseId),
  );
  check(
    answered.length === 0 &&
      sql(
        await db
          .from("form_response_revisions")
          .select("id")
          .eq("response_id", response.responseId),
      ).length === 0,
    "redaction removes full free-text content and historical answers, not just name fields",
  );
  check(
    sql(
      await db
        .from("event_attendance")
        .select("attendee_email")
        .eq("event_id", event.id)
        .eq("attendee_email", peerEmail),
    ).length === 1,
    "unrelated participant identity remains unchanged",
  );
  const forged = await db
    .from("person_privacy_cleanup")
    .insert({ review_id: randomUUID() });
  check(
    forged.error?.code === "42501",
    "API service cannot forge a cleanup request or transaction erasure certificate",
  );
  const firstStatus = data(
    await sa.client.call(`/admin/privacy/status/${review.reviewId}`),
  ).items[0];
  check(
    firstStatus.pendingFiles === 1 && firstStatus.pendingExports === 1,
    "operational status reads actual pending private bytes, not a fabricated erasure success",
  );
  // Exact invocation-owned keys only: no global cleanup claim or unrelated purge.
  await storage.delete("contact-attachments", upload.quarantine);
  await storage.delete("contact-attachments", upload.clean);
  check(
    sql(await db.rpc("finish_contact_upload_cleanup", { p_upload: upload.id })),
    "contact file cleanup acknowledgement follows actual physical deletion",
  );
  const artifacts = sql(
    await db
      .from("form_export_artifacts")
      .select("job_id,lease_token,object_key")
      .eq("job_id", exportJob.id),
  );
  for (const a of artifacts) {
    if (!a.object_key.startsWith(`exports/${exportJob.id}/`))
      throw Error("Unexpected fixture artifact scope");
    await storage.delete("form-exports", a.object_key);
    sql(
      await db
        .from("form_export_artifacts")
        .update({ purged_at: new Date().toISOString() })
        .eq("job_id", a.job_id)
        .eq("lease_token", a.lease_token),
    );
  }
  let missing = false;
  try {
    await storage.head("contact-attachments", upload.clean);
  } catch (e) {
    missing = e.$metadata?.httpStatusCode === 404;
  }
  check(missing, "actual private attachment HEAD is 404 after cleanup");
  const status = data(
    await sa.client.call(`/admin/privacy/status/${review.reviewId}`),
  ).items[0];
  check(
    status.pendingFiles === 0 && status.pendingExports === 0,
    "cleanup status reaches zero only after actual file and generated-export removal",
  );
  const audit = sql(
    await db
      .from("admin_actions")
      .select("metadata")
      .eq("target_id", review.reviewId)
      .like("action", "privacy.%"),
  );
  check(
    !JSON.stringify(audit).includes(email) &&
      audit.filter((a) => a.metadata.count === 7).length === 2,
    "privacy review and single commit retain only safe audit fingerprints and counters",
  );
  const recent = data(await sa.client.call("/admin/privacy"));
  check(
    !JSON.stringify(recent).includes(email) &&
      recent.items.some((r) => r.reviewId === review.reviewId && r.completedAt),
    "private recent-request recovery shows counters without exposing requester identity",
  );
} finally {
  if (form && sa) {
    const current = await sa.client.call(`/admin/forms/${form.id}`);
    if (current.status === 200 && current.json.data.form.status !== "Archived")
      data(
        await sa.client.call(`/admin/forms/${form.id}`, {
          method: "DELETE",
          body: { revision: current.json.data.form.revision },
        }),
      );
  }
  if (event && sa) {
    const current = sql(
      await db.from("events").select("revision").eq("id", event.id).single(),
    );
    data(
      await sa.client.call(`/admin/events/${event.id}`, {
        method: "DELETE",
        body: { revision: current.revision, event: {} },
      }),
    );
  }
  for (const a of accounts) {
    await a.client.logout().catch(() => undefined);
    sql(
      await db.from("admin_users").update({ is_active: false }).eq("id", a.id),
    );
  }
  storage.close();
}
await writeFile(
  new URL("../.docs/phase0/local-person-privacy.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment:
        "loopback only; invocation-owned synthetic identity and storage; scanner separately verified",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
console.info(`${evidence.length} actual person-data privacy checks passed.`);
