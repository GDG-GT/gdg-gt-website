import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const { docker, health } = vi.hoisted(() => ({
  docker: vi.fn(),
  health: vi.fn(),
}));
vi.mock("../../scripts/lib/disposable-postgres.mjs", () => ({
  dockerCommand: docker,
}));
vi.mock("../../server/lib/scanner.mjs", () => ({ scannerHealth: health }));
import { containerScanner } from "../../scripts/lib/container-scanner.mjs";
const purpose = "gdg-gt-private-upload-scanner";
beforeEach(() => {
  docker.mockReset();
  health.mockReset();
  health.mockResolvedValue({
    version: "ClamAV fictional",
    signatureVersion: "fictional-current",
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("Dedicated local scanner ownership and signature verification", () => {
  it("refuses an unknown action before touching Docker", async () => {
    await expect(containerScanner("remove")).rejects.toThrow(
      "Use start or update",
    );
    expect(docker).not.toHaveBeenCalled();
  });
  it("refuses another container's name without starting, stopping or executing in it", async () => {
    docker.mockResolvedValue({ code: 0, stdout: "unrelated-purpose|running" });
    await expect(containerScanner("start")).rejects.toThrow(
      "unrelated container",
    );
    expect(docker).toHaveBeenCalledTimes(1);
  });
  it("reuses its running scanner without resetting signatures or restarting other services", async () => {
    docker.mockResolvedValue({ code: 0, stdout: purpose + "|running" });
    await containerScanner("start");
    expect(docker).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(1);
  });
  it("refuses a foreign signature volume even when no scanner container exists", async () => {
    docker
      .mockResolvedValueOnce({ code: 1, stdout: "" })
      .mockResolvedValueOnce({ code: 0, stdout: "foreign-volume" });
    await expect(containerScanner("start")).rejects.toThrow(
      "unrelated scanner volume",
    );
    expect(docker).toHaveBeenCalledTimes(2);
  });
  it("creates only a pinned resource-bounded scanner with a loopback-only port and persistent owned signatures", async () => {
    docker
      .mockResolvedValue({ code: 0, stdout: "owned" })
      .mockResolvedValueOnce({ code: 1, stdout: "" })
      .mockResolvedValueOnce({ code: 1, stdout: "" });
    await containerScanner("start");
    const args = docker.mock.calls.find(([args]) => args[0] === "run")[0];
    expect(args).toEqual(
      expect.arrayContaining([
        "--platform",
        "linux/amd64",
        "--publish",
        "127.0.0.1:13310:3310",
        "--memory",
        "3g",
        "--cpus",
        "2",
        "dev.gdggt.purpose=" + purpose,
      ]),
    );
    expect(args.find((value) => value.startsWith("clamav/clamav:"))).toMatch(
      /@sha256:[a-f0-9]{64}$/,
    );
    expect(args.join(" ")).toContain(
      "freshclam --config-file=/etc/clamav/freshclam.conf && exec clamd",
    );
    expect(args.join(" ")).not.toMatch(
      /TestDatabases no|privileged|network.host|disable.*verif|clamd.*127.0.0.1:3310/,
    );
    expect(
      docker.mock.calls.some(([args]) =>
        ["rm", "prune", "stop"].includes(args[0]),
      ),
    ).toBe(false);
  });
  it("restarts only an existing verified stopped scanner", async () => {
    docker
      .mockResolvedValue({ code: 0, stdout: "" })
      .mockResolvedValueOnce({ code: 0, stdout: purpose + "|exited" });
    await containerScanner("start");
    expect(docker.mock.calls[1][0]).toEqual(["start", "gdg-gt-scanner-local"]);
  });
  it("requires a running owned scanner for updates", async () => {
    docker.mockResolvedValue({ code: 0, stdout: purpose + "|exited" });
    await expect(containerScanner("update")).rejects.toThrow(
      "Start the local scanner",
    );
    expect(docker).toHaveBeenCalledTimes(1);
  });
  it("updates verified signatures and requests an engine reload without changing verification or application state", async () => {
    docker
      .mockResolvedValue({ code: 0, stdout: "" })
      .mockResolvedValueOnce({ code: 0, stdout: purpose + "|running" });
    await containerScanner("update");
    expect(docker.mock.calls.slice(1).map(([args]) => args)).toEqual([
      [
        "exec",
        "gdg-gt-scanner-local",
        "freshclam",
        "--config-file=/etc/clamav/freshclam.conf",
      ],
      [
        "exec",
        "gdg-gt-scanner-local",
        "clamdscan",
        "--config-file=/etc/clamav/clamd.conf",
        "--reload",
      ],
    ]);
  });
  it("reports failed update without falsely requesting reload or claiming readiness", async () => {
    docker
      .mockResolvedValueOnce({ code: 0, stdout: purpose + "|running" })
      .mockResolvedValueOnce({ code: 1, stdout: "" });
    await expect(containerScanner("update")).rejects.toThrow(
      "operation failed",
    );
    expect(docker).toHaveBeenCalledTimes(2);
    expect(health).not.toHaveBeenCalled();
  });
});
