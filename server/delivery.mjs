import { Resend } from "resend";
import nodemailer from "nodemailer";
import { serverDatabase } from "./db/client.mjs";
import { serverConfig } from "./config.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { decryptPayload } from "./lib/encryption.mjs";
import { ApiError } from "./lib/http.mjs";
import { tokenHash } from "./lib/security.mjs";
const escape = (v) =>
  String(v || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mailConfig(env) {
  const local = env.MAIL_MODE === "local";
  if (
    local &&
    (env.NODE_ENV === "production" ||
      env.SUPABASE_URL !== "http://127.0.0.1:54361")
  )
    throw new Error(
      "Local mail is restricted to the dedicated loopback database.",
    );
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.FROM_EMAIL || ""))
    throw new Error("A valid configured sender is required.");
  return {
    local,
    from: env.FROM_EMAIL,
    replyTo: env.REPLY_TO_EMAIL || env.CHAPTER_CONTACT_EMAIL,
    chapter: env.CHAPTER_CONTACT_EMAIL,
  };
}
export async function deliveryMessage(job, db, config, mail) {
  let to, subject, content;
  if (job.kind === "event_confirmation") {
    const registration = checked(
      await db
        .from("event_attendance")
        .select("attendee_name,attendee_email,event_id,deleted_at")
        .eq("id", job.payload.registrationId)
        .maybeSingle(),
    );
    if (!registration || registration.deleted_at) return null;
    const event = checked(
      await db
        .from("events")
        .select("title,slug,start_at,timezone,location,publication_status")
        .eq("id", registration.event_id)
        .single(),
    );
    if (event.publication_status === "archived") return null;
    to = registration.attendee_email;
    subject = "Your registration: " + event.title;
    content = `Hi ${registration.attendee_name},\n\nYour place at ${event.title} is confirmed.\n${new Date(event.start_at).toLocaleString("en-US", { timeZone: event.timezone })} (${event.timezone})\n${event.location}\n\nDetails: ${config.origin}/events/${event.slug}`;
  } else if (job.kind === "event_message") {
    const recipient = checked(
      await db
        .from("event_message_recipients")
        .select("recipient_email")
        .eq("message_id", job.payload.messageId)
        .eq("registration_id", job.payload.registrationId)
        .maybeSingle(),
    );
    if (!recipient) return null;
    const message = checked(
      await db
        .from("event_messages")
        .select("subject,message")
        .eq("id", job.payload.messageId)
        .single(),
    );
    to = recipient.recipient_email;
    subject = message.subject;
    content = message.message;
  } else if (job.kind === "newsletter_confirmation") {
    const record = checked(
      await db
        .from("newsletter_tokens")
        .select("consumed_at,expires_at")
        .eq("id", job.payload.tokenId)
        .maybeSingle(),
    );
    if (
      !record ||
      record.consumed_at ||
      new Date(record.expires_at) <= new Date()
    )
      return null;
    const subscriber = checked(
      await db
        .from("newsletter_subscribers")
        .select("email")
        .eq("id", job.payload.subscriberId)
        .single(),
    );
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    to = subscriber.email;
    subject = "Confirm your GDG at Georgia Tech subscription";
    content =
      "Confirm that you want chapter news and event updates:\n" +
      config.origin +
      "/newsletter/confirm#token=" +
      secret.token +
      "\n\nThis link expires in 24 hours. If you did not request it, ignore this email.";
  } else if (
    ["contact_acknowledgment", "contact_notification"].includes(job.kind)
  ) {
    const contact = checked(
      await db
        .from("contact_submissions")
        .select("name,email,inquiry_type,message")
        .eq("id", job.payload.contactId)
        .single(),
    );
    if (job.kind === "contact_acknowledgment") {
      to = contact.email;
      subject = "We received your message";
      content = `Hi ${contact.name},\n\nYour message to GDG at Georgia Tech has been saved. The chapter will review it and be in touch.\n\nPlease do not send sensitive personal information by email.`;
    } else {
      if (!mail.chapter)
        throw new ApiError(
          503,
          "MAIL_NOT_CONFIGURED",
          "A chapter inbox is required.",
        );
      to = mail.chapter;
      subject = "New chapter inquiry: " + contact.inquiry_type;
      content = `${contact.name} (${contact.email}) sent an inquiry.\n\n${contact.message}\n\nReview securely: ${config.origin}/admin/communications`;
    }
  } else if (job.kind === "chapter_announcement") {
    const notice = checked(
      await db.rpc("prepare_chapter_announcement_notice", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice?.email) return null;
    to = notice.email;
    subject = "New chapter announcement";
    content =
      "An announcement is available in your chapter workspace. Read it securely:\n" +
      config.origin +
      "/admin/communications?tab=announcements&announcement=" +
      notice.announcementId;
  } else if (job.kind === "direct_message_notice") {
    const notice = checked(
      await db.rpc("prepare_direct_notice", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    to = notice.email;
    subject = "New private chapter message";
    content =
      "A private chapter conversation has a new message. Read it securely:\n" +
      config.origin +
      "/admin/communications?tab=messages&thread=" +
      notice.threadId;
  } else if (job.kind === "task_notification") {
    checked(
      await db.rpc("deliver_task_notification", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    return null;
  } else if (job.kind === "team_announcement") {
    checked(
      await db.rpc("deliver_team_announcement", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    return null;
  } else if (job.kind === "team_invite") {
    const invite = checked(
      await db
        .from("team_invites")
        .select("id,email,team_id,status,expires_at,token_hash")
        .eq("id", job.payload.inviteId)
        .maybeSingle(),
    );
    if (
      !invite ||
      invite.status !== "pending" ||
      invite.token_hash !== job.payload.tokenHash ||
      new Date(invite.expires_at) <= new Date()
    )
      return null;
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    if (
      secret.email !== invite.email ||
      tokenHash(secret.token) !== invite.token_hash
    )
      return null;
    const info = checked(
      await db.rpc("inspect_team_invite", {
        p_hash: invite.token_hash,
        p_email: invite.email,
      }),
    );
    if (!info) return null;
    to = invite.email;
    subject = "Join the chapter team: " + info.teamName;
    content =
      "You have been invited to join " +
      info.teamName +
      " at GDG at Georgia Tech.\n" +
      config.origin +
      "/team/join#invite=" +
      secret.token +
      "\n\nUse the email address that received this message. The single-use link expires in seven days. Existing account holders must sign in; an invitation never resets an existing password. Do not forward this private link.";
  } else if (job.kind === "account_access") {
    const access = checked(
      await db
        .from("account_access_tokens")
        .select(
          "admin_user_id,intended_email,expires_at,consumed_at,revoked_at,token_hash",
        )
        .eq("id", job.payload.tokenId)
        .maybeSingle(),
    );
    if (
      !access ||
      access.revoked_at ||
      access.consumed_at ||
      new Date(access.expires_at) <= new Date()
    )
      return null;
    const user = checked(
      await db
        .from("admin_users")
        .select("email,is_active,deleted_at")
        .eq("id", access.admin_user_id)
        .maybeSingle(),
    );
    if (
      !user?.is_active ||
      user.deleted_at ||
      user.email !== access.intended_email
    )
      return null;
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    if (
      secret.email !== user.email ||
      tokenHash(secret.token) !== access.token_hash
    )
      return null;
    to = user.email;
    subject = "Set up your GDG at Georgia Tech account";
    content =
      "A chapter administrator requested account access for this email address. Choose your own password:\n" +
      config.origin +
      "/account/setup#token=" +
      secret.token +
      "\n\nThis single-use link expires in 24 hours. Do not forward it. Completing setup does not bypass the chapter access entry. If you did not expect this request, contact chapter leadership.";
  } else if (job.kind === "form_access") {
    const access = checked(
      await db
        .from("form_access_tokens")
        .select("revoked_at,expires_at,token_hash")
        .eq("id", job.payload.tokenId)
        .maybeSingle(),
    );
    if (
      !access ||
      access.revoked_at ||
      access.token_hash !== job.payload.tokenHash ||
      new Date(access.expires_at) <= new Date()
    )
      return null;
    const form = checked(
      await db
        .from("forms")
        .select("title,slug,state")
        .eq("id", job.payload.formId)
        .single(),
    );
    if (form.state === "Archived") return null;
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    to = secret.email;
    subject = "Your private form link: " + form.title;
    content =
      "Open your private chapter form link:\n" +
      config.origin +
      "/forms/" +
      form.slug +
      "#access=" +
      secret.token +
      "\n\nDo not forward this link. It grants access to this form and expires " +
      new Date(access.expires_at).toUTCString() +
      ".";
  } else if (job.kind === "form_reviewed_email") {
    const notice = checked(await db.rpc("prepare_form_reviewed_email", { p_job: job.id, p_lease: job.lease_token }));
    if (!notice) return null;
    to = notice.chapterInbox ? mail.chapter : notice.email || (notice.emailEncrypted ? decryptPayload(notice.emailEncrypted, config.encryptionSecret).email : null);
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      throw new ApiError(503, "MAIL_NOT_CONFIGURED", "An authorized chapter delivery address is unavailable.");
    const receipt = notice.purpose === "receipt";
    subject = receipt ? "Your form response was received" : "New chapter form response";
    content = `${receipt ? "Your response has been received." : "A committed response is ready for authorized review."}\n\nForm: ${notice.title}\nForm version: ${notice.version}\nSubmitted: ${new Date(notice.submittedAt).toUTCString()}\nReference: ${notice.responseId}`;
    if (!receipt) content += `\n\nReview securely: ${config.origin}/admin/forms/${notice.formId}/responses`;
    if (notice.answers?.length) content += "\n\nReviewed non-sensitive answers:\n" + notice.answers.map((answer) => `${answer.label}: ${typeof answer.value === "object" ? JSON.stringify(answer.value) : String(answer.value ?? "")}`).join("\n");
    if (notice.answersOmitted) content += "\n\nAnswers were omitted because this response exceeds the safe email size limit. Review the response in the protected workspace.";
    content += "\n\nSensitive answers and files are never included. Downloaded or delivered copies cannot be recalled.";
  } else if (job.kind === "form_response_notification") {
    const form = checked(
      await db
        .from("forms")
        .select("id,title,owner_id")
        .eq("id", job.payload.formId)
        .maybeSingle(),
    );
    if (!form) return null;
    if (
      checked(
        await db.rpc("can_operate_form", {
          p_actor: form.owner_id,
          p_form: form.id,
          p_action: "view_responses",
        }),
      )
    )
      checked(
        await db.from("notifications").upsert(
          {
            user_id: form.owner_id,
            type: "system",
            title: "New form response",
            message: "A response to " + form.title + " is ready for review.",
            link: "/admin/forms/" + form.id + "/responses",
            delivery_key:
              "form-response:" + job.payload.responseId + ":" + form.owner_id,
          },
          { onConflict: "delivery_key", ignoreDuplicates: true },
        ),
      );
    return null;
  } else
    throw new ApiError(
      400,
      "UNKNOWN_JOB_KIND",
      "This delivery type has no handler.",
    );
  return {
    from: mail.from,
    to,
    subject,
    text: content,
    html: `<!doctype html><html><body><h1 style="font:600 22px system-ui">GDG at Georgia Tech</h1><div style="font:16px/1.6 system-ui;white-space:pre-wrap">${escape(content)}</div></body></html>`,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    headers: { "X-GDG-Job-ID": job.id },
    messageId: "<" + job.id + "@gdg.local>",
  };
}
export async function runDelivery({
  db = serverDatabase(),
  env = process.env,
  limit = 10,
} = {}) {
  const config = serverConfig(env),
    mail = mailConfig(env),
    jobs = checked(await db.rpc("claim_delivery_jobs", { p_limit: limit }));
  const smtp = mail.local
    ? nodemailer.createTransport({
        host: "127.0.0.1",
        port: 54365,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;
  const resend = mail.local ? null : new Resend(env.RESEND_API_KEY);
  const result = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    lostLease: 0,
  };
  for (const job of jobs) {
    let providerId = null,
      success = false,
      errorCode = null;
    try {
      const message = await deliveryMessage(job, db, config, mail);
      if (message) {
        if (smtp) {
          const info = await smtp.sendMail(message);
          providerId = String(info.messageId);
        } else {
          const { messageId: unused, ...send } = message;
          void unused;
          const response = await resend.emails.send(send, {
            idempotencyKey: "gdg-job-" + job.id,
          });
          if (response.error)
            throw new ApiError(
              503,
              "PROVIDER_RETRY",
              "Delivery is unavailable.",
            );
          providerId = response.data.id;
        }
      }
      success = true;
    } catch (error) {
      errorCode = error instanceof ApiError ? error.code : "DELIVERY_RETRY";
    }
    const finished = checked(
      await db.rpc("finish_delivery_job", {
        p_id: job.id,
        p_lease: job.lease_token,
        p_success: success,
        p_provider_id: providerId,
        p_error_code: errorCode,
      }),
    );
    if (!finished) {
      result.lostLease++;
      continue;
    }
    if (success && providerId && job.kind === "form_access")
      checked(
        await db
          .from("form_access_tokens")
          .update({
            delivery_state: "sent",
            last_sent_at: new Date().toISOString(),
          })
          .eq("id", job.payload.tokenId)
          .eq("token_hash", job.payload.tokenHash)
          .is("revoked_at", null),
      );
    if (success) result.completed++;
    else result.retried++;
  }
  smtp?.close();
  return result;
}
