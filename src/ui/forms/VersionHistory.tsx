import { useState } from "react";
import { compareFormDefinitions } from "../../../shared/form-history";
import type { PreviewForm } from "./store";
import { fieldTypes } from "./store";
import { Field } from "../primitives";
export default function VersionHistory({ form }: { form: PreviewForm }) {
  const [chosen, setChosen] = useState(form.versions.at(-1)?.version || 1),
    [compareTo, setCompareTo] = useState("draft");
  const version = form.versions.find((v) => v.version === chosen);
  if (!version) return <p>No published version is available.</p>;
  const target = compareTo === "draft" ? form : form.versions.find((v) => String(v.version) === compareTo) || form,
    comparison = compareFormDefinitions(version, target);
  return <div className="gt-form-version-history">
    <Field label="Published snapshot"><select value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
      {form.versions.map((v) => <option key={v.version} value={v.version}>Version {v.version} · {new Date(v.publishedAt).toLocaleString()}</option>)}
    </select></Field>
    <p>Read-only version {version.version}. Published {new Date(version.publishedAt).toLocaleString()}. Viewing a snapshot does not restore it or change the current draft.</p>
    <h3>{version.title}</h3><p>{version.description}</p>
    <details><summary>Compare with another version or the current draft</summary>
      <Field label="Compare snapshot against"><select value={compareTo} onChange={(e) => setCompareTo(e.target.value)}>
        <option value="draft">Current draft (including unsaved edits)</option>
        {form.versions.map((v) => <option key={v.version} value={v.version}>Version {v.version}</option>)}
      </select></Field>
      <p>{comparison.titleChanged ? "Title changed. " : ""}{comparison.descriptionChanged ? "Description changed. " : ""}{comparison.sectionsChanged ? "Sections or branching changed. " : ""}{comparison.settingsChanged ? "Settings changed." : ""}</p>
      {(["added", "removed", "changed", "reordered"] as const).map((kind) => <div key={kind}><h4>{kind[0].toUpperCase() + kind.slice(1)} fields · {comparison[kind].length}</h4>
        {comparison[kind].length > 0 && <ul>{comparison[kind].map((f) => <li key={f.id}>{f.label || "Unlabeled block"} <small>{f.id}</small></li>)}</ul>}
      </div>)}
      <p className="gt-helper">Stable field IDs determine identity. Label, option, validation and rule changes never rewrite older response labels.</p>
    </details>
    {version.sections.map((section, index) => <section key={section.id} className="gt-history-section">
      <h4>Section {index + 1}: {section.title}</h4><p>{section.description}</p>
      {version.fields.filter((f) => f.sectionId === section.id).map((field) => <div key={field.id} className="gt-history-field">
        <strong>{field.label || "Unlabeled block"}</strong><p>{fieldTypes.find(([type]) => type === field.type)?.[1] || field.type}{field.required ? " · Required" : " · Optional"}{field.sensitive ? " · Sensitive" : ""}</p>
        {field.description && <p>{field.description}</p>}
        {["radio", "dropdown", "checkbox", "likert", "grid", "ranking"].includes(field.type) && field.options.length > 0 && <p>Options: {field.options.join(" · ")}</p>}
        {field.columns && field.columns.length > 0 && <p>Grid columns: {field.columns.join(" · ")}</p>}
        <small>Field ID {field.id}</small>
        <details><summary>Validation and visibility</summary><pre>{JSON.stringify(Object.fromEntries(Object.entries(field).filter(([key]) => !["id", "label", "description", "options", "optionIds", "columnIds", "columns", "type", "sectionId"].includes(key))), null, 2)}</pre></details>
      </div>)}
      <details><summary>Section routing</summary><pre>{JSON.stringify({ next: section.next || "Next section", rules: section.rules || [] }, null, 2)}</pre></details>
    </section>)}
    <details><summary>Published version settings</summary><pre>{JSON.stringify(version.settings, null, 2)}</pre></details>
  </div>;
}
