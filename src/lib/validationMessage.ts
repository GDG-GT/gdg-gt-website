import { ZodError } from "zod";
export function validationMessage(
  error: unknown,
  fallback: string,
  labels: Record<string, string> = {},
) {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) return fallback;
    const path = issue.path.join(".");
    const label = labels[path] || labels[String(issue.path[0])] || "This field";
    return `${label}: ${issue.message}`;
  }
  return error instanceof Error ? error.message : fallback;
}
