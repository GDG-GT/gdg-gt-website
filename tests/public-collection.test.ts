import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PublicPagination,
  PublicCollectionNotice,
} from "../src/ui/PublicCollection";
import { publicPageNumber } from "../src/ui/public-collections";
describe("Public collection bounds and recovery controls", () => {
  it("normalizes malformed and out-of-range pages without allowing infinite allocations", () => {
    for (const raw of [
      null,
      "",
      "0",
      "-1",
      "1e3",
      "Infinity",
      "10001",
      "1.5",
      " 2 ",
    ])
      expect(publicPageNumber(raw)).toBe(1);
    expect(publicPageNumber("2")).toBe(2);
    expect(publicPageNumber("10000")).toBe(10000);
  });
  it("exposes both pagination directions with correct first/last/loading boundaries", () => {
    const render = (page: number, total = 25, busy = false) =>
      renderToStaticMarkup(
        createElement(PublicPagination, {
          page,
          total,
          pageSize: 12,
          busy,
          onPage: () => {},
        }),
      );
    expect(render(1)).toContain('aria-label="Result pages"');
    expect(render(1)).toContain('disabled="">Previous page');
    expect(render(3)).toContain('disabled="">Next page');
    expect(render(2, 25, true).match(/disabled=""/g)).toHaveLength(2);
    expect(render(1, 0)).toBe("");
    expect(render(99, 25)).toContain("Back to first page");
    expect(render(99, 25)).not.toContain("Page 99 of");
  });
  it("distinguishes failed loading, stale public results and initial skeletons", () => {
    const render = (error: string, loading: boolean, at?: string) =>
      renderToStaticMarkup(
        createElement(PublicCollectionNotice, {
          error,
          loading,
          at,
          retry: () => {},
        }),
      );
    expect(render("Unavailable", false)).toContain("This list could not load");
    expect(render("Unavailable", false, "test time")).toContain(
      "Showing results last loaded test time",
    );
    expect(render("", true)).toContain('role="status"');
    expect(render("", true, "test time")).toBe("");
    expect(render("<script>", false)).not.toContain("<script>");
  });
});
