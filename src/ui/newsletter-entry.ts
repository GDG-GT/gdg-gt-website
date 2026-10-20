/** Email-shaped officer codes require an explicit gate gesture, never a public
 * copy of the code/hash or password checking through the subscription endpoint. */
export function newsletterEntryIntent(value: string, officerAccess = false) {
  return officerAccess || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? "gate"
    : "newsletter";
}
