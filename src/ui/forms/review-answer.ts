import type { Answer } from "./store";

// Respondent review never turns a private file ID into a visible answer or URL.
export function reviewAnswer(
  value: Answer | undefined,
  type: string,
  files: Record<string, string>,
) {
  if (value == null || value === "") return "Not answered";
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) =>
            type === "file" ? files[item] || "Private attachment" : item,
          )
          .join(", ")
      : "Not answered";
  if (typeof value === "object") {
    const rows = Object.entries(value);
    return rows.length
      ? rows
          .map(
            ([row, answer]) =>
              `${row}: ${Array.isArray(answer) ? (answer.length ? answer.join(", ") : "Not answered") : answer || "Not answered"}`,
          )
          .join("\n")
      : "Not answered";
  }
  return String(value);
}
