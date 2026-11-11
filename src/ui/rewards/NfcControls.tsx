import { parsePresentedCredential, physicalCardPresentation } from "../../../shared/card-presentation.mjs";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { nativeScanner, scanNative } from "./nativeScanner";
import { Button, Field } from "../primitives";
import { parseCardPayload } from "../../../shared/rewards.mjs";
import { qrFocus } from "./qrFocus";
type NfcRecord = { recordType: string; mediaType?: string; data: DataView };
type NfcReader = {
  scan: (options: { signal: AbortSignal }) => Promise<void>;
  write: (
    message: unknown,
    options: { signal: AbortSignal; overwrite: boolean },
  ) => Promise<void>;
  onreading: ((event: { serialNumber?: string; message: { records: NfcRecord[] } }) => void) | null;
  onreadingerror: (() => void) | null;
};
type NfcConstructor = new () => NfcReader;
const nfc = () =>
  (window as unknown as { NDEFReader?: NfcConstructor }).NDEFReader;
export default function NfcControls({
  onRead,
  writeUrl,
  writeId,
  uidHash,
  onWritten,
  continuous = false,
}: {
  onRead?: (token: string) => void | Promise<void>;
  writeUrl?: string;
  writeId?: string;
  uidHash?: string | null;
  onWritten?: () => void | Promise<void>;
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
  const [bindingHash,setBindingHash]=useState(uidHash || "");
  const [pendingBinding,setPendingBinding]=useState<{uid:string;id:string}>();
  useDraftGuard(active || !!pendingBinding,{busy:active,label:"NFC card registration"});
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
    const presented = parsePresentedCredential(value);
    const token = presented ? ("uid" in presented ? JSON.stringify(presented) : presented.credential) : null;
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
        if (!nativeScanner()?.cardBinding) throw Error("Update GDG Workspace to build9 or later for chip-bound NFC scanning. Wallet QR remains available.");
        controller.current = new AbortController();
        setActive(true);
        setStatus("Hold the member card near your phone’s NFC reader.");
        const raw=await scanNative("readCard", {}, controller.current.signal);
        const proof=parsePresentedCredential(raw);
        if(!proof || !("uid" in proof))throw Error("This is not a GDG member credential with a physical chip ID.");
        await accept(raw);
        return;
      }
      const C = nfc();
      if (!C) throw Error();
      const reader = new C();
      controller.current = new AbortController();
      reader.onreading = (e) => {
        const record = e.message.records.find(r => r.recordType === "mime" && r.mediaType === "application/vnd.gdggt.card") || e.message.records.find(r => r.recordType === "url" || r.recordType === "text");
        if (record) {
          const value=new TextDecoder().decode(record.data), token=parseCardPayload(value);
          if(token && e.serialNumber) { try { void accept(physicalCardPresentation(token,e.serialNumber)); } catch { setStatus("This browser did not provide a supported chip ID. Use GDG Workspace."); } }
          else setStatus("A physical chip ID is required. Use GDG Workspace for this card.");
        }
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
  const bind = async (pending:{id:string;uid:string}, signal?:AbortSignal) => {
    setPendingBinding(pending);
    try {
      const result=await api<{uidHash:string}>("/admin/rewards/card-bind",{method:"POST",body:pending,signal});
      if(signal?.aborted || !mounted.current)return;
      setBindingHash(result.uidHash);setPendingBinding(undefined);
      setStatus("Card written, verified and registered. The member email is queued.");
      await onWritten?.();
    } catch(error) {
      if(error instanceof ApiFailure && error.status<500 && error.status!==429)setPendingBinding(undefined);
      throw error;
    }
  };
  const write = async () => {
    try {
      stop();
      if (!nativeScanner()?.cardBinding || !writeUrl || !writeId) throw Error("Use GDG Workspace build9 or later to write and register physical cards.");
      controller.current=new AbortController();const signal=controller.current.signal;
      setActive(true);
      if(pendingBinding) {setStatus("Retrying registration for the same written card…");await bind(pendingBinding,signal);return;}
      setStatus("Hold the card near the top of your iPhone.");
      const raw=await scanNative("writeCard",{url:writeUrl,...(bindingHash?{uidHash:bindingHash}:{})},signal);
      if(signal.aborted)return;
      const proof=parsePresentedCredential(raw);
      if(!proof || !("uid" in proof) || proof.credential!==parseCardPayload(writeUrl))throw Error("The physical write could not be verified. Scan this card before reusing it.");
      await bind({id:writeId,uid:proof.uid},signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setStatus((e as Error).message + (pendingBinding ? " Retry registration before handing out this card." : ""));
    } finally {if(mounted.current)setActive(false);}
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
          {writeUrl ? (pendingBinding ? "Retry card registration" : "Write and register NFC card") : "Start NFC scanning"}
        </Button>
      ) : (
        <p>
          Use GDG Workspace build9 or later for physical NFC cards. You can scan Wallet QR here.
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
              hint="For Wallet QR codes and supported QR readers. Physical cards require a chip scan."
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
