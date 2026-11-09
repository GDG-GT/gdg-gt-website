type DialogRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
type Pending = DialogRequest & { resolve: (accepted: boolean) => void };
let active: Pending | null = null;
const waiting: Pending[] = [],
  listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
export function confirmAction(
  message: string,
  options: Omit<DialogRequest, "message"> = {
    title: "Discard unsaved changes?",
  },
) {
  return new Promise<boolean>((resolve) => {
    const next = { ...options, message, resolve };
    if (active) waiting.push(next);
    else active = next;
    emit();
  });
}
export const appDialogs = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: () => active,
  settle(accepted: boolean) {
    const held = active;
    active = waiting.shift() || null;
    emit();
    held?.resolve(accepted);
  },
  cancelAll() {
    const held = active,
      rest = waiting.splice(0);
    active = null;
    emit();
    held?.resolve(false);
    rest.forEach((item) => item.resolve(false));
  },
};
