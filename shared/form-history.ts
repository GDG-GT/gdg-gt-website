import type { FormVersion } from "./forms";
type Definition = Pick<FormVersion, "title" | "description" | "fields" | "sections" | "settings">;
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
};
export function compareFormDefinitions(before: Definition, after: Definition) {
  const old = new Map(before.fields.map((field, index) => [field.id, { field, index }])),
    next = new Map(after.fields.map((field, index) => [field.id, { field, index }]));
  return {
    added: after.fields.filter((f) => !old.has(f.id)).map((f) => ({ id: f.id, label: f.label })),
    removed: before.fields.filter((f) => !next.has(f.id)).map((f) => ({ id: f.id, label: f.label })),
    changed: after.fields.filter((f) => old.has(f.id) && canonical(old.get(f.id)!.field) !== canonical(f)).map((f) => ({ id: f.id, label: f.label })),
    reordered: after.fields.filter((f, index) => old.has(f.id) && old.get(f.id)!.index !== index).map((f) => ({ id: f.id, label: f.label })),
    titleChanged: before.title !== after.title,
    descriptionChanged: before.description !== after.description,
    sectionsChanged: canonical(before.sections) !== canonical(after.sections),
    settingsChanged: canonical(before.settings) !== canonical(after.settings),
  };
}
