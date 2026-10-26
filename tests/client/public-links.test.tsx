// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://chapter.example.test/"}
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActionLink } from "../../src/ui/primitives";
import BlogMarkdown from "../../src/ui/blog/BlogMarkdown";
afterEach(cleanup);
describe("SEC/A11Y managed navigation", () => {
  it("identifies approved external actions and protects their new browsing context", () => {
    render(
      <MemoryRouter>
        <ActionLink to="https://developers.google.com/" arrow>
          Developer resources
        </ActionLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", {
      name: "Developer resources (opens a new tab)",
    });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });
  it.each([
    "javascript:alert(1)",
    "http://developers.google.com/",
    "//developers.google.com/",
    "/\\developers.google.com/",
    "https://name:password@developers.google.com/",
    "https://developers.google.com/\n",
    "data:text/html,unsafe",
    "",
  ])("does not create an actionable unsafe managed destination %s", (to) => {
    render(
      <MemoryRouter>
        <ActionLink to={to}>Managed action</ActionLink>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText("Managed action").getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("keeps absolute same-origin chapter links inside the router", () => {
    render(
      <MemoryRouter>
        <ActionLink to="https://chapter.example.test/events?q=workshop#schedule">
          Chapter event
        </ActionLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Chapter event" });
    expect(link.getAttribute("href")).toBe("/events?q=workshop#schedule");
    expect(link.getAttribute("target")).toBeNull();
  });
  it.each([
    "/events",
    "/forms/fictional#access=fictional-token",
    "#community-events",
  ])("retains ordinary same-origin route %s", (to) => {
    render(
      <MemoryRouter>
        <ActionLink to={to} arrow>
          Chapter action
        </ActionLink>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Chapter action" });
    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("href")).toBe(to.startsWith("#") ? "/" + to : to);
  });
  it("marks private Markdown links and preserves the stored-XSS boundary", () => {
    render(
      <BlogMarkdown>
        {
          "[Documentation](https://developers.google.com/)\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert(1))"
        }
      </BlogMarkdown>,
    );
    expect(
      screen
        .getByRole("link", { name: "Documentation (opens a new tab)" })
        .getAttribute("referrerpolicy"),
    ).toBe("no-referrer");
    expect(screen.queryByRole("link", { name: /Unsafe/ })).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });
});
