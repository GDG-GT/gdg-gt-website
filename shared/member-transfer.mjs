import { z } from "zod";
import { communityMemberRecord, memberCategories } from "./members.mjs";
export const memberCsvColumns = ["name", "email", "phone", "year", "major", "category", "interests", "is_active", "is_core_team", "team_section"];
export const memberImportTemplate = "\uFEFF" + memberCsvColumns.join(",") + "\r\nFictional Person,person@example.test,,,,member,\"[\"\"Cloud\"\",\"\"Web\"\"]\",true,false,Active Members\r\n";
const metadata = ["id", "team_id", "revision", "reference"];
export const memberTransferFilters = z.object({
  q: z.string().trim().max(100).default(""), state: z.enum(["current", "trash"]).default("current"),
  category: z.enum(memberCategories).optional(), year: z.string().trim().max(50).optional(),
  active: z.boolean().optional(), core: z.boolean().optional(),
}).strict();
export const memberExportInput = z.object({ filters: memberTransferFilters.default({}), includePrivate: z.boolean().default(false) }).strict();
export const memberImportInput = z.object({ teamId: z.string().uuid().nullable(), rows: z.array(communityMemberRecord).min(1).max(200) }).strict()
  .refine((v) => new Set(v.rows.map((r) => r.email)).size === v.rows.length, "Remove duplicate emails from the import.");
export const memberImportCommit = z.object({ document: memberImportInput, reviewId: z.string().uuid(),
  reviewToken: z.string().regex(/^[a-zA-Z0-9_-]{43}$/), confirmation: z.string().max(40), currentPassword: z.string().min(1).max(1024) }).strict();

// RFC-4180-style quoted cells, including escaped quotes and embedded newlines.
// Bound the entire input before parsing, and reject malformed trailing text.
function cells(source) {
  if (new TextEncoder().encode(source).length > 1048576) throw Error("Choose a CSV file no larger than 1 MiB.");
  source = source.replace(/^\uFEFF/, "");
  const result = []; let row = [], value = "", quoted = false, closed = false, line = 1, start = 1;
  const cell = () => { row.push(value); value = ""; closed = false; if (row.length > 25) throw Error("The CSV has too many columns."); };
  const finish = () => { cell(); if (row.some((v) => v.trim())) result.push({ cells: row, line: start }); row = []; start = line + 1; if (result.length > 201) throw Error("Import at most 200 member rows per batch."); };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') { if (source[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else { value += c; if (c === "\n") line++; }
    } else if (c === ",") cell();
    else if (c === "\n" || c === "\r") { if (c === "\r" && source[i + 1] === "\n") i++; finish(); line++; }
    else if (c === '"') { if (value || closed) throw Error(`Unexpected quote near line ${line}.`); quoted = true; }
    else { if (closed) throw Error(`Unexpected text after a quoted cell near line ${line}.`); value += c; }
  }
  if (quoted) throw Error("A quoted CSV cell is not closed.");
  if (row.length || value || closed) finish();
  return result;
}
export function parseMemberCsv(source) {
  const parsed = cells(source);
  if (parsed.length < 2) throw Error("Include a header and at least one member row.");
  const headers = parsed.shift().cells.map((v) => v.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || headers.some((h) => !memberCsvColumns.includes(h) && !metadata.includes(h)))
    throw Error("Use the template column names, without duplicate or unknown columns.");
  if (!headers.includes("name") || !headers.includes("email")) throw Error("The CSV needs name and email columns.");
  const rows = [], errors = [], seen = new Set();
  for (const record of parsed) {
    if (record.cells.length !== headers.length) { errors.push({ line: record.line, message: "The number of cells does not match the header." }); continue; }
    const value = Object.fromEntries(headers.filter((h) => !metadata.includes(h)).map((h) => [h, record.cells[headers.indexOf(h)].trim()]));
    try {
      for (const key of Object.keys(value)) if (value[key] === "" && key !== "name" && key !== "email") delete value[key];
      for (const key of ["is_active", "is_core_team"]) if (value[key] !== undefined) {
        const v = value[key].toLowerCase(); if (!["true", "false", "yes", "no", "1", "0"].includes(v)) throw Error(`${key} must be true or false.`);
        value[key] = ["true", "yes", "1"].includes(v);
      }
      if (value.interests) { try { value.interests = JSON.parse(value.interests); } catch { throw Error("interests must be a JSON array, as shown in the template."); } }
      const valid = communityMemberRecord.safeParse(value);
      if (!valid.success) throw Error("Check " + [...new Set(valid.error.issues.map((i) => i.path[0]))].join(", ") + ".");
      if (seen.has(valid.data.email)) throw Error("This email is repeated in the CSV.");
      seen.add(valid.data.email); rows.push(valid.data);
    } catch (e) { errors.push({ line: record.line, message: e.message }); }
  }
  return { rows, errors, ignoredColumns: headers.filter((h) => metadata.includes(h)) };
}
