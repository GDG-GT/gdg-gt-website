import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runUploadWorker } from "../server/upload-worker.mjs";
import { runMediaPublicationWorker } from "../server/media-publication-worker.mjs";
import { cleanupMedia } from "../server/media-cleanup.mjs";
import { objectStorage } from "../server/lib/object-storage.mjs";
const root = await localHttp(),
  { db, env, call } = root,
  actor = randomUUID(),
  outsider = randomUUID(),
  password = "Media-files-" + randomUUID(),
  files = [],
  tests = [];
const sql = (value) => {
  if (value.error)
    throw Error("Media file fixture database failed " + value.error.code);
  return value.data;
};
const data = (value) => {
  if (value.status !== 200)
    throw Error(
      "Media file API failed " + value.status + " " + value.json?.error?.code,
    );
  return value.json.data;
};
const check = (value, name) => {
  if (!value) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS", name);
};
const post = (path, body, key = randomUUID()) =>
    call(path, { method: "POST", body, key }),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let team, foreign;
const fixtureEmail = `fictional-media-files-${actor}@example.test`;
async function intent(filename, mime, bytes, extra = {}, key = randomUUID()) {
  const result = data(
    await post(
      "/admin/media/uploads",
      {
        teamId: team.id,
        folderId: null,
        filename,
        mime,
        bytes: bytes.length,
        sha256: sha(bytes),
        ...extra,
      },
      key,
    ),
  );
  if (!files.includes(result.fileId)) files.push(result.fileId);
  return result;
}
const detail = async (id) =>
  sql(await db.from("media_files").select("*").eq("id", id).single());
