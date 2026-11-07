import { isMaintenanceDestination } from "./site-status-policy.mjs";

const keys = [
  "revision",
  "is_live",
  "message",
  "redirect_url",
  "button_text",
  "auto_redirect",
];

/**
 * Small browser reader for the six-field public JSON projection. The server's
 * authoritative write/read schemas remain independent. Parity tests compare
 * this reader with that schema; no schema-builder runtime is needed at startup.
 * Never return references or extra fields from an untrusted response/snapshot.
 * @param {unknown} input
 * @returns {{revision: number, is_live: boolean, message: string, redirect_url: string, button_text: string, auto_redirect: boolean} | undefined}
 */
export function readPublicSiteStatus(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return;
    if (
      Object.keys(input).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(input, key))
    )
      return;
    const value = /** @type {Record<string, unknown>} */ (input);
    const { revision, is_live, auto_redirect } = value;
    if (
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      typeof is_live !== "boolean" ||
      typeof auto_redirect !== "boolean" ||
      typeof value.message !== "string" ||
      typeof value.redirect_url !== "string" ||
      typeof value.button_text !== "string"
    )
      return;
    const message = value.message.trim(),
      redirect_url = value.redirect_url.trim(),
      button_text = value.button_text.trim();
    if (
      (value.message !== "" &&
        (message.length < 2 ||
          message.length > 2000 ||
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message))) ||
      redirect_url.length > 2000 ||
      !isMaintenanceDestination(redirect_url) ||
      button_text.length < 2 ||
      button_text.length > 80 ||
      (!is_live && message.length < 2) ||
      (auto_redirect && !redirect_url.startsWith("/l/"))
    )
      return;
    return {
      revision,
      is_live,
      message,
      redirect_url,
      button_text,
      auto_redirect,
    };
  } catch {
    // JSON has no accessors/proxies; malformed in-memory snapshots fail closed.
    return;
  }
}
