import { describe, it, expect } from "vitest";
import { parseMemberCsv, memberImportInput, memberExportInput, memberImportTemplate } from "../../shared/member-transfer.mjs";
import { memberCsv } from "../../server/member-transfer.mjs";
describe("community member CSV transfer", () => {
  it("provides a valid downloadable import template", () => {
    const result = parseMemberCsv(memberImportTemplate);
    expect(result.errors).toEqual([]); expect(result.rows).toHaveLength(1);
    expect(result.rows[0].interests).toEqual(["Cloud", "Web"]);
  });
  it("parses UTF-8 BOM, quoted commas, escaped quotes, multiline fields and boolean flags", () => {
    const csv = '\uFEFFname,email,major,interests,is_active\r\n"Fictional, ""Person""", PERSON@EXAMPLE.TEST ,"Computer\nscience","[""Web, AI"",""Cloud""]",yes\r\n';
    const result = parseMemberCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ name: 'Fictional, "Person"', email: "person@example.test", major: "Computer\nscience", interests: ["Web, AI", "Cloud"], is_active: true });
  });
  it("rejects unknown privilege columns, malformed quoting and oversized batches", () => {
    for (const csv of ['name,email,role\nx,x@example.test,admin', 'name,email\n"Unclosed,x@example.test', 'name,email\n"Person"oops,x@example.test',
      'name,email\n' + Array.from({ length: 201 }, (_, i) => `Person ${i},person${i}@example.test`).join('\n')])
      expect(() => parseMemberCsv(csv)).toThrow();
  });
  it("reports row-level errors and does not hide duplicate normalized emails", () => {
    const r = parseMemberCsv('name,email,is_active\nGood person,person@example.test,true\nOther person,PERSON@example.test,true\nBad email,not-an-email,false\nBad flag,flag@example.test,maybe');
    expect(r.rows).toHaveLength(1); expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5]);
  });
  it("ignores exported identity/scope columns rather than granting their authority", () => {
    const r = parseMemberCsv('name,email,id,team_id,revision\nFictional person,person@example.test,forged,forged,999');
    expect(r.rows[0]).not.toHaveProperty("team_id"); expect(r.ignoredColumns).toEqual(["id", "team_id", "revision"]);
    expect(memberImportInput.safeParse({ rows: r.rows, teamId: null, actorId: "forged" }).success).toBe(false);
  });
  it("escapes spreadsheet formulas and excludes private columns unless selected", () => {
    const row = { name: '=HYPERLINK("https://example.test")', email: "private@example.test", phone: "+123", major: "Private academic value", interests: ["Web, AI"] };
    const safe = memberCsv([row], false);
    expect(safe).toContain("'=HYPERLINK"); expect(safe).not.toContain("private@example.test"); expect(safe).not.toContain("Private academic value");
    const full = memberCsv([row], true);
    expect(full).toContain("private@example.test"); expect(full).toContain("'+123");
  });
  it("bounds filters and refuses duplicate records in direct API submissions", () => {
    const row = { name: "Fictional person", email: "person@example.test" };
    expect(memberImportInput.safeParse({ teamId: null, rows: [row, row] }).success).toBe(false);
    expect(memberExportInput.safeParse({ filters: { ownerId: "forged" } }).success).toBe(false);
    expect(memberExportInput.parse({})).toEqual({ filters: { q: "", state: "current" }, includePrivate: false });
  });
});

describe("Organization Roster exports", () => {
  const headers = "Username,Card ID Number,First Name,Last Name,Campus Email,Preferred Email,Local Phone,Mobile Phone,Organization ID,Organization Name,Position Name,Position Start Date,Position End Date,Last Login";
  const person = (position, email = "person@example.test", name = "Example") => `(Hidden),(Hidden),Fictional,${name},${email},(Hidden),(Hidden),(Hidden),434409,Example chapter,${position},(Hidden),(Hidden),(Hidden)`;
  it("accepts the original preamble and combines multiple positions without granting permissions", () => {
    const result = parseMemberCsv(`\uFEFFOrganization Roster\r\n\r\nExample chapter,11/9/2026\r\n${headers}\r\n${person("Member")}\r\n${person("Finance Officer")}\r\n${person("Faculty/Staff Advisor", "advisor@example.test")}\r\n`);
    expect(result.format).toBe("organization-roster"); expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2); expect(result.duplicatesCollapsed).toBe(1);
    expect(result.rows[0]).toMatchObject({ name: "Fictional Example", email: "person@example.test", phone: "", category: "member", is_core_team: false });
    expect(JSON.stringify(result.rows)).not.toContain("Hidden");
    expect(result.rows[0]).not.toHaveProperty("role");
  });
  it("uses a visible preferred email and mobile phone when the campus/contact cells are hidden", () => {
    const result = parseMemberCsv('First Name,Last Name,Campus Email,Preferred Email,Mobile Phone,Local Phone,Position Name\nFictional,Example,(Hidden),PERSON@example.test,4045550100,(Hidden),Primary Contact');
    expect(result.rows[0]).toMatchObject({ email: "person@example.test", phone: "4045550100", category: "member" });
    expect(result.errors).toEqual([]);
  });
  it("reports malformed rows and identity conflicts instead of silently combining different people", () => {
    const result = parseMemberCsv(`${headers}\n${person("Member")}\n${person("Member", "person@example.test", "Other")}\nmalformed`);
    expect(result.rows).toHaveLength(1); expect(result.errors.map(e => e.line)).toEqual([3, 4]);
    expect(() => parseMemberCsv(headers + ',role\n' + person("Member") + ',admin')).toThrow(/unsupported/);
  });
});