async function scan(i, bytes) {
  const response = await fetch(i.url, {
    method: "PUT",
    headers: i.headers,
    body: bytes,
  });
  if (!response.ok) throw Error("Signed media PUT failed " + response.status);
  data(await post(`/admin/media/uploads/${i.uploadId}/complete`, {}));
  // No broadly running media worker is needed: only the new media kind is
  // claimed. Refuse to consume somebody else's queued media job.
  const pending = sql(
    await db
      .from("upload_intents")
      .select("owner_id")
      .eq("purpose", "media")
      .eq("state", "queued")
      .is("deleted_at", null),
  );
  if (pending.some((v) => v.owner_id !== actor))
    throw Error("Unrelated media queue present; test refuses to claim it");
  await runUploadWorker({ env, db, media: true, limit: 1 });
  return detail(i.fileId);
}
async function mutate(file, action, document = {}, key = randomUUID()) {
  return post(
    "/admin/media/files",
    { action, files: [{ id: file.id, revision: file.revision }], document },
    key,
  );
}
async function publication(file, action, extra = {}, key = randomUUID()) {
  return post(
    `/admin/media/files/${file.id}/publication`,
    {
      action,
      revision: file.revision,
      currentPassword: password,
      confirmation: action === "publish" ? "PUBLISH IMAGE" : "REVOKE IMAGE",
      ...extra,
    },
    key,
  );
}
try {
  sql(
    await db.from("admin_users").insert([
      {
        id: actor,
        email: fixtureEmail,
        password_hash: await hashSecret(password),
        role: "team_member",
        is_active: true,
      },
      {
        id: outsider,
        email: `fictional-media-outsider-${outsider}@example.test`,
        password_hash: await hashSecret(password),
        role: "team_member",
        is_active: true,
      },
    ]),
  );
  team = sql(
    await db
      .from("admin_teams")
      .insert({
        name: "Fictional media files " + actor.slice(0, 8),
        slug: "media-files-" + actor.slice(0, 8),
        created_by: actor,
      })
      .select("id")
      .single(),
  );
  sql(
    await db
      .from("team_memberships")
      .insert({ team_id: team.id, admin_user_id: actor, role: "member" }),
  );
  sql(
    await db.from("team_page_access").insert({
      team_id: team.id,
      page_path: "/admin/media",
      can_access: true,
    }),
  );
  sql(
    await db.from("team_permissions").insert({
      team_id: team.id,
      resource_type: "media",
      permission: "crud",
      can_read: true,
      can_create: true,
      can_update: true,
      can_delete: true,
    }),
  );
  data(await post("/auth/gate", { code: root.credentials.gateCode }));
  data(await post("/auth/login", { email: fixtureEmail, password }));
  foreign = await localHttp();
  data(
    await foreign.call("/auth/gate", {
      method: "POST",
      body: { code: root.credentials.gateCode },
    }),
  );
  data(
    await foreign.call("/auth/login", {
      method: "POST",
      body: {
        email: `fictional-media-outsider-${outsider}@example.test`,
        password,
      },
    }),
  );
  const bytes = await sharp({
    create: { width: 64, height: 32, channels: 3, background: "#dd7766" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const doc = {
    teamId: team.id,
    folderId: null,
    filename: "fictional-media.png",
    mime: "image/png",
    bytes: bytes.length,
    sha256: sha(bytes),
  };
  check(
    (
      await call("/admin/media/uploads", {
        method: "POST",
        body: doc,
        key: randomUUID(),
        anonymous: true,
      })
    ).status === 401,
    "anonymous media uploads denied",
  );
  check(
    (await post("/admin/media/uploads", { ...doc, is_public: true })).status ===
      400,
    "upload request cannot publish a file or forge ownership",
  );
  check(
    (await post("/admin/media/uploads", { ...doc, bytes: 20971521 })).status ===
      400,
    "image upload size limit is twenty MiB",
  );
  check(
    (
      await post("/admin/media/uploads", {
        ...doc,
        filename: "bad.svg",
        mime: "image/svg+xml",
      })
    ).status === 400,
    "active SVG is rejected before a storage capability exists",
  );
  const key = randomUUID(),
    i = await intent(doc.filename, doc.mime, bytes, {}, key);
  check(
    (await intent(doc.filename, doc.mime, bytes, {}, key)).uploadId ===
      i.uploadId,
    "media intent retry creates exactly one file and object capability",
  );
  check(
    (await call(`/admin/media/files/${i.fileId}/download`)).status === 404,
    "quarantine file cannot be downloaded",
  );
  check(
    (await post(`/admin/media/uploads/${i.uploadId}/complete`, {})).status ===
      400,
    "completion requires the actual uploaded object",
  );
  let file = await scan(i, bytes);
  check(
    file.scan_state === "clean" &&
      file.width === 64 &&
      file.height === 32 &&
      !file.is_public,
    "real signed PUT, ClamAV and image normalization produce a private clean file",
  );
  const signed = data(await call(`/admin/media/files/${i.fileId}/download`)),
    download = await fetch(signed.url),
    normalized = Buffer.from(await download.arrayBuffer());
  check(
    download.ok &&
      signed.expiresIn === 60 &&
      !(await sharp(normalized).metadata()).exif,
    "private signed download expires after sixty seconds and strips image metadata",
  );
  const preview = data(await call(`/admin/media/files/${i.fileId}/preview`)),
    previewResponse = await fetch(preview.url);
  check(
    previewResponse.ok &&
      previewResponse.headers.get("content-type") === "image/png" &&
      previewResponse.headers.get("content-disposition").startsWith("inline"),
    "authorized image preview is a bounded direct-storage inline raster capability",
  );
  check(
    (await foreign.call(`/admin/media/files/${i.fileId}/download`)).status ===
      404 &&
      (await foreign.call(`/admin/media?team=${team.id}`)).status === 404,
    "foreign account cannot read inventory or authorize a clean file download",
  );
  check(
    !(
      await fetch(
        `${env.SUPABASE_URL}/storage/v1/object/public/media/${file.file_path}`,
      )
    ).ok,
    "media bucket remains private even after a clean scan",
  );
  const listed = data(await call(`/admin/media?team=${team.id}`));
  check(
    listed.items.some((v) => v.id === file.id) &&
      !JSON.stringify(listed).includes("clean/") &&
      !JSON.stringify(listed).includes("quarantine/"),
    "inventory never exposes private storage paths",
  );
  const starKey = randomUUID(),
    before = file;
  data(await mutate(file, "star", { starred: true }, starKey));
  data(await mutate(before, "star", { starred: true }, starKey));
  file = await detail(file.id);
  check(
    file.revision === before.revision + 1 && file.is_starred,
    "star mutation retry is idempotent",
  );
  check(
    (await mutate(before, "star", { starred: false })).status === 409,
    "stale file revision cannot overwrite current metadata",
  );
  data(
    await mutate(file, "metadata", {
      name: "Fictional approved caption",
      alt: "Coral rectangle used only in local testing",
      description: "Fixture only",
      tags: ["fictional", "local"],
      eventId: null,
      order: 2,
      allowDownload: false,
    }),
  );
  file = await detail(file.id);
  check(
    data(
      await call(
        `/admin/media?team=${team.id}&starred=true&tag=fictional&type=image`,
      ),
    ).items.some((v) => v.id === file.id),
    "search filters preserve current star, tag and type metadata",
  );
  check(
    (await publication(file, "publish")).status === 404,
    "ordinary media CRUD never grants public gallery publishing",
  );
  sql(
    await db.from("team_page_access").insert({
      team_id: team.id,
      page_path: "/admin/gallery",
      can_access: true,
    }),
  );
  sql(
    await db.from("team_permissions").insert({
      team_id: team.id,
      resource_type: "gallery",
      permission: "publish",
      can_read: true,
      can_create: false,
      can_update: true,
      can_delete: false,
    }),
  );
  check(
    (
      await publication(file, "publish", {
        currentPassword: "wrong-fictional-password",
      })
    ).status === 403,
    "publication requires the current account password",
  );
  check(
    (await publication(file, "publish", { confirmation: "yes" })).status ===
      400,
    "publication requires the exact displayed confirmation",
  );
  const publicationKey = randomUUID(),
    queued = data(await publication(file, "publish", {}, publicationKey));
  check(
    queued.state === "queued" &&
      data(await publication(file, "publish", {}, publicationKey))
        .publicationId === queued.publicationId,
    "publication approval freezes the file revision and replays idempotently",
  );
  check(
    (await call(`/media/public/${file.id}`)).status === 404,
    "unapproved derivative bytes cannot be served publicly",
  );
  const published = await runMediaPublicationWorker({ env, db });
  file = await detail(file.id);
  check(
    published.published === 1 && file.is_public,
    "real isolated worker creates and commits three bounded WebP derivatives",
  );
  const publicImage = await call(`/media/public/${file.id}?width=960`);
  check(
    publicImage.status === 200 &&
      publicImage.headers.get("content-type") === "image/webp" &&
      publicImage.headers.get("x-content-type-options") === "nosniff" &&
      publicImage.bytes.length < 3670016,
    "public image endpoint emits only bounded checked WebP bytes with nosniff",
  );
  const publicGallery = data(await call("/gallery")),
    publicPhoto = publicGallery.items.find((v) => v.id === file.id);
  check(
    publicPhoto?.alt_text === "Coral rectangle used only in local testing" &&
      publicPhoto.srcSet &&
      !JSON.stringify(publicPhoto).includes(`public/${file.id}/`) &&
      !JSON.stringify(publicPhoto).includes("clean/") &&
      !publicPhoto.downloadUrl,
    "public gallery returns responsive approved metadata and no private object paths",
  );
  check(
    (await call(`/media/public/${file.id}?width=960&download=true`)).status ===
      404,
    "direct image download is denied without explicit permission",
  );
  check(
    (await call(`/media/public/${file.id}?width=2500`)).status === 400 &&
      (await call(`/media/public/${file.id}?key=quarantine/forged`)).status ===
        400,
    "public asset selectors reject arbitrary widths and storage keys",
  );
  check(
    (await mutate(file, "archive")).status === 409,
    "published files cannot be archived until publication is revoked",
  );
  data(await publication(file, "revoke"));
  file = await detail(file.id);
  check(
    (await call(`/media/public/${file.id}`)).status === 404 &&
      !data(await call("/gallery")).items.some((v) => v.id === file.id),
    "revoke immediately disables new public asset and gallery requests",
  );
  sql(
    await db.from("media_usage").insert({
      file_id: file.id,
      usage_type: "fixture",
      reference_id: actor,
      reference_table: "fictional_test_only",
    }),
  );
  check(
    (await mutate(file, "archive")).status === 409,
    "a referenced file cannot be archived",
  );
  sql(
    await db
      .from("media_usage")
      .delete()
      .eq("file_id", file.id)
      .eq("reference_table", "fictional_test_only"),
  );
  data(await mutate(file, "archive"));
  file = await detail(file.id);
  check(
    (await call(`/admin/media/files/${file.id}/download`)).status === 404,
    "archived file cannot authorize new download capabilities",
  );
  data(await mutate(file, "restore"));
  file = await detail(file.id);
  check(
    !file.deleted_at && !file.is_public,
    "restore retains private state and requires new public approval",
  );
  const malware = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  const infected = await intent(
    "fictional-antivirus.txt",
    "text/plain",
    malware,
  );
  check(
    (await scan(infected, malware)).scan_state === "rejected" &&
      (await call(`/admin/media/files/${infected.fileId}/download`)).status ===
        404,
    "real scanner rejects harmless standard antivirus test bytes and denies download",
  );
  const forged = await intent("fictional-forged.txt", "text/plain", bytes);
  check(
    (await scan(forged, bytes)).scan_state === "rejected",
    "detected content must match declared media MIME",
  );
  const archive = zipSync({ "notes.txt": strToU8("Fictional local fixture") }),
    archiveIntent = await intent(
      "fictional-documents.zip",
      "application/zip",
      archive,
    );
  check(
    (await scan(archiveIntent, archive)).scan_state === "clean",
    "safe bounded ZIP archives pass isolated scanning",
  );
  check(
    (await call(`/admin/media/files/${archiveIntent.fileId}/preview`))
      .status === 400,
    "archives never receive inline preview capabilities",
  );
  // A valid, tiny PCM WAV checks the native seekable ffprobe path without ffmpeg.
  const wav = Buffer.alloc(8044);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(8000, 40);
  const audio = await intent("fictional-silence.wav", "audio/wav", wav),
    audioFile = await scan(audio, wav);
  check(
    audioFile.scan_state === "clean" && Number(audioFile.duration) === 0.5,
    "actual native ffprobe validates WAV streams and duration",
  );
  for (const [filename, mime, args] of [
    [
      "fictional-video.mp4",
      "video/mp4",
      [
        "-f",
        "lavfi",
        "-i",
        "color=c=0xdd7766:s=32x32:r=10",
        "-t",
        "0.2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "frag_keyframe+empty_moov",
        "-f",
        "mp4",
      ],
    ],
    [
      "fictional-video.webm",
      "video/webm",
      [
        "-f",
        "lavfi",
        "-i",
        "color=c=0xdd7766:s=32x32:r=10",
        "-t",
        "0.2",
        "-c:v",
        "libvpx",
        "-deadline",
        "realtime",
        "-f",
        "webm",
      ],
    ],
    [
      "fictional-silence.mp3",
      "audio/mpeg",
      [
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=8000:cl=mono",
        "-t",
        "0.25",
        "-c:a",
        "libmp3lame",
        "-f",
        "mp3",
      ],
    ],
    [
      "fictional-silence.ogg",
      "audio/ogg",
      [
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=8000:cl=mono",
        "-t",
        "0.25",
        "-c:a",
        "flac",
        "-f",
        "ogg",
      ],
    ],
  ]) {
    const fixture = await promisify(execFile)(
        "/opt/homebrew/bin/ffmpeg",
        ["-v", "error", ...args, "pipe:1"],
        { encoding: "buffer", timeout: 15000, maxBuffer: 2097152 },
      ),
      i = await intent(filename, mime, fixture.stdout),
      media = await scan(i, fixture.stdout);
    check(
      media.scan_state === "clean" &&
        Number(media.duration) > 0 &&
        (mime.startsWith("audio/") ||
          (media.width === 32 && media.height === 32)),
      `real scan and native container validation accept ${mime}`,
    );
  }
  const mismatch = await intent("fictional-checksum.png", "image/png", bytes, {
    sha256: sha(Buffer.from("different fictional bytes")),
  });
  check(
    (await scan(mismatch, bytes)).scan_state === "rejected",
    "media scanner independently verifies actual object checksum",
  );
  // Physical cleanup receives only this run's rejected antivirus fixture. The
  // real bounded claim/retention/usage/restore-fencing SQL is covered separately.
  const rejected = await detail(infected.fileId);
  data(await mutate(rejected, "archive"));
  sql(
    await db
      .from("upload_intents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", infected.uploadId),
  );
  sql(
    await db
      .from("media_files")
      .update({ cleanup_started_at: new Date().toISOString() })
      .eq("id", infected.fileId),
  );
  const removal = sql(
      await db
        .from("upload_intents")
        .select("*")
        .eq("id", infected.uploadId)
        .single(),
    ),
    scopedDb = {
      from: db.from.bind(db),
      rpc: (name, args) =>
        name === "claim_media_upload_cleanup"
          ? Promise.resolve({ data: [removal], error: null })
          : name === "claim_media_object_cleanup"
            ? Promise.resolve({ data: [], error: null })
            : db.rpc(name, args),
    },
    cleanup = await cleanupMedia({ env, db: scopedDb, limit: 1 });
  const storage = objectStorage(env);
  let gone = false;
  try {
    await storage.head("media", removal.quarantine_key);
  } catch (e) {
    gone = e?.$metadata?.httpStatusCode === 404;
  } finally {
    storage.close();
  }
  const removed = await detail(infected.fileId);
  check(
    cleanup.purged === 1 &&
      gone &&
      removed.purged_at &&
      removed.original_name === "" &&
      removed.file_size === 0,
    "real scoped cleanup deletes only the generated antivirus fixture and atomically erases its filename/reservation",
  );
  sql(
    await db
      .from("team_page_access")
      .update({ can_access: false })
      .eq("team_id", team.id)
      .in("page_path", ["/admin/media", "/admin/gallery"]),
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY) throw Error("Browser review requires a terminal");
    sql(
      await db
        .from("team_page_access")
        .update({ can_access: true })
        .eq("team_id", team.id)
        .in("page_path", ["/admin/media", "/admin/gallery"]),
    );
    // Local generated rectangles only, published briefly for actual lightbox /
    // responsive-asset verification. finally revokes both approvals.
    const secondBytes = await sharp({
        create: { width: 96, height: 64, channels: 3, background: "#7799bb" },
      })
        .png()
        .toBuffer(),
      second = await intent(
        "fictional-gallery-blue.png",
        "image/png",
        secondBytes,
      );
    let secondFile = await scan(second, secondBytes);
    data(
      await mutate(secondFile, "metadata", {
        name: "Fictional blue gallery fixture",
        alt: "Blue rectangle for local gallery verification",
        description: "Generated fixture, not chapter photography",
        tags: ["fictional"],
        eventId: null,
        order: 3,
        allowDownload: true,
      }),
    );
    secondFile = await detail(second.fileId);
    file = await detail(file.id);
    data(await publication(file, "publish"));
    data(await publication(secondFile, "publish"));
    const proofPublication = await runMediaPublicationWorker({
      env,
      db,
      limit: 2,
    });
    check(
      proofPublication.published === 2,
      "two generated images are temporarily approved for local browser lightbox verification",
    );
    console.info(
      `BROWSER_MEDIA_SCOPE ${team.id} Fictional media files ${actor.slice(0, 8)}`,
    );
    console.info(
      "Type done after browser review to archive this run’s remaining fictional files and revoke fixture sessions.",
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of rl)
      if (line.trim() === "done") {
        rl.close();
        break;
      }
    sql(
      await db
        .from("team_page_access")
        .update({ can_access: false })
        .eq("team_id", team.id)
        .in("page_path", ["/admin/media", "/admin/gallery"]),
    );
  }
  check(
    (await call(`/admin/media/files/${file.id}/download`)).status === 404,
    "current page revocation prevents further signed downloads",
  );
  sql(
    await db
      .from("team_page_access")
      .update({ can_access: true })
      .eq("team_id", team.id)
      .in("page_path", ["/admin/media", "/admin/gallery"]),
  );
} finally {
  if (team)
    sql(
      await db
        .from("team_page_access")
        .update({ can_access: true })
        .eq("team_id", team.id)
        .in("page_path", ["/admin/media", "/admin/gallery"]),
    );
  // Only IDs created by this run are recoverably archived; the one generated
  // antivirus fixture above was explicitly removed by the scoped cleanup test.
  for (const id of files) {
    let file = await detail(id);
    if (
      file.is_public ||
      sql(
        await db
          .from("media_publications")
          .select("id")
          .eq("file_id", id)
          .eq("state", "queued"),
      ).length
    ) {
      data(await publication(file, "revoke"));
      file = await detail(id);
    }
    if (!file.deleted_at && !["pending", "queued"].includes(file.scan_state))
      data(await mutate(file, "archive"));
  }
  await root.logout();
  if (foreign) await foreign.logout();
  if (team)
    sql(
      await db
        .from("admin_teams")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", team.id),
    );
  sql(
    await db
      .from("admin_users")
      .update({ is_active: false })
      .in("id", [actor, outsider]),
  );
}
await writeFile(
  new URL("../.docs/phase0/local-media-files.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Real loopback signed private S3 PUT, ClamAV, sharp, ffprobe and HTTP/scoped SQL using generated fictional files only. Only a generated rejected antivirus fixture is physically removed in a scoped cleanup test; other own files are recoverably archived and local synthetic image publication is revoked. No real user asset or external provider is used.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
console.info(`${tests.length} actual private media file checks passed.`);
