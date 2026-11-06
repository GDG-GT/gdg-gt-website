export function authorizedPrivateDownload(value: unknown, startedAt: number) {
  const result = value as { url?: unknown; expiresIn?: unknown } | null;
  let url: URL;
  try {
    if (typeof result?.url !== "string") throw Error();
    url = new URL(result.url);
  } catch {
    throw Error(
      "The private download link could not be verified. Authorize it again.",
    );
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.hash ||
    typeof result?.expiresIn !== "number" ||
    !Number.isFinite(result.expiresIn) ||
    result.expiresIn <= 0 ||
    result.expiresIn > 60
  )
    throw Error(
      "The private download link could not be verified. Authorize it again.",
    );
  const expiresAt = startedAt + Math.min(55, result.expiresIn) * 1000;
  if (Date.now() < startedAt || Date.now() >= expiresAt)
    throw Error(
      "The download authorization expired before it arrived. Authorize it again.",
    );
  return { url: url.href, expiresAt, startedAt };
}
