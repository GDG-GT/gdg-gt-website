import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import RecordAcknowledgement from "../RecordAcknowledgement";
import { Button } from "../primitives";
type Profile = { id: string; name: string; role: string; revision: number; published: boolean; accountLinked: boolean; memberLinked: boolean };
type Review = { email: string; profiles: Profile[] };
type Result = { record: { id: string; name: string; is_active: boolean }; archived: number };
export default function ProfileReconcileDialog({ id, onClose, onSaved }: {
  id: string; onClose: () => void; onSaved: (result: Result) => void;
}) {
  const [refresh, setRefresh] = useState(0), [keep, setKeep] = useState(""),
    [ack, setAck] = useState(""), [error, setError] = useState(""), [frozen, setFrozen] = useState(false);
  const retry = useRef<{ key: string; body: { action: "reconcile"; keepId: string; profiles: { id: string; revision: number }[] } }>();
  const heading = useRef<HTMLHeadingElement>(null), { isOnline } = useOnlineStatus(),
    path = `/admin/content-records/team-profiles/${id}`,
    read = usePrivateRead<Review>(path + "?duplicates=true", refresh),
    { busy, begin, current, finish } = usePrivateMutation(path + ":reconcile");
  useDraftGuard(true, { busy, label: "Profile consolidation review" });
  const data = read.data, valid = !!data && typeof data.email === "string" && Array.isArray(data.profiles) &&
    data.profiles.length <= 10 && data.profiles.every((p) => p && typeof p.id === "string" && typeof p.name === "string" && Number.isInteger(p.revision)),
    ready = valid && !read.loading && !read.error && !read.denied && isOnline,
    selected = valid ? data.profiles.find((p) => p.id === keep) : undefined;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (frozen || !valid) return;
    setKeep(data.profiles[0]?.id || ""); setAck("");
  }, [data, frozen, valid]);
  const close = () => { if (!busy) onClose(); };
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }}>
      <DialogTitle ref={heading} tabIndex={-1}>Resolve duplicate Team profiles</DialogTitle>
      <DialogDescription>Keep one profile and archive the others. The kept profile retains its biography, links, photo and publication status. Account and member links move to it.</DialogDescription>
      {read.loading && <p role="status">Loading matching profiles…</p>}
      {(read.error || (data && !valid)) && <p role="alert">{read.error || "The matching profiles could not be verified."}</p>}
      {error && <p role="alert">{error}</p>}
      {!isOnline && <p role="status">Reconnect to continue.</p>}
      {valid && <>
        <p>{data.email}</p>
        {data.profiles.length < 2 ? <p>There is only one current profile for this email. Nothing needs consolidating.</p> :
          <fieldset className="gt-form gt-plain-fieldset" disabled={!ready || busy || frozen}>
            <legend>Profile to keep</legend>
            {data.profiles.map((profile) => <label key={profile.id} className="gt-check gt-profile-choice">
              <input type="radio" name="kept-profile" checked={keep === profile.id} onChange={() => { setKeep(profile.id); setAck(""); }} />
              <span><strong>{profile.name}</strong> · {profile.role}<br />{profile.published ? "Published" : "Private draft"}
                {profile.accountLinked && " · Linked to an admin account"}{profile.memberLinked && " · Linked to a community member"}</span>
            </label>)}
            {selected && <RecordAcknowledgement label={`Keep ${selected.name} (${selected.published ? "Published" : "Private draft"}) and archive the other ${data.profiles.length - 1} profile${data.profiles.length > 2 ? "s" : ""}.`}
              reference={keep} value={ack} onChange={setAck} />}
          </fieldset>}
      </>}
      {frozen && <p role="status">The reply was interrupted. Retry the same consolidation, or close and review the current profiles. Closing does not undo a completed consolidation.</p>}
      <div className="gt-actions">
        {!frozen && <Button variant="ghost" disabled={busy || !isOnline} onClick={() => { setAck(""); setRefresh((v) => v + 1); }}>Refresh matching profiles</Button>}
        <Button disabled={busy || !isOnline || (!frozen && (!ready || !selected || data!.profiles.length < 2 || ack !== keep))}
          onClick={async () => {
            if (!retry.current && (!ready || !selected || ack !== keep || data!.profiles.length < 2)) return;
            const controller = begin(); if (!controller) return;
            retry.current ||= { key: crypto.randomUUID(), body: { action: "reconcile", keepId: keep, profiles: data!.profiles.map(({ id, revision }) => ({ id, revision })) } };
            setError("");
            try {
              const result = await api<Result>(path, { method: "POST", protected: true, body: retry.current.body, idempotencyKey: retry.current.key, signal: controller.signal });
              if (!current(controller)) return;
              if (!result?.record || result.record.id !== retry.current.body.keepId || !Number.isInteger(result.archived)) throw Error("The consolidation result could not be confirmed.");
              onSaved(result);
            } catch (e) {
              if (!current(controller)) return;
              setError((e as Error).message);
              if (e instanceof ApiFailure && e.status < 500) { retry.current = undefined; setAck(""); }
              else setFrozen(true);
            } finally { finish(controller); }
          }}>{busy ? "Consolidating…" : frozen ? "Retry same consolidation" : "Confirm consolidation"}</Button>
        <Button variant="secondary" disabled={busy} onClick={close}>{frozen ? "Close and review current profiles" : "Cancel"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
