import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RegistrationChart, FundingChart } from "../src/ui/DashboardCharts";
describe("operational chart data", () => {
  it("keeps exact counts in accessible text and a registration table without a fabricated trend", () => {
    const html = renderToStaticMarkup(
      createElement(RegistrationChart, {
        totalEvents: 12,
        items: [
          { id: "one", title: "<Private event>", internal: 2, external: 3 },
        ],
      }),
    );
    expect(html).toContain("latest 1 of 12");
    expect(html).toContain("2 internal · 3 external");
    expect(html).toContain("&lt;Private event&gt;");
    expect(html).toContain('<th scope="col">External</th>');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/NaN|Infinity|growth/);
  });
  it("preserves cents and distinguishes approved funding from received money", () => {
    const html = renderToStaticMarkup(
      createElement(FundingChart, {
        items: [
          { status: "pending", count: 1, amount: "40.10" },
          { status: "completed", count: 2, amount: "0.11" },
        ],
      }),
    );
    expect(html).toContain("$40.10");
    expect(html).toContain("$0.11");
    expect(html).toContain("Awaiting approval");
    expect(html).toContain("Received");
    expect(html).toContain("2 records");
  });
  it("renders honest empty states and finite zero bars", () => {
    expect(
      renderToStaticMarkup(
        createElement(RegistrationChart, { totalEvents: 0, items: [] }),
      ),
    ).toContain("No events to chart yet");
    const html = renderToStaticMarkup(
      createElement(FundingChart, {
        items: [{ status: "pending", count: 0, amount: "0.00" }],
      }),
    );
    expect(html).toContain("No incoming funding records yet");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
