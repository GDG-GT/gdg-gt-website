import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { formExportInput, exportJobDto } from "../../server/form-exports.mjs";
import { flattenExportResponse, createExportBytes, runFormExportWorker } from "../../server/form-export-worker.mjs";
const id = "d0000000-0000-4000-8000-000000000001";
const row = { formId: id, responseId: id, version: 2, submittedAt: "2026-10-21T00:00:00Z", completionState: "complete", answers: { [id]: { label: "Original label", value: "=SUM(1,2)" } } };
describe("private background Forms exports", () => {
  it("denies unknown ownership, forged artifact paths, malformed selections and reversed dates", () => {
    for (const body of [
      { format: "csv", ownerId: id }, { format: "csv", objectKey: "private" },
      { format: "csv", filters: { selected: ["bad"] } },
      { format: "csv", filters: { from: "2026-10-22T00:00:00Z", to: "2026-10-21T00:00:00Z" } },
      { format: "csv", sensitive: "true" }, { format: "html" },
    ]) expect(formExportInput.safeParse(body).success).toBe(false);
    expect(formExportInput.parse({ format: "json" }).sensitive).toBe(false);
  });
  it("flattens immutable-version labels with stable identity and preserves raw JSON values", () => {
    const flat = flattenExportResponse(row);
    expect(flat[`Original label [${id}] v2`]).toBe("=SUM(1,2)");
    expect(JSON.parse(createExportBytes("json", [flat]).toString())[0].version).toBe(2);
  });
  it("makes formula-safe CSV and literal-cell XLSX with no executable spreadsheet cells", () => {
    const flat = flattenExportResponse(row);
    expect(createExportBytes("csv", [flat]).toString()).toContain("'=SUM(1,2)");
    const files = unzipSync(createExportBytes("xlsx", [flat]));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("&apos;=SUM(1,2)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("Original label");
  });
  it("never serializes job sessions, filters, source snapshots or storage paths to browsers", () => {
    const projected = exportJobDto({ id, state: "ready", format: "csv", expires_at: "2020-01-01T00:00:00Z", filters: { q: "private" }, session_id: "secret", private_object_key: "private", checksum: "hash" });
    expect(projected.state).toBe("expired");
    expect(JSON.stringify(projected)).not.toMatch(/secret|private|hash|filters|session_id|object_key/);
  });
  it("rejects an overlong Excel cell instead of silently truncating the answer", () => {
    expect(() => createExportBytes("xlsx", [{ answer: "x".repeat(32768) }])).toThrow("Excel's text limit");
    expect(JSON.parse(createExportBytes("json", [{ answer: "x".repeat(32768) }]).toString())[0].answer).toHaveLength(32768);
  });
  it("does not delete a ready artifact when promotion committed but its response was lost", async () => {
    const calls = [], deleted = [];
    const db = { rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === "claim_form_exports") return { data: [{ id, lease_token: id, format: "csv", response_count: 1 }] };
      if (name === "read_form_export_batch") return { data: [row] };
      if (name === "finish_form_export" && !args.p_error) throw Error("connection lost after commit");
      if (name === "finish_form_export") return { data: false };
      if (name === "claim_form_export_cleanup") return { data: [] };
      throw Error("unexpected call");
    } };
    const storage = { put: async () => {}, delete: async (...args) => deleted.push(args) };
    const result = await runFormExportWorker({ db, storage });
    expect(result.retried).toBe(1);
    expect(deleted).toEqual([]);
    expect(calls.filter(([name]) => name === "finish_form_export")).toHaveLength(2);
  });
});
