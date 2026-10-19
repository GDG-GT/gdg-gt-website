import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { responseCsv, responseXlsx, safeCell } from "./export";

describe("response exports", () => {
  it.each(["=SUM(A1)", "+cmd", "-1", "@name", "\tcommand", "\rcommand"])(
    "neutralizes formula-like value %j",
    (value) => {
      expect(safeCell(value)).toBe(`'${value}`);
    },
  );
  it("quotes commas, line breaks, and embedded quotes in CSV", () => {
    expect(responseCsv([{ answer: 'A, "B"\nC' }])).toBe(
      '"answer"\r\n"A, ""B""\nC"',
    );
  });
  it("keeps version-specific columns from every response", () => {
    const csv = responseCsv([
      { "Name [id]": "First" },
      { "Renamed [id]": "Second" },
    ]);
    expect(csv).toContain('"Name [id]","Renamed [id]"');
  });
  it("creates a real zipped XLSX with only literal string cells", () => {
    const workbook = responseXlsx([
      {
        answer: '=HYPERLINK("bad")',
        caption: "<script>&",
        nested: ["one", "two"],
      },
    ]);
    expect([...workbook.slice(0, 2)]).toEqual([80, 75]);
    const archive = unzipSync(workbook),
      sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
    expect(Object.keys(archive)).toContain("[Content_Types].xml");
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("&apos;=HYPERLINK");
    expect(sheet).toContain("&lt;script&gt;&amp;");
    expect(sheet).toContain("[&quot;one&quot;,&quot;two&quot;]");
  });
});
