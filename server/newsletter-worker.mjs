import { queueMailAppNotification } from "./app-notifications.mjs";
import { serverDatabase } from "./db/client.mjs";
import { serverConfig } from "./config.mjs";
import { createMailTransport } from "./lib/mail-transport.mjs";
import {
  databaseResult as checked,
  hasControlCharacters,
} from "./lib/validation.mjs";
import { token, tokenHash } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import { newsletterPreview } from "../shared/newsletter.mjs";
export async function runNewsletterWorker({
  db = serverDatabase(),
  env = process.env,
  limit = 10,
} = {}) {
  const config = serverConfig(env),
    transport = createMailTransport(env),
    mail = transport.config,
    jobs = checked(
      await db.rpc("claim_worker_jobs", {
        p_limit: Math.min(25, Math.max(1, limit)),
        p_kinds: ["newsletter_campaign", "newsletter_test"],
      }),
    ),
    result = {
      claimed: jobs.length,
      sent: 0,
      skipped: 0,
      retried: 0,
      failed: 0,
      lostLease: 0,
    };
  try {
    for (const job of jobs) {
      let success = false,
        provider = null,
        error = null,
        permanent = false;
      try {
        const raw = token(),
          prepared = checked(
            await db.rpc("prepare_newsletter_delivery", {
              p_job: job.id,
              p_lease: job.lease_token,
              p_unsubscribe_hash: tokenHash(raw),
              p_secret_payload: encryptPayload(
                { token: raw },
                config.encryptionSecret,
              ),
            }),
          );
        if (!prepared) {
          result.skipped++;
          continue;
        }
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prepared.email) ||
          hasControlCharacters(prepared.subject) ||
          prepared.subject.length > 210 ||
          prepared.content.length > 30000
        ) {
          permanent = true;
          throw Error("Invalid retained campaign content");
        }
        let content = prepared.content,
          unsubscribe = null;
        const headers = { "X-GDG-Job-ID": job.id };
        if (!prepared.test) {
          const secret = decryptPayload(
            prepared.secretPayload,
            config.encryptionSecret,
          );
          if (tokenHash(secret.token) !== prepared.unsubscribeHash) {
            permanent = true;
            throw Error("Invalid unsubscribe capability");
          }
          unsubscribe =
            config.origin + "/newsletter/unsubscribe#token=" + secret.token;
          content += "\n\nUnsubscribe: " + unsubscribe;
          headers["List-Unsubscribe"] = "<" + unsubscribe + ">";
        } else content += "\n\nTest email for your account.";
        const message = {
          from: mail.from,
          to: prepared.email,
          subject: prepared.subject,
          text: content,
          html: newsletterPreview(
            prepared.subject,
            prepared.content +
              (prepared.test ? "\n\nTest email for your account." : ""),
            unsubscribe,
          ),
          headers,
          ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        };
        provider = await transport.send(message, {
          jobId: job.id,
          category: "newsletter",
          idempotencyKey: "gdg-newsletter-" + job.id,
        });
        await queueMailAppNotification(db, job, message, "newsletter", env);
        success = true;
      } catch (failure) {
        permanent = permanent || failure.permanent === true;
        error = permanent
          ? "NEWSLETTER_DELIVERY_REJECTED"
          : "NEWSLETTER_DELIVERY_RETRY";
      }
      const finished = checked(
        await db.rpc("finish_newsletter_delivery", {
          p_job: job.id,
          p_lease: job.lease_token,
          p_success: success,
          p_provider: provider,
          p_error: error,
          p_permanent: permanent,
        }),
      );
      if (!finished) result.lostLease++;
      else if (success) result.sent++;
      else if (permanent || job.attempt_count >= 8) result.failed++;
      else result.retried++;
      // Stay below a conservative one-request/second provider rate. This is an
      // isolated durable worker, never a browser action or Vercel request loop.
      if (!mail.local && jobs.length > 1)
        await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    checked(await db.rpc("reconcile_newsletter_campaigns"));
  } finally {
    transport.close();
  }
  return result;
}
