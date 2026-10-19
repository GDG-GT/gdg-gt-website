type LockState = { count: number; restore: () => void };
const locks = new WeakMap<Document, LockState>();

/** Shared ownership prevents overlapping modals restoring a stale scroll lock. */
export function lockDocumentScroll(doc: Document = document): () => void {
  let state = locks.get(doc);
  if (!state) {
    const body = doc.body;
    const html = doc.documentElement;
    const view = doc.defaultView;
    const scrollY = view?.scrollY || 0;
    const bodyValues = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const htmlOverflow = html.style.overflow;
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    state = {
      count: 0,
      restore: () => {
        Object.assign(body.style, bodyValues);
        html.style.overflow = htmlOverflow;
        view?.scrollTo({ top: scrollY, behavior: 'instant' });
      },
    };
    locks.set(doc, state);
  }
  state.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count === 0) {
      locks.delete(doc);
      state.restore();
    }
  };
}
