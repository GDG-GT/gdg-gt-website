import { api, ApiFailure } from "@/lib/api";
export interface ContactFormData {
  name: string;
  email: string;
  type: string;
  message: string;
  interests?: string[];
  attachment?: { uploadId: string; uploadToken: string };
  website?: string;
}
export interface ContactFormResult {
  success: boolean;
  message?: string;
  error?: string;
  fields?: Record<string, string>;
}
export class ContactService {
  static async submitContactForm(
    form: ContactFormData,
    key: string = crypto.randomUUID(),
    signal?: AbortSignal,
  ): Promise<ContactFormResult> {
    try {
      const result = await api<{ accepted: boolean; message: string }>(
        "/contact",
        {
          method: "POST",
          idempotencyKey: key,
          body: {
            name: form.name,
            email: form.email,
            type: form.type,
            message: form.message,
            interests: form.interests || [],
            website: form.website || "",
            ...(form.attachment ? { attachment: form.attachment } : {}),
          },
          signal,
        },
      );
      return { success: result.accepted, message: result.message };
    } catch (error) {
      return {
        success: false,
        ...(error instanceof ApiFailure
          ? {
              fields: Object.fromEntries(
                Object.entries(error.fields || {})
                  .filter(([key]) =>
                    [
                      "name",
                      "email",
                      "type",
                      "message",
                      "interests",
                      "attachment",
                    ].some(
                      (field) => key === field || key.startsWith(field + "."),
                    ),
                  )
                  .map(([key, value]) => [key.split(".")[0], value]),
              ),
            }
          : {}),
        error:
          error instanceof Error
            ? error.message
            : "Your message could not be saved. Please try again.",
      };
    }
  }
}
