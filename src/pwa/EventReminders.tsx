import { useEffect, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { api } from "@/lib/api";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { usePrivateOperation } from "@/hooks/usePrivateOperation";
import { Button, Field } from "@/ui/primitives";
type Config = {
  enabled: boolean;
  deliveryEnabled: boolean;
  publicKey?: string;
};
function applicationKey(value: string) {
  const bytes = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
}
export default function EventReminders({
  eventId,
  slug,
}: {
  eventId: string;
  slug: string;
}) {
  const { isAuthenticated } = useAdmin(),
    { busy, error, work } = usePrivateOperation();
  const [config, setConfig] = useState<Config>(),
    [supported, setSupported] = useState(false),
    [needsInstall, setNeedsInstall] = useState(false),
    [subscription, setSubscription] = useState<PushSubscription | null>(null),
    [following, setFollowing] = useState(false),
    [email, setEmail] = useState(""),
    [proof, setProof] = useState(""),
    [verified, setVerified] = useState(false),
    [notice, setNotice] = useState("");
  useDraftGuard(!!email, {
    busy,
    label: "Event reminder verification",
    privateDraft: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    const ios =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone;
    setNeedsInstall(ios && !standalone);
    setSupported(
      window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
    const params = new URLSearchParams(window.location.hash.slice(1)),
      incoming = params.get("reminder");
    if (incoming && /^[A-Za-z0-9_-]{43}$/.test(incoming)) {
      setProof(incoming);
      params.delete("reminder");
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname +
          window.location.search +
          (params.size ? "#" + params : ""),
      );
    }
    api<Config>("/push/config", { signal: controller.signal })
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice(
            "Reminder configuration could not be checked. Try again while online.",
          );
      });
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistration("/")
        .then(async (worker) => {
          const device = await worker?.pushManager.getSubscription();
          if (controller.signal.aborted || !device) return;
          setSubscription(device);
          const current = await api<{ subscribed: boolean }>("/push/status", {
            method: "POST",
            body: { eventId, subscription: device.toJSON() },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setFollowing(current.subscribed);
        })
        .catch(() => undefined);
    const clear = () => {
      setProof("");
      setVerified(false);
      setEmail("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      controller.abort();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [eventId]);
  async function enable() {
    // This function is called only from the visible opt-in button. No effect,
    // page load, verification or install action requests notification permission.
    await work(
      async (signal) => {
        if (!config?.publicKey || needsInstall || !supported)
          throw Error("Use a supported installed browser context first.");
        if (Notification.permission === "denied")
          throw Error(
            "Notifications are blocked. Change this site's permission in browser settings if you want reminders.",
          );
        const permission = await Notification.requestPermission();
        signal.throwIfAborted();
        if (permission !== "granted")
          throw Error(
            "Notifications were not enabled. Core event registration still works.",
          );
        const worker = await navigator.serviceWorker.getRegistration("/");
        signal.throwIfAborted();
        if (!worker?.active)
          throw Error(
            "The app's background worker is not ready. Continue online or install the production build first.",
          );
        const device =
          (await worker.pushManager.getSubscription()) ||
          (await worker.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationKey(config.publicKey),
          }));
        signal.throwIfAborted();
        setSubscription(device);
        return api<{ subscribed: boolean }>("/push/subscribe", {
          method: "POST",
          protected: !proof,
          body: {
            eventId,
            subscription: device.toJSON(),
            ...(proof ? { registrationToken: proof } : {}),
          },
          signal,
        });
      },
      (result) => {
        setFollowing(result.subscribed);
        setNotice(
          "This device is following the event. A reminder is scheduled around 24 hours before it starts. Delivery depends on your browser and device.",
        );
      },
    );
  }
  return (
    <section
      className="gt-event-reminders"
      aria-labelledby="event-reminder-title"
    >
      <h3 id="event-reminder-title">Optional event reminder</h3>
      <p>
        Enable a device notification around 24 hours before this event.
        Registration does not enable notifications automatically.
      </p>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {following && subscription ? (
        <>
          <p>You’re following this event on this device.</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              work(
                (signal) =>
                  api("/push/unsubscribe", {
                    method: "POST",
                    body: { eventId, subscription: subscription.toJSON() },
                    signal,
                  }),
                () => {
                  setFollowing(false);
                  setNotice(
                    "This event reminder is off. Your browser subscription may still serve other events; no other reminders were changed.",
                  );
                },
              )
            }
          >
            Turn off this event reminder
          </Button>
        </>
      ) : !config ? (
        <p>Checking reminder availability…</p>
      ) : !config.enabled ? (
        <p>
          Event reminders are not available yet. You can still add the event to
          your calendar.
        </p>
      ) : needsInstall ? (
        <p>
          On iPhone or iPad, open Safari → Share → Add to Home Screen, then open
          the installed app to enable reminders. No permission prompt is
          requested here.
        </p>
      ) : !supported ? (
        <p>
          This browser does not support notifications here. You can still use
          the calendar download.
        </p>
      ) : (
        <>
          {!config.deliveryEnabled && (
            <p>
              Local testing only: push delivery is disabled. This setup will not
              send a device notification.
            </p>
          )}
          {proof && !verified ? (
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() =>
                work(
                  (signal) =>
                    api<{ eventId: string }>("/push/inspect-verification", {
                      method: "POST",
                      body: { token: proof },
                      signal,
                    }),
                  (result) => {
                    if (result.eventId !== eventId)
                      setNotice(
                        "This verification is for a different event. Open its original email link.",
                      );
                    else {
                      setVerified(true);
                      setNotice(
                        "Registration verified for this tab. Enabling notifications is a separate choice.",
                      );
                    }
                  },
                )
              }
            >
              Verify this registration link
            </Button>
          ) : isAuthenticated || verified ? (
            <Button
              disabled={
                busy || !config.deliveryEnabled || !import.meta.env.PROD
              }
              variant="secondary"
              onClick={enable}
            >
              Enable this event reminder
            </Button>
          ) : (
            <form
              className="gt-form"
              onSubmit={(e) => {
                e.preventDefault();
                void work(
                  (signal) =>
                    api<{ message: string }>("/push/verify-registration", {
                      method: "POST",
                      body: { slug, email, website: "" },
                      signal,
                    }),
                  (result) => {
                    setNotice(result.message);
                    setEmail("");
                  },
                );
              }}
            >
              <Field label="Your registration email" required>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  disabled={busy}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button disabled={busy} variant="secondary">
                Email a private verification link
              </Button>
            </form>
          )}
          {!import.meta.env.PROD && (
            <p>
              Browser notification enrollment requires the production build’s
              active background worker. Development pages do not register one.
            </p>
          )}
        </>
      )}
      <p className="gt-helper">
        Reminders reveal only a generic event notice on the lock screen. Keep
        private verification links out of shared devices. Turning off one event
        does not change your registration or other reminders.
      </p>
    </section>
  );
}
