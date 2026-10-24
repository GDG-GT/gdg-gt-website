import { Field } from "../primitives";
import { safePattern, type FormField } from "./store";

const formats = [
  ["application/pdf", "PDF"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Word (.docx)",
  ],
  ["text/plain", "Plain text (.txt)"],
  ["image/png", "PNG"],
  ["image/jpeg", "JPEG"],
  ["image/webp", "WebP"],
] as const;
const mib = 1048576;
export default function FieldValidationSettings({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (change: Partial<FormField>) => void;
}) {
  if (field.type === "file") {
    const allowed = field.allowedMime || formats.map(([mime]) => mime);
    return (
      <div className="gt-form">
        <Field
          label="Maximum files"
          hint="1–10 files for this question. The response-wide limit still applies."
        >
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={field.maxFiles ?? 1}
            onChange={(event) =>
              onChange({
                maxFiles:
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
        </Field>
        <Field
          label="Maximum file size (MiB)"
          hint="Up to 25 MiB per file. Smaller limits reduce upload time."
        >
          <input
            type="number"
            min={1 / mib}
            max={25}
            step="any"
            value={(field.maxFileBytes ?? 25 * mib) / mib}
            onChange={(event) =>
              onChange({
                maxFileBytes:
                  event.target.value === ""
                    ? undefined
                    : Math.round(Number(event.target.value) * mib),
              })
            }
          />
        </Field>
        <fieldset className="gt-form">
          <legend>Allowed file types</legend>
          <p className="gt-helper">
            Select at least one. Every upload remains private until validation
            and malware scanning pass.
          </p>
          {formats.map(([mime, label]) => (
            <label className="gt-check" key={mime}>
              <input
                type="checkbox"
                checked={allowed.includes(mime)}
                disabled={allowed.length === 1 && allowed.includes(mime)}
                onChange={(event) =>
                  onChange({
                    allowedMime: event.target.checked
                      ? [...allowed, mime]
                      : allowed.filter((value) => value !== mime),
                  })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
    );
  }
  if (!["short", "long", "email", "phone", "url"].includes(field.type))
    return null;
  const error = !!field.pattern && !safePattern(field.pattern),
    help = `pattern-help-${field.id}`,
    errorId = `pattern-error-${field.id}`;
  return (
    <div>
      <Field label="Required answer pattern (optional)">
        <input
          value={field.pattern || ""}
          maxLength={120}
          spellCheck={false}
          aria-invalid={error}
          aria-describedby={`${help}${error ? " " + errorId : ""}`}
          onChange={(event) =>
            onChange({ pattern: event.target.value || undefined })
          }
        />
      </Field>
      <p className="gt-helper" id={help}>
        Use an anchored pattern such as ^[A-Z0-9]+$. At most 120 characters; no
        groups, alternatives, backreferences or complex quantifiers.
        Pattern-matched answers are limited to 512 characters. Leave empty for
        no pattern.
      </p>
      {error && (
        <p id={errorId} role="alert" className="gt-form-error">
          Use a supported pattern beginning with ^ and ending with $. Fix or
          clear this rule before the draft can save or publish.
        </p>
      )}
    </div>
  );
}
