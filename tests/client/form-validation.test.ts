// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { captureValidationForm, installValidationFeedback, presentValidationErrors } from "../../src/lib/form-validation";
afterEach(() => { document.body.innerHTML = ""; });
describe("shared form validation feedback", () => {
  it("marks only the submitted form, names the field, and clears feedback as it is corrected", () => {
    document.body.innerHTML = '<form id="other"><input name="title"></form><form id="edited"><label><span>Title</span><input name="title" data-field-label="Title"></label><button>Save</button></form>';
    const remove = installValidationFeedback(), form = document.querySelector<HTMLFormElement>("#edited")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const captured = captureValidationForm(); expect(captured).toBe(form);
    presentValidationErrors(captured, { title: "Enter a title." });
    const input = form.querySelector("input")!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(form.querySelector("small")?.textContent).toBe("Title: Enter a title.");
    expect(document.querySelector("#other input")?.hasAttribute("aria-invalid")).toBe(false);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.hasAttribute("aria-invalid")).toBe(false); expect(form.querySelector("small")).toBeNull(); remove();
  });
  it("matches nested server paths without losing preexisting hints or rendering HTML", () => {
    document.body.innerHTML = '<form><input name="profile.linkedinUrl" aria-describedby="hint" data-field-label="LinkedIn URL"><small id="hint"></small></form>';
    const remove = installValidationFeedback(), form = document.querySelector("form")!, input = form.querySelector("input")!;
    presentValidationErrors(form, { "profile.linkedinUrl": "<img src=x>" });
    expect(input.getAttribute("aria-describedby")).toContain("hint ");
    expect(form.querySelector("img")).toBeNull(); expect(form.textContent).toContain("<img src=x>");
    input.dispatchEvent(new Event("change", { bubbles: true })); expect(input.getAttribute("aria-describedby")).toBe("hint"); remove();
  });
});
