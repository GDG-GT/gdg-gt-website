import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Field } from "../primitives";

export type FormScopeOption = { id: string; label: string };
type Listing = { items: FormScopeOption[]; total: number; pageSize: number };
export default function FormLibraryScopeFilter({
  kind,
  value,
  onChange,
}: {
  kind: "owner" | "team";
  value?: FormScopeOption;
  onChange: (value?: FormScopeOption) => void;
}) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [listing, setListing] = useState<Listing>(),
    [error, setError] = useState("");
  const label = kind === "owner" ? "Owner" : "Team",
    plural = kind === "owner" ? "owners" : "teams";
  useEffect(() => {
    const controller = new AbortController();
    setListing(undefined);
    setError("");
    const timer = window.setTimeout(() => {
      api<Listing>(
        "/admin/forms/filters?" +
          new URLSearchParams({
            kind,
            q: query,
            page: String(page),
            pageSize: "20",
          }),
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) setListing(result);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error
                ? error.message
                : "Filter options unavailable.",
            );
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, page, retry]);
  return (
    <div className="gt-form-library-scope">
      <Field label={`Search ${plural}`}>
        <input
          type="search"
          value={query}
          maxLength={100}
          placeholder={`Find ${plural}…`}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </Field>
      <Field label={label}>
        <select
          value={value?.id || ""}
          onChange={(event) => {
            const id = event.target.value;
            onChange(
              id === "chapter"
                ? { id, label: "Chapter (no team)" }
                : listing?.items.find((item) => item.id === id),
            );
          }}
        >
          <option value="">All {plural}</option>
          {kind === "team" && (
            <option value="chapter">Chapter (no team)</option>
          )}
          {value &&
            value.id !== "chapter" &&
            !listing?.items.some((item) => item.id === value.id) && (
              <option value={value.id}>{value.label} (selected)</option>
            )}
          {listing?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {item.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Field>
      {error ? (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry {plural}
          </Button>
        </p>
      ) : !listing ? (
        <p role="status" className="gt-helper">
          Loading accessible {plural}…
        </p>
      ) : (
        <p role="status" className="gt-helper">
          {listing.total} matching {listing.total === 1 ? kind : plural} from
          forms you can view.
        </p>
      )}
      {listing && listing.total > listing.pageSize && (
        <div className="gt-inline-actions" aria-label={`${label} option pages`}>
          <Button
            type="button"
            variant="ghost"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous {plural}
          </Button>
          <span>Page {page}</span>
          <Button
            type="button"
            variant="ghost"
            disabled={page * listing.pageSize >= listing.total}
            onClick={() => setPage(page + 1)}
          >
            Next {plural}
          </Button>
        </div>
      )}
    </div>
  );
}
