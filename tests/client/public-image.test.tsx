// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicImage from "../../src/ui/PublicImage";
afterEach(cleanup);
describe("public image failures", () => {
  it("uses the safe photo fallback once and preserves the accessible description", () => {
    const onError = vi.fn();
    render(
      <PublicImage
        src="/missing.png"
        srcSet="/missing-2x.png 2x"
        alt="Fictional workshop"
        fallbackSrc="/safe.jpg"
        onError={onError}
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").getAttribute("src")).toBe("/safe.jpg");
    expect(screen.getByRole("img").getAttribute("srcset")).toBeNull();
    fireEvent.error(screen.getByRole("img"));
    const placeholder = screen.getByRole("img", { name: "Fictional workshop" });
    expect(placeholder.tagName).toBe("SPAN");
    expect(onError).toHaveBeenCalledTimes(2);
    expect(document.querySelector("img")).toBeNull();
  });
  it("shows initials for a missing portrait without requesting an empty URL", () => {
    render(<PublicImage alt="Fictional Person" fallback="FP" />);
    expect(
      screen.getByRole("img", { name: "Fictional Person" }).textContent,
    ).toBe("FP");
    expect(document.querySelector("img")).toBeNull();
  });
  it("does not loop when the primary image already is its fallback", () => {
    render(<PublicImage src="/safe.jpg" alt="Photo" fallbackSrc="/safe.jpg" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img").tagName).toBe("SPAN");
  });
  it("tries a changed source after an earlier image failed", () => {
    const page = render(<PublicImage src="/old.png" alt="Partner" />);
    fireEvent.error(screen.getByRole("img"));
    page.rerender(<PublicImage src="/new.png" alt="Partner" />);
    expect(screen.getByRole("img").getAttribute("src")).toBe("/new.png");
  });
  it("keeps decorative image fallbacks out of the accessibility tree", () => {
    const page = render(<PublicImage src="/missing.png" alt="" />);
    fireEvent.error(page.container.querySelector("img")!);
    expect(screen.queryByRole("img")).toBeNull();
    expect(page.container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
