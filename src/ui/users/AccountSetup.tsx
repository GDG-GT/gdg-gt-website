import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button, Field } from "../primitives";
import { useUrlCapability } from '@/hooks/useUrlCapability';
export default function AccountSetup() {
  const [token,setToken] = useUrlCapability('token');
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    document.title = "Account setup · GDG at Georgia Tech";
  }, []);
  return (
    <section className="gt-token-page">
      <div className="gt-token-sheet">
        <h1>
          {done ? "Your account is ready" : "Choose your account password"}
        </h1>
        {done ? (
          <>
            <p>
              All previous account sessions have been signed out. Use the
              chapter access entry to sign in with your new password.
            </p>
            <Link to="/">Return to the chapter website</Link>
          </>
        ) : !token ? (
          <p role="alert">
            This page needs a valid setup link. Open the full link from your
            chapter account email, or ask an administrator to send another.
          </p>
        ) : (
          <form
            className="gt-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              if (password !== confirm) {
                setError("The new passwords do not match.");
                return;
              }
              setBusy(true);
              const secret = password;
              setPassword("");
              setConfirm("");
              try {
                await api("/account/setup", {
                  method: "POST",
                  body: { token, email, newPassword: secret },
                });
                setToken('');
                setDone(true);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Account setup could not be completed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              This private link expires in 24 hours and can be used once. Enter
              the same email address that received it.
            </p>
            {error && (
              <p role="alert" className="gt-form-error">
                {error}
              </p>
            )}
            <Field label="Account email" required>
              <input
                type="email"
                autoComplete="username"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="New password"
              required
              hint="Use at least 14 characters. A unique passphrase or password manager is recommended."
            >
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password" required>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button disabled={busy} type="submit">
              {busy ? "Setting up…" : "Set password"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
