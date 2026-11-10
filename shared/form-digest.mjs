import { emailDocument, escapeEmail } from "./email.mjs";

export function formDigestMessage(notice, origin) {
  const date = new Date(notice.date + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const subject = "Form responses · " + date;
  const content = notice.forms.map((form) =>
    `${form.title}\nToday: ${form.today}\nTotal: ${form.total}\n${origin}/admin/forms/${form.id}/responses`,
  ).join("\n\n");
  const rows = notice.forms.map((form) => `<tr><td style="padding:14px 8px;border-bottom:1px solid #dedbd7"><a href="${escapeEmail(origin + "/admin/forms/" + form.id + "/responses")}" style="color:#a63628">${escapeEmail(form.title)}</a></td><td style="padding:14px 8px;border-bottom:1px solid #dedbd7;text-align:right">${form.today}</td><td style="padding:14px 8px;border-bottom:1px solid #dedbd7;text-align:right">${form.total}</td></tr>`).join("");
  return {
    subject,
    text: `Form responses for ${date}, as of 11 pm Atlanta time.\n\n${content}`,
    html: emailDocument({ subject, preheader: "Today’s responses and totals for your live forms.",
      bodyHtml: `<p style="margin:0 0 20px">As of 11 pm Atlanta time</p><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font:16px/1.5 Arial,sans-serif"><thead><tr><th scope="col" style="text-align:left;padding:8px">Form</th><th scope="col" style="text-align:right;padding:8px">Today</th><th scope="col" style="text-align:right;padding:8px">Total</th></tr></thead><tbody>${rows}</tbody></table>`,
    }),
  };
}
