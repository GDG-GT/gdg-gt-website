import { api } from "@/lib/api";
export interface ContactFormData {
  name: string;
  email: string;
  type: string;
  message: string;
  interests?: string[];
  fileUploadId?: string;
  fileName?: string;
  website?: string;
}
export interface ContactFormResult {
  success: boolean;
  message?: string;
  error?: string;
}
export class ContactService {
  static async submitContactForm(
    form: ContactFormData,
    key: string = crypto.randomUUID(),
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
          },
        },
      );
      return { success: result.accepted, message: result.message };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Your message could not be saved. Please try again.",
      };
    }
  }
}
