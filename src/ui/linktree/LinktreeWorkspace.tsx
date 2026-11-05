import ScrollableTable from "@/ui/ScrollableTable";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useApprovedSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLinktreeRead } from "./useLinktreeRead";
import {
  linktreeCreate,
  linktreeMutation,
  linktreeProfile,
  linktreeLink,
} from "../../../shared/linktree.mjs";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import {
  type ProfileLink,
  type Detail,
  type Listing,
  type Capabilities,
  type Analytics,
  profileFields,
  linkFields,
  countLabel,
} from "./types";
type Mode =
  | "profile_create"
  | "profile_edit"
  | "link_create"
  | "link_edit"
  | null;
type Pending = {
  action: string;
  revision: number;
  expected: string;
  linkId?: string;
  direction?: "up" | "down";
};
const base = "/admin/linktree/profiles";
export default function LinktreeWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <LinktreeWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function ReadState({
  name,
  read,
  retry,
  online,
}: {
  name: string;
  read: { loading: boolean; error: string; at?: string; data?: unknown };
  retry: () => void;
  online: boolean;
}) {
  return (
    <>
      {read.loading && (
        <div
          role="status"
          aria-label={`Loading ${name}`}
          className="gt-read-state"
        >
          <span>{read.data ? `Refreshing ${name}…` : `Loading ${name}…`}</span>
          {!read.data && <div className="gt-skeleton gt-loading-heading" />}
        </div>
      )}
      {read.error && (
        <p className="gt-form-error" role="alert">
          {name}: {read.error}{" "}
          <Button
            variant="ghost"
            disabled={read.loading || !online}
            onClick={retry}
          >
            Retry {name}
          </Button>
        </p>
      )}
      {read.data && (read.error || !online) && (
        <p role="status" className="gt-data-note">
          {name} may be out of date. Last loaded{" "}
          {read.at ? new Date(read.at).toLocaleString() : "earlier"}. Refresh
          after reconnecting before making changes.
        </p>
      )}
    </>
  );
}
function LinktreeWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
  const [needsRefresh, setNeedsRefresh] = useState(!isOnline);
  useEffect(() => {
    if (!isOnline) setNeedsRefresh(true);
  }, [isOnline]);
  const [params, setParams] = useApprovedSearchParams(),
    selected = params.get("profile") || "";
  const navigation = useNavigationSafety();
  const [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [linkPage, setLinkPage] = useState(1),
    [trash, setTrash] = useState(false),
    [days, setDays] = useState(30),
    [tick, setTick] = useState(0);
  const [mode, setMode] = useState<Mode>(null),
    [pending, setPending] = useState<Pending>(),
    [profileValues, setProfileValues] = useState(profileFields()),
    [linkValues, setLinkValues] = useState(linkFields()),
    [team, setTeam] = useState(""),
    [editingLink, setEditingLink] = useState<ProfileLink>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const snapshot = useRef<{
      revision: number;
      live: boolean;
      expected: string;
    }>(),
    mutationKey = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null),
    mounted = useRef(true),
    operation = useRef<AbortController>(),
    busyRef = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null);
  useDraftGuard(!!mode || !!pending || !!password, {
    busy,
    label: "Linktree profile, link or publication changes",
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
    };
  }, []);
  const capabilities = useLinktreeRead<Capabilities>(
      "/admin/linktree/capabilities",
      tick,
    ),
    inventory = useLinktreeRead<Listing>(
      `${base}?${new URLSearchParams({ q, state, page: String(page) })}`,
      tick,
    ),
    definition = useLinktreeRead<Detail>(
      selected
        ? `${base}/${selected}?page=${linkPage}&state=${trash ? "trash" : "current"}`
        : undefined,
      tick,
    ),
    report = useLinktreeRead<Analytics>(
      selected
        ? `/admin/linktree/analytics?profileId=${selected}&days=${days}`
        : undefined,
      tick,
    ),
    blocked = capabilities.denied || inventory.denied,
    cap = blocked ? undefined : capabilities.data,
    list = blocked ? undefined : inventory.data,
    detail = blocked ? undefined : definition.data,
    analytics = blocked ? undefined : report.data,
    canCreateInScope =
      !!cap &&
      !capabilities.loading &&
      !capabilities.error &&
      (team ? cap.teams.some((value) => value.id === team) : cap.globalCreate),
    canChange =
      isOnline &&
      !needsRefresh &&
      !!detail &&
      !definition.error &&
      !definition.loading;
  const retry = () => {
    if (!isOnline || busyRef.current) return;
    setNeedsRefresh(false);
    setTick((value) => value + 1);
    document.getElementById("workspace-content")?.focus();
  };
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden && !busyRef.current && navigator.onLine)
        setTick((v) => v + 1);
    }, 30000);
    return () => {
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (mode || pending) heading.current?.focus();
  }, [mode, pending]);
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  const clearCapabilities = capabilities.clear,
    clearInventory = inventory.clear,
    clearDefinition = definition.clear,
    clearReport = report.clear,
    definitionDenied = definition.denied;
  useEffect(() => {
    if (blocked || definitionDenied) {
      operation.current?.abort();
      if (blocked) {
        clearCapabilities();
        clearInventory();
      }
      clearDefinition();
      clearReport();
      setMode(null);
      setPending(undefined);
      setPassword("");
      setConfirmation("");
      setNotice("");
      setProfileValues(profileFields());
      setLinkValues(linkFields());
      setEditingLink(undefined);
    }
  }, [
    blocked,
    definitionDenied,
    clearCapabilities,
    clearInventory,
    clearDefinition,
    clearReport,
  ]);
  const p = detail?.profile.id === selected ? detail.profile : undefined;
  const requiredAction =
    mode === "link_create"
      ? "create"
      : pending && /(?:publish|unpublish)$/.test(pending.action)
        ? "publish"
        : pending && /(?:archive|restore)$/.test(pending.action)
          ? "delete"
          : "update";
  const needsPublish =
    ((mode === "profile_edit" || mode === "link_edit") &&
      !!snapshot.current?.live) ||
    (pending?.action === "move" && !!p?.active) ||
    (pending?.action === "archive" && !!p?.active) ||
    (pending?.action === "link_archive" &&
      !!detail?.links.find((l) => l.id === pending.linkId)?.active);
  const stale =
    !!p &&
    ((((mode && mode !== "profile_create") || pending) &&
      (!p.actions.includes(requiredAction) ||
        (needsPublish && !p.actions.includes("publish")))) ||
      (mode && mode !== "profile_create"
        ? p.revision !== snapshot.current?.revision
        : pending
          ? p.revision !== pending.revision
          : false));
  const reset = () => {
    setError("");
    setNotice("");
    setMode(null);
    setPending(undefined);
    setPassword("");
    setConfirmation("");
    setConflict(false);
    mutationKey.current = undefined;
  };
  const leave = (run: () => void) => {
    const next = () => {
      reset();
      run();
      document.getElementById("workspace-content")?.focus();
    };
    if (navigation) navigation.request(next);
    else next();
  };
  const choose = (id: string) =>
    leave(() => {
      setLinkPage(1);
      setTrash(false);
      setParams(id ? { profile: id } : {});
    });
  function edit(next: Mode, link?: ProfileLink) {
    if (
      busyRef.current ||
      !isOnline ||
      needsRefresh ||
      (next === "profile_create"
        ? capabilities.loading ||
          !!capabilities.error ||
          !(cap?.globalCreate || cap?.teams.length)
        : !canChange)
    )
      return;
    leave(() => {
      snapshot.current = {
        revision: p?.revision || 0,
        live: next === "profile_edit" ? !!p?.active : !!link?.active,
        expected:
          next === "profile_edit" ? p?.displayName || "" : link?.title || "",
      };
      setMode(next);
      setEditingLink(link);
      setProfileValues(profileFields(next === "profile_edit" ? p : undefined));
      setLinkValues(linkFields(link));
      setTeam(p?.teamId || "");
      setError("");
    });
  }
  async function mutate(
    document: unknown,
    profileId: string | undefined = selected,
  ) {
    mutationKey.current ??= crypto.randomUUID();
    return api<{ id: string }>(base + (profileId ? "/" + profileId : ""), {
      method: "POST",
      protected: true,
      body: document,
      idempotencyKey: mutationKey.current,
      signal: operation.current?.signal,
    });
  }
  function finished(id: string, message: string) {
    if (!mounted.current || operation.current?.signal.aborted) return;
    reset();
    setNotice(message);
    setParams({ profile: id });
    setTick((v) => v + 1);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      busyRef.current ||
      !isOnline ||
      needsRefresh ||
      stale ||
      conflict ||
      !mode ||
      (snapshot.current?.live &&
        (confirmation !== snapshot.current.expected || !password)) ||
      (mode === "profile_create" ? !canCreateInScope : !canChange)
    )
      return;
    busyRef.current = true;
    operation.current = new AbortController();
    const secret = password;
    setPassword("");
    setBusy(true);
    setError("");
    try {
      let body;
      if (mode === "profile_create")
        body = linktreeCreate.parse({
          record: linktreeProfile.parse(profileValues),
          teamId: team || null,
        });
      else
        body = linktreeMutation.parse({
          action: mode === "profile_edit" ? "update" : mode,
          revision: snapshot.current!.revision,
          record:
            mode === "profile_edit"
              ? linktreeProfile.parse(profileValues)
              : linktreeLink.parse(linkValues),
          ...(mode === "link_edit"
            ? { action: "link_update", linkId: editingLink!.id }
            : {}),
          ...(snapshot.current?.live
            ? { currentPassword: secret, confirmation }
            : {}),
        });
      const r = await mutate(body, mode === "profile_create" ? "" : selected);
      finished(
        r.id,
        mode === "link_create" || mode === "profile_create"
          ? "Private draft saved. Activate it separately after review."
          : "Linktree changes saved.",
      );
    } catch (e) {
      if (mounted.current && !operation.current?.signal.aborted) {
        setError(
          validationMessage(
            e,
            "This save could not be confirmed. Your input is preserved. Refresh to check the current revision before retrying.",
          ),
        );
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function decision(
    action: string,
    link?: ProfileLink,
    direction?: "up" | "down",
  ) {
    if (!p || !canChange || busyRef.current) return;
    leave(() => {
      setPending({
        action,
        revision: p.revision,
        expected: link && action !== "move" ? link.title : p.displayName,
        ...(link ? { linkId: link.id } : {}),
        ...(direction ? { direction } : {}),
      });
      setError("");
    });
  }
  const changed = () => {
    mutationKey.current = undefined;
  };
  const confirmFields = (expected: string) => (
    <div className="gt-form-grid">
      <Field label={`Type “${expected}” to confirm`} required>
        <input
          value={confirmation}
          maxLength={150}
          disabled={busy}
          required
          onChange={(e) => {
            setConfirmation(e.target.value);
            changed();
          }}
        />
      </Field>
      <Field label="Current password" required>
        <input
          value={password}
          type="password"
          autoComplete="current-password"
          disabled={busy}
          required
          maxLength={128}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
    </div>
  );
  return (
    <div className="gt-admin-page gt-linktree-workspace">
      <header className="gt-admin-heading">
        <div>
          <h1>Linktree</h1>
          <p>
            Curated chapter link pages, approved embeds and aggregate click
            counts. New content stays private until activated.
          </p>
        </div>
        <div className="gt-button-row">
          <Button
            disabled={
              busy ||
              !isOnline ||
              needsRefresh ||
              capabilities.loading ||
              !!capabilities.error ||
              !!mode ||
              !!pending ||
              !(cap?.globalCreate || cap?.teams.length)
            }
            onClick={() => edit("profile_create")}
          >
            New profile
          </Button>
          <Button variant="ghost" disabled={busy || !isOnline} onClick={retry}>
            Refresh
          </Button>
        </div>
      </header>
      {error && (
        <p ref={feedback} tabIndex={-1} className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. This open tab retains your input; changes cannot be
          saved until you reconnect and refresh. No changes will be sent
          automatically.
        </p>
      )}
      {isOnline && needsRefresh && (
        <p role="status" className="gt-data-note">
          Connection restored. Refresh the workspace to check current
          permissions and revisions before saving. Your input remains in this
          tab.
        </p>
      )}
      <ReadState
        name="creation permissions"
        read={capabilities}
        retry={retry}
        online={isOnline}
      />
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {(stale || conflict) && (
        <p role="alert" className="gt-form-error">
          This profile or its links changed. Your input is preserved, but this
          version cannot save. Close the editor and review the current record.
        </p>
      )}
      {mode && !blocked && !definition.denied && (
        <section className="gt-panel gt-event-editor">
          <h2 ref={heading} tabIndex={-1}>
            {mode.startsWith("profile") ? "Profile details" : "Link details"}
          </h2>
          <p>
            {snapshot.current?.live
              ? "This content is active. Saving changes requires publication authority, typed confirmation and your current password."
              : "Save a private draft first. Activation is a separate confirmed action."}
          </p>
          <form className="gt-form" onSubmit={save}>
            {mode.startsWith("profile") ? (
              <>
                <div className="gt-form-grid">
                  {mode === "profile_create" && (
                    <Field label="Scope">
                      <select
                        disabled={busy}
                        value={team}
                        onChange={(e) => {
                          setTeam(e.target.value);
                          changed();
                        }}
                      >
                        {cap?.globalCreate && <option value="">Chapter</option>}
                        {!cap?.globalCreate && (
                          <option value="" disabled>
                            Select a permitted team
                          </option>
                        )}
                        {cap?.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field
                    label="Public username"
                    required
                    hint="Letters, numbers, hyphens or underscores. Renaming stops old URLs; former names remain reserved."
                  >
                    <input
                      value={profileValues.username}
                      required
                      maxLength={50}
                      disabled={busy}
                      onChange={(e) => {
                        setProfileValues((v) => ({
                          ...v,
                          username: e.target.value,
                        }));
                        changed();
                      }}
                    />
                  </Field>
                  <Field label="Display name" required>
                    <input
                      value={profileValues.displayName}
                      required
                      maxLength={100}
                      disabled={busy}
                      onChange={(e) => {
                        setProfileValues((v) => ({
                          ...v,
                          displayName: e.target.value,
                        }));
                        changed();
                      }}
                    />
                  </Field>
                  <Field
                    label="Avatar URL"
                    hint="Public HTTPS image or an /assets/ file. Never paste a private or signed file link."
                  >
                    <input
                      value={profileValues.avatarUrl}
                      maxLength={2000}
                      disabled={busy}
                      onChange={(e) => {
                        setProfileValues((v) => ({
                          ...v,
                          avatarUrl: e.target.value,
                        }));
                        changed();
                      }}
                    />
                  </Field>
                  <Field label="Theme">
                    <select
                      disabled={busy}
                      value={profileValues.theme}
                      onChange={(e) => {
                        setProfileValues((v) => ({
                          ...v,
                          theme: e.target.value as "light" | "dark" | "auto",
                        }));
                        changed();
                      }}
                    >
                      {["light", "dark", "auto"].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Bio">
                  <textarea
                    value={profileValues.bio}
                    rows={3}
                    maxLength={2000}
                    disabled={busy}
                    onChange={(e) => {
                      setProfileValues((v) => ({ ...v, bio: e.target.value }));
                      changed();
                    }}
                  />
                </Field>
                <div className="gt-form-grid">
                  <Field label="Background type">
                    <select
                      value={profileValues.background.type}
                      disabled={busy}
                      onChange={(e) => {
                        setProfileValues((v) => ({
                          ...v,
                          background:
                            e.target.value === "gradient"
                              ? {
                                  type: "gradient",
                                  from: "#f8d8c6",
                                  to: "#e0d6f2",
                                  angle: 135,
                                }
                              : e.target.value === "image"
                                ? { type: "image", value: "" }
                                : { type: "color", value: "#f8d8c6" },
                        }));
                        changed();
                      }}
                    >
                      <option value="color">Solid color</option>
                      <option value="gradient">Two-color gradient</option>
                      <option value="image">Public image</option>
                    </select>
                  </Field>
                  {profileValues.background.type === "gradient" ? (
                    <>
                      <Field label="Gradient start">
                        <input
                          type="color"
                          disabled={busy}
                          value={profileValues.background.from}
                          onChange={(e) => {
                            setProfileValues((v) => ({
                              ...v,
                              background: {
                                ...(v.background as {
                                  type: "gradient";
                                  from: string;
                                  to: string;
                                  angle: number;
                                }),
                                from: e.target.value,
                              },
                            }));
                            changed();
                          }}
                        />
                      </Field>
                      <Field label="Gradient end">
                        <input
                          type="color"
                          disabled={busy}
                          value={profileValues.background.to}
                          onChange={(e) => {
                            setProfileValues((v) => ({
                              ...v,
                              background: {
                                ...(v.background as {
                                  type: "gradient";
                                  from: string;
                                  to: string;
                                  angle: number;
                                }),
                                to: e.target.value,
                              },
                            }));
                            changed();
                          }}
                        />
                      </Field>
                      <Field label="Gradient angle">
                        <input
                          type="number"
                          min={0}
                          max={360}
                          disabled={busy}
                          value={profileValues.background.angle}
                          onChange={(e) => {
                            setProfileValues((v) => ({
                              ...v,
                              background: {
                                ...(v.background as {
                                  type: "gradient";
                                  from: string;
                                  to: string;
                                  angle: number;
                                }),
                                angle: Number(e.target.value),
                              },
                            }));
                            changed();
                          }}
                        />
                      </Field>
                    </>
                  ) : (
                    <Field
                      label={
                        profileValues.background.type === "image"
                          ? "Public background image URL"
                          : "Background color"
                      }
                    >
                      <input
                        type={
                          profileValues.background.type === "color"
                            ? "color"
                            : "text"
                        }
                        maxLength={2000}
                        disabled={busy}
                        value={profileValues.background.value}
                        onChange={(e) => {
                          setProfileValues((v) => ({
                            ...v,
                            background: {
                              ...(v.background as {
                                type: "color" | "image";
                                value: string;
                              }),
                              value: e.target.value,
                            },
                          }));
                          changed();
                        }}
                      />
                    </Field>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="gt-form-grid">
                  <Field label="Link title" required>
                    <input
                      value={linkValues.title}
                      disabled={busy}
                      required
                      maxLength={100}
                      onChange={(e) => {
                        setLinkValues((v) => ({ ...v, title: e.target.value }));
                        changed();
                      }}
                    />
                  </Field>
                  <Field
                    label="Public destination"
                    required
                    hint="HTTPS or an approved first-party /forms/ or /events/ path. No private resume/access links."
                  >
                    <input
                      value={linkValues.url}
                      required
                      maxLength={2000}
                      disabled={busy}
                      onChange={(e) => {
                        setLinkValues((v) => ({ ...v, url: e.target.value }));
                        changed();
                      }}
                    />
                  </Field>
                </div>
                <Field label="Link description">
                  <textarea
                    value={linkValues.description}
                    rows={3}
                    maxLength={1000}
                    disabled={busy}
                    onChange={(e) => {
                      setLinkValues((v) => ({
                        ...v,
                        description: e.target.value,
                      }));
                      changed();
                    }}
                  />
                </Field>
                <div className="gt-form-grid">
                  {(
                    [
                      [
                        "icon",
                        "Icon",
                        [
                          "link",
                          "code",
                          "calendar",
                          "video",
                          "form",
                          "community",
                          "mail",
                        ],
                      ],
                      [
                        "buttonStyle",
                        "Button style",
                        ["default", "outline", "filled", "minimal"],
                      ],
                      [
                        "embedType",
                        "Embed option",
                        ["none", "google_form", "youtube"],
                      ],
                    ] as const
                  ).map(([key, label, options]) => (
                    <Field label={label} key={key}>
                      <select
                        value={linkValues[key]}
                        disabled={busy}
                        onChange={(e) => {
                          setLinkValues((v) => ({
                            ...v,
                            [key]: e.target.value,
                          }));
                          changed();
                        }}
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="Button color">
                    <input
                      type="color"
                      disabled={busy}
                      value={linkValues.buttonColor}
                      onChange={(e) => {
                        setLinkValues((v) => ({
                          ...v,
                          buttonColor: e.target.value,
                        }));
                        changed();
                      }}
                    />
                  </Field>
                  <Field
                    label="Button text color"
                    hint="The server requires at least 4.5:1 contrast."
                  >
                    <input
                      type="color"
                      disabled={busy}
                      value={linkValues.textColor}
                      onChange={(e) => {
                        setLinkValues((v) => ({
                          ...v,
                          textColor: e.target.value,
                        }));
                        changed();
                      }}
                    />
                  </Field>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={linkValues.showClickCount}
                    disabled={busy}
                    onChange={(e) => {
                      setLinkValues((v) => ({
                        ...v,
                        showClickCount: e.target.checked,
                      }));
                      changed();
                    }}
                  />{" "}
                  Show this link's approximate click count publicly
                </label>
                <p className="gt-helper">
                  Only full Google Forms and YouTube URLs can embed. Other links
                  open externally. Embeds load only after a visitor opts in.
                </p>
              </>
            )}
            {snapshot.current?.live && confirmFields(snapshot.current.expected)}
            <div className="gt-button-row">
              <Button
                disabled={
                  busy ||
                  !isOnline ||
                  needsRefresh ||
                  (mode === "profile_create"
                    ? !canCreateInScope
                    : !canChange) ||
                  stale ||
                  conflict ||
                  (snapshot.current?.live &&
                    (confirmation !== snapshot.current.expected ||
                      !password)) ||
                  (mode === "profile_create" && !cap?.globalCreate && !team)
                }
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => leave(() => {})}
              >
                Close editor
              </Button>
            </div>
          </form>
        </section>
      )}
      {pending && !blocked && !definition.denied && (
        <section className="gt-panel gt-event-editor">
          <h2 ref={heading} tabIndex={-1}>
            Confirm {pending.action.replace(/_/g, " ")}
          </h2>
          <p>
            Activation makes content available publicly. Archiving hides it and
            retains its history; restoration does not reactivate it.
          </p>
          <form
            className="gt-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busyRef.current || !canChange || stale || conflict) return;
              busyRef.current = true;
              operation.current = new AbortController();
              const secret = password;
              setPassword("");
              setBusy(true);
              setError("");
              try {
                const body = linktreeMutation.parse({
                  action: pending.action,
                  revision: pending.revision,
                  ...(pending.linkId ? { linkId: pending.linkId } : {}),
                  ...(pending.direction
                    ? { direction: pending.direction }
                    : {}),
                  currentPassword: secret,
                  confirmation,
                });
                const r = await mutate(body);
                finished(r.id, "Confirmed Linktree change recorded.");
              } catch (e) {
                if (mounted.current && !operation.current?.signal.aborted) {
                  setError(
                    validationMessage(
                      e,
                      "This change could not be confirmed. Refresh to check the current revision before retrying.",
                    ),
                  );
                  if (e instanceof ApiFailure && e.status === 409)
                    setConflict(true);
                }
              } finally {
                busyRef.current = false;
                if (mounted.current) setBusy(false);
              }
            }}
          >
            {confirmFields(pending.expected)}
            <div className="gt-button-row">
              <Button
                disabled={
                  busy ||
                  !canChange ||
                  stale ||
                  conflict ||
                  confirmation !== pending.expected ||
                  !password
                }
              >
                {busy ? "Working…" : "Confirm change"}
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() => leave(() => {})}
              >
                Cancel confirmation
              </Button>
            </div>
          </form>
        </section>
      )}
      <section
        className="gt-finance-filters"
        aria-label="Linktree profile filters"
      >
        <SearchBox
          label="Search link profiles"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <Field label="Profile state">
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            {["current", "active", "draft", "trash"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      </section>
      {(q || state !== "current" || page !== 1) && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ("");
            setState("current");
            setPage(1);
            document.getElementById("workspace-content")?.focus();
          }}
        >
          Reset profile filters
        </Button>
      )}
      <ReadState
        name="profiles"
        read={inventory}
        retry={retry}
        online={isOnline}
      />
      {list && (
        <>
          <ScrollableTable label="Linktree profiles table">
            <table className="gt-data-table">
              <caption className="sr-only">
                Authorized Linktree profiles
              </caption>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Scope</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.displayName}</strong>
                      <small>/l/{row.username}</small>
                    </td>
                    <td>{row.teamName || "Chapter"}</td>
                    <td>
                      <Badge>
                        {row.deletedAt
                          ? "Archived"
                          : row.active
                            ? "Active"
                            : "Draft"}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={
                          busy ||
                          inventory.loading ||
                          !!inventory.error ||
                          !isOnline
                        }
                        onClick={() => choose(row.id)}
                      >
                        <span aria-hidden="true">Manage</span>
                        <span className="sr-only">
                          Manage {row.displayName}
                        </span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {list.items.length === 0 && (
            <EmptyState
              headingLevel={2}
              title={
                page > 1 && list.total > 0
                  ? "No profiles on this page"
                  : q || state !== "current"
                    ? "No profiles match these filters"
                    : "No permitted profiles yet"
              }
            >
              {q || state !== "current" || page > 1
                ? "Reset the filters or return to the first page to see your permitted profiles."
                : cap?.globalCreate || cap?.teams.length
                  ? "Create a private profile to start collecting chapter links."
                  : "Ask a chapter administrator for the appropriate team grants."}
            </EmptyState>
          )}
          <nav className="gt-button-row" aria-label="Linktree profile pages">
            <Button
              variant="ghost"
              disabled={page <= 1 || inventory.loading}
              onClick={() => setPage(page - 1)}
            >
              Previous profiles
            </Button>
            <span>
              Page {page} · {list.total} profiles
            </span>
            <Button
              variant="ghost"
              disabled={page * list.pageSize >= list.total || inventory.loading}
              onClick={() => setPage(page + 1)}
            >
              Next profiles
            </Button>
          </nav>
        </>
      )}
      {selected && (
        <ReadState
          name="profile details"
          read={definition}
          retry={retry}
          online={isOnline}
        />
      )}
      {p && detail && !mode && !pending && (
        <section className="gt-linktree-management">
          <header className="gt-admin-heading">
            <div>
              <h2>{p.displayName}</h2>
              <p>
                /l/{p.username} · {p.teamName || "Chapter"} · revision{" "}
                {p.revision}
              </p>
            </div>
            <div className="gt-button-row">
              {p.active && !p.deletedAt && (
                <a
                  className="gt-button gt-button-secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`/l/${p.username}`}
                >
                  View public page
                </a>
              )}
              <Button variant="ghost" onClick={() => choose("")}>
                Close profile
              </Button>
            </div>
          </header>
          <div className="gt-button-row">
            {!p.deletedAt && (
              <>
                {p.actions.includes("update") &&
                  (!p.active || p.actions.includes("publish")) && (
                    <Button
                      variant="secondary"
                      disabled={!canChange || busy}
                      onClick={() => edit("profile_edit")}
                    >
                      Edit profile
                    </Button>
                  )}
                {p.actions.includes("publish") && (
                  <Button
                    variant="secondary"
                    disabled={!canChange || busy}
                    onClick={() => decision(p.active ? "unpublish" : "publish")}
                  >
                    {p.active ? "Deactivate profile" : "Activate profile"}
                  </Button>
                )}
                {p.actions.includes("create") && (
                  <Button
                    disabled={!canChange || busy}
                    onClick={() => edit("link_create")}
                  >
                    Add draft link
                  </Button>
                )}
                {p.actions.includes("delete") &&
                  (!p.active || p.actions.includes("publish")) && (
                    <Button
                      variant="danger"
                      disabled={!canChange || busy}
                      onClick={() => decision("archive")}
                    >
                      Archive profile
                    </Button>
                  )}
              </>
            )}
            {p.deletedAt && p.actions.includes("delete") && (
              <Button
                variant="secondary"
                disabled={!canChange || busy}
                onClick={() => decision("restore")}
              >
                Restore as inactive
              </Button>
            )}
          </div>
          <div className="gt-button-row">
            <h3>Links</h3>
            <label>
              <input
                type="checkbox"
                checked={trash}
                onChange={(e) => {
                  setTrash(e.target.checked);
                  setLinkPage(1);
                }}
              />{" "}
              Archived links
            </label>
          </div>
          <ScrollableTable label="Profile links table">
            <table className="gt-data-table">
              <caption className="sr-only">
                Profile links in display order
              </caption>
              <thead>
                <tr>
                  <th>Link / destination</th>
                  <th>State</th>
                  <th>Clicks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.links.map((link, index) => (
                  <tr key={link.id}>
                    <td>
                      <strong>{link.title}</strong>
                      <small>{link.url}</small>
                      <small>{link.embedType.replace(/_/g, " ")}</small>
                    </td>
                    <td>
                      <Badge>
                        {link.deletedAt
                          ? "Archived"
                          : link.active
                            ? "Active"
                            : "Draft"}
                      </Badge>
                    </td>
                    <td>{countLabel(link.clickCount)}</td>
                    <td>
                      <div className="gt-button-row">
                        {!p.deletedAt &&
                          (link.deletedAt ? (
                            p.actions.includes("delete") && (
                              <Button
                                variant="ghost"
                                disabled={!canChange || busy}
                                onClick={() => decision("link_restore", link)}
                              >
                                <span aria-hidden="true">Restore</span>
                                <span className="sr-only">
                                  Restore {link.title}
                                </span>
                              </Button>
                            )
                          ) : (
                            <>
                              {p.actions.includes("update") &&
                                (!link.active ||
                                  p.actions.includes("publish")) && (
                                  <Button
                                    variant="ghost"
                                    disabled={!canChange || busy}
                                    onClick={() => edit("link_edit", link)}
                                  >
                                    <span aria-hidden="true">Edit</span>
                                    <span className="sr-only">
                                      Edit {link.title}
                                    </span>
                                  </Button>
                                )}
                              {p.actions.includes("publish") && (
                                <Button
                                  variant="ghost"
                                  disabled={!canChange || busy}
                                  onClick={() =>
                                    decision(
                                      link.active
                                        ? "link_unpublish"
                                        : "link_publish",
                                      link,
                                    )
                                  }
                                >
                                  <span aria-hidden="true">
                                    {link.active ? "Deactivate" : "Activate"}
                                  </span>
                                  <span className="sr-only">
                                    {link.active ? "Deactivate" : "Activate"}{" "}
                                    {link.title}
                                  </span>
                                </Button>
                              )}
                              {p.actions.includes("update") &&
                                (!p.active ||
                                  p.actions.includes("publish")) && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      disabled={
                                        !canChange ||
                                        busy ||
                                        (index === 0 && linkPage === 1)
                                      }
                                      onClick={() =>
                                        decision("move", link, "up")
                                      }
                                    >
                                      <span aria-hidden="true">Move up</span>
                                      <span className="sr-only">
                                        Move {link.title} up
                                      </span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      disabled={
                                        !canChange ||
                                        busy ||
                                        (index === detail.links.length - 1 &&
                                          linkPage * detail.linkPageSize >=
                                            detail.linkTotal)
                                      }
                                      onClick={() =>
                                        decision("move", link, "down")
                                      }
                                    >
                                      <span aria-hidden="true">Move down</span>
                                      <span className="sr-only">
                                        Move {link.title} down
                                      </span>
                                    </Button>
                                  </>
                                )}
                              {p.actions.includes("delete") &&
                                (!link.active ||
                                  p.actions.includes("publish")) && (
                                  <Button
                                    variant="ghost"
                                    disabled={!canChange || busy}
                                    onClick={() =>
                                      decision("link_archive", link)
                                    }
                                  >
                                    <span aria-hidden="true">Archive</span>
                                    <span className="sr-only">
                                      Archive {link.title}
                                    </span>
                                  </Button>
                                )}
                            </>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {!detail.links.length && (
            <p>
              No {trash ? "archived" : "current"} links. A profile can have up
              to 100 current links.
            </p>
          )}
          <nav className="gt-button-row" aria-label="Profile link pages">
            <Button
              variant="ghost"
              disabled={linkPage <= 1 || definition.loading}
              onClick={() => setLinkPage(linkPage - 1)}
            >
              Previous links
            </Button>
            <span>
              Page {linkPage} · {detail.linkTotal} links
            </span>
            <Button
              variant="ghost"
              disabled={
                linkPage * detail.linkPageSize >= detail.linkTotal ||
                definition.loading
              }
              onClick={() => setLinkPage(linkPage + 1)}
            >
              Next links
            </Button>
          </nav>
          <section className="gt-linktree-analytics">
            <div className="gt-button-row">
              <h3>Aggregate analytics</h3>
              <Field label="Analytics period">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  {[7, 30, 90].map((v) => (
                    <option key={v} value={v}>
                      Last {v} days
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <ReadState
              name="analytics"
              read={report}
              retry={retry}
              online={isOnline}
            />
            {analytics ? (
              <>
                <p>{analytics.note}</p>
                <p>
                  <strong>{countLabel(analytics.views)}</strong> profile views ·{" "}
                  <strong>{countLabel(analytics.clicks)}</strong> link clicks in
                  this period
                </p>
                <div className="gt-finance-report-grid">
                  <section>
                    <h4>By day (UTC)</h4>
                    <ScrollableTable label="Linktree daily analytics table">
                      <table className="gt-data-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Views</th>
                            <th>Clicks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.days.map((d) => (
                            <tr key={d.day}>
                              <td>{d.day}</td>
                              <td>{countLabel(d.views)}</td>
                              <td>{countLabel(d.clicks)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollableTable>
                  </section>
                  <section>
                    <h4>By link</h4>
                    <ScrollableTable label="Linktree link analytics table">
                      <table className="gt-data-table">
                        <thead>
                          <tr>
                            <th>Link</th>
                            <th>Clicks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.links.map((l) => (
                            <tr key={l.link_id}>
                              <td>{l.title}</td>
                              <td>{countLabel(l.clicks)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollableTable>
                  </section>
                </div>
                {!analytics.days.length && (
                  <p>
                    No counted activity yet. Counters are approximate and do not
                    identify visitors.
                  </p>
                )}
              </>
            ) : null}
          </section>
        </section>
      )}
    </div>
  );
}
