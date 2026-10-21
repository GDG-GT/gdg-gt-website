import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runUploadWorker } from "../server/upload-worker.mjs";
const root = await localHttp(),
  { db, env } = root,
  accounts = [],
  submissions = [],
  tests = [];
let author, other;
const base = "/admin/blog/uploads",
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function check(ok, name) {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS", name);
}
function data(r) {
  if (r.status !== 200)
    throw Error(
      "Blog file request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
}
const post = (h, path, body, key = randomUUID()) =>
  h.call(path, { method: "POST", body, key });
async function actor() {
  const h = await localHttp(),
    id = randomUUID(),
    email = "fictional-blog-file-" + id + "@example.test",
    password = "Fictional-blog-file-" + randomUUID();
  const r = await db
    .from("admin_users")
    .insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role: "blog_editor",
      is_active: true,
      display_name: "Fictional private file editor",
    });
  if (r.error) throw Error("Blog file account fixture failed");
  accounts.push(id);
  data(await post(h, "/auth/gate", { code: root.credentials.gateCode }));
  data(await post(h, "/auth/login", { email, password }));
  return { ...h, id, password };
}
async function intent(doc, key = randomUUID()) {
  const r = data(await post(author, base, doc, key));
  if (!submissions.includes(r.submissionId)) submissions.push(r.submissionId);
  return r;
}
const fileDetail = async (id) =>
  data(await author.call("/admin/blog/submissions/" + id)).record;
