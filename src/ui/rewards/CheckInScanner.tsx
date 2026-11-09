import { useEffect, useRef, useState, type FormEvent } from "react";
import { confirmAction } from "@/lib/app-dialogs";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Button, Field } from "../primitives";
import ActionFeedback from "../ActionFeedback";
import NfcControls from "./NfcControls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
type Activity = {
  id: string;
  title: string;
  points: number;
  opens_at: string;
  closes_at: string;
};
type Rule = { id: string; title: string; points: number; is_active: boolean };
type FoundMember = {
  id: string;
  name: string;
  email: string;
  points: number;
  credentialId: string;
};
export default function CheckInScanner({
  activities,
  rules,
  refresh,
  manual,
}: {
  activities: Activity[];
  rules: Rule[];
  refresh: () => Promise<void>;
  manual: (token: string) => Promise<void>;
}) {
  const { currentAdmin } = useAdmin();
  const storageKey =
    "gdg-default-checkin:" + (currentAdmin?.id || "current-session");
  const [selected, setSelected] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  });
  const [armed, setArmed] = useState(false),
    [create, setCreate] = useState(false),
    [dirty, setDirty] = useState(false),
    [newRule, setNewRule] = useState(false),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [uncertain, setUncertain] = useState<{
    member: FoundMember;
    activity: Activity;
    key: string;
  }>();
  const lock = useRef(false),
    alive = useRef(true),
    session = useRef(0);
  const creation = useRef<{
    key: string;
    fingerprint: string;
    ruleId?: string;
  }>();
  useDraftGuard(dirty || busy || !!uncertain || !!creation.current, {
    busy,
    label: "Check-in session or activity",
  });
  useEffect(() => {
    alive.current = true;
    const scannerSession = session;
    const stop = () => {
      session.current++;
      setArmed(false);
    };
    window.addEventListener("gdg:session-cleared", stop);
    return () => {
      alive.current = false;
      scannerSession.current++;
      window.removeEventListener("gdg:session-cleared", stop);
    };
  }, []);
  const activity = activities.find((a) => a.id === selected);
  const open =
    !!activity &&
    Date.parse(activity.opens_at) <= Date.now() &&
    Date.parse(activity.closes_at) >= Date.now();
  const choose = (id: string) => {
    session.current++;
    setArmed(false);
    setSelected(id);
    try {
      sessionStorage.setItem(storageKey, id);
    } catch {
      /* Optional per-session default. */
    }
  };
  const award = async (found: FoundMember, target: Activity, key: string) => {
    try {
      await api("/admin/rewards/award", {
        method: "POST",
        body: {
          memberId: found.id,
          activityId: target.id,
          credentialId: found.credentialId,
        },
        idempotencyKey: key,
      });
      setUncertain(undefined);
      setNotice(
        `${found.name} checked in · +${target.points} points · ${target.title}`,
      );
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "DUPLICATE") {
        setNotice(`${found.name} is already checked in to ${target.title}.`);
        setUncertain(undefined);
      } else {
        if (!(e instanceof ApiFailure) || e.status >= 500) {
          setUncertain({ member: found, activity: target, key });
          setArmed(false);
        }
        setError(
          e instanceof Error
            ? e.message
            : "Check-in could not be confirmed. Retry the same check-in.",
        );
      }
    }
  };
  const scan = async (credential: string) => {
    if (lock.current || uncertain) return;
    if (!armed) {
      await manual(credential);
      return;
    }
    if (!activity || !open) {
      setArmed(false);
      setError("Choose an open activity before starting automatic check-in.");
      return;
    }
    const current = session.current,
      target = activity;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const found = await api<FoundMember>("/admin/rewards/resolve", {
        method: "POST",
        body: { credential },
      });
      if (!alive.current || current !== session.current) return;
      await award(found, target, crypto.randomUUID());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This member could not be checked.",
      );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const createActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const opens = new Date(String(data.get("open"))),
      closes = new Date(String(data.get("close")));
    if (
      !Number.isFinite(opens.getTime()) ||
      !Number.isFinite(closes.getTime()) ||
      closes <= opens ||
      closes.getTime() - opens.getTime() > 31 * 86400000
    ) {
      setError("Choose a closing time after the opening time, within 31 days.");
      return;
    }
    const input = {
      title: String(data.get("title")).trim(),
      ruleId: newRule ? "" : String(data.get("rule")),
      ruleTitle: newRule ? String(data.get("ruleTitle")).trim() : "",
      points: newRule ? Number(data.get("points")) : 0,
      opensAt: opens.toISOString(),
      closesAt: closes.toISOString(),
    };
    const fingerprint = JSON.stringify(input);
    if (!creation.current)
      creation.current = { key: crypto.randomUUID(), fingerprint };
    else if (creation.current.fingerprint !== fingerprint) {
      setError(
        "Retry the unchanged activity first so a lost response cannot create a duplicate.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attempt = creation.current;
      if (newRule && !attempt.ruleId) {
        const rule = await api<{ id: string }>("/admin/rewards/rule", {
          method: "POST",
          body: { title: input.ruleTitle, points: input.points, active: true },
          idempotencyKey: attempt.key + "-rule",
        });
        attempt.ruleId = rule.id;
      }
      const saved = await api<{ id: string }>("/admin/rewards/activity", {
        method: "POST",
        body: {
          title: input.title,
          ruleId: attempt.ruleId || input.ruleId,
          opensAt: input.opensAt,
          closesAt: input.closesAt,
        },
        idempotencyKey: attempt.key,
      });
      creation.current = undefined;
      setDirty(false);
      setCreate(false);
      await refresh();
      choose(saved.id);
      setNotice("Activity created. Start automatic check-in when ready.");
    } catch (e) {
      if (
        e instanceof ApiFailure &&
        e.status < 500 &&
        !creation.current?.ruleId
      )
        creation.current = undefined;
      setError(
        e instanceof Error ? e.message : "The activity could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rewards-checkin-session" aria-label="Check-in session">
      <h2>Check-in scanner</h2>
      {notice && <ActionFeedback message={notice} />}
      {error && !create && <ActionFeedback message={error} tone="error" />}
      <div className="rewards-checkin-toolbar">
        <Field label="Activity for this scanner">
          <select
            value={selected}
            disabled={busy || !!uncertain}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Choose an activity</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {a.points} points
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="secondary"
          disabled={busy || armed || !!uncertain}
          onClick={() => {
            setNewRule(!rules.some((r) => r.is_active));
            setCreate(true);
          }}
        >
          Create check-in activity
        </Button>
      </div>
      <div className="gt-actions">
        {armed ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              session.current++;
              setArmed(false);
            }}
          >
            Stop automatic check-in
          </Button>
        ) : (
          <Button
            disabled={!open || busy || !!uncertain}
            onClick={() => {
              setArmed(true);
              setError("");
              setNotice(
                `Automatic check-in started · ${activity!.title} · ${activity!.points} points per member`,
              );
            }}
          >
            Start automatic check-in
          </Button>
        )}
      </div>
      {armed && (
        <p role="status">
          Automatic check-in · {activity?.title} · {activity?.points} points per
          member
        </p>
      )}
      {!!selected && !open && (
        <p>
          This activity is outside its check-in window. Choose an open activity.
        </p>
      )}
      {uncertain ? (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            await award(uncertain.member, uncertain.activity, uncertain.key);
            setBusy(false);
          }}
        >
          Retry same check-in
        </Button>
      ) : (
        <NfcControls
          key={armed ? "auto:" + selected : "manual"}
          continuous={armed}
          onRead={scan}
        />
      )}
      <Dialog
        open={create}
        onOpenChange={async (next) => {
          if (busy) return;
          if (
            !next &&
            (dirty || creation.current) &&
            !(await confirmAction(
              "Discard this activity draft? Any point rule already saved will remain available.",
              {
                title: "Discard activity draft?",
                confirmLabel: "Discard draft",
                cancelLabel: "Keep editing",
              },
            ))
          )
            return;
          setCreate(next);
          if (!next) {
            setDirty(false);
            creation.current = undefined;
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Create check-in activity</DialogTitle>
          <DialogDescription>
            Select the points rule and check-in window.
          </DialogDescription>
          {error && <p role="alert">{error}</p>}
          <form
            onSubmit={(e) => void createActivity(e)}
            onChange={() => setDirty(true)}
          >
            <fieldset disabled={busy} className="rewards-form-fields">
              <Field label="Activity title">
                <input name="title" required minLength={2} maxLength={160} />
              </Field>
              <Field label="Points category">
                <select
                  value={newRule ? "new" : "existing"}
                  disabled={!!creation.current}
                  onChange={(e) => setNewRule(e.target.value === "new")}
                >
                  <option
                    value="existing"
                    disabled={!rules.some((r) => r.is_active)}
                  >
                    Use a saved rule
                  </option>
                  <option value="new">Create a new rule</option>
                </select>
              </Field>
              {newRule ? (
                <>
                  <Field label="Rule name">
                    <input
                      name="ruleTitle"
                      required
                      minLength={2}
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Points per check-in">
                    <input
                      type="number"
                      name="points"
                      min={1}
                      max={10000}
                      required
                    />
                  </Field>
                </>
              ) : (
                <Field label="Point rule">
                  <select name="rule" required defaultValue="">
                    <option value="" disabled>
                      Choose a rule
                    </option>
                    {rules
                      .filter((r) => r.is_active)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} · {r.points} points
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Opens at">
                <input type="datetime-local" name="open" required />
              </Field>
              <Field
                label="Closes at"
                hint="Your local time. Maximum window: 31 days."
              >
                <input type="datetime-local" name="close" required />
              </Field>
              <Button disabled={busy}>Create activity</Button>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
