import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
import { token, tokenHash } from "../server/lib/security.mjs";
import { runUploadWorker } from "../server/upload-worker.mjs";
import { objectStorage } from "../server/lib/object-storage.mjs";
const { call, login, db, env, logout } = await localHttp(),
  evidence = [],
  group = token(),
  storage = objectStorage(env);
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
await login();
let form;
try {
  const f = createTemplate(
      "Fictional secure upload " + randomUUID().slice(0, 8),
    ),
    file = newField("file", f.sections[0].id);
  file.required = true;
  file.maxFiles = 10;
  f.fields.push(file);
  const { title, description, fields, sections, settings } = f;
  let r = await call("/admin/forms", {
    method: "POST",
    body: {
      slug: f.slug,
      definition: { title, description, fields, sections, settings },
    },
  });
  check(r.status === 200, "create file-field fixture");
  form = r.json.data.form;
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(r.status === 200, "configured scanner enables file-field publication");
  form = r.json.data.form;
  r = await call("/forms/" + form.slug, { anonymous: true });
  const versionId = r.json.data.form.versionId,
    base = { versionId, uploadToken: group },
    prefix = "/forms/" + form.slug + "/uploads";
  async function intent(
    bytes,
    name = "fictional.txt",
    mime = "text/plain",
    overrides = {},
  ) {
    return call(prefix, {
      anonymous: true,
      method: "POST",
      body: {
        ...base,
        fieldId: file.id,
        filename: name,
        mime,
        bytes: bytes.length,
        sha256: tokenHash(bytes),
        ...overrides,
      },
    });
  }
  async function put(data, bytes) {
    return fetch(data.url, {
      method: "PUT",
      headers: data.headers,
      body: bytes,
      signal: AbortSignal.timeout(15000),
    });
  }
  async function operation(id, op, overrides = {}) {
    return call(prefix + "/" + id + "/" + op, {
      anonymous: true,
      method: "POST",
      body: { ...base, ...overrides },
    });
  }
  const clean = Buffer.from(
    "Fictional upload verification. No real personal information.",
  );
  r = await intent(clean, "payload.svg", "image/svg+xml");
  check(r.status === 400, "SVG upload declarations are rejected");
  r = await intent(clean, "../payload.txt");
  check(r.status === 400, "filenames cannot select object paths");
  r = await intent(clean, "safe.txt", "text/plain", { fieldId: randomUUID() });
  check(r.status === 400, "unknown file field IDs are rejected");
  r = await intent(clean);
  check(
    r.status === 200 && r.json.data.expiresIn === 120,
    "intent returns a short-lived one-object upload capability",
  );
  const allowed = r.json.data,
    uploadId = allowed.uploadId;
  r = await operation(uploadId, "complete");
  check(r.status === 400, "completion rejects missing object bytes");
  let uploaded = await put(allowed, clean);
  check(
    uploaded.ok,
    "the browser-compatible signed PUT uploads directly to private storage",
  );
  const anonymousRead = new URL(allowed.url);
  anonymousRead.search = "";
  const privateRead = await fetch(anonymousRead);
  check(!privateRead.ok, "anonymous reads cannot retrieve quarantined bytes");
  const substitution = new URL(allowed.url);
  substitution.pathname = substitution.pathname.replace(
    /[^/]+$/,
    "substituted",
  );
  const wrongObject = await fetch(substitution, {
    method: "PUT",
    headers: allowed.headers,
    body: clean,
  });
  check(!wrongObject.ok, "upload signature cannot write another object key");
  r = await operation(uploadId, "status", { uploadToken: token() });
  if (r.status !== 404)
    console.info({ status: r.status, code: r.json?.error?.code });
  check(
    r.status === 404,
    "a different respondent capability cannot inspect an upload",
  );
  r = await operation(uploadId, "complete");
  check(
    r.status === 200 && r.json.data.state === "queued",
    "completion queues scanning without returning a clean file",
  );
  const emails = await db.rpc("claim_delivery_jobs", { p_limit: 100 });
  check(
    !emails.error && !emails.data.some((j) => j.kind === "upload_scan"),
    "mail workers cannot claim file-scanning jobs",
  );
  for (const job of emails.data)
    await db.rpc("finish_delivery_job", {
      p_id: job.id,
      p_lease: job.lease_token,
      p_success: false,
      p_provider_id: null,
      p_error_code: "TEST_RELEASE",
    });
  const answers = {
    [f.fields[0].id]: "Fictional File Reviewer",
    [f.fields[1].id]: "upload-" + randomUUID() + "@example.test",
    [f.fields[2].id]: f.fields[2].options[0],
    [file.id]: [uploadId],
  };
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: { versionId, answers, uploadToken: group },
  });
  check(
    r.status === 400 && r.json.error.code === "INVALID_UPLOAD",
    "pending files cannot associate with a response",
  );
  let scan = await runUploadWorker({ env, db });
  check(
    scan.clean === 1 && scan.rejected === 0 && scan.retried === 0,
    "the real scanner validates and promotes a clean file",
  );
  r = await operation(uploadId, "status");
  check(
    r.status === 200 && r.json.data.scanState === "clean",
    "respondent sees clean status only after the scan transaction commits",
  );
  const record = await db
    .from("upload_intents")
    .select("*")
    .eq("id", uploadId)
    .single();
  check(
    record.data.clean_key.startsWith("clean/") &&
      record.data.clean_key !== record.data.quarantine_key,
    "promotion uses an immutable destination outside the upload capability",
  );
  // Replaying an unexpired PUT can modify quarantine, never the approved object.
  await put(allowed, Buffer.alloc(clean.length, 65));
  const promoted = await storage.bytes(
    record.data.bucket,
    record.data.clean_key,
    1000,
  );
  check(
    promoted.equals(clean),
    "replayed direct PUT cannot alter approved bytes",
  );
  r = await call("/forms/" + form.slug + "/drafts", {
    anonymous: true,
    method: "POST",
    body: { versionId, answers, uploadToken: token() },
  });
  check(
    r.status === 400,
    "saving a draft cannot claim files owned by another upload capability",
  );
  r = await call("/forms/" + form.slug + "/drafts", {
    anonymous: true,
    method: "POST",
    body: { versionId, answers, uploadToken: group },
  });
  check(
    r.status === 200 && r.json.data.resumeToken,
    "a private resume draft preserves its validated uploaded files",
  );
  const savedFile = await db
    .from("form_uploads")
    .select("draft_id")
    .eq("id", uploadId)
    .single();
  check(
    !!savedFile.data.draft_id,
    "resume-file ownership is bound in the draft transaction",
  );
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: { versionId, answers, uploadToken: token() },
  });
  check(r.status === 400, "a response cannot attach another respondent file");
  r = await call("/forms/" + form.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: { versionId, answers, uploadToken: group },
  });
  check(
    r.status === 200,
    "a clean owned file associates atomically with its final response",
  );
  const responseId = r.json.data.responseId;
  r = await operation(uploadId, "remove");
  check(
    r.status === 400,
    "submitted attachments cannot be removed through an upload capability",
  );
  const downloadPath =
    "/admin/forms/" +
    form.id +
    "/responses/" +
    responseId +
    "/files/" +
    uploadId;
  r = await call(downloadPath, { anonymous: true });
  check(
    r.status === 401,
    "anonymous callers cannot obtain response-file download links",
  );
  r = await call(downloadPath);
  check(
    r.status === 200 && r.json.data.expiresIn === 60,
    "authorized response review receives a short-lived attachment download",
  );
  const downloaded = await fetch(r.json.data.url);
  check(
    downloaded.ok &&
      downloaded.headers.get("content-disposition").startsWith("attachment;") &&
      Buffer.from(await downloaded.arrayBuffer()).equals(clean),
    "approved download is an attachment containing only promoted bytes",
  );
  const eicar = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  r = await intent(eicar, "harmless-eicar-test.txt");
  const bad = r.json.data;
  await put(bad, eicar);
  await operation(bad.uploadId, "complete");
  scan = await runUploadWorker({ env, db });
  check(
    scan.rejected === 1 && scan.clean === 0,
    "real antivirus rejects the harmless EICAR test signature",
  );
  r = await operation(bad.uploadId, "status");
  check(
    r.json.data.scanState === "rejected",
    "rejected files never become downloadable",
  );
  const html = Buffer.from("<html><script>test only</script></html>");
  r = await intent(html);
  const spoof = r.json.data;
  await put(spoof, html);
  await operation(spoof.uploadId, "complete");
  scan = await runUploadWorker({ env, db });
  check(
    scan.rejected === 1,
    "detected HTML is rejected despite a plain-text declaration",
  );
  const wrong = Buffer.from("Same length but different content!!!");
  r = await intent(wrong, "mismatch.txt", "text/plain", {
    sha256: tokenHash(Buffer.alloc(wrong.length)),
  });
  const mismatch = r.json.data;
  await put(mismatch, wrong);
  await operation(mismatch.uploadId, "complete");
  scan = await runUploadWorker({ env, db });
  check(
    scan.rejected === 1,
    "scanner recomputes the checksum instead of trusting client metadata",
  );
  const image = await sharp({
    create: { width: 24, height: 24, channels: 3, background: "#e6705f" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Artist: "Fictional private metadata" } } })
    .toBuffer();
  r = await intent(image, "fictional.jpg", "image/jpeg");
  const picture = r.json.data;
  await put(picture, image);
  await operation(picture.uploadId, "complete");
  scan = await runUploadWorker({ env, db });
  check(
    scan.clean === 1,
    "approved images are decoded and re-encoded after scanning",
  );
  const pictureRecord = await db
      .from("upload_intents")
      .select("*")
      .eq("id", picture.uploadId)
      .single(),
    imageBytes = await storage.bytes(
      "form-uploads",
      pictureRecord.data.clean_key,
      100000,
    ),
    meta = await sharp(imageBytes).metadata();
  check(
    !meta.exif && !meta.xmp && !meta.iptc,
    "image promotion strips private metadata",
  );
  r = await operation(picture.uploadId, "remove");
  check(
    r.status === 200,
    "unused clean uploads can be removed by their respondent",
  );
  r = await operation(picture.uploadId, "status");
  check(r.status === 404, "removed uploads are immediately unavailable");
  const audit = await db
    .from("admin_actions")
    .select("metadata")
    .eq("target_id", responseId)
    .eq("action", "forms.file_downloaded");
  check(
    audit.data.length === 1 && !JSON.stringify(audit.data).includes(group),
    "file download audit contains identifiers, never upload capabilities",
  );
} finally {
  storage.close();
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
  new URL("../.docs/phase0/local-upload-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real signed local Storage PUT, database jobs, native ClamAV and HTTP authorization. Only fictional files and the harmless standard antivirus test string.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
