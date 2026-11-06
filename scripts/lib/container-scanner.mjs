import { fileURLToPath } from "node:url";
import { dockerCommand } from "./disposable-postgres.mjs";
import { scannerHealth } from "../../server/lib/scanner.mjs";
const name = "gdg-gt-scanner-local",
  purpose = "gdg-gt-private-upload-scanner",
  volume = "gdg-gt-scanner-signatures",
  image =
    "clamav/clamav:1.5.4@sha256:6d87c712e3391e13c1ba6e05dfb074d4b1ddb5a6834b23bb9da990d2a4ef042a";
const checked = async (args) => {
  const r = await dockerCommand(args);
  if (r.code !== 0)
    throw Error(
      "Local scanner container operation failed; see the verified local runtime prerequisites.",
    );
  return r.stdout.trim();
};
export async function containerScanner(action) {
  if (!["start", "update"].includes(action))
    throw Error("Use start or update.");
  const inspected = await dockerCommand([
    "inspect",
    name,
    "--format",
    '{{index .Config.Labels "dev.gdggt.purpose"}}|{{.State.Status}}',
  ]);
  if (inspected.code === 0 && !inspected.stdout.startsWith(purpose + "|"))
    throw Error("Refusing an unrelated container with the scanner name.");
  if (action === "update") {
    if (inspected.code !== 0 || !inspected.stdout.includes("|running"))
      throw Error("Start the local scanner before requesting an update.");
    await checked([
      "exec",
      name,
      "freshclam",
      "--config-file=/etc/clamav/freshclam.conf",
    ]);
    await checked([
      "exec",
      name,
      "clamdscan",
      "--config-file=/etc/clamav/clamd.conf",
      "--reload",
    ]);
    console.info(
      "Updated verified local scanner signatures; reload requested.",
    );
    return;
  }
  if (inspected.code !== 0) {
    const foundVolume = await dockerCommand([
      "volume",
      "inspect",
      volume,
      "--format",
      '{{index .Labels "dev.gdggt.purpose"}}',
    ]);
    if (foundVolume.code === 0 && foundVolume.stdout.trim() !== purpose)
      throw Error("Refusing an unrelated scanner volume.");
    if (foundVolume.code !== 0)
      await checked([
        "volume",
        "create",
        "--label",
        "dev.gdggt.purpose=" + purpose,
        volume,
      ]);
    await checked([
      "run",
      "-d",
      "--platform",
      "linux/amd64",
      "--name",
      name,
      "--label",
      "dev.gdggt.purpose=" + purpose,
      "--memory",
      "3g",
      "--cpus",
      "2",
      "--pids-limit",
      "128",
      "--publish",
      "127.0.0.1:13310:3310",
      "--mount",
      `type=volume,source=${volume},target=/var/lib/clamav`,
      "--mount",
      `type=bind,source=${fileURLToPath(new URL("../../infra/scanner/clamd-container.conf", import.meta.url))},target=/etc/clamav/clamd.conf,readonly`,
      "--mount",
      `type=bind,source=${fileURLToPath(new URL("../../infra/scanner/freshclam-container.conf", import.meta.url))},target=/etc/clamav/freshclam.conf,readonly`,
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      "freshclam --config-file=/etc/clamav/freshclam.conf && exec clamd --config-file=/etc/clamav/clamd.conf --foreground",
    ]);
  } else if (!inspected.stdout.includes("|running"))
    await checked(["start", name]);
  console.info(
    "Local-only scanner container is starting; signature verification remains enabled.",
  );
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const health = await scannerHealth();
      console.info(
        "Local scanner ready: " +
          health.version +
          ", signature version " +
          health.signatureVersion,
      );
      return;
    } catch {
      const state = await checked([
        "inspect",
        name,
        "--format",
        "{{.State.Status}}",
      ]);
      if (state !== "running")
        throw Error(
          "Local scanner stopped before readiness; inspect its project-owned container log.",
        );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw Error(
    "Local scanner readiness is not confirmed. No application upload guard was changed.",
  );
}
