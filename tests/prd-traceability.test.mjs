import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  validatePrdTestPlan,
  validateMandatoryTestRanges,
} from "../scripts/check-prd-traceability.mjs";
import { prdTestCases } from "../scripts/lib/prd-test-plan.mjs";
const inventory = JSON.parse(
  await readFile(
    new URL("../.docs/phase0/requirements.json", import.meta.url),
    "utf8",
  ),
);
describe("reviewed PRD test traceability", () => {
  it("maps all 146 explicit requirements to real test-source files without marking acceptance", async () => {
    const map = await validatePrdTestPlan(inventory, prdTestCases);
    expect(map.size).toBe(146);
    expect(prdTestCases.every((c) => c.acceptance === "unverified")).toBe(true);
    expect(
      inventory.requirements.every((row) => row.status === "unverified"),
    ).toBe(true);
  });
  it("rejects unknown/duplicate/out-of-range cases, missing requirements and fabricated acceptance", async () => {
    const testCase = {
        id: "AUTH-TEST-001",
        requirements: ["AUTH-001"],
        scope: "Fictional scope",
        automated: [],
        remaining: ["Manual review"],
        acceptance: "unverified",
      },
      input = { requirements: [{ id: "AUTH-001" }] };
    for (const cases of [
      [],
      [{ ...testCase, id: "AUTH-TEST-021" }],
      [testCase, testCase],
      [{ ...testCase, acceptance: "passed" }],
      [{ ...testCase, requirements: ["FAKE-001"] }],
      [{ ...testCase, remaining: [] }],
    ])
      await expect(validatePrdTestPlan(input, cases)).rejects.toThrow();
  });
  it("does not accept missing or escaping test-source references", async () => {
    const c = {
      ...prdTestCases[0],
      automated: ["scripts/../../.env.server.local"],
    };
    await expect(validatePrdTestPlan(inventory, [c])).rejects.toThrow(
      "Invalid test source",
    );
    await expect(
      validatePrdTestPlan(inventory, prdTestCases, {
        exists: async () => {
          throw Error("Missing source");
        },
      }),
    ).rejects.toThrow("Missing source");
  });
  it("refuses a catalog with an unmapped mandatory test even when requirement mapping survives", () => {
    expect(() => validateMandatoryTestRanges(prdTestCases)).not.toThrow();
    expect(() =>
      validateMandatoryTestRanges(
        prdTestCases.filter((row) => row.id !== "OPS-TEST-015"),
      ),
    ).toThrow("Unmapped mandatory test IDs: OPS-TEST-015");
    const physicalPush = prdTestCases.find((row) => row.id === "PWA-TEST-019");
    expect(physicalPush?.automated).toEqual([]);
    expect(physicalPush?.acceptance).toBe("unverified");
    expect(physicalPush?.remaining.join(" ")).toContain(
      "Physical installed-device",
    );
  });
});
