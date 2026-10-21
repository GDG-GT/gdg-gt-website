export function draftDaysRemaining(createdAt, expiresAt, now = Date.now()) {
  const created = new Date(createdAt).getTime(), expires = new Date(expiresAt).getTime(), day = 86400000;
  if (![created, expires, now].every(Number.isFinite)) return 0;
  // A database clock a few milliseconds ahead must not turn a two-day private
  // link into a three-day promise. The stored absolute expiry is authoritative;
  // the approximate day counter can never exceed the original stored lifetime.
  return Math.max(0, Math.min(Math.ceil((expires - created) / day), Math.ceil((expires - now) / day)));
}
