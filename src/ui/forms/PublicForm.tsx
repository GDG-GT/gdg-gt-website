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
  formsStore,
  useForms,
  useResponses,
  visibleFields,
  validateAnswer,
  type Answer,
} from "./store";
import FieldRenderer from "./FieldRenderer";

export default function PublicForm() {
  const { slug } = useParams(),
    [params] = useSearchParams(),
    forms = useForms(),
    responses = useResponses();
  const form = forms.find((item) => item.slug === slug),
    preview = params.get("preview") === "1";
  const version = form?.versions[form.versions.length - 1],
    definition = preview ? form : version;
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
    if (!formId) return;
    document.title = `${formTitle} · GDG at Georgia Tech`;
    try {
      const saved = localStorage.getItem(`gdg-form-draft-${formId}`);
      if (saved) {
        setAnswers(JSON.parse(saved));
        setFeedback("Your local draft was restored.");
      }
    } catch {
      /* Use an empty draft when storage is unavailable. */
    }
  }, [formId, formTitle]);
  useEffect(() => {
    if (step) heading.current?.focus();
  }, [step]);
  if (!form || !definition)
    return (
      <div className="gt-public-form-page">
        <EmptyState
          title="This form isn’t available"
          action={<Link to="/">Return home</Link>}
        >
          It may be a draft, closed, or unavailable in this local preview.
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
      (settings.closesAt && new Date(settings.closesAt) < new Date()) ||
      (settings.limit > 0 &&
        responses.filter((response) => response.formId === form.id).length >=
          settings.limit));
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
  if (!preview && settings.access !== "public")
    return (
      <div className="gt-public-form-page">
        <div className="gt-public-form-sheet">
          <ShieldCheck size={34} />
          <h1>{definition.title}</h1>
          <p>
            This form requires{" "}
            {settings.access === "verified"
              ? "a verified email address"
              : settings.access === "internal"
                ? "chapter member access"
                : "a valid access link"}
            .
          </p>
          <p className="gt-helper">
            Identity verification is not connected in this UI preview. No
            responses can be collected in this access mode yet.
          </p>
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
  const next = (event: FormEvent) => {
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
        "This is a preview. Return to the builder and publish to collect local sample responses.",
      );
      return;
    }
    if (!navigator.onLine) {
      setError(
        "Reconnect to submit. You can save a local draft while offline.",
      );
      return;
    }
    const visible = visibleFields(definition.fields, answers);
    responseId.current ||= crypto.randomUUID();
    formsStore.submit({
      id: responseId.current,
      formId: form.id,
      version: version?.version || 1,
      submittedAt: new Date().toISOString(),
      answers: Object.fromEntries(
        Object.entries(answers).filter(([id]) =>
          visible.some((field) => field.id === id),
        ),
      ),
    });
    localStorage.removeItem(`gdg-form-draft-${form.id}`);
    setSubmitted(true);
  };
  const save = () => {
    try {
      localStorage.setItem(
        `gdg-form-draft-${form.id}`,
        JSON.stringify(answers),
      );
      setFeedback(
        "Draft saved in this browser. Return to this address to resume.",
      );
    } catch {
      setError(
        "This browser could not save your draft. Keep this page open and try again.",
      );
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
            <h1>Response saved locally.</h1>
            <p>{settings.confirmation}</p>
            <p className="gt-helper">
              This is a sample response stored in your browser. No production
              submission or receipt email was sent.
            </p>
            {settings.editing && (
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
                  {preview ? "Draft preview" : "Local sample form"}
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
                <Button type="submit" disabled={preview && review}>
                  {review ? "Save local response" : "Next"}
                  <ArrowRight size={17} />
                </Button>
              </div>
              {settings.resume && (
                <button type="button" className="gt-save-resume" onClick={save}>
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
            Local UI preview. Please use fictional information.{" "}
            <Link to="/privacy">Privacy notice</Link>
          </span>
        </div>
      </div>
      {!submitted && (
        <p className="gt-form-bottom-note">
          Your response is not saved until you complete the final step.
        </p>
      )}
    </div>
  );
}
