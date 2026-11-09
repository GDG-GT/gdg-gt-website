import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { emailDocument, emailText, escapeEmail } from "../shared/email.mjs";
import { decryptPayload } from "./lib/encryption.mjs";
import { ApiError } from "./lib/http.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { walletConfiguration, generateMemberPass } from "./rewards-wallet.mjs";
import {
  googleWalletConfiguration,
  generateGoogleMemberPass,
} from "./rewards-google-wallet.mjs";

const lifetime = 7 * 24 * 60 * 60 * 1000;
const signature = (id, expires, secret) =>
  createHmac("sha256", secret)
    .update(`gdg-credential-email/v1\0${id}\0${expires}`)
    .digest("base64url");
export function emailPassTicket(jobId, createdAt, secret) {
  const expires = Math.floor((Date.parse(createdAt) + lifetime) / 1000);
  return `${jobId}.${expires}.${signature(jobId, expires, secret)}`;
}
export function verifyEmailPassTicket(ticket, secret, now = Date.now()) {
  if (
    typeof ticket !== "string" ||
    !/^[0-9a-f-]{36}\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/.test(ticket)
  )
    return null;
  const [id, expiry, mac] = ticket.split("."),
    expires = Number(expiry);
  if (expires * 1000 <= now || expires * 1000 > now + lifetime + 1000)
    return null;
  const expected = signature(id, expiry, secret);
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? id : null;
}
export async function rewardCredentialMessage(
  job,
  db,
  config,
  mail,
  env = process.env,
) {
  const row = checked(
    await db.rpc("prepare_reward_credential_email", {
      p_job: job.id,
      p_lease: job.lease_token,
    }),
  );
  if (!row) return null;
  const { credential } = decryptPayload(
    row.encryptedToken,
    config.encryptionSecret,
  );
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential))
    throw new ApiError(
      503,
      "CREDENTIAL_UNAVAILABLE",
      "This credential could not be prepared.",
    );
  const ticket = emailPassTicket(
    job.id,
    row.createdAt,
    config.encryptionSecret,
  );
  const base = config.rewardsOrigin || config.origin;
  const passLink = `${base}/pass#ticket=${ticket}`;
  const reference = row.id.replaceAll("-", "").slice(-4).toUpperCase();
  const card = row.kind === "card";
  const subject = card
    ? "Your GDG member card is registered"
    : "Your GDG membership card";
  const content = `Hi ${row.name},\n\n${card ? "Your NFC member card is registered." : "Your membership card is ready."} ${card ? "Card" : "Pass"} reference: ending ${reference}.\n\nShow the QR at chapter check-in. It connects to your existing membership and points.\n\nOpen your card and Wallet options: ${passLink}\n\nWallet download links expire in 7 days. Your QR stays valid until the chapter revokes or replaces it. Keep this email private. If this card was not issued for you, reply to this email.`;
  const png = await QRCode.toBuffer(credential, {
    width: 600,
    margin: 4,
    errorCorrectionLevel: "M",
  });
  const actions = [{ label: "Open my membership card", url: passLink }];
  if (walletConfiguration(env))
    actions.push({
      label: "Add to Apple Wallet",
      url: passLink + "&wallet=apple",
    });
  const google = googleWalletConfiguration(env);
  if (google)
    actions.push({
      label: "Add to Google Wallet",
      url: passLink + "&wallet=google",
    });
  const bodyHtml =
    emailText(
      `Hi ${row.name},\n\n${card ? "Your NFC member card is registered." : "Your membership card is ready."}`,
    ) +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f0e6dc;border-radius:12px"><tr><td align="center" style="padding:24px 16px"><p style="margin:0 0 6px;font:bold 20px/1.4 Arial,sans-serif">${escapeEmail(row.name)}</p><p style="margin:0 0 18px;color:#59554e">${card ? "Card" : "Pass"} ending <strong>${reference}</strong></p><img src="cid:gdg-member-qr" alt="Your private GDG membership QR. The same image is attached to this email." width="240" height="240" style="display:block;max-width:100%;height:auto;border-radius:8px"><p style="margin:16px 0 0">Show this QR at chapter check-in.</p></td></tr></table>` +
    emailText(
      "Wallet download links expire in 7 days. Your QR stays valid until the chapter revokes or replaces it. Keep this email private.\n\nIf you did not request this card, reply to this email.",
    );
  // Recipient comes only from the leased, current directory record, never input.
  return {
    from: mail.from,
    to: row.email,
    subject,
    text: content,
    html: emailDocument({
      subject,
      bodyHtml,
      actions,
      preheader: `Your membership QR and Wallet options · ending ${reference}`,
    }),
    attachments: [
      {
        filename: `GDG-Member-${reference}-inline.png`,
        content: png.toString("base64"),
        contentType: "image/png",
        contentId: "gdg-member-qr",
      },
      {
        filename: `GDG-Member-${reference}.png`,
        content: png.toString("base64"),
        contentType: "image/png",
      },
    ],
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    headers: { "X-GDG-Job-ID": job.id },
    messageId: `<${job.id}@gdg.local>`,
  };
}

export async function emailedPass({
  ticket,
  provider,
  db,
  config,
  env,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const id = verifyEmailPassTicket(ticket, config.encryptionSecret, now);
  const missing = () =>
    new ApiError(
      404,
      "PASS_LINK_UNAVAILABLE",
      "This card link has expired or is no longer available. Ask the chapter to resend it.",
    );
  if (!id) throw missing();
  const lookup = () => db.rpc("reward_email_pass", { p_job: id });
  const row = checked(await lookup());
  if (
    !row ||
    emailPassTicket(id, row.createdAt, config.encryptionSecret) !== ticket
  )
    throw missing();
  const google = googleWalletConfiguration(env),
    apple = walletConfiguration(env);
  if (provider === "info")
    return {
      name: row.name,
      reference: row.id.replaceAll("-", "").slice(-4).toUpperCase(),
      apple: !!apple,
      google: !!google?.approved,
      googlePending: !!google && !google.approved,
    };
  const { credential } = decryptPayload(
    row.encryptedToken,
    config.encryptionSecret,
  );
  if (provider === "qr") return { credential };
  if (provider === "google" && !google?.approved)
    throw new ApiError(
      503,
      "GOOGLE_WALLET_UNAVAILABLE",
      "Google Wallet is awaiting publishing approval.",
    );
  const result = await (
    provider === "google" ? generateGoogleMemberPass : generateMemberPass
  )({
    credential,
    id: row.id,
    name: row.name,
    origin: config.rewardsOrigin || config.origin,
    env,
    fetchImpl,
  });
  if (!checked(await lookup())) throw missing();
  return result;
}
