import { useCallback, useEffect, useState } from "react";
import { useUrlCapability } from "@/hooks/useUrlCapability";
import { Brand, Button } from "../primitives";
import "./rewards.css";
type Card = {
  name: string;
  reference: string;
  apple: boolean;
  google: boolean;
  googlePending?: boolean;
};
export default function EmailedPass() {
  const [ticket] = useUrlCapability("ticket");
  const [card, setCard] = useState<Card>();
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useCallback(
    async (provider: string, signal?: AbortSignal) => {
      const response = await fetch("/api/v1/rewards/email-pass", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, provider }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(
          body.error?.message || "Your card could not be opened. Try again.",
        );
      }
      return response;
    },
    [ticket],
  );
  useEffect(() => {
    const controller = new AbortController();
    if (!ticket) {
      setError("Open the private card link from your membership email.");
      return;
    }
    void (async () => {
      const info = await (await request("info", controller.signal)).json();
      if (controller.signal.aborted) return;
      setCard(info.data);
      const code = await (await request("qr", controller.signal)).json();
      const QRCode = (await import("qrcode")).default;
      const image = await QRCode.toDataURL(code.data.credential, {
        width: 600,
        margin: 4,
      });
      if (!controller.signal.aborted) setQr(image);
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [ticket, request]); // The capability is held in memory after its URL fragment is stripped.
  const wallet = async (provider: "apple" | "google") => {
    setBusy(true);
    setError("");
    try {
      const response = await request(provider);
      if (provider === "google") {
        const { data } = await response.json();
        const url = new URL(data.url);
        if (
          url.origin !== "https://pay.google.com" ||
          !url.pathname.startsWith("/gp/v/save/")
        )
          throw new Error("The Wallet link could not be verified.");
        window.location.assign(url.href);
      } else {
        const blob = await response.blob(),
          url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "GDG-Membership.pkpass";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The pass could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="rewards-emailed-pass" aria-label="Your membership card">
      <Brand compact />
      <h1>Your membership card</h1>
      {error && <p role="alert">{error}</p>}
      {!card && !error && <p role="status">Opening your card…</p>}
      {card && (
        <>
          <h2>{card.name}</h2>
          <p>Pass ending {card.reference}</p>
          {qr ? (
            <>
              <img
                src={qr}
                width="280"
                height="280"
                alt="Your private GDG membership QR"
              />
              <a
                className="gt-button gt-button-secondary"
                href={qr}
                download={`GDG-Member-${card.reference}.png`}
              >
                Save QR image
              </a>
            </>
          ) : (
            <p role="status">Preparing QR…</p>
          )}
          <div className="rewards-email-wallet-actions">
            {card.apple && (
              <Button disabled={busy} onClick={() => void wallet("apple")}>
                Add to Apple Wallet
              </Button>
            )}
            {card.google && (
              <Button disabled={busy} onClick={() => void wallet("google")}>
                Add to Google Wallet
              </Button>
            )}
            {card.googlePending && (
              <>
                <Button disabled>Add to Google Wallet</Button>
                <p>Google Wallet is awaiting publishing approval.</p>
              </>
            )}
          </div>
          <p>Show your QR at chapter check-in.</p>
        </>
      )}
    </main>
  );
}
