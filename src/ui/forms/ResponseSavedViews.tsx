import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field } from "../primitives";
import {
  prepareViewWrite,
  submitViewWrite,
  validSavedView,
  type ViewIntent,
  type ViewInspection,
  type SavedResponseView,
  type ViewAction,
} from "./form-view-api";
import FormViewWriteRecovery from "./FormViewWriteRecovery";
type Props = {
  formId: string;
  items: SavedResponseView[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  scope: string;
  name: string;
  filters: Record<string, string | number>;
  columns: string[];
  columnLabels?: Record<string, string>;
  disabled: boolean;
  onNameChange: (name: string) => void;
  onSearch: (query: string) => void;
  onPage: (page: number) => void;
  onApply: (view: SavedResponseView) => void;
  onComplete: (result: ViewInspection) => void;
  onDenied: () => void;
  onReload: () => void;
  onStateChange: (state: { busy: boolean; dirty: boolean }) => void;
};
export default function ResponseSavedViews(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <SavedViews
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}`}
      {...props}
    />
  );
}
function SavedViews(props: Props) {
  const [selectedId, setSelectedId] = useState(""),
    [review, setReview] = useState<ViewIntent>(),
    [intent, setIntent] = useState<ViewIntent>(),
    [uncertain, setUncertain] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState(""),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [sessionInvalid, setSessionInvalid] = useState(false);
  const callbacks = useRef(props),
    activeIntent = useRef<ViewIntent>(),
    reviewLabels = useRef<Record<string, string>>({}),
    feedback = useRef<HTMLParagraphElement>(null),
    { isOnline } = useOnlineStatus(),
    safety = useNavigationSafety(),
    { busy, begin, current, finish, cancel } = usePrivateMutation(
      "saved-views:" + props.formId,
    ),
    pending = busy || recoveryBusy,
    dirty = !!props.name.trim() || !!review || !!intent;
  callbacks.current = props;
  const selected = props.items.find((v) => v.id === selectedId),
    writable =
      !props.disabled &&
      isOnline &&
      !sessionInvalid &&
      !pending &&
      !intent &&
      !stale;
  const changed =
    !!review &&
    review.action !== "create" &&
    (!selected ||
      selected.id !== review.sourceId ||
      selected.revision !== JSON.parse(review.body).revision);
  useDraftGuard(dirty, {
    busy: pending,
    label: intent
      ? "Unconfirmed saved view change"
      : "Saved response view proposal",
  });
  useEffect(() => {
    callbacks.current.onStateChange({ busy: pending, dirty });
  }, [pending, dirty]);
  useEffect(() => {
    setSelectedId("");
  }, [props.scope]);
  useEffect(() => {
    const clear = () => {
      cancel();
      activeIntent.current = undefined;
      setIntent(undefined);
      setReview(undefined);
      setError("");
      setSessionInvalid(true);
      callbacks.current.onNameChange("");
      callbacks.current.onDenied();
    };
    const offline = () => {
      cancel();
      if (activeIntent.current) {
        setIntent(activeIntent.current);
        setUncertain(true);
      }
    };
    window.addEventListener("gdg:session-cleared", clear);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clear);
      window.removeEventListener("offline", offline);
    };
  }, [cancel]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const reset = () => {
    activeIntent.current = undefined;
    setIntent(undefined);
    setReview(undefined);
    setUncertain(false);
    setStale(false);
    setError("");
    setRecoveryBusy(false);
  };
  const completed = (result: ViewInspection) => {
    reset();
    setSelectedId("");
    callbacks.current.onNameChange("");
    callbacks.current.onComplete(result);
  };
  function openReview(action: ViewAction) {
    if (!writable || (action !== "create" && !validSavedView(selected))) return;
    const name = action === "create" ? props.name.trim() : selected!.name;
    if (action !== "remove" && !name) return;
    reviewLabels.current = { ...props.columnLabels };
    setReview(
      prepareViewWrite(
        props.formId,
        action,
        name,
        props.filters,
        props.columns,
        action === "create" ? undefined : selected,
      ),
    );
    setError("");
  }
  async function confirm() {
    if (!writable || !review || changed) return;
    const controller = begin();
    if (!controller) return;
    activeIntent.current = review;
    setIntent(review);
    setError("");
    try {
      const result = await submitViewWrite(review, controller.signal);
      if (current(controller)) completed(result);
    } catch (e) {
      if (!current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        reset();
        callbacks.current.onNameChange("");
        callbacks.current.onDenied();
      } else if (
        e instanceof ApiFailure &&
        [400, 409, 429].includes(e.status)
      ) {
        activeIntent.current = undefined;
        setIntent(undefined);
        setStale(true);
        setError(
          e.message +
            " Reload current saved views before reviewing another change.",
        );
      } else setUncertain(true);
    } finally {
      finish(controller);
    }
  }
  const reload = () => {
    reset();
    setSelectedId("");
    callbacks.current.onReload();
  };
  return (
    <>
      <div className="gt-actions">
        <Field label="Search saved views">
          <input
            maxLength={100}
            value={props.query}
            disabled={pending || !!review || !!intent}
            onChange={(e) => props.onSearch(e.target.value)}
          />
        </Field>
        <Field label="Saved view">
          <select
            value={selectedId}
            disabled={props.disabled || pending || !!review || !!intent}
            onChange={(e) => {
              const chosen = props.items.find((v) => v.id === e.target.value);
              setSelectedId(e.target.value);
              if (chosen) {
                const apply = () => callbacks.current.onApply(chosen);
                if (props.name.trim()) safety.request(apply);
                else apply();
              }
            }}
          >
            <option value="">Choose a view</option>
            {props.items.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="New view name">
          <input
            maxLength={100}
            value={props.name}
            disabled={pending || !!review || !!intent}
            onChange={(e) => props.onNameChange(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!writable || !props.name.trim()}
          onClick={() => openReview("create")}
        >
          Save view
        </Button>
        <Button
          variant="secondary"
          disabled={!writable || !validSavedView(selected)}
          onClick={() => openReview("replace")}
        >
          Replace selected view
        </Button>
        <Button
          variant="ghost"
          disabled={!writable || !validSavedView(selected)}
          onClick={() => openReview("remove")}
        >
          Remove selected view
        </Button>
      </div>
      <nav className="gt-inline-actions" aria-label="Saved view pages">
        <Button
          variant="secondary"
          disabled={
            props.disabled || pending || !!review || !!intent || props.page <= 1
          }
          onClick={() => props.onPage(props.page - 1)}
        >
          Previous saved views
        </Button>
        <span>
          Saved views page {props.page} of{" "}
          {Math.max(1, Math.ceil(props.total / props.pageSize))} · {props.total}{" "}
          matching
        </span>
        <Button
          variant="secondary"
          disabled={
            props.disabled ||
            pending ||
            !!review ||
            !!intent ||
            props.page * props.pageSize >= props.total
          }
          onClick={() => props.onPage(props.page + 1)}
        >
          Next saved views
        </Button>
      </nav>
      <Dialog
        open={!!review || !!intent}
        onOpenChange={(open) => {
          if (!open && !pending) {
            if (intent) safety.request(reload);
            else reset();
          }
        }}
      >
        <DialogContent
          className="gt-notification-dialog"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <DialogTitle>
            {uncertain
              ? "Recheck saved view"
              : review?.action === "create"
                ? "Save a new view?"
                : review?.action === "replace"
                  ? "Replace selected view?"
                  : "Remove selected view?"}
          </DialogTitle>
          <DialogDescription>
            {uncertain
              ? "Check the originally reviewed saved-view outcome before another change."
              : review?.action === "create"
                ? "Create your own review preferences. An existing name is rejected rather than overwritten."
                : review?.action === "replace"
                  ? "Replace this selected revision with the currently reviewed filters and answer columns."
                  : "Remove only your selected saved preferences. Responses and published forms remain available."}
          </DialogDescription>
          {!uncertain && review && (
            <>
              <p>
                <strong>{review.name}</strong>
                {review.sourceId && (
                  <> · saved view revision {JSON.parse(review.body).revision}</>
                )}
              </p>
              {review.action !== "remove" && (
                <>
                  <h3>Filters to save</h3>
                  <dl className="gt-response-answers">
                    {Object.entries(JSON.parse(review.body).filters).length ? (
                      Object.entries(JSON.parse(review.body).filters).map(
                        ([key, value]) => (
                          <div key={key}>
                            <dt>
                              {{
                                q: "Search",
                                version: "Published version",
                                from: "Submitted after",
                                to: "Submitted before",
                                status: "Response status",
                              }[
                                key as
                                  | "q"
                                  | "version"
                                  | "from"
                                  | "to"
                                  | "status"
                              ] || key}
                            </dt>
                            <dd>{String(value)}</dd>
                          </div>
                        ),
                      )
                    ) : (
                      <div>
                        <dt>Filters</dt>
                        <dd>All permitted responses</dd>
                      </div>
                    )}
                  </dl>
                  {!!JSON.parse(review.body).columns.length && (
                    <ul aria-label="Answer columns to save">
                      {JSON.parse(review.body).columns.map((id: string) => (
                        <li key={id}>
                          {reviewLabels.current[id] || `Field ${id}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>
                    {JSON.parse(review.body).columns.length} selected answer
                    columns. Sensitive values remain subject to current
                    permission and explicit reveal.
                  </p>
                </>
              )}
            </>
          )}
          {error && (
            <p ref={feedback} tabIndex={-1} role="alert">
              {error}
            </p>
          )}
          {changed && (
            <p role="alert">
              The selected saved view changed or is no longer in the current
              inventory. Reload and review its current revision.
            </p>
          )}
          {!uncertain && (
            <div className="gt-inline-actions">
              <Button
                variant={review?.action === "remove" ? "danger" : "primary"}
                disabled={!writable || changed}
                onClick={() => void confirm()}
              >
                {pending
                  ? "Saving…"
                  : review?.action === "create"
                    ? "Confirm new view"
                    : review?.action === "replace"
                      ? "Confirm replacement"
                      : "Confirm removal"}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={reset}>
                Cancel review
              </Button>
              {(stale || changed) && (
                <Button
                  variant="secondary"
                  disabled={pending || !isOnline}
                  onClick={reload}
                >
                  Reload current saved views and review again
                </Button>
              )}
            </div>
          )}
          {uncertain && intent && (
            <FormViewWriteRecovery
              key={intent.key}
              intent={intent}
              onRecovered={completed}
              onBusy={setRecoveryBusy}
              onDenied={() => {
                reset();
                callbacks.current.onNameChange("");
                callbacks.current.onDenied();
              }}
              onAbandon={reload}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
