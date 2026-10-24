import { readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prdTestCases, requirementOverrides } from "./lib/prd-test-plan.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const ranges = {
  AUTH: 20,
  SEC: 30,
  EVT: 25,
  TEAM: 25,
  COMM: 20,
  FIN: 20,
  NEWS: 20,
  CONTENT: 20,
  FORM: 40,
  PRIVATE: 10,
  PWA: 20,
  A11Y: 20,
  VIS: 22,
  OPS: 15,
};
export async function validatePrdTestPlan(
  inventory,
  cases,
  {
    exists = async (file) => {
      await access(path.join(root, file));
    },
  } = {},
) {
  const expected = new Set(inventory.requirements.map((row) => row.id)),
    seen = new Set(),
    mapping = new Map();
  for (const c of cases) {
    const match = c.id?.match(/^([A-Z][A-Z0-9]+)-TEST-(\d{3})$/),
      n = Number(match?.[2]);
    if (
      !match ||
      !ranges[match[1]] ||
      n < 1 ||
      n > ranges[match[1]] ||
      seen.has(c.id)
    )
      throw Error("Invalid or duplicate test case ID");
    seen.add(c.id);
    if (
      !c.scope?.trim() ||
      c.acceptance !== "unverified" ||
      !Array.isArray(c.remaining) ||
      !c.remaining.length ||
      !Array.isArray(c.automated) ||
      !Array.isArray(c.requirements) ||
      (!c.requirements.length && !c.normative?.length)
    )
      throw Error("Test plan cannot imply unearned acceptance");
    if (
      c.normative &&
      (!Array.isArray(c.normative) ||
        c.normative.some((section) => !/^\d+(?:\.\d+)*$/.test(section)))
    )
      throw Error("Invalid normative section reference");
    for (const file of c.automated) {
      if (
        !/^(?:tests\/|src\/ui\/|database\/tests\/|scripts\/)[A-Za-z0-9_./-]+\.(?:tsx?|mjs|sql)$/.test(
          file,
        ) ||
        file.split("/").includes("..")
      )
        throw Error("Invalid test source reference");
      await exists(file);
    }
    for (const id of c.requirements) {
      if (!expected.has(id))
        throw Error("Unknown PRD requirement in test plan");
      const ids = mapping.get(id) || [];
      if (ids.includes(c.id)) throw Error("Duplicate requirement mapping");
      mapping.set(id, [...ids, c.id]);
    }
  }
  const missing = [...expected].filter((id) => !mapping.has(id));
  if (missing.length)
    throw Error("Unmapped PRD requirements: " + missing.join(", "));
  return mapping;
}
export async function checkPrdTraceability({
  write = false,
  release = false,
} = {}) {
  const trackerPath = path.join(root, ".docs/phase0/requirements.json"),
    inventory = JSON.parse(await readFile(trackerPath, "utf8")),
    prd = await readFile(path.join(root, inventory.prd), "utf8");
  if (createHash("sha256").update(prd).digest("hex") !== inventory.prdSha256)
    throw Error(
      "PRD changed; review the requirement inventory before mapping tests",
    );
  const mapping = await validatePrdTestPlan(inventory, prdTestCases);
  const plan = {
    prd: inventory.prd,
    prdSha256: inventory.prdSha256,
    note: "Reviewed test-source mapping only. Source references are not executed evidence or acceptance. Every requirement remains unverified until its full definition of done, normative sections and phase gates pass.",
    cases: prdTestCases,
    userOverrides: requirementOverrides,
  };
  const requirements = inventory.requirements.map((row) => ({
    ...row,
    testIds: mapping.get(row.id),
    ...(requirementOverrides[row.id]
      ? { userOverride: requirementOverrides[row.id] }
      : {}),
  }));
  if (write) {
    await writeFile(
      trackerPath,
      JSON.stringify({ ...inventory, requirements }, null, 2) + "\n",
    );
    await writeFile(
      path.join(root, ".docs/phase0/prd-test-plan.json"),
      JSON.stringify(plan, null, 2) + "\n",
    );
  } else {
    for (const row of inventory.requirements)
      if (JSON.stringify(row.testIds) !== JSON.stringify(mapping.get(row.id)))
        throw Error("Stored requirement mapping is stale: " + row.id);
    const stored = JSON.parse(
      await readFile(
        path.join(root, ".docs/phase0/prd-test-plan.json"),
        "utf8",
      ),
    );
    if (JSON.stringify(stored) !== JSON.stringify(plan))
      throw Error("Stored test plan is stale");
  }
  const pending = requirements.filter((row) => row.status !== "verified");
  console.info(
    `${requirements.length} requirements mapped to ${prdTestCases.length} reviewed logical cases; ${pending.length} remain unverified. This check does not execute feature tests or approve release.`,
  );
  if (release && pending.length)
    throw Error("Release blocked: unverified PRD acceptance remains");
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !["--write", "--release"].includes(flag)))
    throw Error("Unknown traceability option");
  await checkPrdTraceability({
    write: flags.includes("--write"),
    release: flags.includes("--release"),
  });
}
