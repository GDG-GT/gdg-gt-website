/** Narrow bridge to the owned iPhone scanner. Credentials never enter storage. */
type Action = "readCard" | "writeCard" | "readWallet";
type Reply = { id: string; value?: string; error?: string };
type NativeWindow = Window & {
  gdgScanner?: { version: number; wallet: boolean };
  webkit?: {
    messageHandlers?: {
      gdgScanner?: { postMessage: (message: unknown) => void };
    };
  };
};
export function nativeScanner() {
  if (typeof window === "undefined") return null;
  const w = window as NativeWindow;
  return w.gdgScanner?.version === 1 && w.webkit?.messageHandlers?.gdgScanner
    ? w.gdgScanner
    : null;
}
export function scanNative(
  action: Action,
  payload: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<string> {
  const w = window as NativeWindow,
    handler = w.webkit?.messageHandlers?.gdgScanner;
  if (!nativeScanner() || !handler)
    return Promise.reject(
      new Error("Open the GDG Scanner app to use iPhone NFC."),
    );
  if (signal?.aborted)
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("gdg:scanner-result", receive);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("gdg:session-cleared", cancel);
      signal?.removeEventListener("abort", cancel);
      if (error) {
        try {
          handler.postMessage({ id, action: "cancel" });
        } catch {
          /* view already closed */
        }
        reject(error);
      } else resolve(value!);
    };
    const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
    const hidden = () => {
      if (document.hidden) cancel();
    };
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Reply>).detail;
      if (detail?.id !== id) return;
      if (typeof detail.error === "string") finish(new Error(detail.error));
      else if (typeof detail.value === "string" && detail.value.length <= 1024)
        finish(undefined, detail.value);
      else finish(new Error("The scanner returned an invalid response."));
    };
    const timer = setTimeout(
      () => finish(new Error("NFC timed out. Try again.")),
      70000,
    );
    window.addEventListener("gdg:scanner-result", receive);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("gdg:session-cleared", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      handler.postMessage({ id, action, ...payload });
    } catch {
      finish(new Error("The scanner could not start."));
    }
  });
}

/** App chrome uses the same permission-filtered destinations and router guards. */
export function nativeWorkspace() {
  return (
    nativeScanner() &&
    (window as NativeWindow & { gdgScanner?: { admin?: boolean } }).gdgScanner
      ?.admin === true
  );
}
export function postNativeWorkspace(message: Record<string, unknown>) {
  const handler = (
    window as Window & {
      webkit?: {
        messageHandlers?: {
          gdgAdmin?: { postMessage: (message: unknown) => void };
        };
      };
    }
  ).webkit?.messageHandlers?.gdgAdmin;
  if (nativeWorkspace()) handler?.postMessage(message);
}
