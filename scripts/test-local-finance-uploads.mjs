import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runUploadWorker } from "../server/upload-worker.mjs";
const { db, env, credentials } = await localHttp(),
  evidence = [],
  accounts = [];
let author, outsider, requestId;
const data = (r) => {
  if (r.status !== 200)
    throw new Error(
      `Finance upload request failed ${r.status} ${r.json?.error?.code || "unavailable"}`,
    );
  return r.json.data;
};
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
const post = (client, path, body, key = randomUUID()) =>
  client.call(path, { method: "POST", body, key });
async function account() {
  const http = await localHttp(),
    id = randomUUID(),
    email = `fictional-finance-file-${id}@example.test`,
    password = "Fictional-finance-file-" + randomUUID();
  const created = await db
    .from("admin_users")
    .insert({
      id,
      email,
      role: "team_member",
      display_name: "Fictional receipt reviewer",
      password_hash: await hashSecret(password),
      is_active: true,
    });
  if (created.error) throw new Error("Upload fixture account unavailable");
  accounts.push(id);
  data(
    await http.call("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    }),
  );
  data(
    await http.call("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  );
  return { ...http, id, password };
}
try {
  author = await account();
  outsider = await account();
  requestId = data(
    await post(author, "/admin/finances", {
      record: {
        transactionType: "expense",
        category: "Event Costs",
        amount: "0.01",
        description: "Fictional private receipt pipeline verification",
        transactionDate: "2026-10-20",
      },
    }),
  ).id;
  const base = `/admin/finances/${requestId}/attachments`;
  const bytes = await sharp({
    create: { width: 40, height: 25, channels: 3, background: "#ef684f" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const doc = {
    revision: 1,
    filename: "fictional-receipt.png",
    mime: "image/png",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  check(
    (await outsider.call(base)).status === 404,
    "outsider cannot list private receipt metadata",
  );
  check(
    (await post(author, base, { ...doc, bytes: 10485761 })).status === 400,
    "receipt intent enforces the 10 MB limit",
  );
  check(
    (
      await post(author, base, {
        ...doc,
        filename: "unsafe.svg",
        mime: "image/svg+xml",
      })
    ).status === 400,
    "SVG and unapproved finance types are rejected",
  );
  check(
    (await post(author, base, { ...doc, filename: "fake.pdf" })).status === 400,
    "declared extension and MIME must agree",
  );
  const intentKey = randomUUID(),
    intent = data(await post(author, base, doc, intentKey));
  check(
    data(await post(author, base, doc, intentKey)).uploadId === intent.uploadId,
    "intent retry reuses one quarantined financial file",
  );
  check(
    (await author.call(`${base}/${intent.uploadId}/download`)).status === 404,
    "an unuploaded or unscanned receipt cannot be downloaded",
  );
  check(
    (await post(author, `${base}/${intent.uploadId}/complete`, {})).json?.error
      ?.code === "INVALID_UPLOAD",
    "completion verifies that the quarantine object actually exists",
  );
  const put = await fetch(intent.url, {
    method: "PUT",
    headers: intent.headers,
    body: bytes,
  });
  check(
    put.ok,
    "actual receipt bytes upload through the signed private quarantine URL",
  );
  const completeKey = randomUUID();
  const completions = await Promise.all([
    post(author, `${base}/${intent.uploadId}/complete`, {}, completeKey),
    post(author, `${base}/${intent.uploadId}/complete`, {}, completeKey),
  ]);
  check(
    completions.every((r) => r.status === 200),
    "simultaneous completion retries are idempotent",
  );
  await runUploadWorker({ env, db });
  async function scanned(id) {
    const until = Date.now() + 25000;
    while (Date.now() < until) {
      const list = data(await author.call(base));
      const file = list.items.find((f) => f.id === id);
      if (file && ["clean", "rejected"].includes(file.state)) return file;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      "Real receipt scan did not finish; no job or quota was reset",
    );
  }
  check(
    (await scanned(intent.uploadId)).state === "clean",
    "real malware scanner and image normalization promote a valid receipt",
  );
  const list = data(await author.call(base));
  check(
    !JSON.stringify(list).includes("quarantine/") &&
      !JSON.stringify(list).includes("clean/") &&
      !JSON.stringify(list).includes("sha256"),
    "attachment metadata does not expose object keys or checksums",
  );
  const downloadable = data(
    await author.call(`${base}/${intent.uploadId}/download`),
  );
  check(
    downloadable.expiresIn === 60 &&
      new URL(downloadable.url).searchParams.get("X-Amz-Expires") === "60",
    "authorized receipt download is signed for only sixty seconds",
  );
  const downloaded = await fetch(downloadable.url),
    cleanBytes = Buffer.from(await downloaded.arrayBuffer()),
    metadata = await sharp(cleanBytes).metadata();
  check(
    downloaded.ok && !metadata.exif && !metadata.xmp && !metadata.icc,
    "downloaded receipt is normalized and strips private image metadata",
  );
  check(
    (await outsider.call(`${base}/${intent.uploadId}/download`)).status === 404,
    "outsider cannot obtain a signed receipt URL",
  );
  const stored = await db
    .from("upload_intents")
    .select("clean_key")
    .eq("id", intent.uploadId)
    .single();
  if (stored.error) throw new Error("Receipt storage verification unavailable");
  const publicAttempt = await fetch(
    env.SUPABASE_URL +
      "/storage/v1/object/public/finance-attachments/" +
      stored.data.clean_key,
  );
  check(
    !publicAttempt.ok,
    "private receipt bucket has no anonymous public-file path",
  );
  const malware = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  const infected = data(
    await post(author, base, {
      ...doc,
      filename: "fictional-antivirus-test.pdf",
      mime: "application/pdf",
      bytes: malware.length,
      sha256: createHash("sha256").update(malware).digest("hex"),
    }),
  );
  check(
    (
      await fetch(infected.url, {
        method: "PUT",
        headers: infected.headers,
        body: malware,
      })
    ).ok,
    "standard harmless antivirus test bytes enter quarantine, not public media",
  );
  data(await post(author, `${base}/${infected.uploadId}/complete`, {}));
  await runUploadWorker({ env, db });
  check(
    (await scanned(infected.uploadId)).state === "rejected",
    "actual scanner rejects the standard harmless EICAR test file",
  );
  check(
    (await author.call(`${base}/${infected.uploadId}/download`)).status === 404,
    "rejected malware-test file never receives a download URL",
  );
  const jobs = await db
    .from("delivery_jobs")
    .select("id")
    .eq("kind", "upload_scan")
    .eq("payload->>uploadId", intent.uploadId);
  if (jobs.error) throw new Error("Receipt job verification unavailable");
  check(
    jobs.data.length === 1,
    "idempotent completion created exactly one scanner job",
  );
  const audit = await db
    .from("admin_actions")
    .select("metadata")
    .eq("target_id", requestId)
    .eq("action", "finances.file_downloaded");
  if (audit.error) throw new Error("Receipt download audit unavailable");
  check(
    audit.data.length === 1 &&
      !JSON.stringify(audit.data).includes("fictional-receipt.png"),
    "download audit records file identity without receipt filenames or URLs",
  );
  const current = data(
    await author.call("/admin/finances/" + requestId),
  ).record;
  data(
    await post(author, "/admin/finances/" + requestId, {
      action: "cancel",
      revision: current.revision,
      confirmation: current.reference,
      currentPassword: author.password,
    }),
  );
  check(
    data(await author.call(base)).canUpload === false,
    "cancelled requests cannot gain new receipts",
  );
  check(
    (await post(author, base, doc)).status === 404,
    "server enforces terminal-state attachment policy independently of the UI",
  );
} finally {
  if (accounts.length) {
    const archived = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .in("id", accounts);
    const revoked = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .in("admin_user_id", accounts)
      .is("revoked_at", null);
    if (archived.error || revoked.error)
      throw new Error("Finance upload fixture cleanup unavailable");
  }
}
await writeFile(
  new URL(
    "../.docs/phase0/local-finance-uploads-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Actual signed local object uploads, malware scanning, metadata-stripping image normalization, signed private download and retained financial evidence. Synthetic images and the standard harmless antivirus test string only; no user files or external services. Fictional accounts recoverably archived; receipt evidence retained.",
      retainedFixtureRequestId: requestId,
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
