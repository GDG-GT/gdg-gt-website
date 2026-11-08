import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { userInfo } from "node:os";
import { readFile, writeFile, mkdir, rm, cp, readdir, stat, chmod } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rootCertificates } from "node:tls";

const execute = promisify(execFile);
const vendor = {
  version: "1.5.4",
  url: "https://github.com/Cisco-Talos/clamav/releases/download/clamav-1.5.4/clamav-1.5.4.linux.x86_64.deb",
  sha256: "28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886",
  bytes: 105819396,
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function scannerDebPayload(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 8).toString() !== "!<arch>\n") throw Error("Invalid vendor archive.");
  let payload;
  for (let offset = 8; offset < bytes.length;) {
    const header = bytes.subarray(offset, offset + 60).toString("ascii");
    if (header.length !== 60 || header.slice(58) !== "`\n" || !/^\d+\s*$/.test(header.slice(48, 58))) throw Error("Invalid vendor archive header.");
    const size = Number(header.slice(48, 58).trim()), end = offset + 60 + size;
    if (!Number.isSafeInteger(size) || size < 0 || end > bytes.length) throw Error("Truncated vendor archive.");
    if (header.slice(0, 16).trim().replace(/\/$/, "") === "data.tar.gz") {
      if (payload) throw Error("Ambiguous vendor archive payload.");
      payload = bytes.subarray(offset + 60, end);
    }
    offset = end + size % 2;
  }
  if (!payload || payload[0] !== 0x1f || payload[1] !== 0x8b) throw Error("Vendor archive payload missing.");
  return payload;
}

export async function prepareServerlessScanner() {
  if (process.platform !== "linux" || process.arch !== "x64") throw Error("Build the production scanner on Linux x64; local scanner tests use their isolated container.");
  const output = path.resolve(".build/scanner"), runtime = path.join(output, "runtime"),
    tools = path.join(output, "build-tools"), cache = path.resolve("node_modules/.cache/gdg-scanner"),
    archive = path.join(cache, "clamav-" + vendor.version + ".deb");
  await mkdir(cache, { recursive: true });
  let bytes;
  try { bytes = await readFile(archive); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!bytes || bytes.length !== vendor.bytes || digest(bytes) !== vendor.sha256) {
    const response = await fetch(vendor.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || Number(response.headers.get("content-length") || 0) > vendor.bytes) throw Error("Verified scanner download unavailable.");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== vendor.bytes || digest(bytes) !== vendor.sha256) throw Error("Scanner publisher checksum mismatch.");
    await writeFile(archive, bytes);
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(tools, { recursive: true });
  const payload = path.join(tools, "data.tar.gz");
  await writeFile(payload, scannerDebPayload(bytes));
  bytes = undefined;
  // Only the fixed files in the checksum-pinned publisher package are extracted.
  await execute("tar", ["-xzf", payload, "-C", tools,
    "./usr/local/bin/clamscan", "./usr/local/bin/freshclam", "./usr/local/sbin/clamd",
    "./usr/local/etc/certs/clamav.crt", "./usr/local/lib"], { timeout: 120000 });
  await rm(payload);
  const library = path.join(tools, "usr/local/lib"), bin = path.join(runtime, "bin"),
    lib = path.join(runtime, "lib"), definitions = path.join(runtime, "definitions"),
    certs = path.join(runtime, "certs");
  for (const directory of [bin, lib, definitions, certs]) await mkdir(directory, { recursive: true });
  for (const [source, target] of [["bin/clamscan", "clamscan"], ["sbin/clamd", "clamd"]]) {
    await cp(path.join(tools, "usr/local", source), path.join(bin, target));
    await chmod(path.join(bin, target), 0o755);
  }
  for (const filename of await readdir(library)) {
    if (/^lib(?:clamav|clammspack|clamunrar(?:_iface)?)\.so(?:\.\d+)*$/.test(filename))
      await cp(path.join(library, filename), path.join(lib, filename), { verbatimSymlinks: true });
  }
  await cp(path.join(tools, "usr/local/etc/certs/clamav.crt"), path.join(certs, "clamav.crt"));
  const cachedDefinitions = path.join(cache, "definitions");
  try { await cp(cachedDefinitions, definitions, { recursive: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const caCandidates = ["/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt", "/etc/ssl/cert.pem"];
  let ca;
  for (const candidate of caCandidates) { try { if ((await stat(candidate)).isFile()) { ca = candidate; break; } } catch { /* Try the next standard trust store. */ } }
  if (!ca) {
    // Minimal build containers can omit the OS CA package. Use the same
    // publisher-maintained roots bundled with Node's verified HTTPS client.
    if (!rootCertificates.length) throw Error("A verified TLS trust store is required for signature updates.");
    ca = path.join(tools, "node-ca.pem");
    await writeFile(ca, rootCertificates.join("\n") + "\n");
  }
  const config = path.join(tools, "freshclam.conf");
  await writeFile(config, `DatabaseDirectory ${definitions}\nCVDCertsDirectory ${certs}\nDatabaseOwner ${userInfo().username}\nDatabaseMirror database.clamav.net\nConnectTimeout 15\nReceiveTimeout 90\nMaxAttempts 2\nTestDatabases yes\nScriptedUpdates yes\nCompressLocalDatabase yes\n`);
  const childEnv = { PATH: process.env.PATH, LD_LIBRARY_PATH: library, CURL_CA_BUNDLE: ca, SSL_CERT_FILE: ca, CVD_CERTS_DIR: certs };
  await execute(path.join(tools, "usr/local/bin/freshclam"), ["--config-file=" + config, "--stdout"], { env: childEnv, timeout: 300000, maxBuffer: 1048576 });
  const version = await execute(path.join(bin, "clamscan"), ["--version", "--database=" + definitions, "--cvdcertsdir=" + certs], { env: { ...childEnv, LD_LIBRARY_PATH: lib }, timeout: 30000 });
  const text = version.stdout.trim(), date = Date.parse(text.split("/").slice(2).join("/"));
  if (!text.startsWith("ClamAV " + vendor.version + "/") || !Number.isFinite(date) || Date.now() - date > 72 * 3600000) throw Error("Fresh publisher-verified scanner definitions are required.");
  await rm(cachedDefinitions, { recursive: true, force: true });
  await cp(definitions, cachedDefinitions, { recursive: true });
  let total = 0;
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = path.join(directory, entry.name);
      if (entry.isDirectory()) { await chmod(name, 0o755); await walk(name); }
      else if (!entry.isSymbolicLink()) { total += (await stat(name)).size; if (!name.startsWith(bin + path.sep)) await chmod(name, 0o644); }
    }
  };
  await walk(runtime);
  if (total > 210 * 1024 * 1024) throw Error("Private scanner artifacts exceed their function packaging budget.");
  const manifest = { vendorVersion: vendor.version, vendorArchiveSha256: vendor.sha256, version: text, bytes: total, builtAt: new Date().toISOString() };
  await writeFile(path.join(runtime, "manifest.json"), JSON.stringify(manifest) + "\n");
  await rm(tools, { recursive: true, force: true });
  console.info(JSON.stringify({ scannerPrepared: true, version: text, bytes: total }));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await prepareServerlessScanner();
