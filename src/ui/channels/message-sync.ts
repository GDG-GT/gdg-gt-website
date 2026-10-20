export type SequencedMessage = {
  id: string;
  created_at: string;
  creation_sequence: number;
  change_sequence: number;
  is_pinned: boolean;
  is_deleted: boolean;
  message?: string;
  reply?: { id: string; message: string; is_deleted: boolean } | null;
};
/** Never let an older history response replace a newer edit or tombstone. */
export function mergeMessageHistory<T extends SequencedMessage>(
  previous: T[],
  incoming: T[],
  pinned: boolean,
): T[] {
  const merged = new Map(previous.map((m) => [m.id, m]));
  for (const m of incoming) {
    const known = merged.get(m.id);
    if (!known || known.change_sequence < m.change_sequence)
      merged.set(m.id, m);
  }
  return [...merged.values()]
    .filter((m) => !pinned || (m.is_pinned && !m.is_deleted))
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
}
/** Old unloaded edits do not suddenly expand the user's history window. */
export function mergeMessageChanges<T extends SequencedMessage>(
  previous: T[],
  incoming: T[],
  baseline: number,
  pinned: boolean,
): T[] {
  const known = new Set(previous.map((m) => m.id));
  const changed = new Map(incoming.map((m) => [m.id, m]));
  const refreshed = previous.map((m) => {
    const original = m.reply && changed.get(m.reply.id);
    return original
      ? {
          ...m,
          reply: {
            id: original.id,
            message: original.is_deleted
              ? ""
              : (original.message || "").slice(0, 200),
            is_deleted: original.is_deleted,
          },
        }
      : m;
  });
  return mergeMessageHistory(
    refreshed,
    incoming.filter(
      (m) => pinned || known.has(m.id) || m.creation_sequence > baseline,
    ),
    pinned,
  );
}
