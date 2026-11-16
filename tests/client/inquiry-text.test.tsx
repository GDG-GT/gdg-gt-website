// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import InquiryText from "../../src/ui/communications/InquiryText";

afterEach(cleanup);

it("makes inquiry URLs clickable while preserving paragraphs and query strings", () => {
  const url = "https://gdggt.dev/forms/executive-board-application?from=contact&invite=1";
  const text = `Hi Hannah,\n\nApply here: ${url}\n\nTejas`;
  const { container } = render(<p style={{ whiteSpace: "pre-wrap" }}><InquiryText text={text} /></p>);
  const link = screen.getByRole("link", { name: url });
  expect(link.getAttribute("href")).toBe(url);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(container.textContent).toBe(text);
});

it("keeps markup and unsafe destinations as plain text", () => {
  const text = '<script>alert(1)</script> javascript:alert(1) https://user:secret@example.test http://example.test';
  const { container } = render(<p><InquiryText text={text} /></p>);
  expect(screen.queryByRole("link")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toBe(text);
});
