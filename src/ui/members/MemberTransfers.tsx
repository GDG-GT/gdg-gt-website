import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field } from "../primitives";
import {
  parseMemberCsv,
  memberImportTemplate,
} from "../../../shared/member-transfer.mjs";
import type { Capabilities, MemberFields } from "./types";
type Filters = {
  q: string;
  state: string;
  category?: string;
  year?: string;
  active?: boolean;
  core?: boolean;
};
type Review = {
  reviewId: string;
  reviewToken: string;
  expiresAt: string;
  eligible: number;
  skippedRows: number[];
};
type Parsed = {
  rows: MemberFields[];
  errors: { line: number; message: string }[];
  ignoredColumns: string[];
};
const download = (csv: string, filename: string) => {
  const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
type TransferProps = {
  cap?: Capabilities;
  filters: Filters;
  disabled: boolean;
  onImported: () => void;
};
export default function MemberTransfers(props: TransferProps) {
  const { currentAdmin } = useAdmin();
  return (
    <MemberTransfersContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}`}
      {...props}
    />
  );
}
function MemberTransfersContent({
  cap,
  filters,
  disabled,
  onImported,
}: TransferProps) {
  const navigation = useNavigationSafety();
  const { isOnline } = useOnlineStatus();
  const [mode, setMode] = useState<"import" | "export" | null>(null),
    [parsed, setParsed] = useState<Parsed>(),
    [team, setTeam] = useState(""),
    [review, setReview] = useState<Review>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [includePrivate, setIncludePrivate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [expired, setExpired] = useState(false),
    [csvText, setCsvText] = useState("");
  const epoch = useRef(0),
    operation = useRef<AbortController>(),
    key = useRef<string>(),
    busyRef = useRef(false),
    opener = useRef<HTMLButtonElement | null>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    parsedFocus = useRef<HTMLParagraphElement>(null),
    reviewFocus = useRef<HTMLHeadingElement>(null);
  const dirty = !!parsed || !!password || !!confirmation || !!csvText;
  useDraftGuard(dirty, { busy, label: "Community member CSV import" });
  const clear = useCallback(() => {
    epoch.current++;
    busyRef.current = false;
    operation.current?.abort();
    setParsed(undefined);
    setReview(undefined);
    setPassword("");
    setConfirmation("");
    setCsvText("");
    setError("");
    setNotice("");
    setBusy(false);
    setExpired(false);
    key.current = undefined;
  }, []);
  useEffect(() => {
    const cleared = () => {
      clear();
      setMode(null);
      setNotice("");
      setIncludePrivate(false);
      setTeam("");
    };
    const invalidate = () => {
      epoch.current++;
      operation.current?.abort();
    };
    window.addEventListener("gdg:session-cleared", cleared);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", cleared);
    };
  }, [clear]);
  useEffect(() => {
    setExpired(false);
    if (!review) return;
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.max(0, new Date(review.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [review]);
  const close = () => {
    if (busyRef.current) return;
    const finish = () => {
      clear();
      setMode(null);
    };
    if (dirty) navigation?.request(finish);
    else finish();
  };
  const work = async (run: (signal: AbortSignal) => Promise<void>) => {
    if (busyRef.current || disabled || !isOnline) return;
    busyRef.current = true;
    const current = epoch.current,
      controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setPassword("");
    try {
      await run(controller.signal);
    } catch (e) {
      if (current === epoch.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (current === epoch.current) {
        busyRef.current = false;
        setBusy(false);
        setPassword("");
      }
    }
  };
  const canImport = !!cap && (cap.globalCreate || cap.teams.length > 0);
  const scopeAllowed =
    !!cap &&
    (team === "chapter"
      ? cap.globalCreate
      : cap.teams.some((value) => value.id === team));
  const invalidateReview = useCallback(() => {
    setReview(undefined);
    setConfirmation("");
    setPassword("");
    key.current = undefined;
  }, []);
  useEffect(() => {
    if (!isOnline || !scopeAllowed) invalidateReview();
  }, [isOnline, scopeAllowed, invalidateReview]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (parsed) parsedFocus.current?.focus();
  }, [parsed]);
  useEffect(() => {
    if (review) reviewFocus.current?.focus();
  }, [review]);
  return (
    <>
      <div className="gt-button-row">
        <Button
          variant="secondary"
          disabled={disabled || busy || !canImport || !isOnline}
          onClick={(event) => {
            if (busyRef.current) return;
            opener.current = event.currentTarget;
            clear();
            setMode("import");
            setTeam(cap?.globalCreate ? "chapter" : cap?.teams[0]?.id || "");
          }}
        >
          Import CSV
        </Button>
        <Button
          variant="secondary"
          disabled={disabled || busy || !isOnline}
          onClick={(event) => {
            if (busyRef.current) return;
            opener.current = event.currentTarget;
            clear();
            setMode("export");
            setIncludePrivate(false);
          }}
        >
          Export CSV
        </Button>
      </div>
      {notice && (
        <p role="status" ref={noticeFocus} tabIndex={-1}>
          {notice}
        </p>
      )}
      <Dialog
        open={!!mode}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="gt-notification-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (notice) noticeFocus.current?.focus();
            else opener.current?.focus();
          }}
        >
          <DialogTitle>
            {mode === "import"
              ? "Import community members"
              : "Export community members"}
          </DialogTitle>
          <DialogDescription>
            {mode === "import"
              ? "Validate a CSV, review the destination and confirm before creating private records."
              : "Download records matching your current directory filters and access."}
          </DialogDescription>
          {!isOnline && (
            <p role="status" className="gt-data-note">
              You are offline. CSV input remains in this open tab. Reconnect and
              review the import again before confirming; nothing is sent
              automatically.
            </p>
          )}
          {error && (
            <p
              ref={errorFocus}
              tabIndex={-1}
              role="alert"
              className="gt-form-error"
            >
              {error}
            </p>
          )}
          {mode === "export" ? (
            <div className="gt-form">
              <p>
                Exports include up to 1,000 matching records, across all result
                pages. Narrow your filters for larger directories. Member IDs,
                categories and status are included; account credentials never
                are.
              </p>
              <label className="gt-check">
                <input
                  type="checkbox"
                  checked={includePrivate}
                  disabled={busy}
                  onChange={(e) => setIncludePrivate(e.target.checked)}
                />
                Include private email, phone, year, major and interests
              </label>
              <p className="gt-helper">
                Download only for an approved chapter purpose. Exported private
                data cannot be recalled. Spreadsheet formula prefixes are
                escaped; use the import template when preparing new records.
              </p>
              <Button
                disabled={busy || disabled || !isOnline}
                onClick={() =>
                  work(async (signal) => {
                    const result = await api<{
                      csv: string;
                      filename: string;
                      count: number;
                    }>("/admin/members/export", {
                      method: "POST",
                      protected: true,
                      signal,
                      body: { filters, includePrivate },
                    });
                    if (signal.aborted) return;
                    download(result.csv, result.filename);
                    setNotice(
                      `Prepared a CSV with ${result.count} matching community records. Check your downloads and store it securely.`,
                    );
                    setMode(null);
                  })
                }
              >
                {busy ? "Preparing export…" : "Download filtered CSV"}
              </Button>
            </div>
          ) : (
            <div className="gt-form">
              <p>
                Up to 200 rows and 1 MiB per CSV. Required columns: name and
                email. Existing emails—including archived or unavailable
                records—are skipped. Nothing is overwritten, merged, invited, or
                published.
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  download(
                    memberImportTemplate,
                    "community-members-import-template.csv",
                  )
                }
              >
                Download CSV template
              </Button>
              <Field
                label="Destination scope"
                hint="All imported records use this scope. Exported IDs and team columns do not grant access."
              >
                <select
                  value={team}
                  disabled={busy || !canImport}
                  onChange={(e) => {
                    setTeam(e.target.value);
                    invalidateReview();
                  }}
                >
                  {cap?.globalCreate && (
                    <option value="chapter">Chapter-wide directory</option>
                  )}
                  {cap?.teams.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Member CSV file">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  onChange={async (e) => {
                    if (busyRef.current) return;
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const current = ++epoch.current;
                    busyRef.current = true;
                    setBusy(true);
                    setError("");
                    setCsvText("");
                    invalidateReview();
                    setParsed(undefined);
                    try {
                      if (file.size > 1048576)
                        throw Error("Choose a CSV no larger than 1 MiB.");
                      const source = await file.text();
                      if (current !== epoch.current) return;
                      setParsed(parseMemberCsv(source));
                    } catch (err) {
                      if (current === epoch.current)
                        setError((err as Error).message);
                    } finally {
                      if (current === epoch.current) {
                        busyRef.current = false;
                        setBusy(false);
                      }
                    }
                  }}
                />
              </Field>
              <details>
                <summary>Paste CSV instead</summary>
                <Field
                  label="CSV content"
                  hint="Include the template header. This stays in memory until you close or submit the import."
                >
                  <textarea
                    rows={5}
                    maxLength={1048576}
                    disabled={busy}
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      setParsed(undefined);
                      invalidateReview();
                    }}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={busy || !csvText}
                  onClick={() => {
                    setError("");
                    try {
                      setParsed(parseMemberCsv(csvText));
                    } catch (e) {
                      setParsed(undefined);
                      setError((e as Error).message);
                    }
                  }}
                >
                  Validate pasted CSV
                </Button>
              </details>
              {parsed && (
                <>
                  <p role="status" ref={parsedFocus} tabIndex={-1}>
                    {parsed.rows.length} valid{" "}
                    {parsed.rows.length === 1 ? "row" : "rows"} ·{" "}
                    {parsed.errors.length} to fix.
                  </p>
                  {!!parsed.ignoredColumns.length && (
                    <p className="gt-helper">
                      Ignored metadata: {parsed.ignoredColumns.join(", ")}.
                      Destination scope is selected above.
                    </p>
                  )}
                  {!!parsed.errors.length && (
                    <ul>
                      {parsed.errors.map((e) => (
                        <li key={e.line}>
                          Line {e.line}: {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <details>
                    <summary>
                      Preview {Math.min(10, parsed.rows.length)} source{" "}
                      {parsed.rows.length === 1 ? "row" : "rows"}
                    </summary>
                    <ol>
                      {parsed.rows.slice(0, 10).map((r, i) => (
                        <li key={i}>
                          {r.name} · {r.email} · {r.category}
                        </li>
                      ))}
                    </ol>
                  </details>
                  <Button
                    variant="secondary"
                    disabled={
                      busy ||
                      disabled ||
                      !isOnline ||
                      !scopeAllowed ||
                      !team ||
                      !parsed.rows.length ||
                      !!parsed.errors.length ||
                      !canImport
                    }
                    onClick={() =>
                      work(async (signal) => {
                        if (
                          !scopeAllowed ||
                          !parsed.rows.length ||
                          parsed.errors.length
                        )
                          return;
                        const result = await api<Review>(
                          "/admin/members/import-preview",
                          {
                            method: "POST",
                            protected: true,
                            signal,
                            body: {
                              teamId: team === "chapter" ? null : team,
                              rows: parsed.rows,
                            },
                          },
                        );
                        if (signal.aborted) return;
                        setReview(result);
                        setConfirmation("");
                        key.current = crypto.randomUUID();
                      })
                    }
                  >
                    {busy ? "Checking import…" : "Review import"}
                  </Button>
                </>
              )}
              {review && (
                <div className="gt-inline-confirm gt-form">
                  <h3 ref={reviewFocus} tabIndex={-1}>
                    {review.eligible} new{" "}
                    {review.eligible === 1 ? "record" : "records"} ·{" "}
                    {review.skippedRows.length} skipped
                  </h3>
                  {!!review.skippedRows.length && (
                    <p>
                      Source row numbers skipped:{" "}
                      {review.skippedRows.join(", ")}. No existing record
                      details are disclosed.
                    </p>
                  )}
                  <p className="gt-helper">
                    Review expires{" "}
                    {new Date(review.expiresAt).toLocaleTimeString()}. If
                    directory data or your access changes, review again. The
                    batch commits all eligible new records together.
                  </p>
                  {expired && (
                    <p role="alert">
                      This review expired. Choose Review import again.
                    </p>
                  )}
                  <Field
                    label="Import confirmation"
                    hint={`Type IMPORT ${review.eligible}`}
                  >
                    <input
                      autoComplete="off"
                      value={confirmation}
                      disabled={busy}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </Field>
                  <Field label="Current password">
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      disabled={busy}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  <Button
                    disabled={
                      busy ||
                      disabled ||
                      !isOnline ||
                      !scopeAllowed ||
                      expired ||
                      !review.eligible ||
                      !password ||
                      confirmation !== `IMPORT ${review.eligible}`
                    }
                    onClick={() =>
                      work(async (signal) => {
                        if (
                          !scopeAllowed ||
                          !parsed ||
                          !review.eligible ||
                          !password ||
                          confirmation !== `IMPORT ${review.eligible}`
                        )
                          return;
                        if (
                          expired ||
                          new Date(review.expiresAt).getTime() <= Date.now()
                        ) {
                          setExpired(true);
                          return;
                        }
                        const result = await api<{
                          created: number;
                          skipped: number;
                        }>("/admin/members/import", {
                          method: "POST",
                          protected: true,
                          signal,
                          idempotencyKey: key.current,
                          body: {
                            document: {
                              teamId: team === "chapter" ? null : team,
                              rows: parsed!.rows,
                            },
                            reviewId: review.reviewId,
                            reviewToken: review.reviewToken,
                            confirmation,
                            currentPassword: password,
                          },
                        });
                        if (signal.aborted) return;
                        setNotice(
                          `Imported ${result.created} community records. ${result.skipped} existing or unavailable emails were skipped.`,
                        );
                        setParsed(undefined);
                        setReview(undefined);
                        setConfirmation("");
                        setPassword("");
                        setCsvText("");
                        key.current = undefined;
                        setMode(null);
                        onImported();
                      })
                    }
                  >
                    {busy ? "Importing…" : "Confirm import"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
