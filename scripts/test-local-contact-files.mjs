import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import {
  hashSecret,
  token,
  tokenHash,
  riskHash,
} from "../server/lib/security.mjs";
import { runUploadWorker } from "../server/upload-worker.mjs";
import { cleanupUploads } from "../server/upload-cleanup.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { scannerHealth } from "../server/lib/scanner.mjs";
const h = await localHttp(),
  { db, env, call } = h,
  evidence = [],
  uploads = [],
  accounts = [],
  contacts = [],
  marker = randomUUID().slice(0, 8);
const sql = (r) => {
  if (r.error) throw Error("Contact fixture database error: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Contact API error: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
const publicPost = (path, body, key = randomUUID()) =>
  call(path, { method: "POST", body, key, anonymous: true });
async function account(role) {
  const client = await localHttp(),
    id = randomUUID(),
    email = `fictional-contact-${role}-${id}@example.test`,
    password = "Contact-fixture-" + randomUUID();
  sql(
    await db
      .from("admin_users")
      .insert({
        id,
        email,
        password_hash: await hashSecret(password),
        role,
        is_active: true,
      }),
  );
  accounts.push({ client, id });
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await client.call("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  );
  return { ...client, id, password };
}
async function intent(bytes, overrides = {}) {
  const uploadToken = token(),
    body = {
      filename: `fictional-contact-${marker}.png`,
      mime: "image/png",
      bytes: bytes.length,
      sha256: tokenHash(bytes),
      uploadToken,
      website: "",
      ...overrides,
    },
    key = randomUUID();
  const result = data(await publicPost("/contact/upload-intents", body, key)),
    record = { ...result, uploadToken, body, key };
  uploads.push(record);
  return record;
}
async function put(record, bytes) {
  const response = await fetch(record.url, {
    method: "PUT",
    headers: record.headers,
    body: bytes,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("Synthetic direct contact upload failed");
}
async function complete(record) {
  return publicPost(`/contact/uploads/${record.uploadId}/complete`, {
    uploadToken: record.uploadToken,
  });
}
async function status(record) {
  return data(
    await publicPost(`/contact/uploads/${record.uploadId}/status`, {
      uploadToken: record.uploadToken,
    }),
  );
}
const cleanupDb = {
  rpc: async (name, args) =>
    [
      "claim_upload_cleanup",
      "claim_finance_upload_cleanup",
      "claim_blog_upload_cleanup",
    ].includes(name)
      ? { data: [], error: null }
      : db.rpc(name, args),
  from: (...args) => db.from(...args),
};
let admin, outsider, contactId, beforeRetention;
try {
  check(
    env.MAIL_MODE === "local",
    "contact tests cannot use an external email provider",
  );
  await scannerHealth(env);
  const risk = riskHash("127.0.0.1", env.RISK_HASH_SECRET),
    recent = sql(
      await db
        .from("upload_intents")
        .select("id")
        .eq("purpose", "contact")
        .eq("contact_risk_hash", risk)
        .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
    );
  if (recent.length > 6)
    throw Error(
      "Wait for natural contact upload quota headroom; this suite never resets rate windows or quotas.",
    );
  admin = await account("admin");
  outsider = await account("team_member");
  const bytes = await sharp({
    create: { width: 42, height: 28, channels: 3, background: "#da7969" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const invalid = {
    filename: "oversize.png",
    mime: "image/png",
    bytes: 10485761,
    sha256: tokenHash(bytes),
    uploadToken: token(),
    website: "",
  };
  check(
    (await publicPost("/contact/upload-intents", invalid)).status === 400,
    "contact upload intents enforce the 10 MiB limit before signing",
  );
  check(
    (
      await publicPost("/contact/upload-intents", {
        ...invalid,
        bytes: bytes.length,
        mime: "image/svg+xml",
        filename: "unsafe.svg",
      })
    ).status === 400,
    "SVG and unapproved file types cannot receive upload intents",
  );
  check(
    (
      await publicPost("/contact/upload-intents", {
        ...invalid,
        bytes: bytes.length,
        key: "forged/object/key",
      })
    ).status === 400,
    "callers cannot choose quarantine or clean object keys",
  );
  check(
    (
      await publicPost("/contact/upload-intents", {
        ...invalid,
        bytes: bytes.length,
        website: "bot",
      })
    ).status === 400,
    "attachment upload honeypots are enforced",
  );
  const good = await intent(bytes),
    repeated = data(
      await publicPost("/contact/upload-intents", good.body, good.key),
    );
  check(
    repeated.uploadId === good.uploadId,
    "upload creation retries keep one scoped intent and object key",
  );
  const payload = {
    name: "Fictional contact attachment " + marker,
    email: `fictional-contact-recipient-${marker}@example.test`,
    type: "accessibility",
    message:
      "Synthetic private inquiry for contact attachment verification only.",
    interests: ["Synthetic accessibility review"],
    website: "",
    attachment: { uploadId: good.uploadId, uploadToken: good.uploadToken },
  };
  check(
    (await publicPost("/contact", payload)).status === 400,
    "contact submission refuses a file that has not passed scanning",
  );
  check(
    (
      await publicPost(`/contact/uploads/${good.uploadId}/status`, {
        uploadToken: token(),
      })
    ).status === 404,
    "another capability cannot inspect an upload by guessing its identifier",
  );
  check(
    (await complete(good)).status === 400,
    "completion refuses a quarantine object that has not arrived",
  );
  await put(good, bytes);
  data(await complete(good));
  await runUploadWorker({ db, env, limit: 25 });
  check(
    (await status(good)).state === "clean",
    "real direct quarantine upload passes ClamAV and image normalization",
  );
  const retained = sql(
    await db
      .from("upload_intents")
      .select("bucket,quarantine_key,clean_key,contact_clean_candidate")
      .eq("id", good.uploadId)
      .single(),
  );
  check(
    retained.clean_key === retained.contact_clean_candidate &&
      retained.clean_key.startsWith("clean/"),
    "normalized object is durably reserved before publication to private storage",
  );
  const publicObject = await fetch(
    env.SUPABASE_URL +
      "/storage/v1/object/public/contact-attachments/" +
      retained.clean_key,
    { signal: AbortSignal.timeout(10000) },
  );
  check(
    !publicObject.ok,
    "clean contact originals remain unavailable through public storage URLs",
  );
  const submitKey = randomUUID();
  data(await publicPost("/contact", payload, submitKey));
  data(await publicPost("/contact", payload, submitKey));
  const saved = sql(
    await db
      .from("contact_submissions")
      .select("id,attachment_upload_id")
      .eq("email", payload.email)
      .single(),
  );
  contactId = saved.id;
  contacts.push(contactId);
  check(
    saved.attachment_upload_id === good.uploadId &&
      (await status(good)).state === "attached",
    "contact acceptance binds one clean upload atomically and is safe to retry",
  );
  check(
    (await publicPost("/contact", payload)).status === 400,
    "a bound attachment cannot be reused for another inquiry",
  );
  check(
    (
      await call(`/contact/uploads/${good.uploadId}`, {
        method: "DELETE",
        body: { uploadToken: good.uploadToken },
        key: randomUUID(),
        anonymous: true,
      })
    ).status === 409,
    "anonymous upload removal cannot erase a submitted attachment",
  );
  const path = "/admin/contact-submissions/" + contactId;
  check(
    (await call(path, { anonymous: true })).status === 401 &&
      (await outsider.call(path)).status === 404,
    "anonymous visitors and team members cannot read private chapter inquiries",
  );
  let inquiry = data(await admin.call(path)).items[0];
  check(
    inquiry.attachment.canDownload &&
      !JSON.stringify(inquiry).includes("clean/") &&
      !JSON.stringify(inquiry).includes("proof_hash"),
    "administrator inbox returns approved metadata without storage keys or capability hashes",
  );
  const link = data(await admin.call(path + "/attachment")),
    downloaded = await fetch(link.url, { signal: AbortSignal.timeout(10000) }),
    normalized = Buffer.from(await downloaded.arrayBuffer());
  check(
    downloaded.ok &&
      downloaded.headers.get("content-disposition").startsWith("attachment;") &&
      !(await sharp(normalized).metadata()).exif,
    "authorized one-minute private download is attachment-only and strips image metadata",
  );
  check(
    (await outsider.call(path + "/attachment")).status === 404,
    "team members cannot mint private contact download URLs",
  );
  const forged = await intent(Buffer.from("<html>synthetic mismatch</html>"));
  await put(forged, Buffer.from("<html>synthetic mismatch</html>"));
  data(await complete(forged));
  await runUploadWorker({ db, env, limit: 25 });
  check(
    (await status(forged)).state === "rejected",
    "content sniffing rejects HTML forged as an allowed raster image",
  );
  const malware = Buffer.from(
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    ),
    infected = await intent(malware, {
      filename: "fictional-antivirus-test.pdf",
      mime: "application/pdf",
    });
  await put(infected, malware);
  data(await complete(infected));
  await runUploadWorker({ db, env, limit: 25 });
  check(
    (await status(infected)).state === "rejected" &&
      sql(
        await db
          .from("upload_intents")
          .select("error_code")
          .eq("id", infected.uploadId)
          .single(),
      ).error_code === "MALWARE_DETECTED",
    "real ClamAV rejects harmless standard antivirus test bytes before any private download",
  );
  const mismatch = await intent(bytes, {
    sha256: tokenHash(Buffer.from("synthetic wrong hash")),
  });
  await put(mismatch, bytes);
  data(await complete(mismatch));
  await runUploadWorker({ db, env, limit: 25 });
  check(
    (await status(mismatch)).state === "rejected",
    "server scan rejects byte hashes even when signed object metadata claims a matching digest",
  );
  await runDelivery({ db, env, limit: 25 });
  const messages = (
      await (await fetch("http://127.0.0.1:54364/api/v1/messages")).json()
    ).messages,
    notice = messages.find(
      (m) =>
        m.To.some((to) => to.Address === env.CHAPTER_CONTACT_EMAIL) &&
        m.Subject.includes("chapter inquiry"),
    );
  check(
    messages.some((m) => m.To.some((to) => to.Address === payload.email)),
    "accepted contact receives an acknowledgment through actual loopback SMTP",
  );
  const noticeJobs = sql(
    await db
      .from("delivery_jobs")
      .select("payload,state")
      .contains("payload", { contactId }),
  );
  check(
    noticeJobs.length === 2 &&
      noticeJobs.every((r) => r.state === "completed") &&
      !JSON.stringify(noticeJobs).includes(payload.email),
    "contact notification jobs retain references rather than email bodies or file URLs",
  );
  check(
    !!notice,
    "chapter notification is captured only in the configured local mail sink",
  );
  data(
    await admin.call(path, {
      method: "POST",
      key: randomUUID(),
      body: {
        action: "status",
        revision: inquiry.revision,
        status: "resolved",
      },
    }),
  );
  inquiry = data(await admin.call(path)).items[0];
  check(
    (
      await admin.call(path, {
        method: "POST",
        key: randomUUID(),
        body: { action: "status", revision: 1, status: "new" },
      })
    ).status === 409,
    "inbox status updates reject stale revisions",
  );
  check(
    (
      await admin.call(path, {
        method: "POST",
        key: randomUUID(),
        body: {
          action: "hold",
          revision: inquiry.revision,
          enabled: true,
          reason: "Synthetic contact retention fixture",
          currentPassword: "incorrect",
          confirmation: "HOLD CONTACT",
        },
      })
    ).status === 403,
    "retention holds require the actual current password",
  );
  data(
    await admin.call(path, {
      method: "POST",
      key: randomUUID(),
      body: {
        action: "hold",
        revision: inquiry.revision,
        enabled: true,
        reason: "Synthetic contact retention fixture",
        currentPassword: admin.password,
        confirmation: "HOLD CONTACT",
      },
    }),
  );
  sql(
    await db
      .from("contact_submissions")
      .update({
        resolved_at: new Date(Date.now() - 366 * 86400000).toISOString(),
      })
      .eq("id", contactId),
  );
  beforeRetention = sql(
    await db
      .from("contact_submissions")
      .select("id")
      .lt("resolved_at", new Date(Date.now() - 365 * 86400000).toISOString())
      .is("redacted_at", null)
      .eq("retention_hold", false),
  );
  if (beforeRetention.some((r) => r.id !== contactId))
    throw Error(
      "Refusing to run contact retention across unrelated due records.",
    );
  sql(await db.rpc("claim_contact_upload_cleanup", { p_limit: 50 }));
  check(
    !data(await admin.call(path)).items[0].redactedAt,
    "real retention job preserves an old resolved inquiry and its file under a hold",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info(
      "Fictional contact inbox fixture ready. Enter done to finish scoped retention checks.",
    );
    const reader = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => reader.once("line", resolve));
    reader.close();
  }
  inquiry = data(await admin.call(path)).items[0];
  data(
    await admin.call(path, {
      method: "POST",
      key: randomUUID(),
      body: {
        action: "hold",
        revision: inquiry.revision,
        enabled: false,
        reason: "",
        currentPassword: admin.password,
        confirmation: "RELEASE HOLD",
      },
    }),
  );
  const cleanup = await cleanupUploads({ db: cleanupDb, env, limit: 50 });
  check(
    cleanup.purged >= 1 &&
      data(await admin.call(path)).items[0].redactedAt &&
      data(await admin.call(path)).items[0].email === "",
    "released resolved retention redacts identity and physically cleans the private attachment",
  );
  check(
    (await admin.call(path + "/attachment")).status === 404,
    "retention cleanup immediately denies new attachment download capabilities",
  );
} finally {
  // Never touch finance/Forms/blog files or unrelated contact files. Every upload
  // below is a captured UUID created by this synthetic suite.
  for (const u of uploads) {
    const current = sql(
      await db
        .from("upload_intents")
        .select("contact_id,deleted_at,purged_at")
        .eq("id", u.uploadId)
        .single(),
    );
    if (!current.contact_id && !current.deleted_at && !current.purged_at)
      await call(`/contact/uploads/${u.uploadId}`, {
        method: "DELETE",
        body: { uploadToken: u.uploadToken },
        key: randomUUID(),
        anonymous: true,
      });
  }
  for (const a of accounts) {
    await a.client.logout();
    sql(
      await db.from("admin_users").update({ is_active: false }).eq("id", a.id),
    );
  }
}
await writeFile(
  new URL("../.docs/phase0/local-contact-files.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment:
        "Fictional loopback inquiries/accounts; actual private S3, ClamAV and SMTP. Only captured synthetic contact files are purged by the resolution-retention test; unrelated upload cleanup claims are excluded.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
console.info(`${evidence.length} actual private contact-file checks passed.`);
