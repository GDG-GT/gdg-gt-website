import ScrollableTable from "@/ui/ScrollableTable";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { api, ApiFailure } from "@/lib/api";
import {
  useApprovedSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { validationMessage } from "@/lib/validationMessage";
import {
  communityMemberCreate,
  communityMemberMutation,
  communityMemberRecord,
  memberCategories,
} from "../../../shared/members.mjs";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import MemberFields from "./MemberFields";
import MergeReview from "./MergeReview";
import MemberTransfers from "./MemberTransfers";
import {
  memberFields,
  type Member,
  type Listing,
  type Capabilities,
  type Activity,
  type Mode,
} from "./types";
const base = "/admin/members";
export default function MembersWorkspace() {
  const [params, setParams] = useApprovedSearchParams(),
    selected = params.get("member") || "",
    navigation = useNavigationSafety();
  const [listing, setListing] = useState<Listing>(),
    [member, setMember] = useState<Member>(),
    [cap, setCap] = useState<Capabilities>(),
    [activity, setActivity] = useState<Activity>();
  const [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [category, setCategory] = useState(""),
    [year, setYear] = useState(""),
    [active, setActive] = useState(""),
    [core, setCore] = useState(""),
    [page, setPage] = useState(1),
    [activityPage, setActivityPage] = useState(1),
    [tick, setTick] = useState(0);
  const [mode, setMode] = useState<Mode>(null),
    [values, setValues] = useState(memberFields()),
    [interests, setInterests] = useState(""),
    [team, setTeam] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false),
    [mergeDirty, setMergeDirty] = useState(false);
  const snapshot = useRef<{
      revision: number;
      reference: string;
      profileRevision?: number;
    }>(),
    key = useRef<{ identity: string; value: string }>(),
    baseline = useRef<string>(),
    epoch = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    editorHeading = useRef<HTMLHeadingElement>(null);
  const clearPrivate = useCallback(() => {
    epoch.current++;
    setListing(undefined);
    setMember(undefined);
    setCap(undefined);
    setActivity(undefined);
    setMode(null);
    setValues(memberFields());
    setInterests("");
    setTeam("");
    setPassword("");
    setConfirmation("");
    setNotice("");
    setError("");
    setBusy(false);
    setMergeDirty(false);
    baseline.current = undefined;
    snapshot.current = undefined;
    key.current = undefined;
  }, []);
  const dirty =
    mode === "create" || mode === "update"
      ? JSON.stringify({ values, interests, team }) !== baseline.current
      : mode === "merge"
        ? mergeDirty
        : !!mode && !!(password || confirmation);
  useDraftGuard(dirty, { busy, label: "Private community member changes" });
  useEffect(() => {
    const timer = window.setInterval(() => setTick((v) => v + 1), 30000);
    window.addEventListener("gdg:session-cleared", clearPrivate);
    const invalidate = () => {
      epoch.current++;
    };
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("gdg:session-cleared", clearPrivate);
    };
  }, [clearPrivate]);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<Capabilities>(base + "/capabilities", { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch) setCap(v);
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setCap(undefined);
          setLoadError(e.message);
        }
      });
    return () => c.abort();
  }, [tick]);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current,
      query = new URLSearchParams({
        q,
        state,
        page: String(page),
        ...(category ? { category } : {}),
        ...(year ? { year } : {}),
        ...(active ? { active } : {}),
        ...(core ? { core } : {}),
      });
    api<Listing>(base + "?" + query, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setListing(v);
          setLoadError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setListing(undefined);
          setLoadError(e.message);
        }
      });
    return () => c.abort();
  }, [q, state, page, category, year, active, core, tick]);
  useEffect(() => {
    if (!selected) {
      setMember(undefined);
      setActivity(undefined);
      return;
    }
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<{ member: Member }>(base + "/" + selected, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch)
          setMember(v.member);
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          if (e instanceof ApiFailure && [403, 404].includes(e.status))
            clearPrivate();
          else setMember(undefined);
          setLoadError(
            "This member is unavailable. Close the selection to browse current records.",
          );
        }
      });
    return () => c.abort();
  }, [selected, tick, clearPrivate]);
  useEffect(() => {
    if (!selected) return;
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<Activity>(base + "/" + selected + "/activity?page=" + activityPage, {
      signal: c.signal,
    })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch) setActivity(v);
      })
      .catch(() => {
        if (!c.signal.aborted && epoch.current === readEpoch)
          setActivity(undefined);
      });
    return () => c.abort();
  }, [selected, activityPage, tick]);
  useEffect(() => {
    if (mode) editorHeading.current?.focus();
    else heading.current?.focus();
  }, [mode]);
  const reset = () => {
    setMode(null);
    setPassword("");
    setConfirmation("");
    setConflict(false);
    setMergeDirty(false);
    baseline.current = undefined;
    key.current = undefined;
  };
  const leave = (run: () => void) => {
    const next = () => {
      reset();
      setError("");
      run();
    };
    if (navigation) navigation.request(next);
    else next();
  };
  const choose = (id: string) =>
    leave(() => {
      setMember(undefined);
      setActivity(undefined);
      setActivityPage(1);
      setParams(id ? { member: id } : {});
    });
  const edit = (next: Mode) =>
    leave(() => {
      snapshot.current = {
        revision: member?.revision || 0,
        reference: member?.reference || "",
        profileRevision: member?.publicProfile?.revision,
      };
      const initialValues = memberFields(
        next === "update" ? member : undefined,
      );
      const initialInterests =
        next === "update" ? member?.interests.join("\n") || "" : "";
      const initialTeam =
        member?.team_id && cap?.teams.some((t) => t.id === member.team_id)
          ? member.team_id
          : "";
      baseline.current = JSON.stringify({
        values: initialValues,
        interests: initialInterests,
        team: initialTeam,
      });
      setValues(initialValues);
      setInterests(initialInterests);
      setTeam(initialTeam);
      setMode(next);
      setNotice("");
    });
  const stale =
    !!mode &&
    !["create", "merge"].includes(mode) &&
    (member?.revision !== snapshot.current?.revision ||
      (mode === "sync_profile" &&
        member?.publicProfile?.revision !== snapshot.current?.profileRevision));
  const required =
      mode === "archive" || mode === "restore"
        ? "delete"
        : mode === "unmerge" || mode === "merge"
          ? "merge"
          : "update",
    denied =
      mode === "create"
        ? !cap ||
          (team ? !cap.teams.some((t) => t.id === team) : !cap.globalCreate)
        : !!mode &&
          (!member?.actions.includes(required) ||
            (mode === "merge" && !!member?.merged_into_id) ||
            (mode === "sync_profile" && !member?.canSyncProfile));
  useEffect(() => {
    if (mode === "merge" && (denied || !cap?.merge)) setBusy(false);
  }, [mode, denied, cap?.merge]);
  function finished(id: string, message: string) {
    setBusy(false);
    reset();
    setMember(undefined);
    setActivity(undefined);
    setParams({ member: id });
    setTick((v) => v + 1);
    setNotice(message);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!mode || mode === "merge" || busy || stale || denied || conflict)
      return;
    const current = epoch.current,
      secret = password;
    setPassword("");
    setBusy(true);
    setError("");
    try {
      const record =
        mode === "create" || mode === "update"
          ? communityMemberRecord.parse({
              ...values,
              interests: interests
                .split(/\r?\n/)
                .map((v) => v.trim())
                .filter(Boolean),
            })
          : undefined;
      const body =
        mode === "create"
          ? communityMemberCreate.parse({ record, teamId: team || null })
          : communityMemberMutation.parse({
              action: mode,
              revision: snapshot.current!.revision,
              ...(record
                ? { record }
                : {
                    currentPassword: secret,
                    confirmation,
                    ...(mode === "sync_profile" &&
                    snapshot.current?.profileRevision
                      ? { profileRevision: snapshot.current.profileRevision }
                      : {}),
                  }),
            });
      const { currentPassword: omitted, ...fingerprint } = body as Record<
        string,
        unknown
      >;
      void omitted;
      const identity = mode + ":" + selected + JSON.stringify(fingerprint);
      if (key.current?.identity !== identity)
        key.current = { identity, value: crypto.randomUUID() };
      const result = await api<{ id: string }>(
        base + (mode === "create" ? "" : "/" + selected),
        {
          method: "POST",
          body,
          protected: true,
          idempotencyKey: key.current.value,
        },
      );
      if (current === epoch.current)
        finished(
          result.id,
          mode === "sync_profile"
            ? "Public profile synchronized as an unpublished draft. Review it in Public team."
            : "Community record saved. No account or permissions were created.",
        );
    } catch (e) {
      if (current === epoch.current) {
        if (
          e instanceof ApiFailure &&
          ["FORBIDDEN", "NOT_FOUND"].includes(e.code)
        ) {
          clearPrivate();
          setLoadError(
            "This action or record is no longer available. Close the selection to browse current records.",
          );
          return;
        }
        if (e instanceof ApiFailure && e.code === "CONFLICT") setConflict(true);
        setError(validationMessage(e, "Check the community member fields."));
      }
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  }
  return (
    <section className="gt-admin-page gt-members-workspace">
      <header className="gt-admin-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            Community members
          </h1>
          <p>
            Private contact records, community categories and reviewed
            public-profile links—not officer accounts.
          </p>
        </div>
        <div className="gt-button-row">
          <Button
            disabled={
              busy || !!mode || !cap || (!cap.globalCreate && !cap.teams.length)
            }
            onClick={() => edit("create")}
          >
            New member
          </Button>
          <Button variant="secondary" onClick={() => setTick((v) => v + 1)}>
            Refresh members
          </Button>
        </div>
      </header>
      <MemberTransfers
        cap={cap}
        disabled={busy || !!mode}
        onImported={() => setTick((v) => v + 1)}
        filters={{
          q,
          state,
          ...(category ? { category } : {}),
          ...(year ? { year } : {}),
          ...(active ? { active: active === "true" } : {}),
          ...(core ? { core: core === "true" } : {}),
        }}
      />
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="gt-form-error" role="alert">
          {loadError}
        </p>
      )}
      {mode && mode !== "merge" && (
        <form className="gt-panel gt-event-editor" onSubmit={save}>
          <h2 tabIndex={-1} ref={editorHeading}>
            {mode === "create"
              ? "New private community member"
              : mode === "update"
                ? "Edit community member"
                : mode === "sync_profile"
                  ? "Synchronize an unpublished profile"
                  : mode === "unmerge"
                    ? "Recover separate inactive record"
                    : mode === "archive"
                      ? "Archive community record"
                      : "Restore inactive community record"}
          </h2>
          {(stale || denied || conflict) && (
            <p role="alert">
              This record or your access changed. Input is preserved; close and
              reload before saving.
            </p>
          )}
          <fieldset className="gt-plain-fieldset" disabled={busy}>
            {mode === "create" || mode === "update" ? (
              <MemberFields
                values={values}
                setValues={setValues}
                interests={interests}
                setInterests={setInterests}
                creating={mode === "create"}
                cap={cap}
                team={team}
                setTeam={setTeam}
              />
            ) : (
              <>
                <p>
                  {mode === "sync_profile"
                    ? "This copies name, private profile email and display section into a draft. Phone, academic fields and interests are not copied; publishing is a separate action."
                    : mode === "archive"
                      ? "The record and history are retained. Linked public profiles are unpublished; existing accounts and private project history are not deleted."
                      : "This recovers a separate inactive community record. It does not reactivate membership, republish a profile or alter any account."}
                </p>
                <Field
                  label="Exact member reference"
                  required
                  hint={snapshot.current?.reference}
                >
                  <input
                    autoComplete="off"
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
                <Field label="Current password" required>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </>
            )}
          </fieldset>
          <div className="gt-button-row">
            <Button
              type="submit"
              disabled={busy || stale || denied || conflict}
            >
              Save member changes
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
      )}
      {mode === "merge" && member && (denied || !cap?.merge) && (
        <section className="gt-panel">
          <p role="alert">
            This merge is no longer available. Close the review and inspect the
            current record.
          </p>
          <Button variant="secondary" onClick={() => leave(() => {})}>
            Close merge review
          </Button>
        </section>
      )}
      {mode === "merge" && member && !denied && cap?.merge && (
        <MergeReview
          source={member}
          tick={tick}
          onBusy={setBusy}
          onDirty={setMergeDirty}
          onClose={() => leave(() => {})}
          onSaved={(id) =>
            finished(
              id,
              "Reviewed merge committed. The canonical fields are unchanged and the source is retained inactive.",
            )
          }
        />
      )}
      <section
        aria-label="Community member filters"
        className="gt-toolbar gt-response-filters"
      >
        <SearchBox
          value={q}
          onChange={(v) => {
            setPage(1);
            setQ(v);
          }}
          label="Search private members"
          placeholder="Name, email or major"
        />
        <Field label="Record inventory">
          <select
            value={state}
            onChange={(e) => {
              setPage(1);
              setState(e.target.value);
            }}
          >
            <option value="current">Current</option>
            <option value="trash">Archived / merged</option>
          </select>
        </Field>
        <Field label="Category filter">
          <select
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
          >
            <option value="">All categories</option>
            {memberCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Academic year filter">
          <input
            maxLength={50}
            value={year}
            onChange={(e) => {
              setPage(1);
              setYear(e.target.value);
            }}
          />
        </Field>
        <Field label="Active state">
          <select
            value={active}
            onChange={(e) => {
              setPage(1);
              setActive(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </Field>
        <Field label="Core team filter">
          <select
            value={core}
            onChange={(e) => {
              setPage(1);
              setCore(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="true">Core community team</option>
            <option value="false">Not marked core</option>
          </select>
        </Field>
      </section>
      {listing && (
        <>
          <p role="status">
            {listing.total} matching records · {listing.stats.active} active ·{" "}
            {listing.stats.core} marked core. Counts follow these filters and
            your current access.
          </p>
          <ScrollableTable
            label="Community members table"
            className="gt-table-scroll"
          >
            <table className="gt-data-table">
              <caption className="sr-only">
                Authorized community members
              </caption>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Scope / category</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listing.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </td>
                    <td>
                      {m.teamName || "Chapter"}
                      <small>
                        {m.category}
                        {m.is_core_team ? " · Core community team" : ""}
                      </small>
                    </td>
                    <td>
                      <Badge>
                        {m.merged_into_id
                          ? "Merged · retained"
                          : m.deleted_at
                            ? "Archived"
                            : m.is_active
                              ? "Active"
                              : "Inactive"}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={busy || m.id === selected}
                        onClick={() => choose(m.id)}
                      >
                        Manage<span className="sr-only"> {m.name}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {!listing.items.length && (
            <EmptyState title="No matching community members">
              Change the filters or create a private record.
            </EmptyState>
          )}
          <nav aria-label="Community member pages" className="gt-button-row">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous members
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={page * listing.pageSize >= listing.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next members
            </Button>
          </nav>
        </>
      )}
      {selected && !member && !mode && (
        <Button variant="secondary" onClick={() => choose("")}>
          Close selection
        </Button>
      )}
      {!mode && member && (
        <section className="gt-panel">
          <header className="gt-panel-heading">
            <div>
              <h2>{member.name}</h2>
              <p>
                {member.reference} · revision {member.revision} ·{" "}
                {member.teamName || "Chapter"}
              </p>
            </div>
            <Button variant="ghost" onClick={() => choose("")}>
              Close member
            </Button>
          </header>
          <p>
            {member.category} ·{" "}
            {member.is_active
              ? "Active community record"
              : "Inactive community record"}
            {member.is_core_team ? " · Core community team" : ""}
          </p>
          {member.merged_into_id && (
            <p>
              This retained source refers to a canonical member.{" "}
              <Button
                variant="ghost"
                onClick={() => choose(member.merged_into_id!)}
              >
                Open canonical record
              </Button>
            </p>
          )}
          <details>
            <summary>Private contact and academic information</summary>
            <dl>
              {(
                [
                  ["Email", member.email],
                  ["Phone", member.phone],
                  ["Academic year", member.year],
                  ["Major", member.major],
                  ["Interests", member.interests.join(", ")],
                  ["Public profile section", member.team_section],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Not provided"}</dd>
                </div>
              ))}
            </dl>
          </details>
          <p>
            {member.activeProjectCount} active project memberships in your
            readable project scope.
          </p>
          <p>
            {member.publicProfile
              ? `Linked public profile: ${member.publicProfile.name} · ${member.publicProfile.active ? "Published" : "Draft"}.`
              : "No current public profile is visible in your permitted profile scope."}
          </p>
          <div className="gt-button-row">
            {!member.deleted_at && member.actions.includes("update") && (
              <Button onClick={() => edit("update")}>Edit member</Button>
            )}
            {member.canSyncProfile && (
              <Button variant="secondary" onClick={() => edit("sync_profile")}>
                Sync draft public profile
              </Button>
            )}
            {!member.merged_into_id && member.actions.includes("delete") && (
              <Button
                variant="secondary"
                onClick={() => edit(member.deleted_at ? "restore" : "archive")}
              >
                {member.deleted_at
                  ? "Restore inactive record"
                  : "Archive member"}
              </Button>
            )}
            {member.merged_into_id && member.actions.includes("merge") && (
              <Button variant="secondary" onClick={() => edit("unmerge")}>
                Unmerge to inactive record
              </Button>
            )}
            {!member.merged_into_id &&
              member.actions.includes("merge") &&
              cap?.merge && (
                <Button variant="secondary" onClick={() => edit("merge")}>
                  Review duplicate merge
                </Button>
              )}
            {member.publicProfile && (
              <Link className="gt-button gt-button-secondary" to="/admin/team">
                Review Public team
              </Link>
            )}
          </div>
          {activity && (
            <section>
              <h3>Retained activity</h3>
              <ol className="gt-team-history">
                {activity.items.map((a) => (
                  <li key={a.id}>
                    <strong>
                      {a.action.replace(/^members\./, "").replace(/_/g, " ")}
                    </strong>
                    <span>
                      {new Date(a.created_at).toLocaleString()} · {a.result}
                    </span>
                  </li>
                ))}
              </ol>
              <nav aria-label="Member activity pages" className="gt-button-row">
                <Button
                  variant="secondary"
                  disabled={activityPage <= 1}
                  onClick={() => setActivityPage((v) => v - 1)}
                >
                  Previous activity
                </Button>
                <span>Page {activityPage}</span>
                <Button
                  variant="secondary"
                  disabled={activity.items.length < activity.pageSize}
                  onClick={() => setActivityPage((v) => v + 1)}
                >
                  Next activity
                </Button>
              </nav>
            </section>
          )}
        </section>
      )}
    </section>
  );
}
