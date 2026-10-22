import { afterEach, describe, it, expect, vi } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import { scannerHealth, scanBuffer } from "../../server/lib/scanner.mjs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const currentVersion = () =>
  "ClamAV fictional-unit/12345/" + new Date().toUTCString() + "\0";
// This is an isolated protocol peer, not a malware engine. Actual ClamAV/EICAR
// integration is covered by the separate local scanner/upload suites.
async function protocolFixture(
  run,
  reply = "stream: OK\0",
  version = currentVersion(),
) {
  const sockets = new Set(),
    captured = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let received = Buffer.alloc(0),
      kind,
      offset = 0,
      parts = [],
      sizes = [],
      replied = false;
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (!kind) {
        const end = received.indexOf(0);
        if (end < 0) return;
        kind = received.subarray(0, end).toString();
        offset = end + 1;
        if (kind === "zVERSION") {
          captured.push({ kind });
          socket.end(version);
          replied = true;
          return;
        }
      }
      if (replied) return;
      while (received.length - offset >= 4) {
        const size = received.readUInt32BE(offset);
        if (received.length - offset < 4 + size) return;
        offset += 4;
        if (!size) {
          captured.push({ kind, bytes: Buffer.concat(parts), sizes });
          socket.end(reply);
          replied = true;
          return;
        }
        sizes.push(size);
        parts.push(received.subarray(offset, offset + size));
        offset += size;
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const env = {
    CLAMD_HOST: "127.0.0.1",
    CLAMD_PORT: String(server.address().port),
  };
  try {
    return await run(env, captured);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}
function fakeSocket({ writeFailure = false } = {}) {
  const socket = new EventEmitter();
  socket.destroy = vi.fn();
  socket.setTimeout = vi.fn((ms, callback) => {
    socket.expire = callback;
    return socket;
  });
  socket.write = vi.fn((data, callback) => {
    callback(
      writeFailure ? Error("fictional private transport detail") : undefined,
    );
    return true;
  });
  vi.spyOn(net, "createConnection").mockImplementation(() => {
    queueMicrotask(() => socket.emit("connect"));
    return socket;
  });
  return socket;
}
describe("SEC scanner protocol, freshness and fail-closed behavior", () => {
  it("sends the real framed stream in bounded chunks and accepts only a clean scanner verdict", async () => {
    await protocolFixture(async (env, captured) => {
      const bytes = Buffer.alloc(70000, 0x61);
      expect(await scanBuffer(bytes, env)).toEqual({ clean: true });
      expect(captured.map((entry) => entry.kind)).toEqual([
        "zVERSION",
        "zINSTREAM",
      ]);
      expect(captured[1].sizes).toEqual([65536, 4464]);
      expect(captured[1].bytes).toEqual(bytes);
    });
  });
  it("reports detected malware distinctly and refuses unknown scan results", async () => {
    await protocolFixture(
      async (env) =>
        expect(await scanBuffer(Buffer.from("fictional"), env)).toEqual({
          clean: false,
          code: "MALWARE_DETECTED",
        }),
      "stream: Fictional.Signature FOUND\n",
    );
    await protocolFixture(
      async (env) =>
        expect(scanBuffer(Buffer.from("fictional"), env)).rejects.toMatchObject(
          { status: 503, code: "SCANNER_UNAVAILABLE" },
        ),
      "stream: private engine error ERROR\0",
    );
  });
  it("rejects malformed, stale or undated signatures before streaming any file bytes", async () => {
    for (const [version, code] of [
      ["not ClamAV\0", "SCANNER_UNAVAILABLE"],
      ["ClamAV fixture/123/not-a-date\0", "SCANNER_STALE"],
      [
        "ClamAV fixture/123/" +
          new Date(Date.now() - 73 * 3600000).toUTCString() +
          "\0",
        "SCANNER_STALE",
      ],
    ])
      await protocolFixture(
        async (env, captured) => {
          await expect(
            scanBuffer(Buffer.from("fixture"), env),
          ).rejects.toMatchObject({ code });
          expect(captured).toEqual([{ kind: "zVERSION" }]);
        },
        "stream: OK\0",
        version,
      );
  });
  it("bounds scanner replies and rejects incomplete socket closure", async () => {
    await protocolFixture(
      async (env) =>
        expect(scannerHealth(env)).rejects.toMatchObject({
          code: "SCANNER_UNAVAILABLE",
        }),
      "",
      "x".repeat(4097) + "\0",
    );
    await protocolFixture(
      async (env) =>
        expect(scannerHealth(env)).rejects.toMatchObject({
          code: "SCANNER_UNAVAILABLE",
        }),
      "",
      "ClamAV missing terminator",
    );
  });
  it("never connects to an arbitrary public host or invalid port", async () => {
    for (const change of [
      { CLAMD_HOST: "8.8.8.8" },
      { CLAMD_HOST: "evil.example.test" },
      { CLAMD_PORT: "1" },
      { CLAMD_PORT: "65536" },
      { CLAMD_PORT: "1024.5" },
      { CLAMD_PORT: "not-a-port" },
    ])
      await expect(
        scannerHealth({
          CLAMD_HOST: "127.0.0.1",
          CLAMD_PORT: "13310",
          ...change,
        }),
      ).rejects.toMatchObject({ code: "SCANNER_UNAVAILABLE" });
    for (const value of [null, undefined, new Uint8Array(1), Buffer.alloc(0)])
      await expect(scanBuffer(value, {})).rejects.toMatchObject({
        code: "INVALID_UPLOAD",
      });
  });
  it("times out, sanitizes connection errors and settles only once", async () => {
    vi.stubEnv("CLAMD_HOST", "");
    vi.stubEnv("CLAMD_PORT", "");
    const socket = fakeSocket(),
      result = scannerHealth();
    expect(socket.setTimeout.mock.calls[0][0]).toBe(65000);
    socket.expire();
    socket.emit("error", Error("private socket detail"));
    socket.emit("end");
    await expect(result).rejects.toMatchObject({ code: "SCANNER_UNAVAILABLE" });
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
  it("treats command-write errors as unavailable instead of a successful scan", async () => {
    const socket = fakeSocket({ writeFailure: true });
    await expect(scannerHealth({})).rejects.toMatchObject({
      code: "SCANNER_UNAVAILABLE",
    });
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
  it("refuses socket errors without exposing their private diagnostic message", async () => {
    const socket = fakeSocket(),
      result = scannerHealth({});
    socket.emit("error", Error("private diagnostic text"));
    await expect(result).rejects.toMatchObject({
      code: "SCANNER_UNAVAILABLE",
      message: "The private upload scanner is unavailable.",
    });
  });
});
