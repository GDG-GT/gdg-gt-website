import { Resend } from "resend";
import nodemailer from "nodemailer";
import { ApiError } from "./http.mjs";
import { timeDependency } from "./telemetry.mjs";
export function mailConfig(env) {
  const local = env.MAIL_MODE === "local";
  if (
    local &&
    (env.NODE_ENV === "production" ||
      env.SUPABASE_URL !== "http://127.0.0.1:54361")
  )
    throw Error("Local mail is restricted to the dedicated loopback database.");
  if (
    !local &&
    (env.MAIL_MODE !== "resend" ||
      env.EMAIL_SEND_ENABLED !== "true" ||
      !env.RESEND_API_KEY)
  )
    throw new ApiError(
      503,
      "MAIL_NOT_CONFIGURED",
      "Email delivery is not configured.",
    );
  const address = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    !address.test(env.FROM_EMAIL || "") ||
    (env.REPLY_TO_EMAIL && !address.test(env.REPLY_TO_EMAIL)) ||
    (env.CHAPTER_CONTACT_EMAIL && !address.test(env.CHAPTER_CONTACT_EMAIL))
  )
    throw Error("Valid configured sender and reply addresses are required.");
  return {
    local,
    from: env.FROM_EMAIL,
    replyTo: env.REPLY_TO_EMAIL || env.CHAPTER_CONTACT_EMAIL,
    chapter: env.CHAPTER_CONTACT_EMAIL,
  };
}
// One server-only transport owns provider credentials, sender identity, request
// timeouts and retry identities for transactional and newsletter deliveries.
export function createMailTransport(env) {
  const config = mailConfig(env),
    smtp = config.local
      ? nodemailer.createTransport({
          host: "127.0.0.1",
          port: 54365,
          secure: false,
          ignoreTLS: true,
          connectionTimeout: 10000,
          socketTimeout: 15000,
        })
      : null,
    resend = smtp ? null : new Resend(env.RESEND_API_KEY);
  return {
    config,
    async send(message, { jobId, idempotencyKey }) {
      return timeDependency("mail", async () => {
        const {
          from: ignoredFrom,
          replyTo: ignoredReply,
          messageId: ignoredId,
          ...content
        } = message;
        void ignoredFrom;
        void ignoredReply;
        void ignoredId;
        const send = {
          ...content,
          from: config.from,
          ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        };
        if (smtp)
          return String(
            (
              await smtp.sendMail({
                ...send,
                messageId: `<${jobId}@gdg.local>`,
              })
            ).messageId,
          );
        const response = await resend.emails.send(send, {
          idempotencyKey,
          signal: AbortSignal.timeout(20000),
        });
        if (response.error || !response.data?.id) {
          const error = new ApiError(
            503,
            "PROVIDER_RETRY",
            "Email delivery is unavailable.",
          );
          error.permanent = [
            "validation_error",
            "invalid_parameter",
            "missing_required_field",
            "invalid_idempotency_key",
            "invalid_access",
          ].includes(response.error?.name);
          throw error;
        }
        return response.data.id;
      });
    },
    close() {
      smtp?.close();
    },
  };
}
