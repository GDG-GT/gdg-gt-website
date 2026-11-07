import { useEffect, useState, useCallback, useRef } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, EmptyState } from "@/ui/primitives";
type Notification = {
  id: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};
type Inbox = { items: Notification[]; total: number; unreadCount: number };

export function NotificationInbox({
  onChange,
}: {
  onChange?: (count: number) => void;
}) {
  const [data, setData] = useState<Inbox>(),
    [page, setPage] = useState(1),
    [reading, setReading] = useState(true),
    [writing, setWriting] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [loadedPage, setLoadedPage] = useState(0),
    [loadedAt, setLoadedAt] = useState("");
  const mounted = useRef(false),
    read = useRef<AbortController>(),
    mutation = useRef<AbortController>(),
    mutationPending = useRef(false),
    summary = useRef<HTMLParagraphElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    failure = useRef<HTMLParagraphElement>(null),
    focusTarget = useRef<"summary" | "notice" | "error" | null>(null);
  const busy = reading || writing,
    current = loadedPage === page ? data : undefined;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      read.current?.abort();
      mutation.current?.abort();
    };
  }, []);
  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setReading(true);
    setLoadError("");
    try {
      const result = await api<Inbox>(
        `/admin/notifications?page=${page}&pageSize=20`,
        { signal: controller.signal },
      );
      if (!mounted.current || controller.signal.aborted) return;
      if (page > 1 && result.total <= (page - 1) * 20) {
        setPage(Math.max(1, Math.ceil(result.total / 20)));
        return;
      }
      setData(result);
      setLoadedPage(page);
      setLoadedAt(new Date().toLocaleString());
      onChange?.(result.unreadCount);
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          setData(undefined);
          setLoadedPage(0);
          setLoadedAt("");
          onChange?.(0);
        }
        setLoadError(
          e instanceof Error
            ? e.message
            : "Notifications could not load. Try again.",
        );
      }
    } finally {
      if (mounted.current && !controller.signal.aborted) setReading(false);
    }
  }, [page, onChange]);
  useEffect(() => {
    void load();
    return () => read.current?.abort();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!mutationPending.current) void load();
    };
    window.addEventListener("gdg:notifications-updated", refresh);
    return () =>
      window.removeEventListener("gdg:notifications-updated", refresh);
  }, [load]);
  useEffect(() => {
    if (busy || !focusTarget.current) return;
    const target = { summary, notice: feedback, error: failure }[
      focusTarget.current
    ].current;
    if (target) {
      focusTarget.current = null;
      target.focus();
    }
  }, [busy, notice, error, loadError, current]);
  const mutate = async (path: string, method = "PATCH", dismissAll = false) => {
    if (mutationPending.current) return;
    mutationPending.current = true;
    read.current?.abort();
    setReading(false);
    const controller = new AbortController();
    mutation.current = controller;
    setWriting(true);
    setError("");
    setNotice("");
    try {
      await api(path, {
        method,
        protected: true,
        signal: controller.signal,
        ...(method === "PATCH" ? { body: { is_read: true } } : {}),
        ...(dismissAll ? { body: { readOnly: true } } : {}),
      });
      if (!mounted.current || controller.signal.aborted) return;
      setNotice(
        dismissAll
          ? "Read notifications dismissed. New unread notifications are kept."
          : method === "DELETE"
            ? "Notification dismissed from your inbox."
            : "Notifications marked read.",
      );
      focusTarget.current = "notice";
      if (dismissAll) {
        if (page !== 1) {
          setPage(1);
          return;
        }
      }
      await load();
    } catch (e) {
      if (mounted.current && !controller.signal.aborted) {
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          setData(undefined);
          setLoadedPage(0);
          setLoadedAt("");
          onChange?.(0);
        }
        setError(
          e instanceof Error
            ? e.message
            : "This change could not be confirmed. Refresh your inbox before trying again.",
        );
        focusTarget.current = "error";
      }
    } finally {
      mutationPending.current = false;
      if (mounted.current && !controller.signal.aborted) setWriting(false);
    }
  };
  return (
    <div className="gt-notification-inbox" aria-busy={busy}>
      <div className="gt-panel-heading">
        <p ref={summary} tabIndex={-1}>
          {current
            ? `${current.unreadCount} unread`
            : reading
              ? "Loading notifications…"
              : "Notifications unavailable"}
        </p>
        <Button
          variant="secondary"
          disabled={busy || !!loadError || !current?.total}
          onClick={() =>
            current?.unreadCount
              ? mutate("/admin/notifications")
              : mutate("/admin/notifications", "DELETE", true)
          }
        >
          {current?.unreadCount ? "Mark all read" : "Dismiss all"}
        </Button>
      </div>
      <p className="gt-helper">
        Dismiss all removes read notifications from your inbox. New unread
        updates are kept.
      </p>
      {notice && (
        <p role="status" ref={feedback} tabIndex={-1}>
          {notice}
        </p>
      )}
      {reading && !current && (
        <div
          role="status"
          aria-label="Loading notifications"
          className="gt-skeleton gt-detail-skeleton"
        />
      )}
      {loadError && (
        <div role="alert" className="gt-form-error">
          <p>
            {current && loadedAt
              ? `Could not refresh. Showing notifications last loaded ${loadedAt}. `
              : "Notifications could not load. "}
            {loadError}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              focusTarget.current = "summary";
              void load();
            }}
          >
            Retry loading notifications
          </Button>
        </div>
      )}
      {error && (
        <p className="gt-form-error" role="alert" ref={failure} tabIndex={-1}>
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              focusTarget.current = "summary";
              void load();
            }}
          >
            Refresh inbox
          </button>
        </p>
      )}
      {current?.items.length === 0 && !error && !loadError && (
        <EmptyState title="You’re all caught up">
          Team updates and account notifications will appear here.
        </EmptyState>
      )}
      <ul className="gt-notification-list">
        {current?.items.map((item) => (
          <li key={item.id} className={item.is_read ? "" : "is-unread"}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </div>
            <div className="gt-actions">
              {item.link &&
                /^\/(?!\/)/.test(item.link) &&
                !/[\\\s]/.test(item.link) &&
                !Array.from(item.link).some(
                  (character) =>
                    character.charCodeAt(0) <= 32 ||
                    character.charCodeAt(0) === 127,
                ) && <Link to={item.link}>Open update</Link>}
              {!item.is_read && (
                <Button
                  variant="ghost"
                  aria-label={`Mark read: ${item.title}`}
                  disabled={busy || !!loadError}
                  onClick={() => mutate("/admin/notifications/" + item.id)}
                >
                  Mark read
                </Button>
              )}
              <Button
                variant="ghost"
                aria-label={`Dismiss ${item.title}`}
                disabled={busy || !!loadError}
                onClick={() =>
                  mutate("/admin/notifications/" + item.id, "DELETE")
                }
              >
                Dismiss<span className="sr-only"> {item.title}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!!current?.total && (
        <nav aria-label="Notifications pages" className="gt-actions">
          <Button
            variant="secondary"
            disabled={busy || page === 1}
            onClick={() => {
              setPage(page - 1);
              focusTarget.current = "summary";
            }}
          >
            Previous
          </Button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(current.total / 20))}
          </span>
          <Button
            variant="secondary"
            disabled={busy || page * 20 >= current.total}
            onClick={() => {
              setPage(page + 1);
              focusTarget.current = "summary";
            }}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
export default function NotificationBell() {
  const { currentAdmin } = useAdmin();
  return (
    <NotificationBellWorkspace
      key={`${currentAdmin?.id}:${currentAdmin?.role}`}
      accountId={currentAdmin?.id}
    />
  );
}
function NotificationBellWorkspace({ accountId }: { accountId?: string }) {
  const [open, setOpen] = useState(false),
    [count, setCount] = useState(0),
    [revision, setRevision] = useState(0);
  useScopedRealtime(
    { kind: "notifications" },
    () => {
      setRevision((v) => v + 1);
      window.dispatchEvent(new Event("gdg:notifications-updated"));
    },
    () => {
      setCount(0);
      setOpen(false);
    },
  );
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    let controller: AbortController | undefined;
    const cancel = () => controller?.abort();
    const update = () => {
      cancel();
      if (document.visibilityState === "hidden") return;
      const current = new AbortController();
      controller = current;
      api<Inbox>("/admin/notifications?pageSize=1", { signal: current.signal })
        .then((r) => {
          if (active && !current.signal.aborted) setCount(r.unreadCount);
        })
        .catch(() => {
          /* Opening the inbox exposes errors with retry. */
        });
    };
    update();
    const timer = window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", cancel);
    return () => {
      active = false;
      cancel();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", cancel);
    };
  }, [accountId, revision]);
  return (
    <>
      <button
        type="button"
        className="gt-icon-button"
        aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
        onClick={() => setOpen(true)}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="gt-notification-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gt-notification-dialog">
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>
            Your account’s updates. Only you can read or dismiss these
            notifications.
          </DialogDescription>
          <NotificationInbox onChange={setCount} />
        </DialogContent>
      </Dialog>
    </>
  );
}
