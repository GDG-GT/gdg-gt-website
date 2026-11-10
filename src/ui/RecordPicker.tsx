import { useEffect, useId, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { Button, Field } from "./primitives";

type Item = {
  id: string;
  title?: string;
  name?: string;
  display_name?: string;
  email?: string;
  submittedAt?: string;
  respondent?: { name?: string | null; email?: string | null; source?: string };
};
type Listing = { items: Item[]; total: number; pageSize?: number };
export type RecordChoice = { id: string; label: string };

/** Selection uses a permission-checked inventory, never a hand-entered database ID. */
export default function RecordPicker({
  label, endpoint, value, onChange, disabled = false, name, hint,
  initialLabel, eligible, inventories,
}: {
  label: string;
  endpoint: string;
  value: string;
  onChange: (choice: RecordChoice | null) => void;
  disabled?: boolean;
  name?: string;
  hint?: string;
  initialLabel?: string;
  eligible?: (item: Item) => boolean;
  inventories?: { label: string; endpoint: string }[];
}) {
  const [open, setOpen] = useState(false),
    [inventory, setInventory] = useState(endpoint),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0),
    [selection, setSelection] = useState<RecordChoice>();
  useEffect(() => {
    setOpen(false); setInventory(endpoint); setQuery(""); setSearch(""); setPage(1); setSelection(undefined);
  }, [endpoint]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const groupId = useId(), container = useRef<HTMLDivElement>(null);
  const focusTrigger = () => container.current?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus();
  const { isOnline } = useOnlineStatus();
  const source = inventories?.some((item) => item.endpoint === inventory) ? inventory : endpoint;
  const read = usePrivateRead<Listing>(
    open && !disabled && isOnline
      ? source + (source.includes("?") ? "&" : "?") + new URLSearchParams({ q: search, page: String(page) })
      : undefined,
    retry,
  );
  const data = read.data,
    valid = !!data && Array.isArray(data.items) && Number.isInteger(data.total) && data.total >= 0 && data.items.every(
      (item) => !!item && typeof item.id === "string" &&
        [item.title, item.name, item.display_name, item.email, item.submittedAt].some((text) => typeof text === "string" && text.length > 0) &&
        [item.title, item.name, item.display_name, item.email, item.submittedAt].every((text) => text == null || typeof text === "string"),
    ),
    ready = query === search && valid && !read.loading && !read.error && !read.denied && isOnline,
    selectedLabel = selection?.id === value ? selection.label : initialLabel || `Linked ${label.toLowerCase()}`;
  const itemLabel = (item: Item) => item.title || item.name || item.display_name || item.email ||
    `Response · ${new Date(item.submittedAt!).toLocaleString()}`;
  return (
    <div className="gt-form gt-record-picker" ref={container}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="gt-button-row">
        <strong>{label}</strong>
        {value && <span>{selectedLabel}</span>}
        <Button type="button" variant="secondary" disabled={disabled} aria-expanded={open} aria-controls={groupId}
          onClick={() => setOpen(!open)}>{open ? `Close ${label.toLowerCase()} choices` : value ? `Change ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}</Button>
        {value && <Button type="button" variant="ghost" disabled={disabled} onClick={() => {
          setSelection(undefined); onChange(null); focusTrigger();
        }}>Clear {label.toLowerCase()}</Button>}
      </div>
      {open && (
        <div id={groupId} role="group" aria-label={`${label} choices`}>
          {inventories && <Field label={`${label} inventory`}>
            <select value={source} disabled={disabled} onChange={(event) => {
              setInventory(event.target.value); setQuery(""); setSearch(""); setPage(1);
            }}>
              {inventories.map((item) => <option key={item.endpoint} value={item.endpoint}>{item.label}</option>)}
            </select>
          </Field>}
          <Field label={`Search ${label.toLowerCase()}`} hint={hint}>
            <input type="search" value={query} maxLength={100} disabled={disabled}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </Field>
          {!isOnline && <p role="status">Reconnect to choose a {label.toLowerCase()}.</p>}
          {(read.loading || query !== search) && <p role="status">Loading {label.toLowerCase()} choices…</p>}
          {(read.error || (!read.loading && data && !valid)) && <p role="alert">
            {read.error || "The choices could not be verified."} <Button type="button" variant="ghost" onClick={() => setRetry(retry + 1)}>Retry {label.toLowerCase()} choices</Button>
          </p>}
          {ready && <>
            <ul className="gt-picker-options">
              {data.items.filter((item) => !eligible || eligible(item)).map((item) => (
                <li key={item.id}>
                  <Button type="button" variant={item.id === value ? "primary" : "secondary"} aria-pressed={item.id === value}
                    onClick={() => {
                      const choice = { id: item.id, label: itemLabel(item) };
                      setSelection(choice); onChange(choice); setOpen(false); focusTrigger();
                    }}>{itemLabel(item)}{item.email && item.email !== itemLabel(item) ? ` · ${item.email}` : ""}</Button>
                </li>
              ))}
            </ul>
            {!data.items.filter((item) => !eligible || eligible(item)).length && <p>No matching {label.toLowerCase()} choices on this page.</p>}
            <div className="gt-button-row">
              <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous {label.toLowerCase()} choices</Button>
              <span>Page {page}</span>
              <Button type="button" variant="ghost" disabled={page * (data.pageSize || 30) >= data.total} onClick={() => setPage(page + 1)}>More {label.toLowerCase()} choices</Button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
