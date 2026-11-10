import type { ReactNode } from "react";

/** The reviewed record carries its internal reference; officers confirm the human context. */
export default function RecordAcknowledgement({
  label,
  reference,
  value,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  reference: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="gt-check gt-record-acknowledgement">
      <input
        type="checkbox"
        required
        disabled={disabled || !reference}
        checked={!!reference && value === reference}
        onChange={(event) => onChange(event.target.checked ? reference : "")}
      />
      <span>{label}</span>
    </label>
  );
}
