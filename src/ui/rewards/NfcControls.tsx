import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { nativeScanner, scanNative } from "./nativeScanner";
import { Button, Field } from "../primitives";
import { parseCardPayload } from "../../../shared/rewards.mjs";
type NfcRecord = { recordType: string; data: DataView };
type NfcReader = {
  scan: (options: { signal: AbortSignal }) => Promise<void>;
  write: (
    message: unknown,
    options: { signal: AbortSignal; overwrite: boolean },
  ) => Promise<void>;
  onreading: ((event: { message: { records: NfcRecord[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};
type NfcConstructor = new () => NfcReader;
const nfc = () =>
  (window as unknown as { NDEFReader?: NfcConstructor }).NDEFReader;
export default function NfcControls({
  onRead,
  writeUrl,
}: {
  onRead?: (token: string) => void;
  writeUrl?: string;
}) {
  const [status, setStatus] = useState(""),
    [active, setActive] = useState(false),
    [supported, setSupported] = useState(false),
    [native, setNative] = useState(false),
    [walletReady, setWalletReady] = useState(false),
    [camera, setCamera] = useState(false),
    [manual, setManual] = useState("");
  const controller = useRef<AbortController>(),
    video = useRef<HTMLVideoElement>(null),
    scanner = useRef<{ stop: () => void; destroy: () => void }>();
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const acceptRef = useRef<(value: string) => void>(() => {});
  const stop = () => {
    controller.current?.abort();
    scanner.current?.stop();
    scanner.current?.destroy();
    scanner.current = undefined;
    setCamera(false);
    setActive(false);
  };
  useEffect(() => {
    setSupported(!!nfc() || !!nativeScanner());
    setNative(!!nativeScanner());
    if (nativeScanner()?.wallet && onReadRef.current) {
      const capability = new AbortController();
      void api<{ available: boolean }>("/admin/rewards/wallet-reader", {
        signal: capability.signal,
      })
        .then((r) => {
          if (!capability.signal.aborted) setWalletReady(r.available);
        })
        .catch(() => {});
      controller.current = capability;
    }
    const hidden = () => {
      if (document.hidden) {
        controller.current?.abort();
        scanner.current?.stop();
        setActive(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      controller.current?.abort();
      scanner.current?.destroy();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const accept = (value: string) => {
    const token = parseCardPayload(value, window.location.origin);
    if (!token) {
      setStatus("This is not a GDG member credential.");
      return;
    }
    stop();
    setStatus("Credential read. Check the member before awarding points.");
    onReadRef.current?.(token);
  };
  acceptRef.current = accept;
  const scan = async () => {
    try {
      stop();
      if (nativeScanner()) {
        controller.current = new AbortController();
        setActive(true);
        setStatus("Hold the member card near the top of your iPhone.");
        accept(await scanNative("readCard", {}, controller.current.signal));
        return;
      }
      const C = nfc();
      if (!C) throw Error();
      const reader = new C();
      controller.current = new AbortController();
      reader.onreading = (e) => {
        const record = e.message.records.find(
          (r) => r.recordType === "url" || r.recordType === "text",
        );
        if (record) accept(new TextDecoder().decode(record.data));
        else setStatus("No supported credential was found on this card.");
      };
      reader.onreadingerror = () =>
        setStatus("Card could not be read. Hold it still and try again.");
      await reader.scan({ signal: controller.current.signal });
      setActive(true);
      setStatus("Ready. Hold a member card near the NFC reader.");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setStatus(
          nativeScanner()
            ? (e as Error).message
            : "NFC is unavailable or permission was denied. Check NFC settings and try again.",
        );
    } finally {
      if (nativeScanner()) setActive(false);
    }
  };
  const write = async () => {
    try {
      stop();
      if (nativeScanner() && writeUrl) {
        controller.current = new AbortController();
        setActive(true);
        setStatus("Hold a blank card near the top of your iPhone.");
        await scanNative(
          "writeCard",
          { url: writeUrl },
          controller.current.signal,
        );
        setStatus("Card written and verified. It is ready for the member.");
        setActive(false);
        return;
      }
      const C = nfc();
      if (!C || !writeUrl) throw Error();
      controller.current = new AbortController();
      setActive(true);
      setStatus("Hold a blank NDEF card near the phone.");
      await new C().write(
        { records: [{ recordType: "url", data: writeUrl }] },
        { signal: controller.current.signal, overwrite: false },
      );
      setStatus(
        "Card written. Scan it to verify before handing it to the member.",
      );
      setActive(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setStatus(
          nativeScanner()
            ? (e as Error).message
            : "Card was not written. Use a blank, compatible NDEF card and allow NFC access.",
        );
      setActive(false);
    }
  };
  const walletScan = async () => {
    stop();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setActive(true);
    setStatus("Hold the member’s Wallet pass near your iPhone.");
    try {
      const challenge = await api<{
        challenge: string;
        passTypeIdentifier: string;
      }>("/admin/rewards/wallet-challenge", {
        method: "POST",
        body: {},
        signal,
      });
      const data = await scanNative(
        "readWallet",
        { passTypeIdentifier: challenge.passTypeIdentifier },
        signal,
      );
      if (signal.aborted) return;
      const result = await api<{ credential: string }>(
        "/admin/rewards/wallet-read",
        {
          method: "POST",
          body: { challenge: challenge.challenge, data },
          signal,
        },
      );
      if (!signal.aborted) accept(result.credential);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setStatus((e as Error).message);
    } finally {
      setActive(false);
    }
  };
  const cameraScan = async () => {
    stop();
    setCamera(true);
    setStatus("Allow camera access to scan a member QR code.");
  };
  useEffect(() => {
    if (!camera || !video.current) return;
    let gone = false;
    void import("qr-scanner").then(async ({ default: QrScanner }) => {
      if (gone || !video.current) return;
      const instance = new QrScanner(
        video.current,
        (r) => acceptRef.current(r.data),
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
        },
      );
      scanner.current = instance;
      try {
        await instance.start();
        if (gone) instance.destroy();
        else setStatus("Point the camera at the member QR code.");
      } catch {
        instance.destroy();
        setCamera(false);
        setStatus(
          "Camera could not start. Allow camera access or use an NFC card.",
        );
      }
    });
    return () => {
      gone = true;
      scanner.current?.destroy();
      scanner.current = undefined;
    };
  }, [camera]);
  return (
    <section
      className="rewards-scanner"
      aria-label={writeUrl ? "Write member NFC card" : "Read member credential"}
    >
      {supported ? (
        <Button
          onClick={() => void (writeUrl ? write() : scan())}
          disabled={active}
        >
          {writeUrl ? "Write blank NFC card" : "Start NFC scanning"}
        </Button>
      ) : (
        <p>
          On iPhone, tap a physical NFC card near the top of the phone and open
          its notification. Sign in to this website in Safari first. Use the GDG
          Scanner iPhone app for direct NFC reading and writing.
        </p>
      )}
      {native && walletReady && onRead && (
        <Button
          variant="secondary"
          disabled={active}
          onClick={() => void walletScan()}
        >
          Scan Apple Wallet NFC
        </Button>
      )}
      {onRead && (
        <>
          <Button
            variant="secondary"
            onClick={() => void cameraScan()}
            disabled={camera}
          >
            Use QR instead
          </Button>
          {camera && (
            <video
              ref={video}
              muted
              playsInline
              aria-label="Member QR camera"
            />
          )}
          <Field
            label="Credential link or code"
            hint="For a connected reader or a credential copied from an issued card."
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => accept(manual)}
            disabled={!manual}
          >
            Read credential
          </Button>
        </>
      )}
      {(active || camera) && (
        <Button variant="ghost" onClick={stop}>
          Stop scanning
        </Button>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
