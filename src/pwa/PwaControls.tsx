import { useEffect, useState } from "react";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button } from "@/ui/primitives";
import { activatePublicUpdate, hasWaitingUpdate } from "./register";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaUpdateNotice() {
  const [waiting, setWaiting] = useState(hasWaitingUpdate),
    safety = useNavigationSafety();
  useEffect(() => {
    const update = () => setWaiting(hasWaitingUpdate());
    window.addEventListener("gdg:pwa-update", update);
    return () => window.removeEventListener("gdg:pwa-update", update);
  }, []);
  if (!waiting) return null;
  return (
    <aside className="gt-pwa-update" aria-label="Application update">
      <p>A new version is ready. Save your work before updating.</p>
      <Button
        variant="secondary"
        onClick={() => {
          if (safety) safety.request(activatePublicUpdate);
          else activatePublicUpdate();
        }}
      >
        Update this tab
      </Button>
    </aside>
  );
}
export function InstallApp() {
  const [install, setInstall] = useState<InstallEvent>(),
    [installed, setInstalled] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const ready = (e: Event) => {
        e.preventDefault();
        setInstall(e as InstallEvent);
      },
      done = () => {
        setInstalled(true);
        setInstall(undefined);
      };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <details className="gt-install-help">
      <summary>
        {installed ? "App installed" : "Add GDG@GT to your home screen"}
      </summary>
      {installed ? (
        <p>GDG@GT is installed on this device.</p>
      ) : (
        <>
          <p>
            On iPhone, open this page in Safari and choose Share, then Add to
            Home Screen. On Android, choose Install app from your browser menu.
          </p>
          {install && (
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await install.prompt();
                  const choice = await install.userChoice;
                  setNotice(
                    choice.outcome === "accepted"
                      ? "Installation requested."
                      : "You can install later from the browser menu.",
                  );
                } catch {
                  setNotice("Use your browser’s Install app menu to continue.");
                } finally {
                  setInstall(undefined);
                }
              }}
            >
              Install app
            </Button>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
