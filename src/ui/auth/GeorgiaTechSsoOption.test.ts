import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GeorgiaTechSsoOption from "./GeorgiaTechSsoOption";

describe("planned campus SSO is display-only", () => {
  for (const purpose of ["login", "form"] as const) {
    it(`keeps ${purpose} SSO visibly unavailable and non-submitting`, () => {
      const html = renderToStaticMarkup(
        createElement(GeorgiaTechSsoOption, { purpose }),
      );
      expect(html).toContain('type="button"');
      expect(html).toContain('disabled=""');
      expect(html).toContain("Coming soon");
      expect(html).toContain("not connected");
      expect(html).not.toContain("href=");
      expect(html).not.toContain("verified=true");
    });
  }
});
