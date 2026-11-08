import {downloadPinnedArtifact} from './lib/pinned-download.mjs';
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, cp, rm, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const execute = promisify(execFile);
// Official 9.0.2 source, verified against FFmpeg release key
// FCF986EA15E6E293A5644F10B4322F04D67658D8 before this checksum was pinned.
const source = { version: "9.0.2", sha256: "8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e" };
export async function prepareServerlessMedia() {
  if (process.platform !== "linux" || process.arch !== "x64") throw Error("Production media tools require Linux x64.");
  const cache = path.resolve("node_modules/.cache/gdg-ffprobe-" + source.version),
    output = path.resolve(".build/media-runtime"), binary = path.join(cache, "ffprobe"), manifestFile = path.join(cache, "manifest.json");
  await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true });
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    if (manifest.sourceSha256 !== source.sha256 || manifest.binarySha256 !== createHash("sha256").update(await readFile(binary)).digest("hex")) manifest = undefined;
  } catch { /* Build a missing or invalid private cache from verified source. */ }
  if (!manifest) {
    const bytes=await downloadPinnedArtifact({
      urls:["https://ffmpeg.org/releases/ffmpeg-"+source.version+".tar.xz","https://distfiles.macports.org/ffmpeg/ffmpeg-"+source.version+".tar.xz","https://mirrors.omnios.org/ffmpeg/ffmpeg-"+source.version+".tar.xz"],
      sha256:source.sha256,maxBytes:20*1024*1024
    });
    const archive = path.join(cache, "source.tar.xz"), build = path.join(cache, "source");
    await writeFile(archive, bytes); await rm(build, { recursive: true, force: true }); await mkdir(build, { recursive: true });
    await execute("tar", ["-xJf", archive, "--strip-components=1", "-C", build], { timeout: 60000 });
    // No networking, devices, shell helpers or external codec libraries are
    // compiled into the private metadata reader. Runtime also forces its format
    // and file/pipe protocol whitelist with bounded probe/time/memory budgets.
    const flags = ["--disable-everything", "--disable-autodetect", "--disable-network", "--disable-doc", "--disable-debug", "--disable-x86asm", "--disable-programs", "--enable-ffprobe", "--enable-protocol=file,pipe", "--enable-demuxer=mov,matroska,mp3,wav,ogg", "--enable-parser=aac,ac3,av1,flac,h264,hevc,mpeg4video,mpegaudio,opus,vorbis,vp8,vp9", "--enable-decoder=aac,ac3,av1,flac,h264,hevc,mp3,mpeg4,opus,pcm_s16le,vorbis,vp8,vp9", "--extra-cflags=-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2", "--extra-ldflags=-Wl,-z,relro,-z,now"];
    // The compiler gets no application credentials or runtime provider keys.
    const childEnv = { PATH: process.env.PATH, LANG: "C" };
    await execute(path.join(build, "configure"), flags, { cwd: build, env: childEnv, timeout: 120000, maxBuffer: 2097152 });
    await execute("make", ["-j2", "ffprobe"], { cwd: build, env: childEnv, timeout: 900000, maxBuffer: 8 * 1024 * 1024 });
    await cp(path.join(build, "ffprobe"), binary); await chmod(binary, 0o755);
    const version = (await execute(binary, ["-version"], { env: childEnv, timeout: 10000 })).stdout.split("\n")[0];
    if (!version.startsWith("ffprobe version " + source.version) || (await stat(binary)).size > 40 * 1024 * 1024) throw Error("Media tool validation failed.");
    manifest = { version, sourceSha256: source.sha256, binarySha256: createHash("sha256").update(await readFile(binary)).digest("hex"), builtAt: new Date().toISOString() };
    await writeFile(manifestFile, JSON.stringify(manifest) + "\n");
    await rm(build, { recursive: true, force: true }); await rm(archive);
  }
  await cp(binary, path.join(output, "ffprobe")); await chmod(path.join(output, "ffprobe"), 0o755);
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest) + "\n");
  console.info(JSON.stringify({ mediaToolPrepared: true, version: manifest.version }));
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepareServerlessMedia();
