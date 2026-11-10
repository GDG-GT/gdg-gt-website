import { createMailTransport, mailConfig } from "./lib/mail-transport.mjs";
export { mailConfig } from "./lib/mail-transport.mjs";
import { serverDatabase } from "./db/client.mjs";
import { serverConfig } from "./config.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { decryptPayload } from "./lib/encryption.mjs";
import { ApiError } from "./lib/http.mjs";
import { tokenHash } from "./lib/security.mjs";
import { visibleFields } from "../shared/forms.ts";
import { responseCopyText } from "../shared/form-respondent.mjs";
import { rewardCredentialMessage } from "./rewards-email.mjs";
import { emailDocument } from "../shared/email.mjs";
import { formDigestMessage } from "../shared/form-digest.mjs";
export function deliveryCategory(kind) {
  if (kind.startsWith("form_")) return "forms";
  if (kind.startsWith("newsletter_")) return "newsletter";
  if (kind.startsWith("contact_")) return "contact";
  if (kind.startsWith("reward_")) return "id";
  if (kind.startsWith("event_")) return "events";
  if (["account_access", "team_invite"].includes(kind)) return "accounts";
  return "workspace";
}
export async function deliveryMessage(
  job,
  db,
  config,
  mail,
  env = process.env,
) {
  if (job.kind === "reward_credential_email")
    return rewardCredentialMessage(job, db, config, mail, env);
  if (job.kind === "form_daily_digest") {
    const notice = checked(await db.rpc("prepare_form_daily_digest", {
      p_job: job.id, p_lease: job.lease_token,
    }));
    if (!notice) return null;
    if (!mail.chapter) throw new ApiError(503, "MAIL_NOT_CONFIGURED", "A chapter inbox is required.");
    return { to: mail.chapter, ...formDigestMessage(notice, config.origin),
      headers: { "X-GDG-Job-ID": job.id } };
  }
  let to, subject, content, htmlContent;
  const actions = [];
  if (job.kind === "workspace_notice_email") {
    const notice = checked(
      await db.rpc("prepare_workspace_notice_email", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    to = notice.email;
    subject = {
      assignment: "A task has been assigned to you",
      due: "Your task is due soon",
      overdue: "Your task is overdue",
      team_announcement: "New team announcement",
    }[notice.kind];
    if (
      !subject ||
      !/^\/admin\/(communications\?tab=tasks&task=[0-9a-f-]{36}|team\/[0-9a-f-]{36}\?section=announcements)$/.test(
        notice.link,
      )
    )
      throw new ApiError(
        503,
        "DELIVERY_RETRY",
        "The workspace notice could not be prepared.",
      );
    content = `${subject}.${notice.dueDate ? "\nDeadline: " + notice.dueDate + " (UTC)" : ""}\n\nOpen your workspace to review the details:\n${config.origin}${notice.link}`;
    htmlContent = `${subject}.${notice.dueDate ? "\nDeadline: " + notice.dueDate + " (UTC)" : ""}`;
    actions.push({ label: "Open workspace", url: config.origin + notice.link });
  } else if (job.kind === "event_confirmation") {
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
    htmlContent = content.split("\n\nDetails:")[0];
    actions.push({
      label: "View event",
      url: config.origin + "/events/" + event.slug,
    });
  } else if (job.kind === "event_message") {
    const notice = checked(
      await db.rpc("prepare_event_mail", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    to = notice.email;
    subject = notice.subject;
    content = notice.message;
  } else if (job.kind === "event_push_verification") {
    const notice = checked(
      await db.rpc("prepare_event_push_verification", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    if (tokenHash(secret.token) !== notice.tokenHash) return null;
    to = notice.email;
    subject = "Verify your event reminder request";
    content = `You requested a device reminder for a GDG at Georgia Tech event you registered for. Verify through this private link, then explicitly enable notifications on your device:\n${config.origin}/events/${notice.slug}#reminder=${secret.token}\n\nThis link expires in 24 hours. Opening it does not enable notifications automatically. Do not forward it. If you did not request this, ignore the message.`;
    htmlContent =
      "Confirm your email to set up reminders for this event.\n\nThis button expires in 24 hours.";
    actions.push({
      label: "Verify event reminder",
      url:
        config.origin + "/events/" + notice.slug + "#reminder=" + secret.token,
    });
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
        .select("email,state,deleted_at,suppressed_at,team_id")
        .eq("id", job.payload.subscriberId)
        .single(),
    );
    if (
      subscriber.state !== "pending" ||
      subscriber.deleted_at ||
      subscriber.suppressed_at
    )
      return null;
    if (subscriber.team_id) {
      const team = checked(
        await db
          .from("admin_teams")
          .select("is_active,deleted_at")
          .eq("id", subscriber.team_id)
          .maybeSingle(),
      );
      if (!team?.is_active || team.deleted_at) return null;
    }
    const secret = decryptPayload(job.secret_payload, config.encryptionSecret);
    to = subscriber.email;
    subject = "Confirm your GDG at Georgia Tech subscription";
    const confirmationUrl =
      config.origin + "/newsletter/confirm#token=" + secret.token;
    actions.push({ label: "Confirm subscription", url: confirmationUrl });
    htmlContent =
      "Get chapter news and event updates. Confirm your email below.\n\nThis button expires in 24 hours. If you didn’t sign up, you can ignore this email.";
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
        .select(
          "name,email,inquiry_type,message,attachment_upload_id,redacted_at",
        )
        .eq("id", job.payload.contactId)
        .single(),
    );
    if (contact.redacted_at) return null;
    if (job.kind === "contact_acknowledgment") {
      to = contact.email;
      subject = "We received your message";
      content = `Hi ${contact.name},\n\nThanks for contacting GDG at Georgia Tech. We’ve received your message and will get back to you.`;
    } else {
      if (!mail.chapter)
        throw new ApiError(
          503,
          "MAIL_NOT_CONFIGURED",
          "A chapter inbox is required.",
        );
      to = mail.chapter;
      subject = "New chapter inquiry: " + contact.inquiry_type;
      content = `${contact.name} (${contact.email}) sent an inquiry.\n\n${contact.message}\n\n${contact.attachment_upload_id ? "A private scanned attachment is available in the protected inbox.\n\n" : ""}Review securely: ${config.origin}/admin/communications?tab=contact&contact=${job.payload.contactId}`;
    }
    if (job.kind === "contact_notification") {
      htmlContent = content.split("\n\nReview securely:")[0];
      actions.push({
        label: "Review inquiry",
        url:
          config.origin +
          "/admin/communications?tab=contact&contact=" +
          job.payload.contactId,
      });
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
    htmlContent = "There’s a new announcement in your chapter workspace.";
    actions.push({
      label: "Read announcement",
      url:
        config.origin +
        "/admin/communications?tab=announcements&announcement=" +
        notice.announcementId,
    });
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
    htmlContent = "You have a new message in your chapter workspace.";
    actions.push({
      label: "Read message",
      url:
        config.origin +
        "/admin/communications?tab=messages&thread=" +
        notice.threadId,
    });
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
    htmlContent = `You’ve been invited to join ${info.teamName} at GDG at Georgia Tech.\n\nUse the email address that received this invitation. This button expires in seven days.`;
    actions.push({
      label: "Join team",
      url: config.origin + "/team/join#invite=" + secret.token,
    });
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
    htmlContent =
      "Set a password for your GDG at Georgia Tech account.\n\nThis button expires in 24 hours. If you weren’t expecting this email, contact the chapter.";
    actions.push({
      label: "Set up account",
      url: config.origin + "/account/setup#token=" + secret.token,
    });
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
    htmlContent = `Open ${form.title} using the button below.\n\nThis private link expires ${new Date(access.expires_at).toUTCString()}. Don’t forward it.`;
    actions.push({
      label: "Open form",
      url: config.origin + "/forms/" + form.slug + "#access=" + secret.token,
    });
  } else if (job.kind === "form_respondent_copy") {
    const notice = checked(
      await db.rpc("prepare_form_respondent_copy", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    to = notice.email;
    subject = "Your response: " + notice.title;
    const answers = visibleFields(
      notice.definition.fields,
      notice.values,
      notice.definition.sections,
    )
      .filter(
        (f) => !["title", "description", "image", "divider"].includes(f.type),
      )
      .map((f) => ({
        label: f.label,
        value:
          f.type === "file"
            ? (notice.values[f.id] || []).map(
                (id) => notice.files[id] || "Private attachment",
              )
            : notice.values[f.id],
      }));
    content = responseCopyText({ ...notice, answers });
  } else if (job.kind === "form_reviewed_email") {
    const notice = checked(
      await db.rpc("prepare_form_reviewed_email", {
        p_job: job.id,
        p_lease: job.lease_token,
      }),
    );
    if (!notice) return null;
    to = notice.chapterInbox
      ? mail.chapter
      : notice.email ||
        (notice.emailEncrypted
          ? decryptPayload(notice.emailEncrypted, config.encryptionSecret).email
          : null);
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
      throw new ApiError(
        503,
        "MAIL_NOT_CONFIGURED",
        "An authorized chapter delivery address is unavailable.",
      );
    const receipt = notice.purpose === "receipt";
    subject = receipt
      ? "Your form response was received"
      : "New chapter form response";
    content = `${receipt ? "Your response has been received." : "A new form response is ready to review."}\n\nForm: ${notice.title}\nForm version: ${notice.version}\nSubmitted: ${new Date(notice.submittedAt).toUTCString()}\nReference: ${notice.responseId}`;
    if (!receipt)
      content += `\n\nReview securely: ${config.origin}/admin/forms/${notice.formId}/responses`;
    if (notice.answers?.length)
      content +=
        "\n\nResponse summary:\n" +
        notice.answers
          .map(
            (answer) =>
              `${answer.label}: ${typeof answer.value === "object" ? JSON.stringify(answer.value) : String(answer.value ?? "")}`,
          )
          .join("\n");
    if (notice.answersOmitted)
      content +=
        "\n\nAnswers were omitted because this response exceeds the safe email size limit. Review the response in the protected workspace.";
    content += "\n\nSensitive answers and files are excluded.";
    if (!receipt) {
      const reviewUrl =
        config.origin + "/admin/forms/" + notice.formId + "/responses";
      htmlContent = content.replace("\n\nReview securely: " + reviewUrl, "");
      actions.push({ label: "Review response", url: reviewUrl });
    }
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
    html: emailDocument({ subject, content: htmlContent ?? content, actions }),
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
  const transport = createMailTransport(env);
  const result = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    lostLease: 0,
  };
  try {
    for (const job of jobs) {
      let providerId = null,
        success = false,
        errorCode = null;
      try {
        const message = await deliveryMessage(job, db, config, mail, env);
        if (message) {
          providerId = await transport.send(message, {
            jobId: job.id,
            category: deliveryCategory(job.kind),
            idempotencyKey: "gdg-job-" + job.id,
          });
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
  } finally {
    transport.close();
  }
  return result;
}
