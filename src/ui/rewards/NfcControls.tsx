import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { nativeScanner, scanNative } from "./nativeScanner";
import { Button, Field } from "../primitives";
import { parseCardPayload } from "../../../shared/rewards.mjs";
import { qrFocus } from "./qrFocus";
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
  continuous = false,
}: {
  onRead?: (token: string) => void | Promise<void>;
  writeUrl?: string;
  continuous?: boolean;
}) {
  const [status, setStatus] = useState(""),
    [active, setActive] = useState(false),
    [supported, setSupported] = useState(false),
    [native, setNative] = useState(false),
    [walletReady, setWalletReady] = useState(false),
    [camera, setCamera] = useState(false),
    [focus, setFocus] = useState<ReturnType<typeof qrFocus> | null>(null),
    [manual, setManual] = useState("");
  const controller = useRef<AbortController>(),
    video = useRef<HTMLVideoElement>(null),
    frozen = useRef<HTMLCanvasElement>(null),
    confirmation = useRef<ReturnType<typeof setTimeout>>(),
    detected = useRef(false),
    mounted = useRef(true),
    run = useRef(0),
    recent = useRef<{ token: string; at: number }>(),
    scanner = useRef<{ stop: () => void; destroy: () => void }>();
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const acceptRef = useRef<(value: string) => void>(() => {});
  const stop = () => {
    run.current++;
    clearTimeout(confirmation.current);
    detected.current = false;
    setFocus(null);
    controller.current?.abort();
    scanner.current?.stop();
    scanner.current?.destroy();
    scanner.current = undefined;
    setCamera(false);
    setActive(false);
  };
  useEffect(() => {
    mounted.current = true;
    const scanGeneration = run;
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
        run.current++;
        clearTimeout(confirmation.current);
        detected.current = false;
        setFocus(null);
        setCamera(false);
        controller.current?.abort();
        scanner.current?.stop();
        setActive(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("gdg:session-cleared", stop);
    return () => {
      mounted.current = false;
      scanGeneration.current++;
      controller.current?.abort();
      clearTimeout(confirmation.current);
      scanner.current?.destroy();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("gdg:session-cleared", stop);
    };
  }, []);
  const accept = async (value: string) => {
    const token = parseCardPayload(value, window.location.origin);
    if (!token) {
      setStatus("This is not a GDG member credential.");
      return;
    }
    const resumeCamera = continuous && camera;
    stop();
    const current = run.current;
    setStatus(
      continuous
        ? "Reading member and recording check-in…"
        : "Credential read. Check the member before awarding points.",
    );
    try {
      await onReadRef.current?.(token);
    } finally {
      if (
        resumeCamera &&
        mounted.current &&
        current === run.current &&
        !document.hidden
      )
        setCamera(true);
    }
  };
  acceptRef.current = accept;
  const scan = async () => {
    try {
      stop();
      if (nativeScanner()) {
        controller.current = new AbortController();
        setActive(true);
        setStatus("Hold the member card near your phone’s NFC reader.");
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
        setStatus("Hold a blank card near your phone’s NFC reader.");
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
    video.current.parentElement?.scrollIntoView?.({
      block: "center",
      behavior: "auto",
    });
    let gone = false;
    void import("qr-scanner")
      .then(async ({ default: QrScanner }) => {
        if (gone || !video.current) return;
        const instance = new QrScanner(
          video.current,
          (r) => {
            if (gone || detected.current || !video.current) return;
            if (!parseCardPayload(r.data, window.location.origin)) {
              setStatus("This is not a GDG member credential.");
              return;
            }
            const token = parseCardPayload(r.data, window.location.origin)!;
            if (
              recent.current?.token === token &&
              Date.now() - recent.current.at < 3000
            )
              return;
            recent.current = { token, at: Date.now() };
            detected.current = true;
            const source = video.current,
              canvas = frozen.current;
            if (canvas && source.videoWidth > 0) {
              canvas.width = Math.min(1280, source.videoWidth);
              canvas.height = Math.round(
                (canvas.width * source.videoHeight) / source.videoWidth,
              );
              canvas
                .getContext("2d")
                ?.drawImage(source, 0, 0, canvas.width, canvas.height);
            }
            setFocus(
              qrFocus(
                r.cornerPoints || [],
                source.videoWidth,
                source.videoHeight,
              ),
            );
            instance.stop();
            setStatus("QR detected. Finding member…");
            const reduced = window.matchMedia?.(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            confirmation.current = setTimeout(
              () => {
                if (!gone && detected.current) acceptRef.current(r.data);
              },
              reduced ? 100 : 520,
            );
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: false,
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
      })
      .catch(() => {
        if (!gone) {
          setCamera(false);
          setStatus("Camera could not start. Try again or use an NFC card.");
        }
      });
    return () => {
      gone = true;
      clearTimeout(confirmation.current);
      detected.current = false;
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
            <div className={`rewards-qr-camera${focus ? " is-detected" : ""}`}>
              <video
                ref={video}
                muted
                playsInline
                aria-label="Member QR camera"
              />
              <canvas
                ref={frozen}
                aria-hidden="true"
                style={
                  focus
                    ? {
                        transformOrigin: `${focus.left + focus.width / 2}% ${focus.top + focus.height / 2}%`,
                      }
                    : undefined
                }
              />
              <div
                className="rewards-qr-focus"
                aria-hidden="true"
                style={
                  focus
                    ? {
                        left: `${focus.left}%`,
                        top: `${focus.top}%`,
                        width: `${focus.width}%`,
                        height: `${focus.height}%`,
                      }
                    : undefined
                }
              />
            </div>
          )}
          <details className="rewards-manual-entry">
            <summary>Enter credential manually</summary>
            <Field
              label="Credential link or code"
              hint="Paste the member’s issued credential, or use a reader that types it."
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
          </details>
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
