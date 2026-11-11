import { useWorkspaceReadiness } from "@/contexts/WorkspaceReadinessContext";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { Button } from "../primitives";
import { nativeWorkspace } from "../rewards/nativeScanner";
import { nativePushAvailable, requestNativePush, type NativePushState } from "./nativePush";
const categories = { forms: "Form responses", events: "Events and registrations", newsletter: "Chapter news", accounts: "Account updates", id: "Membership cards and Wallet", contact: "Contact messages", workspace: "Tasks, messages and team updates" };
type Preferences = Record<keyof typeof categories, boolean>;
type Settings = { preferences: Preferences; devices: { id: string; platform: string; label: string; lastSeen: string; installationId: string }[]; config: { ios: boolean; web: boolean; publicKey?: string } };
const root = "/admin/app-notifications";
function installation() {
  let id = localStorage.getItem("gdg-push-installation");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) { id = crypto.randomUUID(); localStorage.setItem("gdg-push-installation", id); }
  return id;
}
async function syncNativePush(settings: Settings, state: NativePushState, signal?: AbortSignal) {
  if (!state.token || !state.installationId || !["authorized", "provisional"].includes(state.permission)) return;
  if ((state.platform === "ios" && !settings.config.ios)) return;
  return api<{ id: string }>(root + "/devices", { method: "POST", protected: true, signal, body: { platform: state.platform, installationId: state.installationId, environment: state.environment || "production", token: state.token, label: "iPhone app" } });
}
/** Silent token refresh only; requesting permission belongs to the visible Enable button. */
export function NativeNotificationSync() {
  const { currentAdmin } = useAdmin();
  const accountId = currentAdmin?.id;
  useEffect(() => {
    if (!accountId || !nativePushAvailable()) return;
    const controller = new AbortController(); let pending = false;
    const update = async () => {
      if (document.hidden || pending || controller.signal.aborted) return;
      pending = true;
      try {
        const settings = await api<Settings>(root, { signal: controller.signal });
        const state = await requestNativePush("status", controller.signal);
        if (settings.devices.some(device => device.installationId === state.installationId)) await syncNativePush(settings, state, controller.signal);
      } catch { /* Explicit settings exposes permission/configuration errors; token retries follow lifecycle. */ }
      finally { pending = false; }
    };
    void update(); window.addEventListener("focus", update); document.addEventListener("visibilitychange", update);
    return () => { controller.abort(); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, [accountId]);
  return null;
}
export default function NotificationSettings() {
  const { currentAdmin } = useAdmin();
  return currentAdmin ? <NotificationSettingsContent key={currentAdmin.id} /> : null;
}
function NotificationSettingsContent() {
  const [data, setData] = useState<Settings>(), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useWorkspaceReadiness(!data && !error);
  const operation = useRef<AbortController>(), pending = useRef(false);
  useEffect(() => { const controller = new AbortController(); operation.current = controller; api<Settings>(root, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => operation.current?.abort(); }, []);
  const work = async (action: (signal: AbortSignal) => Promise<void>) => {
    if (pending.current) return; pending.current = true; const controller = new AbortController(); operation.current?.abort(); operation.current = controller; setBusy(true); setError(""); setNotice("");
    try { await action(controller.signal); if (!controller.signal.aborted) setData(await api<Settings>(root, { signal: controller.signal })); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Notifications could not be updated."); }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  };
  const enable = () => work(async signal => {
    if (!data) return;
    if (nativeWorkspace()) {
      const state = await requestNativePush("enable", signal);
      if (!["authorized", "provisional"].includes(state.permission)) throw Error("Notifications are off. You can allow them in your device settings.");
      const saved = await syncNativePush(data, state, signal);
      if (!saved) throw Error("Notifications for this device are not ready yet.");
    } else {
      if (!data.config.web || !data.config.publicKey || !("Notification" in window) || !("serviceWorker" in navigator)) throw Error("Use the latest app or a browser that supports notifications.");
      if (await Notification.requestPermission() !== "granted") throw Error("Allow notifications in your browser or device settings to continue.");
      const worker = await navigator.serviceWorker.getRegistration("/");
      if (!worker?.active || !worker.pushManager) throw Error("Install the app before enabling notifications on this device.");
      const bytes = Uint8Array.from(atob(data.config.publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
      const subscription = await worker.pushManager.getSubscription() || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      await api(root + "/devices", { method: "POST", protected: true, signal, body: { platform: "web", installationId: installation(), environment: "production", subscription: subscription.toJSON(), label: "Browser app" } });
    }
    setNotice("Notifications enabled on this device.");
  });
  return <section className="gt-notification-settings" aria-label="Notification settings">
    <h2>Device notifications</h2>
    <p>Get your chapter updates even when the app is closed.</p>
    {error && <p role="alert" className="gt-form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data ? <Button variant="secondary" onClick={() => work(async () => {})} disabled={busy}>Retry notification settings</Button> : <>
      <Button onClick={enable} disabled={busy}>Enable on this device</Button>
      <fieldset disabled={busy} className="gt-notification-options"><legend>Notify me about</legend>
        {(Object.entries(categories) as [keyof Preferences, string][]).map(([key, label]) => <label className="gt-check" key={key}><input type="checkbox" checked={data.preferences[key]} onChange={e => { if (pending.current) return; const previous = data, preferences = { ...data.preferences, [key]: e.target.checked }; setData({ ...data, preferences }); void work(async signal => { try { await api(root + "/preferences", { method: "PATCH", protected: true, signal, body: preferences }); setNotice("Notification preferences saved."); } catch (error) { if (!signal.aborted) setData(previous); throw error; } }); }} />{label}</label>)}
      </fieldset>
      {!!data.devices.length && <><h3>Enabled devices</h3><ul className="gt-notification-devices">{data.devices.map(device => <li key={device.id}><span>{device.label}</span><Button variant="ghost" disabled={busy} onClick={() => work(async signal => { await api(root + "/devices/" + device.id, { method: "DELETE", protected: true, signal }); setNotice("Notifications turned off for that device."); })}>Turn off <span className="sr-only">{device.label}</span></Button></li>)}</ul></>}
    </>}
  </section>;
}
