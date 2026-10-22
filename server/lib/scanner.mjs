import net from "node:net";
import { ApiError } from "./http.mjs";
import { timeDependency } from "./telemetry.mjs";
function endpoint(env = process.env) {
  const host = env.CLAMD_HOST || "127.0.0.1",
    port = Number(env.CLAMD_PORT || 13310);
  if (
    !/^(127\.0\.0\.1|localhost|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9.-]+\.internal)$/.test(
      host,
    ) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new ApiError(
      503,
      "SCANNER_UNAVAILABLE",
      "The private upload scanner is unavailable.",
    );
  return { host, port };
}
async function command(name, bytes, env) {
  const { host, port } = endpoint(env);
  return timeDependency(
    "scanner",
    () =>
      new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port }),
          chunks = [];
        let size = 0,
          settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          error ? reject(error) : resolve(value);
        };
        const unavailable = () =>
          new ApiError(
            503,
            "SCANNER_UNAVAILABLE",
            "The private upload scanner is unavailable.",
          );
        socket.setTimeout(65000, () => finish(unavailable()));
        socket.on("error", () => finish(unavailable()));
        socket.on("end", () => {
          if (!settled) finish(unavailable());
        });
        socket.on("data", (chunk) => {
          size += chunk.length;
          if (size > 4096) {
            finish(unavailable());
            return;
          }
          chunks.push(chunk);
          const response = Buffer.concat(chunks).toString("utf8");
          if (response.includes("\0") || response.includes("\n"))
            finish(null, response.replace(/[\0\r\n]+$/, ""));
        });
        socket.once("connect", async () => {
          try {
            const write = (data) =>
              new Promise((done, fail) => {
                socket.write(data, (error) => (error ? fail(error) : done()));
              });
            await write(Buffer.from("z" + name + "\0"));
            if (bytes) {
              for (let offset = 0; offset < bytes.length; offset += 65536) {
                const part = bytes.subarray(offset, offset + 65536),
                  header = Buffer.alloc(4);
                header.writeUInt32BE(part.length);
                await write(header);
                await write(part);
              }
              await write(Buffer.alloc(4));
            }
          } catch {
            finish(unavailable());
          }
        });
      }),
  );
}
export async function scannerHealth(env = process.env) {
  const version = await command("VERSION", null, env);
  if (!String(version).startsWith("ClamAV "))
    throw new ApiError(
      503,
      "SCANNER_UNAVAILABLE",
      "The private upload scanner is unavailable.",
    );
  const build = Date.parse(String(version).split("/").slice(2).join("/"));
  if (!Number.isFinite(build) || Date.now() - build > 72 * 3600000)
    throw new ApiError(
      503,
      "SCANNER_STALE",
      "The scanner signature database needs an update.",
    );
  return {
    ready: true,
    version: String(version).split("/")[0],
    signatureVersion: String(version).split("/")[1],
  };
}
export async function scanBuffer(bytes, env = process.env) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 262144000)
    throw new ApiError(400, "INVALID_UPLOAD", "This file cannot be scanned.");
  await scannerHealth(env);
  const reply = await command("INSTREAM", bytes, env);
  if (reply === "stream: OK") return { clean: true };
  if (/^stream: .+ FOUND$/.test(String(reply)))
    return { clean: false, code: "MALWARE_DETECTED" };
  throw new ApiError(
    503,
    "SCANNER_UNAVAILABLE",
    "The private upload scanner could not complete this scan.",
  );
}
