import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
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
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api<Inbox>(
        `/admin/notifications?page=${page}&pageSize=20`,
      );
      if (page > 1 && result.total <= (page - 1) * 20) {
        setPage(Math.max(1, Math.ceil(result.total / 20)));
        return;
      }
      setData(result);
      onChange?.(result.unreadCount);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [page, onChange]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("gdg:notifications-updated", refresh);
    return () =>
      window.removeEventListener("gdg:notifications-updated", refresh);
  }, [load]);
  const mutate = async (path: string, method = "PATCH", dismissAll = false) => {
    setBusy(true);
    setNotice("");
    try {
      await api(path, {
        method,
        protected: true,
        ...(method === "PATCH" ? { body: { is_read: true } } : {}),
        ...(dismissAll ? { body: { readOnly: true } } : {}),
      });
      if (dismissAll) {
        setNotice("Read notifications dismissed. New unread notifications are kept.");
        if (page !== 1) { setPage(1); return; }
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="gt-notification-inbox" aria-busy={busy}>
      <div className="gt-panel-heading">
        <p>{data ? `${data.unreadCount} unread` : "Loading notifications…"}</p>
        <Button
          variant="secondary"
          disabled={busy || !data?.total}
          onClick={() => data?.unreadCount ? mutate("/admin/notifications") : mutate("/admin/notifications", "DELETE", true)}
        >
          {data?.unreadCount ? "Mark all read" : "Dismiss all"}
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="gt-form-error" role="alert">
          {error} <button onClick={() => void load()}>Try again</button>
        </p>
      )}
      {data?.items.length === 0 && !error && (
        <EmptyState title="You’re all caught up">
          Team updates and account notifications will appear here.
        </EmptyState>
      )}
      <ul className="gt-notification-list">
        {data?.items.map((item) => (
          <li key={item.id} className={item.is_read ? "" : "is-unread"}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <small>{new Date(item.created_at).toLocaleString()}</small>
            </div>
            <div className="gt-actions">
              {item.link && <Link to={item.link}>Open update</Link>}
              {!item.is_read && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => mutate("/admin/notifications/" + item.id)}
                >
                  Mark read
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
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
      {!!data?.total && (
        <nav aria-label="Notifications pages" className="gt-actions">
          <Button
            variant="secondary"
            disabled={busy || page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(data.total / 20))}
          </span>
          <Button
            variant="secondary"
            disabled={busy || page * 20 >= data.total}
            onClick={() => setPage(page + 1)}
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
  const accountId = currentAdmin?.id;
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
    const update = () => {
      if (document.visibilityState === "hidden") return;
      api<Inbox>("/admin/notifications?pageSize=1")
        .then((r) => {
          if (active) setCount(r.unreadCount);
        })
        .catch(() => {
          /* Opening the inbox exposes errors with retry. */
        });
    };
    update();
    const timer = window.setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
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
