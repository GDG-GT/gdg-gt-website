import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import { Brand, Button, Field } from "../primitives";
import "./rewards.css";
import { nativeWorkspace, postNativeWorkspace } from "./nativeScanner";

/** Dedicated app entry; retains the same server gate, account and permissions. */
export default function ScannerEntry() {
  const { isLoading, isAuthenticated, isSuperAdmin, login, logout, error } =
    useAdmin();
  const [stage, setStage] = useState<"gate" | "login">("gate");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController>();
  const emailField = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    document.title = "Scanner sign-in · GDG at Georgia Tech";
    window.dispatchEvent(new Event("gdg:auth-needed"));
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (stage === "login") emailField.current?.focus();
  }, [stage]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || isLoading) return;
    setBusy(true);
    setNotice("");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      if (stage === "gate") {
        const request = new AbortController();
        controller.current = request;
        timeout = setTimeout(() => {
          timedOut = true;
          request.abort();
        }, 10000);
        const response = await fetch("/api/v1/auth/gate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal: controller.current.signal,
        });
        const result = response.ok ? await response.json() : null;
        if (!live.current) return;
        if (!result?.data?.gateValid)
          throw Error("The access code could not be verified. Try again.");
        setCode("");
        setStage("login");
      } else {
        const secret = password;
        setPassword("");
        await login({ username: email, password: secret });
      }
    } catch (e) {
      if (live.current && timedOut)
        setNotice("The connection took too long. Try again.");
      else if (live.current && (e as Error).name !== "AbortError")
        setNotice(
          e instanceof Error
            ? e.message
            : "Sign-in could not be completed. Try again.",
        );
    } finally {
      clearTimeout(timeout);
      if (live.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (!isLoading && !isAuthenticated && nativeWorkspace())
      postNativeWorkspace({ action: "authRequired" });
  }, [isLoading, isAuthenticated]);
  if (!isLoading && isAuthenticated && nativeWorkspace())
    return <Navigate to="/admin" replace />;
  if (!isLoading && isAuthenticated && isSuperAdmin)
    return <Navigate to="/admin/rewards" replace />;
  return (
    <main className="scanner-entry">
      <div className="scanner-entry-content">
        <Brand compact />
        <h1>{isAuthenticated ? "Scanner access" : "Scanner sign-in"}</h1>
        {isLoading && !busy ? (
          <p role="status">Loading your account…</p>
        ) : isAuthenticated ? (
          <>
            <p>This account cannot use the scanner.</p>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void logout()
                  .catch(() =>
                    setNotice("Sign-out could not finish. Try again."),
                  )
                  .finally(() => {
                    if (live.current) setBusy(false);
                  });
              }}
            >
              Sign out
            </Button>
          </>
        ) : (
          <form
            className="gt-form"
            onSubmit={(e) => void submit(e)}
            aria-busy={busy}
          >
            {stage === "gate" ? (
              <Field label="Access code">
                <input
                  type="password"
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={200}
                  disabled={busy}
                />
              </Field>
            ) : (
              <>
                <Field label="Email">
                  <input
                    ref={emailField}
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={1024}
                    disabled={busy}
                  />
                </Field>
              </>
            )}
            <Button disabled={busy || isLoading} type="submit">
              {busy
                ? "Please wait…"
                : stage === "gate"
                  ? "Continue"
                  : "Sign in"}
            </Button>
            {stage === "login" && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || isLoading}
                onClick={() => {
                  setStage("gate");
                  setPassword("");
                  setNotice("");
                }}
              >
                Use another access code
              </Button>
            )}
          </form>
        )}
        {(notice || error) && <p role="alert">{notice || error}</p>}
      </div>
    </main>
  );
}
