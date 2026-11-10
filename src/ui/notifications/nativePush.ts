import { nativeWorkspace, postNativeWorkspace } from "../rewards/nativeScanner";
export type NativePushState = { permission: string; installationId?: string; token?: string; environment?: string; platform?: "ios" };
export function nativePushAvailable() {
  return nativeWorkspace() && (window as Window & { gdgScanner?: { push?: boolean } }).gdgScanner?.push === true;
}
export function requestNativePush(method: "status" | "enable", signal?: AbortSignal): Promise<NativePushState> {
  if (!nativePushAvailable()) return Promise.reject(Error("Update GDG Workspace to enable device notifications."));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, state?: NativePushState) => {
      clearTimeout(timer); window.removeEventListener("gdg:native-push-result", receive); signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(state!);
    };
    const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
    const receive = (event: Event) => {
      const reply = (event as CustomEvent<{ id: string; error?: string; state?: NativePushState }>).detail;
      if (reply?.id !== id) return;
      if (reply.error) finish(Error(reply.error));
      else if (reply.state && typeof reply.state.permission === "string") finish(undefined, reply.state);
      else finish(Error("Notification status could not be read."));
    };
    const timer = window.setTimeout(() => finish(Error("Notifications could not be set up. Try again.")), 30000);
    window.addEventListener("gdg:native-push-result", receive);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) return cancel();
    postNativeWorkspace({ action: "appPush", id, method });
  });
}
