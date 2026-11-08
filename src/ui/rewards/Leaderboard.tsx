import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, ApiFailure } from "@/lib/api";
import { Brand, Button, Field } from "../primitives";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import "./rewards.css";
import MemberEventLinks from "./MemberEventLinks";
import { rewardsPagePaths } from "../../../shared/rewards-pages.mjs";
type Perk = {
  id: string;
  title: string;
  description: string;
  threshold: number;
};
type Board = {
  items: { alias: string; points: number; rank: number }[];
  total: number;
  perks: Perk[];
  ssoAvailable: boolean;
};
type Me = {
  walletAvailable?: boolean;
  walletCredentials?: { id: string; label: string }[];
  id: string;
  name: string;
  points: number;
  alias: string | null;
  isPublic: boolean;
  csrf: string;
  ledger: { id: string; points: number; reason: string; created_at: string }[];
  claims: { id: string; perkId: string; title: string; status: string }[];
};
async function memberWrite(
  path: string,
  body: unknown,
  csrf: string,
  key: string,
) {
  const response = await fetch("/api/v1/rewards/" + path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Rewards-CSRF": csrf,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
  const r = await response.json();
  if (!response.ok)
    throw new Error(r.error?.message || "This change could not be confirmed.");
  return r.data;
}
export default function Leaderboard() {
  const paths = rewardsPagePaths(window.location.hostname)!;
  const location = useLocation(),
    privateView = location.pathname === paths.member;
  const [data, setData] = useState<Board>(),
    [me, setMe] = useState<Me>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(1),
    [alias, setAlias] = useState(""),
    [visible, setVisible] = useState(false),
    [dirty, setDirty] = useState(false),
    [attempt, setAttempt] = useState<{
      path: string;
      body: unknown;
      key: string;
    }>();
  useDraftGuard(dirty || !!attempt, { busy, label: "Member profile changes" });
  const load = useCallback(async () => {
    setError("");
    try {
      setData(await api<Board>("/rewards/leaderboard?page=" + page));
      if (privateView) {
        const m = await api<Me>("/rewards/me");
        setMe(m);
        setAlias(m.alias || "");
        setVisible(m.isPublic);
        setDirty(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "This page could not load.");
      if (e instanceof ApiFailure && [401, 403].includes(e.status))
        setMe(undefined);
    }
  }, [page, privateView]);
  useEffect(() => {
    void load();
  }, [load]);
  const login = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("/rewards/login", {
        method: "POST",
        body: {},
      });
      const u = new URL(result.url);
      if (u.protocol !== "https:" || !u.hostname.endsWith(".supabase.co"))
        throw Error("Campus sign-in returned an unexpected destination.");
      window.location.assign(u.href);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Campus sign-in could not start.",
      );
      setBusy(false);
    }
  };
  const send = async (a: { path: string; body: unknown; key: string }) => {
    if (!me) return;
    if (
      attempt &&
      (attempt.path !== a.path ||
        JSON.stringify(attempt.body) !== JSON.stringify(a.body))
    ) {
      setError(
        "Retry the previous request before starting a different change.",
      );
      return;
    }
    setAttempt(a);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await memberWrite(a.path, a.body, me.csrf, a.key);
      setAttempt(undefined);
      setDirty(false);
      setNotice("Saved.");
      if (a.path === "logout") {
        setMe(undefined);
        window.location.assign(paths.home);
      } else await load();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "The result is uncertain.") +
          " Retry the same request before starting another one.",
      );
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send({
      path: "profile",
      body: { alias, public: visible },
      key: crypto.randomUUID(),
    });
  };
  return (
    <div className="rewards-public">
      <header className="rewards-public-header">
        <Brand
          compact
          destination={paths.home}
          ariaLabel="GDG@GT member leaderboard"
        />
        <nav aria-label="Member rewards">
          <Link
            to={paths.home}
            aria-current={!privateView ? "page" : undefined}
          >
            Leaderboard
          </Link>
          <Link
            to={paths.member}
            aria-current={privateView ? "page" : undefined}
          >
            My membership
          </Link>
          <a href="https://gdggt.dev">Chapter website ↗</a>
        </nav>
      </header>
      <div className="rewards-public-main">
        <div className="rewards-public-intro">
          <p className="rewards-wordmark">GDG at Georgia Tech</p>
          <h1>
            {privateView
              ? "Your place in the chapter."
              : "Show up. Build. Give back."}
          </h1>
          <p>
            {privateView
              ? "Your points, contributions and chapter perks in one place."
              : "A little recognition for the people who make our community happen."}
          </p>
        </div>
        {error && (
          <div role="alert" className="rewards-notice">
            <p>{error}</p>
            {attempt ? (
              <Button disabled={busy} onClick={() => void send(attempt)}>
                Retry same request
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void load()}
              >
                Try again
              </Button>
            )}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {privateView && !me && (
          <section className="rewards-signin">
            <h2>Member sign-in</h2>
            <p>Sign in with your Georgia Tech account.</p>
            <Button
              disabled={!data?.ssoAvailable || busy}
              onClick={() => void login()}
            >
              {busy ? "Opening campus sign-in…" : "Sign in with Georgia Tech"}
            </Button>
            {data && !data.ssoAvailable && (
              <p>Georgia Tech sign-in is coming soon.</p>
            )}
          </section>
        )}
        {!privateView && (
          <section aria-label="Chapter leaderboard">
            <h2>Leaderboard</h2>
            {!data && !error && <p role="status">Loading leaderboard…</p>}
            {data && data.items.length === 0 && (
              <div className="rewards-empty">
                <p>No rankings yet.</p>
                <Link
                  className="gt-button gt-button-secondary"
                  to={paths.member}
                >
                  Open member sign-in
                </Link>
              </div>
            )}
            {!!data?.items.length && (
              <ol className="rewards-ranking" start={(page - 1) * 25 + 1}>
                {data.items.map((item) => (
                  <li key={item.alias}>
                    <span
                      className="rewards-rank"
                      aria-label={"Rank " + item.rank}
                    >
                      {item.rank}
                    </span>
                    <strong>{item.alias}</strong>
                    <span>
                      {item.points.toLocaleString()} <small>points</small>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <div className="rewards-actions">
              <Button
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={!data || page * 25 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </section>
        )}
        {privateView && me && (
          <>
            <section className="rewards-member-summary">
              <h2>Hi, {me.name}</h2>
              <p className="rewards-balance">
                {me.points.toLocaleString()} <span>points</span>
              </p>

              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void send({
                    path: "logout",
                    body: {},
                    key: crypto.randomUUID(),
                  })
                }
              >
                Sign out
              </Button>
            </section>
            <MemberEventLinks csrf={me.csrf} />
            <section>
              {me.walletAvailable &&
                me.walletCredentials?.map((c) => (
                  <p key={c.id}>
                    <a
                      className="gt-button gt-button-secondary"
                      href={"/api/v1/rewards/wallet/" + c.id}
                    >
                      Add {c.label} to Apple Wallet
                    </a>
                  </p>
                ))}
              <h2>Your public profile</h2>
              <form className="rewards-profile-form" onSubmit={submit}>
                <Field label="Display name" hint="Your email stays private.">
                  <input
                    value={alias}
                    onChange={(e) => {
                      setAlias(e.target.value);
                      setDirty(true);
                    }}
                    minLength={2}
                    maxLength={40}
                  />
                </Field>
                <label className="rewards-checkbox">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => {
                      setVisible(e.target.checked);
                      setDirty(true);
                    }}
                  />
                  Show my display name and points on the public leaderboard
                </label>
                <Button disabled={busy || !dirty}>Save profile</Button>
              </form>
            </section>
            <section>
              <h2>Your contributions</h2>
              {me.ledger.length === 0 ? (
                <p>No contributions yet.</p>
              ) : (
                <ul className="rewards-history">
                  {me.ledger.map((e) => (
                    <li key={e.id}>
                      <span>
                        {e.reason}
                        <small>
                          {new Date(e.created_at).toLocaleDateString()}
                        </small>
                      </span>
                      <strong>
                        {e.points > 0 ? "+" : ""}
                        {e.points}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
              {me.ledger.length === 100 && (
                <p className="rewards-fine-print">Latest 100 entries</p>
              )}
            </section>
          </>
        )}
        <section>
          <h2>Perks</h2>
          {!!data?.perks.length && <p>Requests don’t spend points.</p>}
          {data?.perks.length === 0 && <p>No perks available right now.</p>}
          <div className="rewards-perks">
            {data?.perks.map((p) => {
              const claim = me?.claims.find((c) => c.perkId === p.id);
              return (
                <article key={p.id}>
                  <p className="rewards-threshold">{p.threshold} points</p>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  {me &&
                    (claim ? (
                      <>
                        <p role="status">Request {claim.status}</p>
                        {claim.status === "pending" && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              void send({
                                path: "cancel",
                                body: { id: claim.id },
                                key: crypto.randomUUID(),
                              })
                            }
                          >
                            Cancel request
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        disabled={busy || me.points < p.threshold}
                        onClick={() =>
                          void send({
                            path: "claim",
                            body: { perkId: p.id },
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        {me.points < p.threshold
                          ? `${p.threshold - me.points} more points to qualify`
                          : "Request perk"}
                      </Button>
                    ))}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
