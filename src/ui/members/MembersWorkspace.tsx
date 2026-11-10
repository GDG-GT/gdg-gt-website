import RecordAcknowledgement from "@/ui/RecordAcknowledgement";
import ActionFeedback from "@/ui/ActionFeedback";
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
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import MemberReadFeedback from "./MemberReadFeedback";
import MemberWriteRecovery from "./MemberWriteRecovery";
import {
  memberIntent,
  submitMemberWrite,
  type MemberWriteIntent,
} from "./member-write";
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
function checkedRead<T>(
  read: ReturnType<typeof usePrivateRead<T>>,
  valid: (value: T) => boolean,
) {
  return read.data !== undefined && !valid(read.data)
    ? {
        ...read,
        data: undefined,
        error: "The member data reply could not be verified. Retry this read.",
      }
    : read;
}
export default function MembersWorkspace() {
  const { currentAdmin } = useAdmin(),
    [sessionEpoch, setSessionEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setSessionEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <MemberDirectory
      key={JSON.stringify([currentAdmin?.id, currentAdmin?.role, sessionEpoch])}
    />
  );
}
function MemberDirectory() {
  const [params, setParams] = useApprovedSearchParams(),
    selected = params.get("member") || "",
    navigation = useNavigationSafety();
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
    [uncertain, setUncertain] = useState<MemberWriteIntent>(),
    [accessDenied, setAccessDenied] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(!navigator.onLine),
    [capAttempt, setCapAttempt] = useState(0),
    [listAttempt, setListAttempt] = useState(0),
    [detailAttempt, setDetailAttempt] = useState(0),
    [activityAttempt, setActivityAttempt] = useState(0),
    [notice, setNotice] = useState(""),
    [profileToReview, setProfileToReview] = useState<string>(),
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
  const activeWrite = useRef<{
    intent: MemberWriteIntent;
    controller: AbortController;
  }>();
  const { isOnline } = useOnlineStatus();
  const query = new URLSearchParams({
    q,
    state,
    page: String(page),
    ...(category ? { category } : {}),
    ...(year ? { year } : {}),
    ...(active ? { active } : {}),
    ...(core ? { core } : {}),
  });
  const capRead = checkedRead(
      usePrivateRead<Capabilities>(
        accessDenied ? undefined : base + "/capabilities",
        tick + capAttempt,
      ),
      (v) =>
        !!v &&
        typeof v.globalCreate === "boolean" &&
        typeof v.merge === "boolean" &&
        Array.isArray(v.teams) &&
        v.teams.every(
          (team) =>
            typeof team.id === "string" && typeof team.name === "string",
        ),
    ),
    listRead = checkedRead(
      usePrivateRead<Listing>(
        accessDenied ? undefined : base + "?" + query,
        tick + listAttempt,
      ),
      (v) =>
        !!v &&
        Array.isArray(v.items) &&
        v.items.every(
          (item) =>
            !!item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.email === "string" &&
            Array.isArray(item.actions),
        ) &&
        Number.isInteger(v.total) &&
        v.total >= 0 &&
        v.pageSize > 0 &&
        !!v.stats &&
        typeof v.stats.active === "number" &&
        typeof v.stats.core === "number",
    ),
    detailRead = checkedRead(
      usePrivateRead<{ member: Member }>(
        !accessDenied && selected ? base + "/" + selected : undefined,
        tick + detailAttempt,
      ),
      (v) =>
        !!v?.member &&
        v.member.id === selected &&
        typeof v.member.name === "string" &&
        Array.isArray(v.member.actions) &&
        Array.isArray(v.member.interests) &&
        Number.isInteger(v.member.revision),
    ),
    activityRead = checkedRead(
      usePrivateRead<Activity>(
        !accessDenied && selected
          ? base + "/" + selected + "/activity?page=" + activityPage
          : undefined,
        tick + activityAttempt,
      ),
      (v) =>
        !!v &&
        v.pageSize > 0 &&
        Array.isArray(v.items) &&
        v.items.every(
          (item) =>
            !!item &&
            typeof item.id === "string" &&
            typeof item.action === "string" &&
            typeof item.created_at === "string",
        ),
    );
  const cap = capRead.data,
    listing = listRead.data,
    member = detailRead.data?.member,
    activity = activityRead.data;
  const unavailable =
    !!uncertain ||
    accessDenied ||
    !isOnline ||
    needsRecheck ||
    capRead.loading ||
    !!capRead.error ||
    !cap ||
    listRead.loading ||
    !!listRead.error ||
    !listing ||
    (!!selected && (detailRead.loading || !!detailRead.error || !member));
  const clearCap = capRead.clear,
    clearList = listRead.clear,
    clearDetail = detailRead.clear,
    clearActivity = activityRead.clear;
  const clearPrivate = useCallback(() => {
    epoch.current++;
    activeWrite.current?.controller.abort();
    activeWrite.current = undefined;
    clearList();
    clearDetail();
    clearCap();
    clearActivity();
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
    setUncertain(undefined);
  }, [clearCap, clearList, clearDetail, clearActivity]);
  const dirty =
    mode === "create" || mode === "update"
      ? JSON.stringify({ values, interests, team }) !== baseline.current
      : mode === "merge"
        ? mergeDirty
        : !!mode && !!(password || confirmation);
  useDraftGuard(dirty || !!uncertain, {
    busy: busy || !!uncertain,
    label: "Private community member changes",
  });
  useEffect(() => {
    if (
      !(
        capRead.denied ||
        listRead.denied ||
        detailRead.denied ||
        activityRead.denied
      )
    )
      return;
    clearPrivate();
    setAccessDenied(true);
  }, [
    capRead.denied,
    listRead.denied,
    detailRead.denied,
    activityRead.denied,
    clearPrivate,
  ]);
  useEffect(() => {
    if (!isOnline) {
      setNeedsRecheck(true);
      if (activeWrite.current) {
        activeWrite.current.controller.abort();
        setUncertain(activeWrite.current.intent);
        activeWrite.current = undefined;
        setBusy(false);
      }
    }
  }, [isOnline]);
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
      activeWrite.current?.controller.abort();
      activeWrite.current = undefined;
    };
    return invalidate;
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        navigator.onLine &&
        !document.hidden &&
        !accessDenied &&
        !needsRecheck &&
        !uncertain &&
        !busy
      )
        setTick((v) => v + 1);
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, [accessDenied, needsRecheck, uncertain, busy]);
  const recheck = () => {
    if (!navigator.onLine || busy) return;
    setAccessDenied(false);
    setNeedsRecheck(false);
    setTick((v) => v + 1);
  };
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
    setUncertain(undefined);
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
      clearDetail();
      clearActivity();
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
      setProfileToReview(undefined);
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
  function finished(id: string, message: string, profileId?: string | null) {
    setBusy(false);
    reset();
    clearDetail();
    clearActivity();
    setParams({ member: id });
    setTick((v) => v + 1);
    setNotice(message);
    setProfileToReview(profileId || undefined);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      !mode ||
      mode === "merge" ||
      busy ||
      activeWrite.current ||
      unavailable ||
      stale ||
      denied ||
      conflict ||
      (!["create", "update"].includes(mode) && confirmation !== snapshot.current?.reference)
    )
      return;
    const current = epoch.current,
      secret = password;
    setPassword("");
    setBusy(true);
    setError("");
    let original: MemberWriteIntent | undefined;
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
      original = memberIntent(
        base + (mode === "create" ? "" : "/" + selected),
        mode,
        fingerprint,
      );
      const controller = new AbortController();
      activeWrite.current = { intent: original, controller };
      const result = await submitMemberWrite(
        original,
        controller.signal,
        secret,
      );
      if (controller.signal.aborted) return;
      if (current === epoch.current)
        finished(
          result.id,
          mode === "sync_profile"
            ? "Draft Team profile saved. Review and publish it to show this member on the website."
            : "Community record saved. No account or permissions were created.",
          result.profileId,
        );
    } catch (e) {
      if (current === epoch.current) {
        if (original && activeWrite.current?.controller.signal.aborted) return;
        if (original && (!(e instanceof ApiFailure) || e.status >= 500)) {
          setUncertain(original);
          setError("");
          return;
        }

        if (
          e instanceof ApiFailure &&
          ["FORBIDDEN", "NOT_FOUND"].includes(e.code)
        ) {
          clearPrivate();
          setAccessDenied(true);
          return;
        }
        if (e instanceof ApiFailure && e.code === "CONFLICT") setConflict(true);
        setError(validationMessage(e, "Check the community member fields."));
      }
    } finally {
      if (activeWrite.current?.intent === original)
        activeWrite.current = undefined;
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
              busy ||
              unavailable ||
              !!mode ||
              !cap ||
              (!cap.globalCreate && !cap.teams.length)
            }
            onClick={() => edit("create")}
          >
            New member
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !!uncertain || !isOnline}
            onClick={recheck}
          >
            Recheck member access
          </Button>
        </div>
      </header>
      <MemberTransfers
        cap={cap}
        disabled={busy || unavailable || !!mode}
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
      {uncertain && (
        <MemberWriteRecovery
          key={uncertain.key}
          intent={uncertain}
          onConfirmed={(receipt) =>
            finished(
              receipt.id,
              uncertain.action === "sync_profile"
                ? "Draft Team profile save confirmed. Review and publish it to show this member on the website."
                : "Original community member save confirmed.",
              receipt.profileId,
            )
          }
          onDenied={() => {
            clearPrivate();
            setAccessDenied(true);
          }}
          onBusy={setBusy}
          onStop={() => {
            clearPrivate();
            setTick((v) => v + 1);
            setNotice(
              "Member recovery stopped. The original outcome remains unconfirmed; inspect current records before another save.",
            );
          }}
        />
      )}
      {notice && <ActionFeedback message={notice}>
        {profileToReview && <Link className="gt-button gt-button-secondary" to={`/admin/content/team?profile=${encodeURIComponent(profileToReview)}`}>Review draft Team profile</Link>}
      </ActionFeedback>}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {accessDenied ? (
        <div role="alert" className="gt-form-error">
          <p>
            Community member access could not be verified. Private records and
            edits have been cleared. Recheck current access to continue.
          </p>
        </div>
      ) : (
        <>
          {(!isOnline || needsRecheck) && (
            <p role="status">
              Member actions are paused.{" "}
              {!isOnline ? "You’re offline." : "Connection restored."} Recheck
              member access before continuing.
            </p>
          )}
          <MemberReadFeedback
            name="member permissions"
            read={capRead}
            offline={!isOnline}
            retry={() => setCapAttempt((v) => v + 1)}
            disabled={busy || !!uncertain || !isOnline || needsRecheck}
          />
          <MemberReadFeedback
            name="member inventory"
            read={listRead}
            offline={!isOnline}
            retry={() => setListAttempt((v) => v + 1)}
            disabled={busy || !!uncertain || !isOnline || needsRecheck}
          />
          {selected && (
            <>
              <MemberReadFeedback
                name="selected member"
                read={detailRead}
                offline={!isOnline}
                retry={() => setDetailAttempt((v) => v + 1)}
                disabled={busy || !!uncertain || !isOnline || needsRecheck}
              />
              <MemberReadFeedback
                name="member activity"
                read={activityRead}
                offline={!isOnline}
                retry={() => setActivityAttempt((v) => v + 1)}
                disabled={busy || !!uncertain || !isOnline || needsRecheck}
              />
            </>
          )}
        </>
      )}
      {mode && mode !== "merge" && (
        <form className="gt-panel gt-event-editor" onSubmit={save}>
          <h2 tabIndex={-1} ref={editorHeading}>
            {mode === "create"
              ? "New private community member"
              : mode === "update"
                ? "Edit community member"
                : mode === "sync_profile"
                  ? `Draft Team profile for ${member?.name}`
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
          <fieldset
            className="gt-plain-fieldset"
            disabled={busy || unavailable}
          >
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
                <RecordAcknowledgement
                  label={mode === "sync_profile"
                    ? `Create or update the draft Team profile for ${member?.name}.`
                    : `I have reviewed ${member?.name} and want to ${mode === "archive" ? "archive this member" : mode === "restore" ? "restore this member" : "separate this merged member"}.`}
                  reference={snapshot.current?.reference || ""}
                  value={confirmation}
                  onChange={setConfirmation}
                />
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
              disabled={busy || unavailable || stale || denied || conflict}
            >
              {mode === "sync_profile" ? "Create or update draft profile" : "Save member changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !!uncertain}
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
          key={JSON.stringify([member.id, member.team_id])}
          source={member}
          onDenied={() => {
            clearPrivate();
            setAccessDenied(true);
          }}
          disabled={unavailable}
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
      <fieldset
        disabled={busy || !!uncertain}
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
      </fieldset>
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
                        aria-label={"Manage " + m.name}
                        disabled={busy || unavailable || m.id === selected}
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
              disabled={busy || !isOnline || listRead.loading || page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous members
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={
                busy ||
                !isOnline ||
                listRead.loading ||
                page * listing.pageSize >= listing.total
              }
              onClick={() => setPage((v) => v + 1)}
            >
              Next members
            </Button>
          </nav>
        </>
      )}
      {!listing && page > 1 && (
        <Button
          variant="secondary"
          disabled={busy || !isOnline || listRead.loading}
          onClick={() => setPage((v) => Math.max(1, v - 1))}
        >
          Previous members
        </Button>
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
              : member.canSyncProfile ? "No linked Team profile yet." : "No Team profile is available in your current access."}
            {member.publicProfile && !member.publicProfile.active && " Publish the draft in Public team to make it visible on the website."}
          </p>
          <div className="gt-button-row">
            {!member.deleted_at && member.actions.includes("update") && (
              <Button disabled={unavailable} onClick={() => edit("update")}>
                Edit member
              </Button>
            )}
            {member.publicProfile && (
              <Link className="gt-button gt-button-secondary" to={`/admin/content/team?profile=${encodeURIComponent(member.publicProfile.id)}`}>
                {member.publicProfile.active ? "Edit published Team profile" : "Review draft Team profile"}
              </Link>
            )}
            {member.canSyncProfile && (
              <Button
                variant="secondary"
                disabled={unavailable}
                onClick={() => edit("sync_profile")}
              >
                Sync draft public profile
              </Button>
            )}
            {!member.merged_into_id && member.actions.includes("delete") && (
              <Button
                variant="secondary"
                disabled={unavailable}
                onClick={() => edit(member.deleted_at ? "restore" : "archive")}
              >
                {member.deleted_at
                  ? "Restore inactive record"
                  : "Archive member"}
              </Button>
            )}
            {member.merged_into_id && member.actions.includes("merge") && (
              <Button
                variant="secondary"
                disabled={unavailable}
                onClick={() => edit("unmerge")}
              >
                Unmerge to inactive record
              </Button>
            )}
            {!member.merged_into_id &&
              member.actions.includes("merge") &&
              cap?.merge && (
                <Button
                  variant="secondary"
                  disabled={unavailable}
                  onClick={() => edit("merge")}
                >
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
                  disabled={
                    busy ||
                    !isOnline ||
                    activityRead.loading ||
                    activityPage <= 1
                  }
                  onClick={() => setActivityPage((v) => v - 1)}
                >
                  Previous activity
                </Button>
                <span>Page {activityPage}</span>
                <Button
                  variant="secondary"
                  disabled={
                    busy ||
                    !isOnline ||
                    activityRead.loading ||
                    activity.items.length < activity.pageSize
                  }
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
