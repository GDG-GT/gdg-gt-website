import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { NavigationSafetyContext } from "@/contexts/NavigationSafetyContext";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, EmptyState, Field } from "../primitives";
import {
  visibleFields,
  formPath,
  validateAnswer,
  type Answer,
  type FormDefinition,
} from "./store";
import FieldRenderer from "./FieldRenderer";
import FormImage from "./FormImage";
import { formImageId } from "./store";
import { presentationFields } from "../../../shared/form-presentation";
import {
  stripUrlCapabilities,
  formCapabilityNames,
} from "../../../shared/capability-navigation";
import RespondentFileField from "./RespondentFileField";
import RespondentWriteRecovery from "./RespondentWriteRecovery";
import {
  prepareRespondentWrite,
  submitRespondentWrite,
  type RespondentWriteIntent,
  type RespondentWriteReceipt,
} from "./respondent-write";
import NotFoundContent from "../NotFoundContent";
import { usePublicMetadata } from "../usePublicMetadata";
import { reviewAnswer } from "./review-answer";
import { api, ApiFailure } from "@/lib/api";
import GeorgiaTechSsoOption from "../auth/GeorgiaTechSsoOption";
import {
  formRespondentSchema,
  respondentLabel,
} from "../../../shared/form-respondent.mjs";
type RespondentForm = FormDefinition & {
  id: string;
  slug: string;
  status: string;
  versionId: string;
  version: number;
  respondentContext?: {
    name?: string;
    email?: string;
    source: string;
    locked?: boolean;
  };
  copyAvailable?: boolean;
};

export default function PublicForm() {
  const { slug } = useParams(),
    [params] = useSearchParams();
  return (
    <RespondentFormBoundary
      key={JSON.stringify([slug, params.get("preview") === "1"])}
    />
  );
}
function RespondentFormBoundary() {
  const { slug } = useParams(),
    location = useLocation(),
    safety = useContext(NavigationSafetyContext),
    [incoming, setIncoming] = useState<string>(),
    generation = useRef(0),
    [params] = useSearchParams(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
    };
    const clear = () => {
      invalidate();
      stripUrlCapabilities(
        window.history,
        window.location,
        formCapabilityNames,
      );
      setIncoming(undefined);
      setEpoch((value) => value + 1);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    // The child strips capabilities on first load. A newly approved fragment
    // must still replace even the same edit link after a completed request.
    const raw = window.location.hash;
    if (
      !raw ||
      raw !== location.hash ||
      !formCapabilityNames.some((name) =>
        new URLSearchParams(raw.slice(1)).has(name),
      )
    )
      return;
    const originalGeneration = generation.current;
    const replace = () => {
      if (generation.current !== originalGeneration) return;
      setIncoming(raw);
      setEpoch((value) => value + 1);
    };
    // Same-document entries may inherit a router index even when the router
    // did not review them. Every private-context replacement uses the live guard.
    // Keep incoming secrets only in the pending callback until approval.
    if (safety) safety.request(replace);
    else replace();
    stripUrlCapabilities(window.history, window.location, formCapabilityNames);
  }, [location, safety]);
  useEffect(() => {
    const waiting = new Set<number>();
    const changed = () => {
      // Native fragment changes can be deduplicated by the router when its last
      // location still contains the stripped capability. Let router blockers
      // settle first, then review only the unmanaged same-form transition.
      const task = window.setTimeout(() => {
        waiting.delete(task);
        const raw = window.location.hash;
        if (
          window.location.pathname !== `/forms/${slug}` ||
          !raw ||
          !formCapabilityNames.some((name) =>
            new URLSearchParams(raw.slice(1)).has(name),
          ) ||
          document.querySelector('[role="alertdialog"]')
        )
          return;
        const originalGeneration = generation.current;
        const replace = () => {
          if (generation.current !== originalGeneration) return;
          setIncoming(raw);
          setEpoch((value) => value + 1);
        };
        if (safety) safety.request(replace);
        else replace();
        stripUrlCapabilities(
          window.history,
          window.location,
          formCapabilityNames,
        );
      }, 0);
      waiting.add(task);
    };
    window.addEventListener("hashchange", changed);
    return () => {
      window.removeEventListener("hashchange", changed);
      waiting.forEach((task) => window.clearTimeout(task));
    };
  }, [safety, slug]);
  // A different form must never inherit another form's answers, identity or
  // private resume/edit/upload capabilities after an approved navigation.
  return (
    <RespondentFormRuntime
      key={JSON.stringify([slug, params.get("preview") === "1", epoch])}
      initialFragment={incoming}
    />
  );
}

