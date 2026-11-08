import { useEffect, useRef, useState } from "react";
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
    setSupported(!!nfc());
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
          "NFC is unavailable or permission was denied. Check NFC settings and try again.",
        );
    }
  };
  const write = async () => {
    try {
      stop();
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
          "Card was not written. Use a blank, compatible NDEF card and allow NFC access.",
        );
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
          its notification. Sign in to this website in Safari first. Direct NFC
          scanning within the PWA requires a supported Android browser.
        </p>
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
