import { Button } from "./primitives";

export function PublicCollectionNotice({
  error,
  loading,
  at,
  retry,
}: {
  error: string;
  loading: boolean;
  at?: string;
  retry: () => void;
}) {
  return (
    <>
      {error && (
        <div role="alert" className="gt-inline-error">
          <p>
            {at
              ? `Could not refresh. Showing results last loaded ${at}.`
              : "This list could not load."}{" "}
            {error}
          </p>
          <Button variant="secondary" onClick={retry} disabled={loading}>
            Try again
          </Button>
        </div>
      )}
      {loading && !at && (
        <div role="status" className="gt-skeleton gt-detail-skeleton">
          <span className="sr-only">Loading results…</span>
        </div>
      )}
    </>
  );
}
export function PublicPagination({
  page,
  pageSize,
  total,
  busy,
  onPage,
  label = "Result pages",
}: {
  page: number;
  pageSize: number;
  total: number;
  busy: boolean;
  onPage: (value: number) => void;
  label?: string;
}) {
  if (total <= pageSize && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const go = (value: number) => {
    onPage(value);
    // The result-page controls may unmount while fetching the next page. Keep
    // keyboard focus on the persistent content landmark, not the document body.
    document.getElementById("main-content")?.focus();
  };
  if (page > pages)
    return (
      <nav className="gt-table-footer" aria-label={label}>
        <p role="status">There are no results on page {page}.</p>
        <Button variant="secondary" disabled={busy} onClick={() => go(1)}>
          Back to first page
        </Button>
      </nav>
    );
  return (
    <nav className="gt-table-footer" aria-label={label}>
      <p role="status">
        Page {page} of {pages} · {total} results
      </p>
      <div className="gt-actions">
        <Button
          variant="secondary"
          disabled={busy || page <= 1}
          onClick={() => go(page - 1)}
        >
          Previous page
        </Button>
        <Button
          variant="secondary"
          disabled={busy || page * pageSize >= total}
          onClick={() => go(page + 1)}
        >
          Next page
        </Button>
      </div>
    </nav>
  );
}