function RespondentFormRuntime({
  initialFragment,
}: {
  initialFragment?: string;
}) {
  const { slug } = useParams(),
    [params] = useSearchParams(),
    preview = params.get("preview") === "1";
  const [form, setForm] = useState<RespondentForm>(),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [loadStatus, setLoadStatus] = useState<number>(),
    [loadAttempt, setLoadAttempt] = useState(0),
    [online, setOnline] = useState(navigator.onLine),
    [pending, setPending] = useState(false),
    [uncertain, setUncertain] = useState<RespondentWriteIntent>(),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [stopped, setStopped] = useState(false),
    [blocked, setBlocked] = useState(false),
    [writeConflict, setWriteConflict] = useState(false),
    [savedLink, setSavedLink] = useState(""),
    [accessRequired, setAccessRequired] = useState(false);
  const [tokens, setTokens] = useState(() => {
    const values = new URLSearchParams(
      (initialFragment ?? window.location.hash).slice(1),
    );
    return {
      access: values.get("access") || undefined,
      resume: values.get("resume") || undefined,
      edit: values.get("edit") || undefined,
      upload: values.get("upload") || undefined,
    };
  });
  const definition = form,
    editToken = useRef(tokens.edit),
    resumeToken = useRef(tokens.resume),
    editRevision = useRef(0),
    submission = useRef<RespondentWriteIntent>(),
    draftRevision = useRef(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({}),
    [step, setStep] = useState(0),
    [submitted, setSubmitted] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [identityErrors, setIdentityErrors] = useState<Record<string, string>>(
    {},
  );
  const operation = useRef(false);
  const [respondent, setRespondent] = useState({ name: "", email: "" }),
    [copyRequested, setCopyRequested] = useState(false),
    [copyQueued, setCopyQueued] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    errorFeedback = useRef<HTMLElement | null>(null),
    statusFeedback = useRef<HTMLParagraphElement>(null),
    focusTarget = useRef<{
      kind: "identity" | "field" | "heading" | "error" | "status";
      id?: string;
    }>(),
    mutation = useRef<AbortController>();
  useEffect(() => () => mutation.current?.abort(), []);
  useEffect(() => {
    const connected = () => setOnline(true),
      disconnected = () => {
        setOnline(false);
        if (operation.current && submission.current) {
          mutation.current?.abort();
          setUncertain(submission.current);
          setPending(false);
          operation.current = false;
          setError(
            "The connection ended before the original form request could be confirmed. Reconnect and check its outcome.",
          );
        }
      };
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  const responseId = useRef<string | null>(null);
  const savedAnswers = useRef(
    JSON.stringify({
      answers: {},
      respondent: { name: "", email: "" },
      copyRequested: false,
    }),
  );
  const [uploadToken] = useState(() =>
    tokens.upload && /^[A-Za-z0-9_-]{43}$/.test(tokens.upload)
      ? tokens.upload
      : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, ""),
  );
  const [uploading, setUploading] = useState<string[]>([]),
    [fileNames, setFileNames] = useState<Record<string, string>>({});
  const clearRespondent = (denied = false) => {
    mutation.current?.abort();
    operation.current = false;
    setPending(false);
    setRecoveryBusy(false);
    setUncertain(undefined);
    setWriteConflict(false);
    setForm(undefined);
    setAnswers({});
    setRespondent({ name: "", email: "" });
    setFileNames({});
    setSavedLink("");
    setCopyRequested(false);
    setCopyQueued(false);
    setUploading([]);
    editToken.current = undefined;
    resumeToken.current = undefined;
    submission.current = undefined;
    responseId.current = null;
    draftRevision.current = 0;
    setTokens({
      access: undefined,
      resume: undefined,
      edit: undefined,
      upload: undefined,
    });
    if (denied) {
      setBlocked(true);
      setLoadStatus(403);
      setLoadError(
        "Form access could not be verified. Reopen the form using current chapter access or your original private link.",
      );
    } else setStopped(true);
  };
  const rejectIdentity = (
    issues: readonly { path: readonly PropertyKey[] }[],
  ) => {
    const messages = {
      name: "Enter your name (2–100 characters).",
      email: "Enter a valid email address.",
    };
    const errors = Object.fromEntries(
      issues.map((issue) => {
        const key = issue.path[0] === "name" ? "name" : "email";
        return [key, messages[key]];
      }),
    );
    setIdentityErrors(errors);
    setError(Object.values(errors)[0]);
    setStep(0);
    focusTarget.current = { kind: "identity", id: Object.keys(errors)[0] };
  };
  useDraftGuard(
    !submitted &&
      !stopped &&
      !blocked &&
      JSON.stringify({ answers, respondent, copyRequested }) !==
        savedAnswers.current,
    {
      busy: pending || recoveryBusy || uploading.length > 0 || !!uncertain,
      label: "Form answers or files not yet saved",
      privateDraft: true,
    },
  );
  useEffect(() => {
    if (!uploading.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading.length]);
  usePublicMetadata(
    `${loadStatus === 404 ? "Page not found" : form?.title || "Chapter form"} · GDG at Georgia Tech`,
    { noindex: true, noarchive: true },
  );
  useEffect(() => {
    stripUrlCapabilities(window.history, window.location, formCapabilityNames);
    if (stopped || blocked) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    setLoadStatus(undefined);
    setAccessRequired(false);
    const load = async () => {
      if (tokens.edit && !preview) {
        const data = await api<{
          form: RespondentForm;
          responseId: string;
          revision: number;
          answers: Record<string, Answer>;
          respondent: { name: string; email: string };
        }>(`/forms/${slug}/edits/load`, {
          method: "POST",
          body: {
            editToken: tokens.edit,
            ...(tokens.access ? { accessToken: tokens.access } : {}),
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setForm(data.form);
        savedAnswers.current = JSON.stringify({
          answers: data.answers,
          respondent: data.respondent,
          copyRequested: false,
        });
        setAnswers(data.answers);
        setRespondent(data.respondent);
        responseId.current = data.responseId;
        editRevision.current = data.revision;
        setFeedback(
          "Your response is ready to edit. Previous answers stay private.",
        );
      } else {
        const data = await api<{ form: RespondentForm }>(
          `/forms/${slug}${preview ? "/preview" : ""}`,
          { formAccessToken: tokens.access, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setForm(data.form);
        const initial = {
          name: data.form.respondentContext?.name || "",
          email: data.form.respondentContext?.email || "",
        };
        setRespondent(initial);
        savedAnswers.current = JSON.stringify({
          answers: {},
          respondent: initial,
          copyRequested: false,
        });
        if (tokens.resume && !preview) {
          const draft = await api<{
            answers: Record<string, Answer>;
            respondent: { name: string; email: string };
            copyRequested: boolean;
            revision: number;
          }>(`/forms/${slug}/drafts/load`, {
            method: "POST",
            body: {
              resumeToken: tokens.resume,
              ...(tokens.access ? { accessToken: tokens.access } : {}),
            },
            signal: controller.signal,
            protected: data.form.respondentContext?.source === "account",
          });
          if (controller.signal.aborted) return;
          draftRevision.current = draft.revision || 1;
          savedAnswers.current = JSON.stringify({
            answers: draft.answers,
            respondent: draft.respondent,
            copyRequested: draft.copyRequested,
          });
          setAnswers(draft.answers);
          setRespondent(draft.respondent);
          setCopyRequested(draft.copyRequested);
          setFeedback("Your saved draft was restored.");
        }
      }
    };
    load()
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoadError(e.message);
          setLoadStatus(e instanceof ApiFailure ? e.status : undefined);
          if (e instanceof ApiFailure && e.code === "ACCESS_REQUIRED")
            setAccessRequired(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, preview, tokens, loadAttempt, stopped, blocked]);
  useEffect(() => {
    if (loading || pending || !focusTarget.current) return;
    const target = focusTarget.current;
    focusTarget.current = undefined;
    if (target.kind === "identity")
      document.getElementById("respondent-" + target.id)?.focus();
    else if (target.kind === "field")
      document.getElementById("field-" + target.id)?.focus();
    else if (target.kind === "error") errorFeedback.current?.focus();
    else if (target.kind === "status") statusFeedback.current?.focus();
    else heading.current?.focus();
  }, [
    step,
    submitted,
    pending,
    loading,
    fieldErrors,
    identityErrors,
    error,
    feedback,
  ]);
  if (stopped)
    return (
      <div className="gt-public-form-page">
        <EmptyState
          title="Form recovery stopped"
          action={<Link to="/">Return home</Link>}
        >
          The original request may already have succeeded. Its answers and
          private capabilities have been cleared from this tab. Contact the
          chapter if you need the outcome checked before submitting another
          response.
        </EmptyState>
      </div>
    );
  if (!loading && accessRequired)
    return (
      <div className="gt-public-form-page">
        <section className="gt-public-form-sheet gt-form">
          <h1>This form requires private access</h1>
          <p>
            Open the chapter’s access link, or sign in if it is an internal
            form. If email verification is enabled, you can request a private
            link below.
          </p>
          <form
            className="gt-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (operation.current) return;
              const values = new FormData(event.currentTarget);
              setPending(true);
              operation.current = true;
              setError("");
              const controller = new AbortController();
              mutation.current = controller;
              try {
                const result = await api<{ message: string }>(
                  `/forms/${slug}/verify`,
                  {
                    method: "POST",
                    body: {
                      email: String(values.get("email") || ""),
                      website: String(values.get("website") || ""),
                    },
                    signal: controller.signal,
                  },
                );
                if (controller.signal.aborted) return;
                focusTarget.current = { kind: "status" };
                setFeedback(result.message);
              } catch (e) {
                if (controller.signal.aborted) return;
                focusTarget.current = { kind: "error" };
                setError((e as Error).message);
              } finally {
                operation.current = false;
                if (!controller.signal.aborted) setPending(false);
              }
            }}
          >
            <Field label="Email address" required>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                disabled={pending || !!uncertain}
              />
            </Field>
            <div className="gt-honeypot" aria-hidden="true">
              <label>
                Website
                <input
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  disabled={pending || !!uncertain}
                />
              </label>
            </div>
            <Button disabled={pending || !!uncertain}>
              Request verification link
            </Button>
          </form>
          {error && (
            <p
              className="gt-form-error"
              role="alert"
              tabIndex={-1}
              ref={(node) => {
                errorFeedback.current = node;
              }}
            >
              {error}
            </p>
          )}
          {feedback && (
            <p role="status" tabIndex={-1} ref={statusFeedback}>
              {feedback}
            </p>
          )}
          <GeorgiaTechSsoOption purpose="form" />
          <Link to="/contact">Contact the chapter</Link>
        </section>
      </div>
    );
  if (loading)
    return (
      <div className="gt-public-form-page">
        <div
          className="gt-public-form-sheet"
          role="status"
          aria-label="Loading form"
        >
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading your form…</span>
        </div>
      </div>
    );
  if (loadStatus === 404) return <NotFoundContent />;
  if (loadError || !form || !definition)
    return (
      <div className="gt-public-form-page">
        <EmptyState
          title="This form isn’t available"
          action={
            <div className="gt-inline-actions">
              {(!loadStatus || loadStatus >= 500 || loadStatus === 429) && (
                <Button
                  onClick={() => {
                    setLoadAttempt((value) => value + 1);
                    document.getElementById("main-content")?.focus();
                  }}
                >
                  Retry form
                </Button>
              )}
              <Link to="/">Return home</Link>
            </div>
          }
        >
          {loadError ||
            "It may be a draft, archived, or require a valid access link."}
        </EmptyState>
      </div>
    );
  const settings = definition.settings;
  const displayFields = presentationFields(
    definition.fields,
    definition.sections,
    settings,
    tokens.edit || tokens.resume || uploadToken,
  );
  const sections = formPath(definition, answers).sections;
  const closed =
    !preview &&
    !submitted &&
    !responseId.current &&
    (form.status !== "Open" ||
      (settings.opensAt && new Date(settings.opensAt) > new Date()) ||
      (settings.closesAt && new Date(settings.closesAt) < new Date()));
  if (closed)
    return (
      <div className="gt-public-form-page">
        <div className="gt-public-form-sheet">
          <Badge>Not accepting responses</Badge>
          <h1>{definition.title}</h1>
          <p>
            {settings.closedMessage ||
              "This form is not accepting new responses right now."}
          </p>
          <Link to="/contact">Contact the chapter</Link>
        </div>
      </div>
    );
  const section = sections[Math.min(step, sections.length - 1)];
  const fields = visibleFields(
    displayFields,
    answers,
    definition.sections,
  ).filter((field) => field.sectionId === section.id);
  const review = step >= sections.length;
  const finalStep =
    review || (settings.review === false && step >= sections.length - 1);
  const confirmed = (
    original: RespondentWriteIntent,
    result: RespondentWriteReceipt,
  ) => {
    const body = JSON.parse(original.body);
    setUncertain(undefined);
    setWriteConflict(false);
    setRecoveryBusy(false);
    submission.current = undefined;
    setError("");
    setRespondent(body.respondent);
    setCopyRequested(body.copyRequested);
    if (original.action === "drafts") {
      resumeToken.current = body.resumeToken;
      draftRevision.current = result.revision!;
      setAnswers(body.answers);
      savedAnswers.current = JSON.stringify({
        answers: body.answers,
        respondent: body.respondent,
        copyRequested: body.copyRequested,
      });
      const fragment = new URLSearchParams({
        resume: body.resumeToken,
        upload: uploadToken,
        ...(tokens.access ? { access: tokens.access } : {}),
      });
      setSavedLink(
        window.location.origin + window.location.pathname + "#" + fragment,
      );
      focusTarget.current = { kind: "status" };
      setFeedback(
        `Draft saved securely until ${new Date(result.expiresAt!).toLocaleString()}. Keep your private resume link.`,
      );
      return;
    }
    responseId.current = result.responseId!;
    setCopyQueued(!!result.copyQueued);
    setForm(
      (previous) =>
        previous && {
          ...previous,
          respondentContext: {
            ...previous.respondentContext,
            ...body.respondent,
            source: previous.respondentContext?.source || "self_reported",
            locked: true,
          },
        },
    );
    editToken.current = result.editToken || editToken.current;
    if (result.revision !== undefined) editRevision.current = result.revision;
    if (editToken.current)
      setSavedLink(
        window.location.origin +
          window.location.pathname +
          "#edit=" +
          editToken.current,
      );
    focusTarget.current = { kind: "heading" };
    setSubmitted(true);
  };
  const dispatch = async (original: RespondentWriteIntent) => {
    if (operation.current || !navigator.onLine) return;
    submission.current = original;
    setPending(true);
    operation.current = true;
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const result = await submitRespondentWrite(original, controller.signal);
      if (!controller.signal.aborted) confirmed(original, result);
    } catch (e) {
      if (controller.signal.aborted) return;
      focusTarget.current = { kind: "error" };
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clearRespondent(true);
        return;
      }
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(original);
        setError(
          "The connection ended before this form request could be confirmed. Check its original outcome before making changes.",
        );
        return;
      }
      setError((e as Error).message);
      if (e instanceof ApiFailure && e.status === 409) setWriteConflict(true);
      if (e instanceof ApiFailure && e.fields) {
        setFieldErrors(e.fields);
        const invalid = displayFields.find((field) => !!e.fields?.[field.id]);
        if (invalid) {
          setStep(
            Math.max(
              0,
              sections.findIndex((section) => section.id === invalid.sectionId),
            ),
          );
          focusTarget.current = { kind: "field", id: invalid.id };
        }
      }
    } finally {
      operation.current = false;
      if (mutation.current === controller) mutation.current = undefined;
      if (!controller.signal.aborted) setPending(false);
    }
  };
  const next = async (event: FormEvent) => {
    event.preventDefault();
    if (operation.current || uncertain || stopped || blocked || writeConflict)
      return;
    if (uploading.length) {
      focusTarget.current = { kind: "error" };
      setError("Wait for file uploads and security checks to finish.");
      return;
    }
    setError("");
    const identity = formRespondentSchema.safeParse(respondent);
    if (!identity.success) {
      rejectIdentity(identity.error.issues);
      return;
    }
    setIdentityErrors({});
    const errors = Object.fromEntries(
      (finalStep
        ? visibleFields(definition.fields, answers, definition.sections)
        : fields
      )
        .map((field) => [field.id, validateAnswer(field, answers[field.id])])
        .filter(([, message]) => !!message),
    ) as Record<string, string>;
    setFieldErrors(errors);
    const missing = displayFields.find((field) => !!errors[field.id]);
    if (missing) {
      setError(`Check “${missing.label}”: ${errors[missing.id]}`);
      if (finalStep)
        setStep(
          sections.findIndex((section) => section.id === missing.sectionId),
        );
      focusTarget.current = { kind: "field", id: missing.id };
      return;
    }
    if (!finalStep) {
      focusTarget.current = { kind: "heading" };
      setStep(step + 1);
      return;
    }
    if (preview) {
      setFeedback(
        "This is a preview. Return to the builder and publish before collecting responses.",
      );
      return;
    }
    if (!navigator.onLine) {
      focusTarget.current = { kind: "error" };
      setError(
        "Reconnect to submit. Keep this page open; final responses are never queued offline.",
      );
      return;
    }
    const visible = visibleFields(
      definition.fields,
      answers,
      definition.sections,
    );
    const submittedAnswers = Object.fromEntries(
      Object.entries(answers).filter(([id]) =>
        visible.some((field) => field.id === id),
      ),
    );
    const body = editToken.current
      ? {
          versionId: form.versionId,
          answers: submittedAnswers,
          respondent: identity.data,
          copyRequested,
          editToken: editToken.current,
          revision: editRevision.current,
          ...(tokens.access ? { accessToken: tokens.access } : {}),
        }
      : {
          versionId: form.versionId,
          answers: submittedAnswers,
          respondent: identity.data,
          copyRequested,
          website: "",
          ...(tokens.access ? { accessToken: tokens.access } : {}),
          ...(resumeToken.current ? { resumeToken: resumeToken.current } : {}),
          uploadToken,
        };
    await dispatch(
      prepareRespondentWrite(
        slug!,
        editToken.current ? "edits" : "submissions",
        body,
        form.respondentContext?.source === "account",
        editToken.current ? responseId.current || undefined : undefined,
      ),
    );
  };
  const save = async () => {
    if (
      operation.current ||
      uncertain ||
      stopped ||
      blocked ||
      writeConflict ||
      uploading.length ||
      !navigator.onLine
    )
      return;
    const identity = formRespondentSchema.safeParse(respondent);
    if (!identity.success) {
      rejectIdentity(identity.error.issues);
      return;
    }
    setIdentityErrors({});
    setError("");
    const visible = visibleFields(
        definition.fields,
        answers,
        definition.sections,
      ),
      safe = Object.fromEntries(
        Object.entries(answers).filter(([id]) =>
          visible.some((field) => field.id === id),
        ),
      ),
      resume =
        resumeToken.current ||
        btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");
    await dispatch(
      prepareRespondentWrite(
        slug!,
        "drafts",
        {
          versionId: form.versionId,
          answers: safe,
          respondent: identity.data,
          copyRequested,
          resumeToken: resume,
          draftRevision: draftRevision.current,
          uploadToken,
          ...(tokens.access ? { accessToken: tokens.access } : {}),
        },
        form.respondentContext?.source === "account",
      ),
    );
  };
  return (
    <div
      className="gt-public-form-page"
      data-form-theme={settings.theme === "charcoal" ? "charcoal" : "coral"}
    >
      {preview && (
        <div className="gt-form-preview-note">
          <Badge tone="coral">Preview</Badge> You’re viewing the current draft.
          Submissions are disabled.
          <Link to={`/admin/forms/${form.id}/edit`}>Back to builder</Link>
        </div>
      )}
      {!online && !submitted && (
        <div className="gt-public-form-sheet" role="status">
          <p>
            You’re offline. Your current answers remain in this open tab.
            Reconnect to submit or save a private resume link. Reloading or
            closing this tab can lose unsaved answers.
          </p>
        </div>
      )}
      <div className="gt-public-form-sheet">
        <div className="gt-form-peach-band" />
        {uncertain && (
          <RespondentWriteRecovery
            key={uncertain.key}
            intent={uncertain}
            onConfirmed={(result) => confirmed(uncertain, result)}
            onDenied={() => clearRespondent(true)}
            onBusy={setRecoveryBusy}
            onAbandon={() => clearRespondent()}
          />
        )}

        {submitted ? (
          <div className="gt-success">
            <CheckCircle2 size={48} />
            <h1 ref={heading} tabIndex={-1}>
              Response submitted.
            </h1>
            <p>{settings.confirmation}</p>
            <p className="gt-helper">
              Your response is saved securely. Reference: {responseId.current}
            </p>
            {copyRequested && (
              <p role="status">
                {copyQueued
                  ? `A copy of your questions and answers is queued for ${respondent.email}. No confirmation step is needed.`
                  : "Your response is saved, but an email copy could not be queued. Email may be unavailable or the copy limit reached."}
              </p>
            )}
            {settings.editing && editToken.current && (
              <Button
                variant="secondary"
                onClick={() => {
                  focusTarget.current = { kind: "heading" };
                  setSubmitted(false);
                  setStep(0);
                }}
              >
                Review your answers
              </Button>
            )}
            <Link to="/events">
              Explore upcoming events <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <>
            <div className="gt-public-form-intro">
              {settings.headerMedia && (
                <FormImage
                  header
                  id={formImageId(settings.headerMedia)}
                  alt={settings.headerAlt || ""}
                />
              )}
              <span className="gt-section-note">
                GDG on Campus · Georgia Tech
              </span>
              <h1>{definition.title}</h1>
              <p>{definition.description}</p>
              <div className="gt-form-progress-label">
                <span>
                  {review
                    ? "Review your response"
                    : `Section ${step + 1} of ${sections.length}`}
                </span>
                <Badge tone="success">
                  {preview ? "Draft preview" : "Chapter form"}
                </Badge>
              </div>
              {settings.progress !== false && (
                <div
                  className="gt-form-progress"
                  role="progressbar"
                  aria-label="Form progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(
                    (Math.min(step + 1, sections.length) / sections.length) *
                      100,
                  )}
                >
                  <span
                    style={{
                      width: `${(Math.min(step + 1, sections.length) / sections.length) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <form
              noValidate
              ref={formRef}
              className="gt-public-form-questions"
              aria-busy={pending || recoveryBusy || uploading.length > 0}
              onSubmit={next}
            >
              <h2 tabIndex={-1} ref={heading}>
                {review ? "One last look." : section.title}
              </h2>
              <p className="gt-helper">
                {review
                  ? "Make sure everything looks right before saving your response."
                  : "Fields marked * are required."}
              </p>
              {error && (
                <div
                  className="gt-form-error"
                  role="alert"
                  tabIndex={-1}
                  ref={(node) => {
                    errorFeedback.current = node;
                  }}
                >
                  {error}
                </div>
              )}
              {writeConflict && !uncertain && (
                <details>
                  <summary>Review loading current saved answers</summary>
                  <p>
                    Loading replaces the answers and identity shown in this tab
                    with the current saved response, saved draft or current form
                    questions. Your typed changes and unsaved copy choice will
                    be discarded.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || uploading.length > 0 || !online}
                    onClick={() => {
                      setWriteConflict(false);
                      setError("");
                      setFieldErrors({});
                      setIdentityErrors({});
                      setStep(0);
                      setAnswers({});
                      setCopyRequested(false);
                      setSavedLink("");
                      setTokens({
                        ...tokens,
                        resume: editToken.current
                          ? undefined
                          : resumeToken.current,
                        edit: editToken.current,
                        upload: uploadToken,
                      });
                      setLoadAttempt((value) => value + 1);
                    }}
                  >
                    {editToken.current
                      ? "Load current response and discard typed changes"
                      : resumeToken.current
                        ? "Load current draft and discard typed changes"
                        : "Reload questions and discard typed changes"}
                  </Button>
                </details>
              )}
              {step === 0 && (
                <fieldset className="gt-form">
                  <legend>Your details</legend>
                  <p className="gt-helper">
                    Name and email are required.{" "}
                    {respondentLabel(
                      form.respondentContext?.source || "self_reported",
                    )}
                    .
                  </p>
                  <Field label="Your name *">
                    <input
                      id="respondent-name"
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                      value={respondent.name}
                      readOnly={!!form.respondentContext?.locked}
                      disabled={pending || !!uncertain}
                      aria-invalid={!!identityErrors.name}
                      aria-describedby={
                        identityErrors.name
                          ? "respondent-name-error"
                          : undefined
                      }
                      onChange={(e) => {
                        setError("");
                        setIdentityErrors((v) => ({ ...v, name: "" }));
                        setRespondent((v) => ({ ...v, name: e.target.value }));
                      }}
                    />
                  </Field>
                  {identityErrors.name && (
                    <p id="respondent-name-error" className="gt-form-error">
                      {identityErrors.name}
                    </p>
                  )}
                  <Field
                    label="Your email *"
                    hint="If you request a copy, it goes only to this address. Check it carefully."
                  >
                    <input
                      id="respondent-email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={respondent.email}
                      readOnly={!!form.respondentContext?.email}
                      disabled={pending || !!uncertain}
                      aria-invalid={!!identityErrors.email}
                      aria-describedby={
                        identityErrors.email
                          ? "respondent-email-error"
                          : undefined
                      }
                      onChange={(e) => {
                        setError("");
                        setIdentityErrors((v) => ({ ...v, email: "" }));
                        setRespondent((v) => ({ ...v, email: e.target.value }));
                      }}
                    />
                  </Field>
                  {identityErrors.email && (
                    <p id="respondent-email-error" className="gt-form-error">
                      {identityErrors.email}
                    </p>
                  )}
                </fieldset>
              )}
              {review ? (
                <div className="gt-response-answers">
                  <div>
                    <strong>Your details</strong>
                    <p>
                      {respondent.name}
                      <br />
                      {respondent.email}
                    </p>
                  </div>
                  {visibleFields(displayFields, answers, definition.sections)
                    .filter(
                      (field) =>
                        !["divider", "title", "description", "image"].includes(
                          field.type,
                        ),
                    )
                    .map((field) => (
                      <div key={field.id}>
                        <strong>{field.label}</strong>
                        <p style={{ whiteSpace: "pre-wrap" }}>
                          {reviewAnswer(
                            answers[field.id],
                            field.type,
                            fileNames,
                          )}
                        </p>
                      </div>
                    ))}
                </div>
              ) : (
                <fieldset
                  className="gt-form-answer-controls"
                  disabled={pending || !!uncertain}
                  aria-label="Form questions"
                >
                  {fields.map((field) => (
                    <FieldRenderer
                      key={field.id}
                      field={field}
                      value={answers[field.id]}
                      error={fieldErrors[field.id]}
                      fileControl={
                        field.type === "file" && !preview ? (
                          <RespondentFileField
                            field={field}
                            value={
                              Array.isArray(answers[field.id])
                                ? (answers[field.id] as string[])
                                : []
                            }
                            context={{
                              slug: slug!,
                              versionId: form.versionId,
                              uploadToken,
                              accessToken: tokens.access,
                              protected:
                                form.respondentContext?.source === "account",
                            }}
                            readOnly={!!editToken.current}
                            error={fieldErrors[field.id]}
                            onAccessDenied={() => clearRespondent(true)}
                            onBusy={(busy) =>
                              setUploading((previous) =>
                                busy
                                  ? [...new Set([...previous, field.id])]
                                  : previous.filter((id) => id !== field.id),
                              )
                            }
                            onName={(id, name) =>
                              setFileNames((previous) =>
                                previous[id] === name
                                  ? previous
                                  : { ...previous, [id]: name },
                              )
                            }
                            onChange={(value) =>
                              setAnswers((previous) => ({
                                ...previous,
                                [field.id]: value,
                              }))
                            }
                          />
                        ) : undefined
                      }
                      onChange={(value) => {
                        setError("");
                        setFieldErrors((previous) => ({
                          ...previous,
                          [field.id]: "",
                        }));
                        setAnswers((previous) => ({
                          ...previous,
                          [field.id]: value,
                        }));
                      }}
                    />
                  ))}
                </fieldset>
              )}
              {finalStep && (
                <div className="gt-form">
                  <label className="gt-check">
                    <input
                      type="checkbox"
                      checked={copyRequested}
                      disabled={
                        pending ||
                        !!uncertain ||
                        (!preview && !form.copyAvailable)
                      }
                      onChange={(e) => setCopyRequested(e.target.checked)}
                    />
                    Email me a copy of my completed response
                  </label>
                  <p className="gt-helper">
                    {!preview && !form.copyAvailable
                      ? "Email copies are currently unavailable; you can still submit your response."
                      : `Sent only to ${respondent.email || "the email you enter above"}, including all questions and answers you provide, even sensitive answers. No extra verification. Files are listed by name, not attached. Email copies cannot be recalled.`}
                  </p>
                </div>
              )}
              <div className="gt-form-step-actions">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || !!uncertain || uploading.length > 0}
                    onClick={() => {
                      focusTarget.current = { kind: "heading" };
                      setStep(step - 1);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} /> Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    !!uncertain ||
                    writeConflict ||
                    uploading.length > 0 ||
                    (preview && finalStep) ||
                    (!online && finalStep)
                  }
                >
                  {pending ? "Saving…" : finalStep ? "Submit response" : "Next"}
                  <ArrowRight size={17} />
                </Button>
              </div>
              {settings.resume && !preview && !editToken.current && (
                <button
                  disabled={
                    pending ||
                    !!uncertain ||
                    writeConflict ||
                    uploading.length > 0 ||
                    !online
                  }
                  type="button"
                  className="gt-save-resume"
                  onClick={save}
                >
                  <Save size={15} />
                  Save and resume later
                </button>
              )}
              <p className="gt-helper" role="status">
                {feedback}
              </p>
            </form>
          </>
        )}
        <div className="gt-public-form-privacy">
          <ShieldCheck size={15} />
          <span>
            Your answers are available to authorized chapter reviewers and, if
            requested, emailed to the address you entered.{" "}
            <Link to="/privacy">Privacy notice</Link>
          </span>
        </div>
      </div>
      {savedLink && (
        <div className="gt-public-form-sheet">
          <h2>Your private {editToken.current ? "edit" : "resume"} link</h2>
          <p>
            Anyone with this link can access your response. Save it privately;
            do not share it.
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(savedLink);
                setFeedback("Private link copied.");
              } catch {
                focusTarget.current = { kind: "status" };
                setFeedback("The private link could not be copied. Try again.");
              }
            }}
          >
            Copy private link
          </Button>
          <p role="status" tabIndex={-1} ref={statusFeedback}>
            {feedback}
          </p>
        </div>
      )}
      {!submitted && (
        <p className="gt-form-bottom-note">
          Your response is not saved until you complete the final step.
        </p>
      )}
    </div>
  );
}
