type Address = Pick<Location, "pathname" | "search" | "hash">;
export const formCapabilityNames = [
  "access",
  "resume",
  "edit",
  "upload",
] as const;
/** Private signature stays in memory. Never use it as a DOM ID, log or React key. */
export function capabilitySignature(
  address: Address,
  names: readonly string[],
  allowQuery = false,
): string | undefined {
  const fragment = new URLSearchParams(address.hash.slice(1)),
    query = new URLSearchParams(address.search);
  if (
    !names.some((name) => fragment.has(name) || (allowQuery && query.has(name)))
  )
    return undefined;
  return JSON.stringify(
    names.map((name) => [
      name,
      fragment.has(name)
        ? fragment.getAll(name)
        : allowQuery
          ? query.getAll(name)
          : [],
    ]),
  );
}
export function readUrlCapability(
  address: Address,
  name: string,
  allowQuery = false,
): string {
  return (
    new URLSearchParams(address.hash.slice(1)).get(name) ||
    (allowQuery ? new URLSearchParams(address.search).get(name) : "") ||
    ""
  );
}
export function stripUrlCapabilities(
  history: Pick<History, "state" | "replaceState">,
  address: Address,
  names: readonly string[],
  allowQuery = false,
) {
  if (capabilitySignature(address, names, allowQuery) === undefined)
    return false;
  const fragment = new URLSearchParams(address.hash.slice(1)),
    query = new URLSearchParams(address.search);
  for (const name of names) {
    fragment.delete(name);
    if (allowQuery) query.delete(name);
  }
  const next =
    address.pathname +
    (query.size ? "?" + query : "") +
    (fragment.size ? "#" + fragment : "");
  history.replaceState(history.state, "", next);
  return true;
}
function scopeFor(
  path: string,
): { names: readonly string[]; query?: boolean } | undefined {
  if (/^\/forms\/[^/]+$/.test(path)) return { names: formCapabilityNames };
  if (path === "/account/setup") return { names: ["token"] };
  if (path === "/pass") return { names: ["ticket"] };
  if (path === "/team/join") return { names: ["invite"] };
  if (/^\/newsletter\/(confirm|unsubscribe)$/.test(path))
    return { names: ["token"], query: true };
  if (/^\/events\/[^/]+$/.test(path)) return { names: ["reminder"] };
}
export function navigationChangesContext(
  current: Address,
  next: Address,
): boolean {
  if (current.pathname !== next.pathname || current.search !== next.search)
    return true;
  const scope = scopeFor(next.pathname);
  if (!scope) return false;
  const incoming = capabilitySignature(next, scope.names, scope.query);
  return (
    incoming !== undefined &&
    incoming !== capabilitySignature(current, scope.names, scope.query)
  );
}
