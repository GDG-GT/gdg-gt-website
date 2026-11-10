import { useState } from "react";
import RecordPicker, { type RecordChoice } from "../RecordPicker";
import { Button } from "../primitives";

export default function HistoricalResponsePicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [form, setForm] = useState<RecordChoice | null>(null),
    [labels, setLabels] = useState<Record<string, string>>({});
  const selected = value.split(/[\s,]+/).filter(Boolean);
  return <div className="gt-form">
    <p>Choose responses whose ownership you have independently verified. Only older responses with no captured identity are eligible. Up to 20 responses.</p>
    <RecordPicker label="Historical form" endpoint="/admin/forms" value={form?.id || ""} onChange={setForm} />
    {form && selected.length < 20 && <RecordPicker key={form.id} label="Historical response"
      endpoint={`/admin/forms/${form.id}/responses`} value=""
      eligible={(item) => !selected.includes(item.id) && (!item.respondent || item.respondent.source === "legacy_unknown")}
      hint="Search the permitted responses, then select by submission time."
      onChange={(choice) => {
        if (!choice || selected.includes(choice.id) || selected.length >= 20) return;
        setLabels((current) => ({ ...current, [choice.id]: `${form.label} · ${choice.label}` }));
        onChange([...selected, choice.id].join(","));
      }} />}
    {selected.length > 0 && <ul className="gt-picker-options" aria-label="Selected historical responses">
      {selected.map((id, index) => <li key={id}>
        <span>{labels[id] || `Selected response ${index + 1}`}</span>
        <Button type="button" variant="ghost" aria-label={`Remove ${labels[id] || `selected response ${index + 1}`}`}
          onClick={() => onChange(selected.filter((value) => value !== id).join(","))}>Remove response</Button>
      </li>)}
    </ul>}
  </div>;
}
