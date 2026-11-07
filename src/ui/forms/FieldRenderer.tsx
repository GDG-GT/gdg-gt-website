import { ArrowDown, ArrowUp, Star } from "lucide-react";
import type { ReactNode } from "react";
import { conditionValues, type Answer, type FormField } from "./store";
import FormImage from "./FormImage";
import ScrollableTable from "../ScrollableTable";

export default function FieldRenderer({
  field,
  value,
  onChange,
  preview = false,
  error,
  fileControl,
}: {
  field: FormField;
  value?: Answer;
  onChange: (value: Answer) => void;
  preview?: boolean;
  error?: string;
  fileControl?: ReactNode;
}) {
  const inputId = `field-${field.id}`;
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
      <FormImage
        id={field.imageMediaId}
        alt={field.label}
        width={field.imageWidth}
        height={field.imageHeight}
      />
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
      "file",
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
        <legend id={`${inputId}-label`}>{label}</legend>
        {help}
        {field.type === "file" &&
          (fileControl || (
            <p className="gt-helper">
              File uploads are disabled in this preview. Respondents upload
              privately on the published form.
            </p>
          ))}
        {["radio", "checkbox"].includes(field.type) && (
          <div className="gt-choice-list">
            {field.options.map((option, i) => (
              <label key={`${option}-${i}`}>
                <input
                  type={field.type}
                  name={inputId}
                  aria-describedby={shared["aria-describedby"]}
                  aria-invalid={!!error}
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
          <div className="gt-scale">
            {!conditionValues(field).length && (
              <p className="gt-helper">
                Set valid whole-number scale bounds between 0 and 10 in the
                field settings.
              </p>
            )}
            {conditionValues(field).map((score) => {
              return (
                <label key={score}>
                  <input
                    type="radio"
                    name={inputId}
                    value={score}
                    className="sr-only"
                    checked={text === score}
                    required={field.required && !preview}
                    aria-label={`${score} of ${field.max ?? 5}`}
                    aria-describedby={shared["aria-describedby"]}
                    aria-invalid={!!error}
                    onChange={() => onChange(score)}
                  />
                  <span>
                    {field.type === "rating" && score !== "0" ? (
                      <Star
                        size={22}
                        fill={
                          text && Number(text) >= Number(score)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    ) : (
                      score
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {field.type === "consent" && (
          <label className="gt-check">
            <input
              type="checkbox"
              aria-describedby={shared["aria-describedby"]}
              aria-invalid={!!error}
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
          <ScrollableTable
            className="gt-grid-question"
            label={field.label + " answer grid"}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Statement</th>
                  {(field.columns || ["Disagree", "Neutral", "Agree"]).map(
                    (option) => (
                      <th scope="col" key={option}>
                        {option}
                      </th>
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
                              aria-describedby={shared["aria-describedby"]}
                              aria-invalid={!!error}
                              required={
                                field.type === "likert" &&
                                field.required &&
                                !preview
                              }
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
          </ScrollableTable>
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
      ) : (
        <input
          {...shared}
          step={
            field.type === "number"
              ? "any"
              : field.type === "datetime"
                ? "0.001"
                : field.type === "time"
                  ? "1"
                  : undefined
          }
          type={
            (
              {
                short: "text",
                email: "email",
                phone: "tel",
                number: "number",
                url: "url",
                date: "date",
                time: "time",
                datetime: "datetime-local",
              } as Partial<Record<FormField["type"], string>>
            )[field.type] || "text"
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
