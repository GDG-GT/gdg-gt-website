// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LiveSearchInput from "../../src/ui/LiveSearchInput";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("Live search controls", () => {
  it("commits only the last typed term without Enter and preserves focus", () => {
    const search = vi.fn();
    render(<LiveSearchInput aria-label="Find records" value="" onSearch={search} />);
    const input = screen.getByRole("searchbox"); input.focus();
    fireEvent.change(input, { target: { value: "a" } });
    act(() => vi.advanceTimersByTime(150));
    fireEvent.change(input, { target: { value: "anish" } });
    act(() => vi.advanceTimersByTime(199));
    expect(search).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(search.mock.calls).toEqual([["anish"]]);
    expect(document.activeElement).toBe(input);
  });
  it("does not dispatch incomplete IME composition", () => {
    const search = vi.fn();
    render(<LiveSearchInput aria-label="Find records" value="" onSearch={search} />);
    const input = screen.getByRole("searchbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "東京" } });
    act(() => vi.advanceTimersByTime(500));
    expect(search).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    act(() => vi.advanceTimersByTime(200));
    expect(search).toHaveBeenCalledWith("東京");
  });
  it("cancels work on disable or unmount and clears pending input on form reset", () => {
    const search = vi.fn();
    const view = render(<form><LiveSearchInput aria-label="Find records" value="" onSearch={search} /></form>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "discard" } });
    act(() => screen.getByRole("searchbox").closest("form")!.reset());
    act(() => vi.advanceTimersByTime(300));
    expect(search).not.toHaveBeenCalled();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "paused" } });
    view.rerender(<form><LiveSearchInput aria-label="Find records" value="" disabled onSearch={search} /></form>);
    act(() => vi.advanceTimersByTime(300));
    expect(search).not.toHaveBeenCalled();
    view.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(search).not.toHaveBeenCalled();
  });
  it("follows external filter navigation while accepting its own committed term", () => {
    function Example() {
      const [value, setValue] = useState("");
      return <><LiveSearchInput aria-label="Find records" value={value} onSearch={setValue} />
        <button onClick={() => setValue("back")}>Back to prior filter</button></>;
    }
    render(<Example />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "current" } });
    act(() => vi.advanceTimersByTime(200));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("current");
    fireEvent.click(screen.getByRole("button"));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("back");
  });
});
