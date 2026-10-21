import { useEffect, useState } from "react";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button } from "@/ui/primitives";
import { activatePublicUpdate, hasWaitingUpdate, isPublicWorkerReady } from "./register";
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function PwaUpdateNotice() {
  const [waiting, setWaiting] = useState(hasWaitingUpdate), safety = useNavigationSafety();
  useEffect(() => { const update = () => setWaiting(hasWaitingUpdate()); window.addEventListener("gdg:pwa-update", update); return () => window.removeEventListener("gdg:pwa-update", update); }, []);
  if (!waiting) return null;
  return <aside className="gt-pwa-update" aria-label="Application update"><p>A new version is ready. Save your work before updating.</p><Button variant="secondary" onClick={() => { if (safety) safety.request(activatePublicUpdate); else activatePublicUpdate(); }}>Update this tab</Button></aside>;
}
export function InstallApp() {
  const [install, setInstall] = useState<InstallEvent>(), [installed, setInstalled] = useState(false), [notice, setNotice] = useState("");
  const [offlineReady, setOfflineReady] = useState(isPublicWorkerReady);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const ready = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); }, done = () => { setInstalled(true); setInstall(undefined); };
    window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", done);
    const available = () => setOfflineReady(isPublicWorkerReady()); window.addEventListener("gdg:pwa-ready", available);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); window.removeEventListener("gdg:pwa-ready", available); };
  }, []);
  return <details className="gt-install-help"><summary>{installed ? "App installed" : "Install the GDG@GT app"}</summary>
    {installed ? <p>You’re using the installed app. Core chapter workflows still work in a browser.</p> : <>
      <p>Chrome/Edge or Android: use Install app in your browser menu. iPhone/iPad: Safari → Share → Add to Home Screen.</p>
      {install && <Button variant="secondary" onClick={async () => { try { await install.prompt(); const choice = await install.userChoice; setNotice(choice.outcome === "accepted" ? "Installation requested." : "You can install later from the browser menu."); } catch { setNotice("Use your browser’s Install app menu to continue."); } finally { setInstall(undefined); } }}>Install app</Button>}
    </>}
    <p>Installation does not enable notifications. On iPhone and iPad, Web Push requires the Home Screen app and a separate opt-in.</p>
    <p role="status">{offlineReady ? "Public offline assets are ready on this device. Private workspace data and forms are never cached." : "Offline assets are not ready in this browser yet. Continue online; install and offline support require the production build."}</p>
    {notice && <p role="status">{notice}</p>}
  </details>;
}
