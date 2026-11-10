import { useEffect, useRef, useState } from "react";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { Link } from "react-router-dom";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, EmptyState, Field } from "../primitives";
import {
  validIntegrationWorkspace,
  validIntegrationCandidates,
  prepareIntegrationWrite,
  submitIntegrationWrite,
  type IntegrationKind,
  type IntegrationWorkspace,
  type IntegrationCandidates,
  type IntegrationIntent,
  type FormReference,
} from "./form-integration-api";
import FormIntegrationWriteRecovery from "./FormIntegrationWriteRecovery";
type Props = {
  kind: IntegrationKind;
  resourceId: string;
  disabled?: boolean;
  onDenied?: () => void;
  onRecheck?: () => void;
};
type Read = { loading: boolean; error: string; at?: string };
function ReadStatus({
  name,
  read,
  retry,
  disabled,
}: {
  name: string;
  read: Read;
  retry: () => void;
  disabled: boolean;
}) {
  return (
    <>
      {read.loading && (
        <div role="status" aria-label={"Loading " + name}>
          <div className="gt-skeleton" />
          <span className="sr-only">Loading {name}…</span>
        </div>
      )}
      {read.error && (
        <section role="alert">
          <p>{read.error}</p>
          {read.at && (
            <p>
              Last successful {name} check:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={retry}
          >
            Retry {name}
          </Button>
        </section>
      )}
    </>
  );
}
export default function FormIntegrations(props: Props) {
  const { currentAdmin } = useAdmin(),
    [epoch, setEpoch] = useState(0),
    callbacks = useRef(props);
  callbacks.current = props;
  useEffect(() => {
    const clear = () => {
      setEpoch((v) => v + 1);
      callbacks.current.onDenied?.();
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <IntegrationPanel
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.kind}:${props.resourceId}:${epoch}`}
      {...props}
    />
  );
}
function IntegrationPanel(props: Props) {
  const [open, setOpen] = useState(false),
    [refresh, setRefresh] = useState({
      workspace: 0,
      candidates: 0,
      target: 0,
    }),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [formId, setFormId] = useState(""),
    [label, setLabel] = useState("Open form"),
    [editing, setEditing] = useState<FormReference>(),
    [review, setReview] = useState<IntegrationIntent>(),
    [intent, setIntent] = useState<IntegrationIntent>(),
    [uncertain, setUncertain] = useState(false),
    [blocked, setBlocked] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const root = `/admin/form-integrations/${props.kind}/${props.resourceId}`,
    base = usePrivateRead<IntegrationWorkspace>(
      open && !blocked ? root : undefined,
      refresh.workspace,
    ),
    workspace = validIntegrationWorkspace(
      base.data,
      props.kind,
      props.resourceId,
    )
      ? base.data
      : undefined,
    candidateRead = usePrivateRead<IntegrationCandidates>(
      open && !blocked && workspace?.canLink
        ? root +
            "/candidates?" +
            new URLSearchParams({ q: search, page: String(page) })
        : undefined,
      refresh.candidates,
    ),
    targetRead = usePrivateRead<IntegrationCandidates>(
      open && !blocked && workspace?.canLink && formId
        ? root +
            "/candidates?" +
            new URLSearchParams({ selected: formId, pageSize: "1" })
        : undefined,
      refresh.target,
    ),
    candidates = validIntegrationCandidates(
      candidateRead.data,
      props.kind,
      props.resourceId,
    )
      ? candidateRead.data
      : undefined,
    targetInventory = validIntegrationCandidates(
      targetRead.data,
      props.kind,
      props.resourceId,
    )
      ? targetRead.data
      : undefined,
    target = targetInventory?.items.find((r) => r.id === formId),
    targetUnavailable = !!formId && !!targetInventory && !target,
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation(root),
    { begin, current, finish, cancel, pending } = mutation,
    safety = useNavigationSafety(),
    callbacks = useRef(props),
    feedback = useRef<HTMLParagraphElement>(null);
  callbacks.current = props;
  const baseError =
      base.error ||
      (!base.loading && base.data && !workspace
        ? "The current linked-form result could not be verified."
        : ""),
    candidateError =
      candidateRead.error ||
      (!candidateRead.loading && candidateRead.data && !candidates
        ? "The published-form inventory could not be verified."
        : ""),
    targetError =
      targetRead.error ||
      (!targetRead.loading && targetRead.data && !targetInventory
        ? "The selected published form could not be verified."
        : ""),
    baseReady = !!workspace && !base.loading && !baseError && !base.denied,
    candidateReady =
      !!candidates &&
      !candidateRead.loading &&
      !candidateError &&
      !candidateRead.denied,
    targetReady =
      !!target && !targetRead.loading && !targetError && !targetRead.denied,
    busy = mutation.busy || recoveryBusy,
    dirty =
      open &&
      !!(
        formId ||
        editing ||
        query ||
        label !== "Open form" ||
        review ||
        intent
      ),
    writable =
      isOnline &&
      !busy &&
      !intent &&
      !needsRecheck &&
      !blocked &&
      !props.disabled &&
      baseReady &&
      !!workspace?.canEdit;
  useLiveSearch(query, search, (value) => {
    setSearch(value);
    setPage(1);
  }, open && writable && !review);
  const clearBase = base.clear,
    clearCandidates = candidateRead.clear,
    clearTarget = targetRead.clear;
  useDraftGuard(dirty, {
    busy: open && busy,
    label: intent
      ? "Unconfirmed linked-form change"
      : "Published form link proposal",
  });
  const resetDraft = () => {
    setFormId("");
    setLabel("Open form");
    setQuery("");
    setSearch("");
    setPage(1);
    setEditing(undefined);
    setReview(undefined);
  };
  const block = () => {
    cancel();
    clearBase();
    clearCandidates();
    clearTarget();
    resetDraft();
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setError("");
    setNotice("");
    setBlocked(true);
    callbacks.current.onDenied?.();
  };
  const blockRef = useRef(block);
  blockRef.current = block;
  useEffect(() => {
    if (base.denied || candidateRead.denied || targetRead.denied)
      blockRef.current();
  }, [base.denied, candidateRead.denied, targetRead.denied]);
  useEffect(() => {
    if (workspace && !workspace.canEdit && (intent || review || formId))
      blockRef.current();
  }, [workspace, intent, review, formId]);
  useEffect(() => {
    if (!isOnline && open) setNeedsRecheck(true);
    if (!isOnline && pending.current && intent) {
      cancel();
      setReview(undefined);
      setUncertain(true);
    }
  }, [isOnline, open, pending, intent, cancel]);
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  const retry = (part: keyof typeof refresh) => {
    if (!isOnline || pending.current) return;
    setRefresh((v) => ({ ...v, [part]: v[part] + 1 }));
  };
  const reload = () => {
    if (!isOnline || pending.current) return;
    setNeedsRecheck(false);
    setRefresh((v) => ({
      workspace: v.workspace + 1,
      candidates: v.candidates + 1,
      target: v.target + 1,
    }));
    callbacks.current.onRecheck?.();
  };
  const completed = () => {
    setNeedsRecheck(false);
    resetDraft();
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setError("");
    clearBase();
    clearCandidates();
    clearTarget();
    setRefresh((v) => ({
      workspace: v.workspace + 1,
      candidates: v.candidates + 1,
      target: v.target + 1,
    }));
    setNotice(
      "Linked-form change confirmed. Current links are being refreshed.",
    );
    callbacks.current.onRecheck?.();
  };
  const abandon = () => {
    setNeedsRecheck(false);
    resetDraft();
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setError("");
    clearBase();
    clearCandidates();
    clearTarget();
    setRefresh((v) => ({
      workspace: v.workspace + 1,
      candidates: v.candidates + 1,
      target: v.target + 1,
    }));
    setNotice(
      "Recovery stopped. Review current links before making another request.",
    );
    callbacks.current.onRecheck?.();
  };
  const discard = (run: () => void) => {
    if (busy || pending.current || intent) return;
    if (dirty) safety.request(run);
    else run();
  };
  const close = () =>
    discard(() => {
      resetDraft();
      setOpen(false);
      clearBase();
      clearCandidates();
      clearTarget();
      setError("");
      setNotice("");
    });
  const start = (remove?: FormReference) => {
    if (
      !writable ||
      !workspace ||
      pending.current ||
      (!remove && (!workspace.canLink || !targetReady))
    )
      return;
    try {
      setReview(
        prepareIntegrationWrite(
          workspace,
          remove ? "remove" : "save",
          label,
          target,
          remove || editing,
        ),
      );
      setError("");
      setNotice("");
      retry("workspace");
      if (!remove) retry("target");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const body = review ? JSON.parse(review.body) : undefined,
    selectedReference =
      review && workspace?.items.find((r) => r.slot === review.slot),
    reviewChanged =
      !!review &&
      baseReady &&
      ((selectedReference?.id || null) !== review.sourceId ||
        (selectedReference?.revision || 0) !== body.revision ||
        (review.action === "save" &&
          targetReady &&
          (target!.id !== body.formId ||
            target!.formRevision !== body.formRevision ||
            target!.publishedVersionId !== body.publishedVersionId))),
    reviewReady =
      writable &&
      !!review &&
      !reviewChanged &&
      (review.action === "remove" || (workspace?.canLink && targetReady));
  async function submit() {
    if (!review || !reviewReady || pending.current) return;
    const controller = begin();
    if (!controller) return;
    const original = review;
    setIntent(original);
    setError("");
    setNotice("");
    try {
      await submitIntegrationWrite(original, controller.signal);
      if (current(controller)) completed();
    } catch (e) {
      if (!current(controller)) return;
      setReview(undefined);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
        block();
      else if (!(e instanceof ApiFailure) || e.status >= 500)
        setUncertain(true);
      else {
        setIntent(undefined);
        setError(
          (e as Error).message +
            " Recheck current links before another review.",
        );
        setNeedsRecheck(false);
        setRefresh((v) => ({
          workspace: v.workspace + 1,
          candidates: v.candidates + 1,
          target: v.target + 1,
        }));
        callbacks.current.onRecheck?.();
      }
    } finally {
      finish(controller);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={props.disabled}
        onClick={() => {
          setOpen(true);
          setBlocked(false);
          setError("");
          setNotice("");
        }}
      >
        Linked forms
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          className="gt-notification-dialog gt-form-integration-dialog"
          closeDisabled={busy || !!intent}
          onEscapeKeyDown={(e) => {
            if (busy || intent) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy || intent) e.preventDefault();
          }}
        >
          <DialogTitle>Linked forms</DialogTitle>
          <DialogDescription>
            Connect a published form to this {props.kind}. Links follow the
            latest published version; drafts stay private.
          </DialogDescription>
          {blocked ? (
            <EmptyState
              title="Linked-form access is restricted"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!isOnline}
                  onClick={() => {
                    setBlocked(false);
                    retry("workspace");
                  }}
                >
                  Retry current linked-form access
                </Button>
              }
            >
              Private links, candidates and proposals were cleared for your
              current session.
            </EmptyState>
          ) : (
            <div className="gt-form">
              {error && (
                <p
                  ref={feedback}
                  tabIndex={-1}
                  role="alert"
                  className="gt-form-error"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p ref={feedback} tabIndex={-1} role="status">
                  {notice}
                </p>
              )}
              {!isOnline && (
                <p role="status">
                  Reconnect, then explicitly check current links before
                  confirming. No changes run automatically.
                </p>
              )}
              {needsRecheck && isOnline && !intent && (
                <p role="status">
                  Recheck current linked-form access after reconnecting.
                </p>
              )}
              {open && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!isOnline || busy}
                  onClick={reload}
                >
                  Recheck linked form access
                </Button>
              )}
              {intent && uncertain && (
                <FormIntegrationWriteRecovery
                  key={intent.key}
                  intent={intent}
                  onRecovered={completed}
                  onDenied={block}
                  onBusy={setRecoveryBusy}
                  onAbandon={abandon}
                />
              )}
              <ReadStatus
                name="current linked forms"
                read={{ ...base, error: baseError }}
                retry={() => (needsRecheck ? reload() : retry("workspace"))}
                disabled={!isOnline || busy}
              />
              {workspace && (
                <>
                  {workspace.items.length ? (
                    <ul className="gt-form-integration-list">
                      {workspace.items.map((row) => (
                        <li key={row.id}>
                          <div>
                            <strong>{row.label}</strong>
                            <p className="gt-helper">
                              {row.formId === formId && targetUnavailable
                                ? "Form details restricted"
                                : row.title || "Form details restricted"}{" "}
                              · latest published version
                            </p>
                            {row.href &&
                            !(row.formId === formId && targetUnavailable) ? (
                              <Link to={row.href}>Open respondent page</Link>
                            ) : (
                              <span className="gt-helper">
                                Not currently available to open
                              </span>
                            )}
                          </div>
                          {workspace.canEdit && (
                            <div className="gt-inline-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={
                                  !writable || !workspace.canLink || !!review
                                }
                                onClick={() =>
                                  discard(() => {
                                    resetDraft();
                                    setEditing(row);
                                    setFormId(row.formId);
                                    setLabel(row.label);
                                  })
                                }
                              >
                                Edit link
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={!writable || !!review}
                                onClick={() => start(row)}
                              >
                                Remove link
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : baseReady ? (
                    <p>No forms linked yet.</p>
                  ) : null}
                  {review && (
                    <section
                      className="gt-form"
                      aria-label="Review published form link"
                    >
                      <h3>
                        {review.action === "remove"
                          ? "Remove form link?"
                          : review.sourceId
                            ? "Replace form link?"
                            : "Link published form?"}
                      </h3>
                      <p>
                        {review.action === "remove" ? "Remove" : "Save"} “
                        {review.label}” on this {props.kind}. The form and
                        responses are retained.
                      </p>
                      <p>
                        Reviewed link revision {body.revision}.{" "}
                        {review.action === "save"
                          ? "The selected publication is checked before saving. Future publications follow this link automatically; drafts remain private."
                          : ""}
                      </p>
                      {reviewChanged && (
                        <p role="alert">
                          The selected link or publication changed. Cancel and
                          review its current state.
                        </p>
                      )}
                      {!baseReady ||
                      (review.action === "save" && !targetReady) ? (
                        <p role="status">
                          Checking current link and selected-form access before
                          confirmation…
                        </p>
                      ) : null}
                      <div className="gt-inline-actions">
                        <Button
                          type="button"
                          variant={
                            review.action === "remove" ? "danger" : "primary"
                          }
                          disabled={!reviewReady}
                          onClick={() => void submit()}
                        >
                          {busy
                            ? "Saving…"
                            : review.action === "remove"
                              ? "Confirm removal"
                              : "Confirm form link"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setReview(undefined)}
                        >
                          Cancel review
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!isOnline || busy}
                          onClick={reload}
                        >
                          Recheck link review
                        </Button>
                      </div>
                    </section>
                  )}
                  {!review &&
                    !intent &&
                    workspace.canLink &&
                    (editing || workspace.items.length < 5) && (
                      <>
                        <form
                          className="gt-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!isOnline || busy) return;
                            setPage(1);
                            if (search === query) retry("candidates");
                            else setSearch(query);
                          }}
                        >
                          <Field
                            label="Find a published form"
                            hint="Searches published forms you can view and manage. Unpublished and archived forms are excluded."
                          >
                            <div className="gt-inline-actions">
                              <input
                                value={query}
                                maxLength={100}
                                disabled={busy}
                                onChange={(e) => setQuery(e.target.value)}
                              />
                              <Button
                                type="submit"
                                variant="secondary"
                                disabled={
                                  !isOnline || busy || candidateRead.loading
                                }
                              >
                                Search forms
                              </Button>
                            </div>
                          </Field>
                        </form>
                        <ReadStatus
                          name="published form candidates"
                          read={{ ...candidateRead, error: candidateError }}
                          retry={() => retry("candidates")}
                          disabled={!isOnline || busy}
                        />
                        <div
                          className="gt-inline-actions"
                          aria-label="Published form pages"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={
                              !candidateReady || busy || !isOnline || page === 1
                            }
                            onClick={() => setPage((v) => v - 1)}
                          >
                            Previous forms
                          </Button>
                          <span>
                            Form page {page} · {candidates?.total || 0} matching
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={
                              !candidateReady ||
                              busy ||
                              !isOnline ||
                              page * 30 >= (candidates?.total || 0)
                            }
                            onClick={() => setPage((v) => v + 1)}
                          >
                            Next forms
                          </Button>
                        </div>
                        <form
                          className="gt-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            start();
                          }}
                        >
                          <h3>
                            {editing
                              ? "Edit form link"
                              : "Add a published form"}
                          </h3>
                          <fieldset
                            className="gt-form gt-plain-fieldset"
                            disabled={busy || !isOnline}
                          >
                            <Field label="Published form">
                              <select
                                required
                                value={formId}
                                disabled={!candidateReady}
                                onChange={(e) => setFormId(e.target.value)}
                              >
                                <option value="">Choose a form</option>
                                {formId &&
                                  (targetUnavailable ||
                                    !candidates?.items.some(
                                      (c) => c.id === formId,
                                    )) && (
                                    <option value={formId}>
                                      {target?.title ||
                                        "Selected form unavailable; recheck its current access"}
                                    </option>
                                  )}
                                {candidates?.items
                                  .filter(
                                    (c) =>
                                      c.id !== formId || !targetUnavailable,
                                  )
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title} · v{c.version} · {c.access}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                            {formId && (
                              <>
                                <ReadStatus
                                  name="selected published form"
                                  read={{ ...targetRead, error: targetError }}
                                  retry={() => retry("target")}
                                  disabled={!isOnline || busy}
                                />
                                {targetInventory &&
                                  !targetRead.loading &&
                                  !targetError &&
                                  !target && (
                                    <p role="alert">
                                      The selected form is no longer available
                                      for linking. Choose a currently authorized
                                      published form.
                                    </p>
                                  )}
                              </>
                            )}
                            <Field label="Link label">
                              <input
                                required
                                maxLength={80}
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                              />
                            </Field>
                            <p className="gt-helper">
                              A link does not grant form access or verify
                              identity. Public event pages show only available
                              public or email-verified forms; invited, internal
                              and unlisted forms stay off public event pages.
                            </p>
                            <div className="gt-inline-actions">
                              <Button
                                type="submit"
                                disabled={
                                  !writable || !targetReady || !label.trim()
                                }
                              >
                                {editing
                                  ? "Review link changes"
                                  : "Review new link"}
                              </Button>
                              {dirty && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy}
                                  onClick={() => discard(resetDraft)}
                                >
                                  Cancel changes
                                </Button>
                              )}
                            </div>
                          </fieldset>
                        </form>
                      </>
                    )}
                  {!review &&
                    !intent &&
                    (!workspace.canLink ||
                      (workspace.items.length >= 5 && !editing)) && (
                      <p className="gt-helper">
                        {workspace.canLink
                          ? "Five forms are linked. Remove one before adding another."
                          : workspace.canEdit
                            ? "New links require an active editable resource. Existing links can be removed by authorized managers."
                            : "Your current access allows reviewing links. Editing requires additional permission."}
                      </p>
                    )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
