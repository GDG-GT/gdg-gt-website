import { randomUUID, createHash } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import sharp from "sharp";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal.");
const { call, db, credentials } = await localHttp(),
  id = randomUUID(),
  email = `fictional-media-recovery-${id}@example.test`,
  password = "Fictional-media-recovery-" + randomUUID(),
  tests = [];
const ledger = new URL("../.docs/local-media-review.local", import.meta.url);
let fileId,
  ledgerOwned = false;
function data(r) {
  if (r.status !== 200)
    throw Error(
      "Media recovery request failed " +
        r.status +
        " " +
        (r.json?.error?.code || "unavailable"),
    );
  return r.json.data;
}
function check(value, name) {
  if (!value) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
}
const post = (path, body, key = randomUUID()) =>
  call(path, { method: "POST", body, key });
async function listing() {
  return data(await call("/admin/media?team=chapter&folder=root"));
}
async function evidence(cleanedUp) {
  await writeFile(
    new URL("../.docs/phase0/local-media-recovery.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback upload/scan/metadata recovery with one generated rectangle and an isolated fictional officer. No publication, external send, imported personal file or permanent deletion.",
        cleanup: { completed: cleanedUp },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
const account = await db
  .from("admin_users")
  .insert({
    id,
    email,
    password_hash: await hashSecret(password),
    role: "admin",
    display_name: "Fictional media recovery reviewer",
    is_active: true,
  });
if (account.error) throw Error("Media recovery fixture unavailable");
try {
  data(await post("/auth/gate", { code: credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#ef876d" },
  })
    .png()
    .toBuffer();
  const body = {
      teamId: null,
      folderId: null,
      filename: "fictional-media-recovery.png",
      mime: "image/png",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    key = randomUUID();
  const intent = data(await post("/admin/media/uploads", body, key));
  fileId = intent.fileId;
  check(
    data(await post("/admin/media/uploads", body, key)).fileId === fileId,
    "unchanged upload intent retry retains the original private file",
  );
  const put = await fetch(intent.url, {
    method: "PUT",
    headers: intent.headers,
    body: bytes,
    signal: AbortSignal.timeout(15000),
  });
  check(
    put.ok,
    "generated rectangle uploads only to signed private quarantine",
  );
  data(await post(`/admin/media/uploads/${intent.uploadId}/complete`, {}));
  let file;
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    file = (await listing()).items.find((f) => f.id === fileId);
    if (file?.scanState === "clean") break;
    if (file?.scanState === "rejected")
      throw Error("Generated rectangle unexpectedly rejected");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check(
    file?.scanState === "clean",
    "real background scanner promotes the generated rectangle before private editing",
  );
  const metadata = {
      action: "metadata",
      files: [{ id: fileId, revision: file.revision }],
      document: {
        name: "Fictional media recovery photo",
        alt: "Coral rectangle for local recovery testing",
        description: "Generated fixture only",
        seoTitle: "",
        seoDescription: "",
        tags: ["fictional"],
        eventId: null,
        order: 0,
        allowDownload: false,
      },
    },
    metadataKey = randomUUID();
  data(await post("/admin/media/files", metadata, metadataKey));
  data(await post("/admin/media/files", metadata, metadataKey));
  const current = (await listing()).items.find((f) => f.id === fileId);
  check(
    current.name === metadata.document.name &&
      current.revision === file.revision + 1,
    "uncertain metadata retry is idempotent and preserves exactly one revision advance",
  );
  check(
    !current.public && current.actions.includes("update"),
    "private metadata save does not approve public delivery",
  );
  const stale = await post("/admin/media/files", metadata);
  check(
    stale.status === 409,
    "stale media revisions cannot overwrite the accepted metadata",
  );
  if (process.argv.includes("--hold-for-browser")) {
    await writeFile(
      ledger,
      JSON.stringify({ email, password, fileId, name: current.name }),
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    await evidence(false);
    console.info("Fictional private media ready. Commands: change, done.");
    const input = createInterface({ input: process.stdin });
    for await (const command of input) {
      if (command.trim() === "done") {
        input.close();
        break;
      }
      if (command.trim() === "change") {
        const file = (await listing()).items.find((f) => f.id === fileId);
        data(
          await post("/admin/media/files", {
            ...metadata,
            files: [{ id: fileId, revision: file.revision }],
            document: {
              ...metadata.document,
              description: "Generated fixture only. Fictional remote update.",
            },
          }),
        );
        check(
          true,
          "independent-session fictional metadata revision committed for browser review",
        );
      }
    }
  }
} finally {
  if (fileId) {
    const file = (await listing()).items.find((f) => f.id === fileId);
    if (file && !file.deletedAt) {
      if (["pending", "queued"].includes(file.scanState))
        throw Error(
          "Fixture scan still pending; cleanup requires its terminal result",
        );
      data(
        await post("/admin/media/files", {
          action: "archive",
          files: [{ id: fileId, revision: file.revision }],
          document: {},
        }),
      );
    }
  }
  await call("/auth/session", { method: "DELETE" });
  const account = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id),
    sessions = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_user_id", id)
      .is("revoked_at", null);
  if (account.error || sessions.error)
    throw Error("Media recovery account cleanup failed");
  if (ledgerOwned) await unlink(ledger);
  if (process.stdin.isTTY) process.stdin.pause();
}
await evidence(true);
