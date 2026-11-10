/** Accept ordinary pasted hostnames while leaving schemes and paths for validation. */
export function normalizeProfileLink(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?:[/?#]|$)/i.test(trimmed) ? "https://" + trimmed : trimmed;
}
