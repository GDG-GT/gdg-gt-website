let submitted: { form: HTMLFormElement; at: number } | undefined;
const normalized = (value: string) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();
const alias = (value: string) => ({ fullname: "name", displayname: "displayname", photourl: "imageurl", portfoliowebsite: "portfoliourl", chapterrole: "role" }[normalized(value)] || normalized(value));
const marked = new Map<Element, () => void>();
function clearField(field: Element) {
  marked.get(field)?.(); marked.delete(field);
}
export function captureValidationForm() {
  if (typeof document === "undefined") return undefined;
  const active = document.activeElement?.closest("form");
  if (active instanceof HTMLFormElement) return active;
  if (submitted && submitted.form.isConnected && Date.now() - submitted.at < 2000) {
    const form = submitted.form; submitted = undefined; return form;
  }
  return undefined;
}
export function presentValidationErrors(form: HTMLFormElement | undefined, fields: unknown) {
  if (!form?.isConnected || !fields || typeof fields !== "object") return;
  const controls = [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")];
  let first: HTMLElement | undefined;
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-z0-9_.-]{1,100}$/i.test(key) || typeof value !== "string" || value.length > 300) continue;
    const leaf = key.split(".").at(-1) || key;
    const matches = controls.filter(control => control.name === key || control.dataset.validationKey === key ||
      alias(control.name) === alias(key) || alias(control.dataset.fieldLabel || "") === alias(leaf));
    for (const control of matches) {
      if (control.dataset.managedValidation === "true") continue;
      clearField(control);
      const previous = control.getAttribute("aria-invalid"), description = control.getAttribute("aria-describedby");
      const error = document.createElement("small"); error.className = "gt-field-error"; error.id = "field-error-" + crypto.randomUUID(); error.dataset.generatedValidation = "true";
      const label = control.dataset.fieldLabel || control.labels?.[0]?.querySelector("span")?.textContent?.replace(/\*/g, "").trim();
      error.textContent = (label ? label + ": " : "") + value;
      control.setAttribute("aria-invalid", "true"); control.setAttribute("aria-describedby", [description, error.id].filter(Boolean).join(" "));
      // Existing caller-owned field messages remain authoritative.
      if (!description?.split(" ").some(id => document.getElementById(id)?.matches('[role="alert"], .gt-field-error, [id$="-error"]'))) control.insertAdjacentElement("afterend", error);
      marked.set(control, () => { error.remove(); if (previous === null) control.removeAttribute("aria-invalid"); else control.setAttribute("aria-invalid", previous); if (description === null) control.removeAttribute("aria-describedby"); else control.setAttribute("aria-describedby", description); });
      first ||= control;
    }
  }
  if (first) first.scrollIntoView?.({ block: "nearest", behavior: "instant" });
}
export function installValidationFeedback() {
  const submit = (event: Event) => {
    if (!(event.target instanceof HTMLFormElement)) return;
    for (const control of event.target.querySelectorAll("input,select,textarea")) clearField(control);
    submitted = { form: event.target, at: Date.now() };
  };
  const edit = (event: Event) => { if (event.target instanceof Element) clearField(event.target); };
  document.addEventListener("submit", submit, true); document.addEventListener("input", edit, true); document.addEventListener("change", edit, true);
  return () => { submitted = undefined; for (const field of marked.keys()) clearField(field); document.removeEventListener("submit", submit, true); document.removeEventListener("input", edit, true); document.removeEventListener("change", edit, true); };
}
