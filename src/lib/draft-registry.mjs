// Only transient booleans and generic editor labels live here, never draft bodies.
export function createDraftRegistry() {
  const entries = new Map();
  let approvedDepth = 0;
  return {
    register(id, read) {
      const entry = { read, suppressed: false };
      entries.set(id, entry);
      return () => {
        if (entries.get(id) === entry) entries.delete(id);
      };
    },
    states() {
      return [...entries.values()]
        .filter((entry) => !entry.suppressed)
        .map((entry) => entry.read())
        .filter((s) => s.dirty || s.busy);
    },
    shouldBlock() {
      return approvedDepth === 0 && this.states().length > 0;
    },
    allow(run) {
      approvedDepth++;
      try {
        return run();
      } finally {
        approvedDepth--;
      }
    },
    clearPrivate() {
      for (const entry of entries.values())
        if (entry.read().privateDraft) entry.suppressed = true;
    },
  };
}
