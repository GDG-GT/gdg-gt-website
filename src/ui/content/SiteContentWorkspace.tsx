import RecordPanel from "@/ui/RecordPanel";
import { useEffect, useRef, useState } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { PublicTeamWorkspace } from "./CollectionWorkspace";
import SiteCompositionPreview from "./SiteCompositionPreview";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useContent } from "@/contexts/ContentContext";
import { Badge, Button, EmptyState, Field } from "../primitives";
import ScrollableTable from "../ScrollableTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  managedPublicPages,
  editablePageCopy,
  publicPageSections,
  managedSettingKeys,
} from "../../../shared/site-content";
type Kind = "settings" | "pages" | "navigation" | "social" | "footer";
type Row = {
  id: string;
  revision: number;
  is_active: boolean;
  deleted_at: string | null;
  updated_at: string;
  actions: string[];
  [key: string]: unknown;
};
type Listing = { items: Row[]; total: number; page: number; pageSize: number };
const kinds: Record<Kind, string> = {
  settings: "Site identity & links",
  pages: "Page copy",
  navigation: "Navigation",
  social: "Social links",
  footer: "Footer",
};
const copyLabels: Record<string, string> = {
  title: "Heading",
  accent: "Highlighted heading text",
  subtitle: "Supporting line",
  description: "Description",
  primary_cta_text: "Primary button text",
  primary_cta_link: "Primary button destination",
  secondary_cta_text: "Secondary button text",
  secondary_cta_link: "Secondary button destination",
  cta_text: "Button text",
  cta_link: "Button destination",
  no_events_message: "No upcoming events message",
  form_title: "Contact form heading",
  success_message: "Contact confirmation message",
  closed_message: "Closed message",
  newsletter_title: "Newsletter heading",
  newsletter_description: "Newsletter description",
  copyright: "Copyright line",
};
type Draft = {
  row?: Row;
  values: Record<string, string>;
  copy: Record<string, string>;
  links: { id: string; name: string; url: string; category: string }[];
};
export default function SiteContentWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <SiteContentView
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function SiteContentView() {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const team = pathname === "/admin/content/team";
  if (params.get("mode") === "preview") return <SiteCompositionPreview />;
  return (
    <>
      <nav className="gt-team-tabs" aria-label="Site content sections">
        <Link
          className="gt-button gt-button-ghost"
          to="/admin/content"
          aria-current={!team ? "page" : undefined}
        >
          Page content &amp; settings
        </Link>
        <Link
          className="gt-button gt-button-ghost"
          to="/admin/content/team"
          aria-current={team ? "page" : undefined}
        >
          Public team
        </Link>
      </nav>
      {team ? <PublicTeamWorkspace /> : <ContentEditor />}
    </>
  );
}
function ContentEditor() {
  const [kind, setKind] = useState<Kind>("pages"),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [draft, setDraft] = useState<Draft>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<{
      row: Row;
      action: "publish" | "archive" | "unpublish" | "restore";
    }>(),
    [discard, setDiscard] = useState(false),
    [conflict, setConflict] = useState(false);
  const original = useRef(""),
    retry = useRef<{ signature: string; key: string }>(),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    { refreshContent } = useContent(),
    prefix = "/admin/site-content/" + kind,
    key = draft ? draft.row?.id || "new" : undefined,
    dirty = !!draft && JSON.stringify(draft) !== original.current;
  const selected = draft?.row || confirm?.row,
    { isOnline } = useOnlineStatus(),
    { busy, begin, current, finish, cancel, pending } =
      usePrivateMutation(prefix);
  const listRead = usePrivateRead<Listing>(
      prefix + "?" + new URLSearchParams({ state, page: String(page) }),
      refresh,
    ),
    capRead = usePrivateRead<{ actions: string[] }>(
      prefix + "/capabilities",
      refresh,
    ),
    detailRead = usePrivateRead<Listing>(
      selected
        ? prefix +
            "/" +
            selected.id +
            "?state=" +
            (selected.deleted_at ? "trash" : "current")
        : undefined,
      refresh,
    );
  const data = listRead.data,
    actions = capRead.data?.actions || [],
    loading = listRead.loading,
    freshRow = detailRead.data?.items[0],
    stale = !!selected && !!freshRow && selected.revision !== freshRow.revision,
    unavailable =
      capRead.loading ||
      !!capRead.error ||
      listRead.loading ||
      !!listRead.error ||
      (!!selected && (detailRead.loading || !!detailRead.error || !freshRow)),
    denied = !!draft && !actions.includes(draft.row ? "update" : "create");
  const { clear: clearList } = listRead,
    { clear: clearCap } = capRead,
    { clear: clearDetail } = detailRead;
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (confirm) reviewHeading.current?.focus();
  }, [confirm]);
  useDraftGuard(!!confirm, { busy, label: "Site content publication review" });
  useEffect(() => {
    document.title = "Site content · GDG workspace";
  }, []);
  useEffect(() => {
    const update = () => {
      if (!pending.current) setRefresh((v) => v + 1);
    };
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) update();
    }, 30000);
    window.addEventListener("gdg:access-changed", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gdg:access-changed", update);
    };
  }, [pending]);
  useEffect(() => {
    if (capRead.denied || listRead.denied) {
      cancel();
      clearList();
      clearCap();
      clearDetail();
      setDraft(undefined);
      setConfirm(undefined);
      setNotice("");
      setErrors({});
      setDiscard(false);
    }
  }, [
    capRead.denied,
    listRead.denied,
    cancel,
    clearList,
    clearCap,
    clearDetail,
  ]);
  useEffect(() => {
    if (detailRead.denied || (detailRead.data && !freshRow)) {
      cancel();
      clearDetail();
      setDraft(undefined);
      setConfirm(undefined);
      setNotice("");
      setErrors({});
      setDiscard(false);
      setError("This content is no longer available in your current access.");
    }
  }, [detailRead.denied, detailRead.data, freshRow, cancel, clearDetail]);
  useEffect(() => {
    if (key) heading.current?.focus();
  }, [key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useDraftGuard(dirty, { busy, label: "Site content changes" });
  const label = (row: Row) =>
    String(
      row.key ||
        row.label ||
        row.platform ||
        (row.page_slug
          ? row.page_slug + " / " + row.section_key
          : row.section_key) ||
        "Content",
    );
  const open = (row?: Row) => {
    if (
      pending.current ||
      unavailable ||
      !actions.includes(row ? "update" : "create")
    )
      return;
    const values: Record<string, string> = {
      page_slug: "home",
      section_key: kind === "footer" ? "about" : "hero",
      key: "site_title",
      platform: "github",
      icon: "github",
      order_index: "0",
      parent_id: "",
    };
    if (row)
      for (const [key, value] of Object.entries(row))
        if (typeof value === "string" || typeof value === "number")
          values[key] = String(value);
    if (row && typeof row.value === "string") values.value = row.value;
    const next = {
      row,
      values,
      copy:
        row?.content && typeof row.content === "object"
          ? (row.content as Record<string, string>)
          : {},
      links: Array.isArray(row?.value) ? (row.value as Draft["links"]) : [],
    };
    setDraft(next);
    original.current = JSON.stringify(next);
    setError("");
    setErrors({});
    setDiscard(false);
    setConflict(false);
    retry.current = undefined;
    setNotice("");
  };
  const field = (
    name: string,
    label: string,
    options?: readonly string[],
    long = false,
  ) =>
    draft && (
      <Field
        key={name}
        label={label}
        hint={errors["record." + name] ? "Check this field." : undefined}
      >
        {options ? (
          <select
            value={draft.values[name] || options[0]}
            disabled={busy}
            onChange={(event) =>
              setDraft({
                ...draft,
                values: {
                  ...draft.values,
                  [name]: event.target.value,
                  ...(name === "page_slug"
                    ? { section_key: publicPageSections(event.target.value)[0] }
                    : {}),
                },
              })
            }
          >
            {options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : long ? (
          <textarea
            rows={4}
            value={draft.values[name] || ""}
            maxLength={3000}
            disabled={busy}
            onChange={(event) =>
              setDraft({
                ...draft,
                values: { ...draft.values, [name]: event.target.value },
              })
            }
          />
        ) : (
          <input
            value={draft.values[name] || ""}
            maxLength={name === "href" || name === "url" ? 2000 : 500}
            disabled={busy}
            type={name === "order_index" ? "number" : "text"}
            min={0}
            onChange={(event) =>
              setDraft({
                ...draft,
                values: { ...draft.values, [name]: event.target.value },
              })
            }
          />
        )}
      </Field>
    );
  const mutate = async (row: Row, action: string) => {
    const authoritative =
      selected?.id === row.id
        ? freshRow
        : data?.items.find((item) => item.id === row.id);
    if (
      pending.current ||
      !isOnline ||
      unavailable ||
      !authoritative ||
      authoritative.revision !== row.revision ||
      !actions.includes(
        ["archive", "restore"].includes(action) ? "delete" : "publish",
      )
    )
      return;
    const controller = begin();
    if (!controller) return;
    setError("");
    const identity = JSON.stringify([prefix, row.id, action, row.revision]);
    if (retry.current?.signature !== identity)
      retry.current = { signature: identity, key: crypto.randomUUID() };
    try {
      await api(prefix + "/" + row.id, {
        method: action === "archive" ? "DELETE" : "POST",
        protected: true,
        body: { revision: row.revision, action },
        signal: controller.signal,
        idempotencyKey: retry.current.key,
      });
      if (!current(controller)) return;
      retry.current = undefined;
      setConfirm(undefined);
      setRefresh((v) => v + 1);
      setNotice(
        action === "publish"
          ? "Approved content is now published."
          : action === "restore"
            ? "Restored as a private draft."
            : "Public visibility updated.",
      );
      const refreshed = await refreshContent();
      if (!current(controller)) return;
      if (!refreshed)
        setNotice(
          (previous) =>
            previous +
            " Public page content could not refresh; retry from the public page.",
        );
    } catch (e) {
      if (!current(controller)) return;
      setError((e as Error).message);
      if (e instanceof ApiFailure && e.status === 409) setConflict(true);
    } finally {
      finish(controller);
    }
  };
  const panelFeedback = (<>
      {error && (
        <p
          className="gt-form-error"
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
        >
          {error}{" "}
        </p>
      )}
      {notice && (
        <p role="status" tabIndex={-1} ref={noticeFocus}>
          {notice}
        </p>
      )}
      {[
        { name: "Content permissions", ...capRead },
        { name: "Content inventory", ...listRead },
        { name: "Selected content", ...detailRead },
      ].map((read) => (
        <div key={read.name}>
          {read.error && (
            <p role="alert">
              {read.name}: {read.error}{" "}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  document.getElementById("workspace-content")?.focus();
                  setRefresh((v) => v + 1);
                }}
              >
                Retry {read.name.toLowerCase()}
              </Button>
            </p>
          )}
          {read.data && (read.loading || read.error) && (
            <p role="status">
              {read.name} may be out of date. Last loaded{" "}
              {new Date(read.at!).toLocaleString()}.
            </p>
          )}
        </div>
      ))}
      {!isOnline && (
        <p role="status">
          You’re offline. Your input stays in this tab. Reconnect and save when
          ready; nothing sends automatically.
        </p>
      )}
      {(stale || conflict) && (
        <p role="alert">
          This content changed. Input is preserved; close and reopen the editor
          or review before saving.
        </p>
      )}
  </>);
  return (
    <div className="gt-admin-page gt-site-content-workspace">
      <div className="gt-admin-page-heading">
        <div>
          <h1>Site content</h1>
          <p>
            Edit approved public copy and links. Draft changes remain private
            until a separate publication action.
          </p>
        </div>
        <div className="gt-site-content-heading-actions">
          <Button
            disabled={
              !!draft ||
              !!confirm ||
              busy ||
              unavailable ||
              !actions.includes("create")
            }
            onClick={() => open()}
          >
            Create draft
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
          >
            Refresh site content
          </Button>
        </div>
      </div>
      <div
        className="gt-site-content-previews"
        aria-label="Private page previews"
      >
        <a
          className="gt-button gt-button-secondary"
          href="/admin/content?mode=preview&page=home"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full-page draft preview
        </a>
        <Button
          variant="secondary"
          type="button"
          onClick={() =>
            window.open(
              "/admin/content?mode=preview&page=home",
              "_blank",
              "noopener,noreferrer,width=390,height=844",
            )
          }
        >
          Open phone-size preview
        </Button>
        <span className="gt-helper">Save changes before previewing.</span>
      </div>
      <div
        className="gt-site-content-collections"
        role="group"
        aria-label="Content collections"
      >
        {(Object.keys(kinds) as Kind[]).map((value) => (
          <Button
            key={value}
            variant={kind === value ? "primary" : "secondary"}
            aria-pressed={kind === value}
            disabled={!!draft || !!confirm || busy}
            onClick={() => {
              setKind(value);
              setPage(1);
              setNotice("");
              setConfirm(undefined);
              setError("");
              setConflict(false);
              retry.current = undefined;
            }}
          >
            {kinds[value]}
          </Button>
        ))}
      </div>
      {!draft && panelFeedback}
      {draft && (
        <RecordPanel title="Site content editor" busy={busy} onClose={() => dirty ? setDiscard(true) : setDraft(undefined)}>
          {panelFeedback}
        <section className="gt-panel gt-event-editor">
          <h2 ref={heading} tabIndex={-1}>
            {draft.row
              ? "Edit " + label(draft.row)
              : "New " + kinds[kind].toLowerCase() + " draft"}
          </h2>
          <form
            className="gt-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                pending.current ||
                !isOnline ||
                unavailable ||
                denied ||
                stale ||
                conflict
              )
                return;
              const controller = begin();
              if (!controller) return;
              setError("");
              setErrors({});
              try {
                const values = draft.values,
                  order_index = Number(values.order_index || 0),
                  record =
                    kind === "settings"
                      ? {
                          key: values.key,
                          value:
                            values.key === "all_links"
                              ? draft.links
                              : values.value || "",
                          description: values.description || "",
                        }
                      : kind === "pages"
                        ? {
                            page_slug: values.page_slug,
                            section_key: values.section_key,
                            content: draft.copy,
                            order_index,
                          }
                        : kind === "footer"
                          ? {
                              section_key: values.section_key,
                              content: draft.copy,
                              order_index,
                            }
                          : kind === "navigation"
                            ? {
                                label: values.label || "",
                                href: values.href || "",
                                icon: values.icon || "",
                                parent_id: values.parent_id || null,
                                order_index,
                              }
                            : {
                                platform: values.platform,
                                url: values.url || "",
                                icon: values.platform,
                                order_index,
                              };
                const body = {
                  ...(draft.row ? { revision: draft.row.revision } : {}),
                  record,
                };
                const identity = JSON.stringify([prefix, draft.row?.id, body]);
                if (retry.current?.signature !== identity)
                  retry.current = {
                    signature: identity,
                    key: crypto.randomUUID(),
                  };
                await api(prefix + (draft.row ? "/" + draft.row.id : ""), {
                  method: draft.row ? "PATCH" : "POST",
                  protected: true,
                  body,
                  signal: controller.signal,
                  idempotencyKey: retry.current.key,
                });
                if (!current(controller)) return;
                retry.current = undefined;
                setDraft(undefined);
                setRefresh((v) => v + 1);
                setNotice("Saved privately. Review and publish separately.");
                const refreshed = await refreshContent();
                if (!current(controller)) return;
                if (!refreshed)
                  setNotice(
                    (previous) =>
                      previous +
                      " Public page content could not refresh; retry from the public page.",
                  );
              } catch (e) {
                if (!current(controller)) return;
                setError((e as Error).message);
                if (e instanceof ApiFailure) setErrors(e.fields || {});
                if (e instanceof ApiFailure && e.status === 409)
                  setConflict(true);
              } finally {
                finish(controller);
              }
            }}
          >
            {kind === "settings" && (
              <>
                {field("key", "Setting", managedSettingKeys)}
                {draft.values.key !== "all_links" ? (
                  field("value", "Value", undefined, true)
                ) : (
                  <div>
                    <h3>Approved links</h3>
                    {draft.links.map((link, index) => (
                      <fieldset key={index} className="gt-branch-rule">
                        <legend>Link {index + 1}</legend>
                        {(["id", "name", "url", "category"] as const).map(
                          (name) => (
                            <Field
                              key={name}
                              label={name === "id" ? "Stable link key" : name}
                            >
                              <input
                                value={link[name]}
                                maxLength={name === "url" ? 2000 : 100}
                                disabled={busy}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    links: draft.links.map((row, i) =>
                                      i === index
                                        ? { ...row, [name]: event.target.value }
                                        : row,
                                    ),
                                  })
                                }
                              />
                            </Field>
                          ),
                        )}
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              links: draft.links.filter((_, i) => i !== index),
                            })
                          }
                        >
                          Remove link {index + 1}
                        </Button>
                      </fieldset>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || draft.links.length >= 100}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          links: [
                            ...draft.links,
                            {
                              id: "link-" + crypto.randomUUID().slice(0, 8),
                              name: "",
                              url: "",
                              category: "community",
                            },
                          ],
                        })
                      }
                    >
                      Add approved link
                    </Button>
                  </div>
                )}
                {field(
                  "description",
                  "Private editor description",
                  undefined,
                  true,
                )}
              </>
            )}
            {kind === "pages" && (
              <>
                {field("page_slug", "Public page", managedPublicPages)}
                {field(
                  "section_key",
                  "Section",
                  publicPageSections(draft.values.page_slug),
                )}
              </>
            )}
            {kind === "footer" &&
              field("section_key", "Footer section", [
                "about",
                "newsletter",
                "copyright",
              ])}
            {(kind === "pages" || kind === "footer") && (
              <div className="gt-form-grid">
                {(kind === "pages"
                  ? editablePageCopy(
                      draft.values.page_slug,
                      draft.values.section_key,
                    )
                  : [
                      ...(draft.values.section_key === "about"
                        ? ["description"]
                        : draft.values.section_key === "newsletter"
                          ? ["newsletter_title", "newsletter_description"]
                          : ["copyright"]),
                    ]
                ).map((name) => (
                  <Field
                    key={name}
                    label={copyLabels[name] || name.replace(/_/g, " ")}
                    hint={
                      errors["record.content." + name]
                        ? "Check this field."
                        : undefined
                    }
                  >
                    <textarea
                      rows={name.includes("description") ? 3 : 2}
                      maxLength={name === "description" ? 5000 : 1000}
                      disabled={busy}
                      value={draft.copy[name] || ""}
                      onChange={(event) => {
                        const copy = { ...draft.copy };
                        if (event.target.value) copy[name] = event.target.value;
                        else delete copy[name];
                        setDraft({ ...draft, copy });
                      }}
                    />
                  </Field>
                ))}
              </div>
            )}
            {kind === "navigation" && (
              <>
                {field("label", "Navigation label")}
                {field("href", "Public route (for example, /events)")}
                {field("icon", "Optional icon name")}
                <Field label="Parent navigation item">
                  <select
                    value={draft.values.parent_id || ""}
                    disabled={busy}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        values: {
                          ...draft.values,
                          parent_id: event.target.value,
                        },
                      })
                    }
                  >
                    <option value="">Top-level item</option>
                    {data?.items
                      .filter(
                        (row) =>
                          row.id !== draft.row?.id &&
                          !row.parent_id &&
                          !row.deleted_at,
                      )
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {label(row)}
                        </option>
                      ))}
                  </select>
                </Field>
              </>
            )}
            {kind === "social" && (
              <>
                {field("platform", "Platform", [
                  "github",
                  "linkedin",
                  "instagram",
                  "youtube",
                  "discord",
                  "community",
                ])}
                {field("url", "Approved HTTPS profile URL")}
              </>
            )}
            {kind !== "settings" && field("order_index", "Display order")}
            <div className="gt-actions">
              <Button
                disabled={
                  busy ||
                  !isOnline ||
                  unavailable ||
                  denied ||
                  stale ||
                  conflict
                }
                type="submit"
              >
                {busy ? "Saving…" : "Save private draft"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() => (dirty ? setDiscard(true) : setDraft(undefined))}
              >
                Cancel editing
              </Button>
            </div>
            {discard && (
              <div role="alert">
                <p>Discard unsaved changes? Saved content remains unchanged.</p>
                <div className="gt-actions">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      setDraft(undefined);
                      setDiscard(false);
                    }}
                  >
                    Discard changes
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDiscard(false)}
                  >
                    Keep editing
                  </Button>
                </div>
              </div>
            )}
          </form>
        </section>
        </RecordPanel>
      )}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirm(undefined);
        }}
      >
        {confirm && (
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              reviewHeading.current?.focus();
            }}
          >
            <DialogTitle tabIndex={-1} ref={reviewHeading}>
              {confirm.action === "publish"
                ? "Publish approved content?"
                : confirm.action === "archive"
                  ? "Archive this content?"
                  : confirm.action === "restore"
                    ? "Restore this private draft?"
                    : "Unpublish this content?"}
            </DialogTitle>
            <DialogDescription>
              {label(confirm.row)}.{" "}
              {confirm.action === "publish"
                ? "This changes the public website."
                : confirm.action === "restore"
                  ? "This restores a private draft without publishing it."
                  : "This hides the record and preserves it for recovery."}
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            <div className="gt-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRefresh((v) => v + 1)}
              >
                Refresh review access
              </Button>
              <Button
                disabled={
                  busy ||
                  !isOnline ||
                  unavailable ||
                  stale ||
                  conflict ||
                  !actions.includes(
                    ["archive", "restore"].includes(confirm.action)
                      ? "delete"
                      : "publish",
                  )
                }
                variant={confirm.action === "archive" ? "danger" : "primary"}
                onClick={() => mutate(confirm.row, confirm.action)}
              >
                Confirm{" "}
                {confirm.action === "publish" ? "publication" : confirm.action}
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => {
                  setConfirm(undefined);
                  setConflict(false);
                  retry.current = undefined;
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <Field label="Visibility">
        <select
          value={state}
          disabled={busy || !!draft || !!confirm}
          onChange={(event) => {
            setState(event.target.value);
            setPage(1);
          }}
        >
          <option value="current">Current records</option>
          <option value="draft">Private drafts</option>
          <option value="published">Published</option>
          <option value="trash">Archived records</option>
        </select>
      </Field>
      {loading && !data ? (
        <div role="status" aria-label="Loading site content">
          <div className="gt-skeleton gt-overview-placeholder" />
          <span className="sr-only">Loading site content…</span>
        </div>
      ) : data?.items.length ? (
        <ScrollableTable label={kinds[kind] + " records"}>
          <table className="gt-data-table">
            <caption className="sr-only">{kinds[kind]}</caption>
            <thead>
              <tr>
                <th>Record</th>
                <th>Visibility</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{label(row)}</strong>
                    <p className="gt-helper">Revision {row.revision}</p>
                  </td>
                  <td>
                    <Badge>
                      {row.deleted_at
                        ? "Archived"
                        : row.is_active
                          ? "Published"
                          : "Private draft"}
                    </Badge>
                  </td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                  <td>
                    <div className="gt-actions">
                      {!row.deleted_at && actions.includes("update") && (
                        <Button
                          disabled={busy || !!draft || !!confirm || unavailable}
                          aria-label={"Edit " + label(row)}
                          variant="secondary"
                          onClick={() => open(row)}
                        >
                          Edit
                        </Button>
                      )}
                      {!row.deleted_at && actions.includes("publish") && (
                        <Button
                          disabled={busy || !!draft || !!confirm || unavailable}
                          aria-label={
                            (row.is_active ? "Unpublish " : "Publish ") +
                            label(row)
                          }
                          variant="secondary"
                          onClick={() => (
                            setConflict(false),
                            (retry.current = undefined),
                            setConfirm({
                              row,
                              action: row.is_active ? "unpublish" : "publish",
                            })
                          )}
                        >
                          {row.is_active ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {actions.includes("delete") && (
                        <Button
                          disabled={busy || !!draft || !!confirm || unavailable}
                          aria-label={
                            (row.deleted_at ? "Restore draft " : "Archive ") +
                            label(row)
                          }
                          variant="secondary"
                          onClick={() => (
                            setConflict(false),
                            (retry.current = undefined),
                            setConfirm({
                              row,
                              action: row.deleted_at ? "restore" : "archive",
                            })
                          )}
                        >
                          {row.deleted_at ? "Restore draft" : "Archive"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      ) : (
        !listRead.error && (
          <EmptyState title="No content in this view">
            Create a private draft or choose a different visibility filter.
            Public pages retain their approved defaults until managed copy is
            published.
          </EmptyState>
        )
      )}
      {data && (
        <div className="gt-actions">
          <span>
            {data.total} records · Page {page}
          </span>
          <Button
            disabled={busy || !!draft || !!confirm || loading || page <= 1}
            variant="secondary"
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            disabled={
              busy ||
              !!draft ||
              !!confirm ||
              loading ||
              page * data.pageSize >= data.total
            }
            variant="secondary"
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
