/** Select only the transport: the shared newsletter endpoint recognizes an
 * email-shaped gate on the server. No gate value or hash belongs in the client. */
export function newsletterEntryIntent(value: string, officerAccess = false) {
  return officerAccess || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? "gate"
    : "newsletter";
}
