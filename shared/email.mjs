export const escapeEmail = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeEmailLink(raw) {
  try {
    const url = new URL(raw);
    return (
      !url.username &&
      !url.password &&
      !/[\x00-\x20\x7f]/.test(raw) &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}
export function emailText(content) {
  return String(content)
    .split(/\n\s*\n/)
    .map(
      (paragraph) =>
        '<p style="margin:0 0 20px;overflow-wrap:anywhere">' +
        paragraph
          .split(/(https?:\/\/[^\s<>"']+)/g)
          .map((part, i) =>
            i % 2 && safeEmailLink(part)
              ? `<a style="color:#a63628;text-decoration:underline;word-break:break-word" href="${escapeEmail(part)}">${escapeEmail(part)}</a>`
              : escapeEmail(part).replaceAll("\n", "<br>"),
          )
          .join("") +
        "</p>",
    )
    .join("");
}
/**
 * Table-based and self-contained for Outlook, Gmail, Apple Mail and mobile.
 * @param {{ subject: string, content?: string, bodyHtml?: string, footerHtml?: string, actions?: Array<{label: string, url: string}>, preheader?: string }} options
 */
export function emailDocument({
  subject,
  content = "",
  bodyHtml,
  footerHtml,
  actions = [],
  preheader = "",
}) {
  const buttons = actions
    .filter((a) => safeEmailLink(a.url))
    .map(
      (a) =>
        `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0"><tr><td bgcolor="#af3c2d" style="border-radius:8px"><a href="${escapeEmail(a.url)}" style="display:inline-block;padding:14px 22px;color:#fff7ef;font:bold 16px/1.4 Arial,sans-serif;text-decoration:none">${escapeEmail(a.label)}</a></td></tr></table>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeEmail(subject)}</title></head><body style="margin:0;padding:0;background:#f3f3f1;color:#292825;font:16px/1.6 Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeEmail(preheader || subject)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f3f3f1"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px"><tr><td style="padding:8px 12px 24px;font:bold 24px/1.2 Arial,sans-serif;letter-spacing:-.5px"><img src="https://gdggt.dev/logo.png" width="38" height="24" alt="" style="display:inline-block;width:38px;height:24px;vertical-align:middle;margin-right:10px;border:0"> <span style="color:#292825">GDG@GT</span></td></tr><tr><td bgcolor="#fff8f1" style="padding:32px 24px;border-radius:12px"><h1 style="margin:0 0 24px;font:bold 27px/1.25 Arial,sans-serif;letter-spacing:-.4px">${escapeEmail(subject)}</h1>${bodyHtml ?? emailText(content)}${buttons}</td></tr><tr><td style="padding:24px 12px;color:#59554e;font:13px/1.6 Arial,sans-serif">GDG at Georgia Tech<br>${footerHtml || 'Questions? Reply to this email or <a href="https://gdggt.dev/contact" style="color:#9b3326">contact the chapter</a>.'}</td></tr></table></td></tr></table></body></html>`;
}
