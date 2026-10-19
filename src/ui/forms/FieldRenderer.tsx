import { ArrowDown, ArrowUp, Star, Upload } from "lucide-react";
import { useState } from "react";
import type { Answer, FormField } from "./store";

export default function FieldRenderer({
  field,
  value,
  onChange,
  preview = false,
  error,
}: {
  field: FormField;
  value?: Answer;
  onChange: (value: Answer) => void;
  preview?: boolean;
  error?: string;
}) {
  const inputId = `field-${field.id}`;
  const [fileError, setFileError] = useState("");
  const text = typeof value === "string" ? value : "";
  const choices = Array.isArray(value) ? value : [];
  const toggle = (option: string) =>
    onChange(
      choices.includes(option)
        ? choices.filter((item) => item !== option)
        : [...choices, option],
    );
  if (field.type === "divider") return <hr className="gt-form-divider" />;
  if (field.type === "title")
    return <h3 className="gt-form-content-title">{field.label}</h3>;
  if (field.type === "description")
    return <p className="gt-helper">{field.label}</p>;
  if (field.type === "image")
    return (
      <div className="gt-form-image-block">
        <img
          src="/assets/event-hackathon.jpg"
          alt={field.label || "Illustrative development image"}
        />
        <small>Illustrative development image</small>
      </div>
    );
  const label = (
    <>
      {field.label}
      {field.required && (
        <span className="gt-required">
          {" "}
          *<span className="sr-only"> required</span>
        </span>
      )}
    </>
  );
  const help = (
    <>
      {field.description && (
        <p id={`${inputId}-help`} className="gt-field-description">
          {field.description}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="gt-form-error">
          {error}
        </p>
      )}
    </>
  );
  const shared = {
    id: inputId,
    disabled: preview,
    required: field.required && !preview,
    "aria-describedby":
      [field.description && `${inputId}-help`, error && `${inputId}-error`]
        .filter(Boolean)
        .join(" ") || undefined,
    "aria-invalid": !!error,
  };
  if (
    [
      "radio",
      "checkbox",
      "scale",
      "rating",
      "likert",
      "grid",
      "ranking",
      "consent",
    ].includes(field.type)
  )
    return (
      <fieldset
        className="gt-rendered-field"
        id={inputId}
        tabIndex={-1}
        disabled={preview}
        aria-invalid={!!error}
        aria-describedby={shared["aria-describedby"]}
      >
        <legend>{label}</legend>
        {help}
        {["radio", "checkbox"].includes(field.type) && (
          <div className="gt-choice-list">
            {field.options.map((option, i) => (
              <label key={`${option}-${i}`}>
                <input
                  type={field.type}
                  name={inputId}
                  checked={
                    field.type === "radio"
                      ? text === option
                      : choices.includes(option)
                  }
                  required={
                    field.type === "radio" && field.required && !preview
                  }
                  onChange={() =>
                    field.type === "radio" ? onChange(option) : toggle(option)
                  }
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}
        {["scale", "rating"].includes(field.type) && (
          <div className="gt-scale" role="group" aria-label={field.label}>
            {Array.from(
              { length: Math.max(1, (field.max || 5) - (field.min ?? 1) + 1) },
              (_, i) => {
                const score = i + (field.min ?? 1);
                return (
                  <button
                    type="button"
                    className={text === String(score) ? "is-selected" : ""}
                    key={i}
                    aria-pressed={text === String(score)}
                    aria-label={`${score} of ${field.max || 5}`}
                    onClick={() => onChange(String(score))}
                  >
                    {field.type === "rating" ? (
                      <Star
                        size={22}
                        fill={
                          text && Number(text) >= score
                            ? "currentColor"
                            : "none"
                        }
                      />
                    ) : (
                      score
                    )}
                  </button>
                );
              },
            )}
          </div>
        )}
        {field.type === "consent" && (
          <label className="gt-check">
            <input
              type="checkbox"
              checked={text === "Agreed"}
              required={field.required && !preview}
              onChange={(event) =>
                onChange(event.target.checked ? "Agreed" : "")
              }
            />
            <span>I agree to the statement above.</span>
          </label>
        )}
        {["likert", "grid"].includes(field.type) && (
          <div className="gt-grid-question">
            <table>
              <thead>
                <tr>
                  <th>Statement</th>
                  {(field.columns || ["Disagree", "Neutral", "Agree"]).map(
                    (option) => (
                      <th key={option}>{option}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {field.options.map((row, i) => (
                  <tr key={i}>
                    <th scope="row">{row}</th>
                    {(field.columns || ["Disagree", "Neutral", "Agree"]).map(
                      (option) => {
                        const record =
                          typeof value === "object" && !Array.isArray(value)
                            ? value
                            : {};
                        const selected = record?.[row];
                        return (
                          <td key={option}>
                            <input
                              aria-label={`${row}: ${option}`}
                              type={
                                field.type === "likert" ? "radio" : "checkbox"
                              }
                              name={`${inputId}-${i}`}
                              checked={
                                field.type === "likert"
                                  ? selected === option
                                  : Array.isArray(selected) &&
                                    selected.includes(option)
                              }
                              onChange={() =>
                                onChange({
                                  ...record,
                                  [row]:
                                    field.type === "likert"
                                      ? option
                                      : Array.isArray(selected)
                                        ? selected.includes(option)
                                          ? selected.filter(
                                              (item) => item !== option,
                                            )
                                          : [...selected, option]
                                        : [option],
                                })
                              }
                            />
                          </td>
                        );
                      },
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {field.type === "ranking" && (
          <>
            <ol className="gt-ranking">
              {(choices.length ? choices : field.options).map(
                (option, i, options) => (
                  <li key={option}>
                    <span>{i + 1}</span>
                    {option}
                    <div>
                      <button
                        type="button"
                        className="gt-icon-button"
                        disabled={i === 0}
                        aria-label={`Move ${option} up`}
                        onClick={() => {
                          const next = [...options];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          onChange(next);
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="gt-icon-button"
                        disabled={i === options.length - 1}
                        aria-label={`Move ${option} down`}
                        onClick={() => {
                          const next = [...options];
                          [next[i + 1], next[i]] = [next[i], next[i + 1]];
                          onChange(next);
                        }}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ol>
            {!choices.length && (
              <button
                type="button"
                className="gt-text-button"
                onClick={() => onChange([...field.options])}
              >
                Use this order
              </button>
            )}
          </>
        )}
      </fieldset>
    );
  return (
    <div className="gt-rendered-field">
      <label htmlFor={inputId}>{label}</label>
      {help}
      {field.type === "long" ? (
        <textarea
          {...shared}
          rows={4}
          minLength={field.minLength}
          maxLength={field.maxLength}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "dropdown" ? (
        <select
          {...shared}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose an option</option>
          {field.options.map((option, index) => (
            <option value={option} key={index}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "file" ? (
        <>
          <label className="gt-upload-drop" htmlFor={inputId}>
            <Upload size={23} />
            <strong>{text || "Choose a file"}</strong>
            <span>PDF, document, or image · Up to 25 MB</span>
            <input
              {...shared}
              type="file"
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && file.size > 25 * 1024 * 1024) {
                  setFileError("Choose a file smaller than 25 MB.");
                  onChange("");
                  event.target.value = "";
                  return;
                }
                if (
                  file &&
                  !/\.(pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name)
                ) {
                  setFileError(
                    "Choose a PDF, DOCX, TXT, PNG, JPEG, or WebP file.",
                  );
                  onChange("");
                  event.target.value = "";
                  return;
                }
                setFileError("");
                onChange(file?.name || "");
              }}
            />
          </label>
          {fileError && (
            <p role="alert" className="gt-form-error">
              {fileError}
            </p>
          )}
          {text && (
            <small className="gt-helper">
              Selected locally. Files are not uploaded or scanned in this UI
              preview.
            </small>
          )}
        </>
      ) : (
        <input
          {...shared}
          type={
            {
              short: "text",
              email: "email",
              phone: "tel",
              number: "number",
              url: "url",
              date: "date",
              time: "time",
              datetime: "datetime-local",
            }[field.type] || "text"
          }
          min={
            ["date", "datetime"].includes(field.type)
              ? field.dateFrom
              : field.min
          }
          max={
            ["date", "datetime"].includes(field.type) ? field.dateTo : field.max
          }
          minLength={field.minLength}
          maxLength={field.maxLength}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