async function complete(i, bytes) {
  const r = await fetch(i.url, {
    method: "PUT",
    headers: i.headers,
    body: bytes,
  });
  if (!r.ok) throw Error("Signed private Blog quarantine PUT failed");
  data(await post(author, base + "/" + i.uploadId + "/complete", {}));
  await runUploadWorker({ env, db });
}
async function scanned(id) {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    const r = await fileDetail(id);
    if (["clean", "rejected"].includes(r.scan_status)) return r;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Blog scanner did not finish; no jobs or quotas reset");
}
try {
  author = await actor();
  other = await actor();
  const bytes = await sharp({
    create: { width: 40, height: 25, channels: 3, background: "#ef684f" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const doc = {
    teamId: null,
    filename: "fictional-editorial-image.png",
    mime: "image/png",
    bytes: bytes.length,
    sha256: sha(bytes),
  };
  check(
    (
      await post(
        {
          ...author,
          call: (p, o) => author.call(p, { ...o, anonymous: true }),
        },
        base,
        doc,
      )
    ).status === 401,
    "anonymous Blog file upload denied",
  );
  check(
    (await post(author, base, { ...doc, owner_id: other.id })).status === 400,
    "Blog file creation rejects forged ownership",
  );
  check(
    (await post(author, base, { ...doc, bytes: 20971521 })).status === 400,
    "Blog file limit is twenty MB",
  );
  check(
    (
      await post(author, base, {
        ...doc,
        filename: "unsafe.svg",
        mime: "image/svg+xml",
      })
    ).status === 400,
    "Blog uploads reject active SVG",
  );
  check(
    (await post(author, base, { ...doc, filename: "fake.pdf" })).status === 400,
    "file extension and MIME must agree before signing",
  );
  const key = randomUUID(),
    i = await intent(doc, key);
  check(
    (await intent(doc, key)).uploadId === i.uploadId,
    "Blog intent replay reuses one private submission and upload",
  );
  check(
    (await author.call(base + "/" + i.uploadId + "/download")).status === 404,
    "quarantined Blog file cannot be downloaded",
  );
  check(
    (await post(author, base + "/" + i.uploadId + "/complete", {})).json?.error
      ?.code === "INVALID_UPLOAD",
    "completion verifies the private object exists",
  );
  const put = await fetch(i.url, {
    method: "PUT",
    headers: i.headers,
    body: bytes,
  });
  check(put.ok, "actual Blog image bytes enter signed private quarantine");
  const completionKey = randomUUID();
  data(
    await post(
      author,
      base + "/" + i.uploadId + "/complete",
      {},
      completionKey,
    ),
  );
  check(
    data(
      await post(
        author,
        base + "/" + i.uploadId + "/complete",
        {},
        completionKey,
      ),
    ).uploadId === i.uploadId,
    "Blog completion is idempotent",
  );
  await runUploadWorker({ env, db });
  const clean = await scanned(i.submissionId);
  check(
    clean.scan_status === "clean",
    "actual ClamAV scan and normalization promote a valid Blog file",
  );
  check(
    !("file_path" in clean) &&
      !JSON.stringify(clean).includes("quarantine/") &&
      !JSON.stringify(clean).includes("clean/"),
    "submission DTO never exposes storage paths",
  );
  const signed = data(await author.call(base + "/" + i.uploadId + "/download"));
  check(
    signed.expiresIn === 60 &&
      new URL(signed.url).searchParams.get("X-Amz-Expires") === "60",
    "Blog download authorization expires in sixty seconds",
  );
  const downloaded = await fetch(signed.url),
    normalized = Buffer.from(await downloaded.arrayBuffer()),
    metadata = await sharp(normalized).metadata();
  check(
    downloaded.ok && !metadata.exif && !metadata.xmp && !metadata.icc,
    "downloaded Blog image strips private metadata",
  );
  check(
    (await other.call(base + "/" + i.uploadId + "/download")).status === 404,
    "unassigned editor cannot obtain a clean-file URL",
  );
  const stored = await db
    .from("upload_intents")
    .select("clean_key")
    .eq("id", i.uploadId)
    .single();
  if (stored.error) throw Error("Blog storage verification unavailable");
  const publicAttempt = await fetch(
    env.SUPABASE_URL +
      "/storage/v1/object/public/blog-submissions/" +
      stored.data.clean_key,
  );
  check(!publicAttempt.ok, "Blog storage has no public clean-file path");
  const malware = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  const infected = await intent({
    ...doc,
    filename: "fictional-antivirus-test.txt",
    mime: "text/plain",
    bytes: malware.length,
    sha256: sha(malware),
  });
  await complete(infected, malware);
  check(
    (await scanned(infected.submissionId)).scan_status === "rejected",
    "real scanner rejects harmless standard antivirus test bytes",
  );
  check(
    (await author.call(base + "/" + infected.uploadId + "/download")).status ===
      404,
    "rejected Blog file never receives a download URL",
  );
  const mismatch = await intent({
    ...doc,
    sha256: sha(Buffer.from("fictional mismatch")),
  });
  await complete(mismatch, bytes);
  check(
    (await scanned(mismatch.submissionId)).scan_status === "rejected",
    "worker rejects bytes with a forged checksum",
  );
  const spoof = await intent({
    ...doc,
    filename: "fictional-not-text.txt",
    mime: "text/plain",
  });
  await complete(spoof, bytes);
  check(
    (await scanned(spoof.submissionId)).scan_status === "rejected",
    "content inspection rejects a MIME-spoofed Blog file",
  );
  const jobs = await db
    .from("delivery_jobs")
    .select("id")
    .eq("kind", "upload_scan")
    .eq("payload->>uploadId", i.uploadId);
  if (jobs.error) throw Error("Blog scan job check unavailable");
  check(
    jobs.data.length === 1,
    "repeated Blog completion schedules one scanner job",
  );
  const audit = await db
    .from("admin_actions")
    .select("metadata")
    .eq("target_id", i.submissionId)
    .eq("action", "blog.file_downloaded");
  if (audit.error) throw Error("Blog download audit unavailable");
  check(
    audit.data.length === 1 &&
      !JSON.stringify(audit.data).includes(doc.filename),
    "file download audit excludes filenames and signed URLs",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY) throw Error("Browser review needs a terminal");
    console.info(
      "BROWSER_CLEAN_SUBMISSION http://127.0.0.1:8080/admin/blog?collection=submissions&record=" +
        i.submissionId,
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.info(
      "Type done to revoke fixture access and archive exact submissions.",
    );
    for await (const line of rl)
      if (line.trim() === "done") {
        rl.close();
        break;
      }
  }
  const revoked = await db
    .from("admin_users")
    .update({ is_active: false })
    .eq("id", author.id);
  if (revoked.error) throw Error("Blog file revocation fixture failed");
  check(
    (await author.call(base + "/" + i.uploadId + "/download")).status === 401,
    "deactivated uploader cannot authorize another download",
  );
} finally {
  if (submissions.length) {
    await root.login();
    try {
      for (const id of submissions) {
        const r = data(await root.call("/admin/blog/submissions/" + id)).record;
        if (!r.deleted_at)
          data(
            await post(root, "/admin/blog/submissions/" + id, {
              action: "archive",
              revision: r.revision,
              currentPassword: root.credentials.password,
              confirmation: r.reference,
            }),
          );
      }
    } finally {
      await root.logout();
    }
  }
  if (accounts.length)
    for (const r of [
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .in("id", accounts),
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .in("admin_user_id", accounts)
        .is("revoked_at", null),
    ])
      if (r.error) throw Error("Blog file fixture retention failed");
}
await writeFile(
  new URL(
    "../.docs/phase0/local-blog-uploads-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real private S3 quarantine, ClamAV, metadata normalization and sixty-second download using synthetic images and the harmless standard antivirus test string. Exact fictional submissions/accounts recoverably archived; clean evidence retained. No real person, user file, external provider or mail.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
