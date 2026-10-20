import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, EmptyState } from "../primitives";
import {
  visibleFields,
  validateAnswer,
  type Answer,
  type FormDefinition,
} from "./store";
import FieldRenderer from "./FieldRenderer";
import { api, ApiFailure } from "@/lib/api";
type RespondentForm = FormDefinition & {
  id: string;
  slug: string;
  status: string;
  versionId: string;
  version: number;
};

export default function PublicForm() {
  const { slug } = useParams(),
    [params] = useSearchParams(),
    preview = params.get("preview") === "1";
  const [form, setForm] = useState<RespondentForm>(),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [pending, setPending] = useState(false),
    [savedLink, setSavedLink] = useState("");
  const [tokens] = useState(() => {
    const values = new URLSearchParams(window.location.hash.slice(1));
    return {
      access: values.get("access") || undefined,
      resume: values.get("resume") || undefined,
      edit: values.get("edit") || undefined,
    };
  });
  const definition = form,
    editToken = useRef(tokens.edit),
    resumeToken = useRef(tokens.resume),
    editRevision = useRef(0),
    submission = useRef<{ payload: string; key: string }>();
  const [answers, setAnswers] = useState<Record<string, Answer>>({}),
    [step, setStep] = useState(0),
    [submitted, setSubmitted] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const heading = useRef<HTMLHeadingElement>(null),
    formRef = useRef<HTMLFormElement>(null);
  const responseId = useRef<string | null>(null);
  const formId = form?.id,
    formTitle = form?.title;
  useEffect(() => {
    if (formId) document.title = `${formTitle} · GDG at Georgia Tech`;
  }, [formId, formTitle]);
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = meta?.content;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow, noarchive";
    return () => {
      if (previous !== undefined) meta!.content = previous;
      else meta?.remove();
    };
  }, []);
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const load = async () => {
      if (tokens.edit && !preview) {
        const data = await api<{
          form: RespondentForm;
          responseId: string;
          revision: number;
          answers: Record<string, Answer>;
        }>(`/forms/${slug}/edits/load`, {
          method: "POST",
          body: {
            editToken: tokens.edit,
            ...(tokens.access ? { accessToken: tokens.access } : {}),
          },
          signal: controller.signal,
        });
        setForm(data.form);
        setAnswers(data.answers);
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
        setForm(data.form);
        if (tokens.resume && !preview) {
          const draft = await api<{ answers: Record<string, Answer> }>(
            `/forms/${slug}/drafts/load`,
            {
              method: "POST",
              body: {
                resumeToken: tokens.resume,
                ...(tokens.access ? { accessToken: tokens.access } : {}),
              },
              signal: controller.signal,
            },
          );
          setAnswers(draft.answers);
          setFeedback("Your saved draft was restored.");
        }
      }
    };
    load()
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, preview, tokens]);
  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);
  if (loading || loadError || !form || !definition)
    return (
      <div className="gt-public-form-page">
        <EmptyState
          title={loading ? "Loading your form…" : "This form isn’t available"}
          action={<Link to="/">Return home</Link>}
        >
          {loadError ||
            "It may be a draft, archived, or require a valid access link."}
        </EmptyState>
      </div>
    );
  const settings = definition.settings;
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
          <p>This form is not accepting new responses right now.</p>
          <Link to="/contact">Contact the chapter</Link>
        </div>
      </div>
    );
  const section =
    definition.sections[Math.min(step, definition.sections.length - 1)];
  const fields = visibleFields(definition.fields, answers).filter(
    (field) => field.sectionId === section.id,
  );
  const review = step >= definition.sections.length;
  const next = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const errors = Object.fromEntries(
      (review ? visibleFields(definition.fields, answers) : fields)
        .map((field) => [field.id, validateAnswer(field, answers[field.id])])
        .filter(([, message]) => !!message),
    ) as Record<string, string>;
    setFieldErrors(errors);
    const missing = definition.fields.find((field) => !!errors[field.id]);
    if (missing) {
      setError(`Check “${missing.label}”: ${errors[missing.id]}`);
      if (review)
        setStep(
          definition.sections.findIndex(
            (section) => section.id === missing.sectionId,
          ),
        );
      requestAnimationFrame(() =>
        document.getElementById(`field-${missing.id}`)?.focus(),
      );
      return;
    }
    if (!review) {
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
      setError(
        "Reconnect to submit. Keep this page open; final responses are never queued offline.",
      );
      return;
    }
    const visible = visibleFields(definition.fields, answers);
    const submittedAnswers = Object.fromEntries(
      Object.entries(answers).filter(([id]) =>
        visible.some((field) => field.id === id),
      ),
    );
    const body = editToken.current
      ? {
          versionId: form.versionId,
          answers: submittedAnswers,
          editToken: editToken.current,
          revision: editRevision.current,
          ...(tokens.access ? { accessToken: tokens.access } : {}),
        }
      : {
          versionId: form.versionId,
          answers: submittedAnswers,
          website: "",
          ...(tokens.access ? { accessToken: tokens.access } : {}),
          ...(resumeToken.current ? { resumeToken: resumeToken.current } : {}),
        };
    const payload = JSON.stringify(body);
    if (submission.current?.payload !== payload)
      submission.current = { payload, key: crypto.randomUUID() };
    setPending(true);
    try {
      const result = await api<{
        responseId: string;
        editToken?: string;
        revision?: number;
      }>(`/forms/${slug}/${editToken.current ? "edits" : "submissions"}`, {
        method: "POST",
        body,
        idempotencyKey: submission.current.key,
      });
      responseId.current = result.responseId;
      editToken.current = result.editToken || editToken.current;
      if (result.revision !== undefined) editRevision.current = result.revision;
      if (editToken.current)
        setSavedLink(
          window.location.origin +
            window.location.pathname +
            "#edit=" +
            editToken.current,
        );
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiFailure && e.fields) setFieldErrors(e.fields);
    } finally {
      setPending(false);
    }
  };
  const save = async () => {
    setPending(true);
    setError("");
    try {
      const visible = visibleFields(definition.fields, answers),
        safe = Object.fromEntries(
          Object.entries(answers).filter(([id]) =>
            visible.some((f) => f.id === id),
          ),
        );
      const result = await api<{ resumeToken: string; expiresInDays: number }>(
        `/forms/${slug}/drafts`,
        {
          method: "POST",
          body: {
            versionId: form.versionId,
            answers: safe,
            ...(resumeToken.current
              ? { resumeToken: resumeToken.current }
              : {}),
            ...(tokens.access ? { accessToken: tokens.access } : {}),
          },
        },
      );
      resumeToken.current = result.resumeToken;
      const fragment = new URLSearchParams({
        resume: result.resumeToken,
        ...(tokens.access ? { access: tokens.access } : {}),
      });
      setSavedLink(
        window.location.origin + window.location.pathname + "#" + fragment,
      );
      setFeedback(
        `Draft saved securely for ${result.expiresInDays} days. Keep your private resume link.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="gt-public-form-page">
      {preview && (
        <div className="gt-form-preview-note">
          <Badge tone="coral">Preview</Badge> You’re viewing the current draft.
          Submissions are disabled.
          <Link to={`/admin/forms/${form.id}/edit`}>Back to builder</Link>
        </div>
      )}
      <div className="gt-public-form-sheet">
        <div className="gt-form-peach-band" />
        {submitted ? (
          <div className="gt-success">
            <CheckCircle2 size={48} />
            <h1>Response submitted.</h1>
            <p>{settings.confirmation}</p>
            <p className="gt-helper">
              Your response is saved securely. Reference: {responseId.current}
            </p>
            {settings.editing && editToken.current && (
              <Button
                variant="secondary"
                onClick={() => {
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
              <span className="gt-section-note">
                GDG on Campus · Georgia Tech
              </span>
              <h1>{definition.title}</h1>
              <p>{definition.description}</p>
              <div className="gt-form-progress-label">
                <span>
                  {review
                    ? "Review your response"
                    : `Section ${step + 1} of ${definition.sections.length}`}
                </span>
                <Badge tone="success">
                  {preview ? "Draft preview" : "Chapter form"}
                </Badge>
              </div>
              <div
                className="gt-form-progress"
                role="progressbar"
                aria-label="Form progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(
                  (Math.min(step + 1, definition.sections.length) /
                    definition.sections.length) *
                    100,
                )}
              >
                <span
                  style={{
                    width: `${(Math.min(step + 1, definition.sections.length) / definition.sections.length) * 100}%`,
                  }}
                />
              </div>
            </div>
            <form
              noValidate
              ref={formRef}
              className="gt-public-form-questions"
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
                <div className="gt-form-error" role="alert">
                  {error}
                </div>
              )}
              {review ? (
                <div className="gt-response-answers">
                  {visibleFields(definition.fields, answers)
                    .filter(
                      (field) =>
                        !["divider", "title", "description", "image"].includes(
                          field.type,
                        ),
                    )
                    .map((field) => (
                      <div key={field.id}>
                        <strong>{field.label}</strong>
                        <p>
                          {Array.isArray(answers[field.id])
                            ? (answers[field.id] as string[]).join(", ")
                            : typeof answers[field.id] === "object"
                              ? JSON.stringify(answers[field.id])
                              : String(answers[field.id] || "Not answered")}
                        </p>
                      </div>
                    ))}
                </div>
              ) : (
                fields.map((field) => (
                  <FieldRenderer
                    key={field.id}
                    field={field}
                    value={answers[field.id]}
                    error={fieldErrors[field.id]}
                    onChange={(value) => {
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
                ))
              )}
              <div className="gt-form-step-actions">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setStep(step - 1);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} /> Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" disabled={pending || (preview && review)}>
                  {pending ? "Saving…" : review ? "Submit response" : "Next"}
                  <ArrowRight size={17} />
                </Button>
              </div>
              {settings.resume && !preview && !editToken.current && (
                <button
                  disabled={pending}
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
            Your answers are shared only with authorized chapter reviewers.{" "}
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
                setError("The link could not be copied.");
              }
            }}
          >
            Copy private link
          </Button>
          <p role="status">{feedback}</p>
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
