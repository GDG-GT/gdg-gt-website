import { z } from "zod";
import { otherChoiceText } from "./form-choice.ts";

// These are declared details, not proof of identity. Authentication provenance
// is derived by the server and is never accepted in the request body.
export const formRespondentSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
    email: z.string().trim().toLowerCase().email().max(254),
  })
  .strict();

export function respondentLabel(source) {
  return (
    {
      self_reported: "Entered details · unverified",
      email_verified: "Email access link",
      account: "Chapter account",
      redacted: "Identity removed",
    }[source] || "Historical identity unavailable"
  );
}

export function responseCopyText(notice) {
  const value = (v) =>
    otherChoiceText(v) ??
    (Array.isArray(v)
      ? v.join(", ")
      : v && typeof v === "object"
        ? Object.entries(v)
            .map(
              ([k, item]) =>
                `${k}: ${Array.isArray(item) ? item.join(", ") : item}`,
            )
            .join("\n")
        : String(v ?? "Not answered"));
  return `Here is the copy you requested of your submitted response.\n\nForm: ${notice.title}\nForm version: ${notice.version}\nSubmitted: ${new Date(notice.submittedAt).toUTCString()}\nReference: ${notice.responseId}\nName: ${notice.name}\nEmail: ${notice.email}\n\n${notice.answers.map((answer) => `${answer.label}\n${value(answer.value)}`).join("\n\n")}\n\nUploaded files are listed by filename only; private download links and attachments are not included. This copy was requested when submitting the form using this email address. If you did not submit it, you can ignore this email. Delivered email copies cannot be recalled.`;
}
