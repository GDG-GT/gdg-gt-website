import { useEffect, useRef, useState, useCallback } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  GripVertical,
  History,
  Laptop,
  Plus,
  Redo2,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import { reconcileOptionIds } from "./store";
import {
  fieldTypes,
  newField,
  formImageId,
  validateDefinition,
  duplicateSection,
  type FieldType,
  type PreviewForm,
} from "./store";
import FieldRenderer from "./FieldRenderer";
import FormImage from "./FormImage";
import FormImagePicker from "./FormImagePicker";
import FieldValidationSettings from "./FieldValidationSettings";
import { canShuffleQuestions } from "../../../shared/form-presentation";
import { formsApi, useServerForm, draftDefinition } from "./api";
import FormWriteRecovery, { type FormWriteIntent } from "./FormWriteRecovery";
import AccessPanel, { type AccessWorkState } from "./AccessPanel";
import SectionLogic from "./SectionLogic";
import VersionHistory from "./VersionHistory";
import DeliveryPanel from "./DeliveryPanel";
const signature = (value: PreviewForm) =>
  JSON.stringify([
    value.slug,
    value.title,
    value.description,
    value.fields,
    value.sections,
    value.settings,
    value.teamId,
  ]);

export default function FormBuilder() {
  const { currentAdmin } = useAdmin(),
    { formId } = useParams(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <FormBuilderContent
      key={`${currentAdmin.id}:${currentAdmin.role}:${formId || "missing"}:${epoch}`}
    />
  );
}
function FormBuilderContent() {
  const navigationSafety = useNavigationSafety();
  const { formId } = useParams(),
    server = useServerForm(formId),
    source = server.form,
    navigate = useNavigate(),
    { isOnline } = useOnlineStatus();
  const [form, setForm] = useState<PreviewForm | null>(() =>
    source ? structuredClone(source) : null,
  );
  const [selected, setSelected] = useState(source?.fields[0]?.id || ""),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("Field"),
    [saveStatus, setSaveStatus] = useState("Loading draft…"),
    [mobile, setMobile] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [deliveryOpen, setDeliveryOpen] = useState(false),
    [deliveryState, setDeliveryState] = useState({ dirty: false, busy: false }),
    [accessState, setAccessState] = useState<AccessWorkState>({
      dirty: false,
      busy: false,
      uncertain: false,
    }),
    [publishOpen, setPublishOpen] = useState(false),
    [saveError, setSaveError] = useState(""),
    [publishing, setPublishing] = useState(false),
    [remoteConflict, setRemoteConflict] = useState(false),
    [loadReview, setLoadReview] = useState(false);
  const [uncertainWrite, setUncertainWrite] = useState<FormWriteIntent>(),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const undo = useRef<PreviewForm[]>([]),
    redo = useRef<PreviewForm[]>([]),
    dragged = useRef<string | null>(null);
  const latest = useRef(form);
  latest.current = form;
  const revision = useRef<number>(),
    queue = useRef<Promise<PreviewForm | undefined>>(
      Promise.resolve(undefined),
    ),
    saved = useRef(""),
    mounted = useRef(true),
    generation = useRef(0),
    publicationPending = useRef(false),
    activeWrites = useRef(new Set<AbortController>()),
    titleInput = useRef<HTMLInputElement>(null),
    sourceSeen = useRef<PreviewForm>(),
    allowed = useRef(false),
    serverRef = useRef(server),
    unconfirmed = useRef(false);
  serverRef.current = server;
  unconfirmed.current = !!uncertainWrite && !recoveryConfirmed;
  const ready =
    !!source &&
    !server.loading &&
    !server.error &&
    !server.denied &&
    isOnline &&
    !remoteConflict;
  allowed.current = ready;
  const invalidateWrites = useCallback(() => {
    generation.current++;
    for (const controller of activeWrites.current) controller.abort();
    activeWrites.current.clear();
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateWrites();
    };
  }, [invalidateWrites]);
  const clearPrivate = useCallback(() => {
    invalidateWrites();
    queue.current = Promise.resolve(undefined);
    latest.current = null;
    setForm(null);
    setSelected("");
    undo.current = [];
    redo.current = [];
    setSaveError("");
    setPublishOpen(false);
    setHistoryOpen(false);
    setDeliveryOpen(false);
    setLoadReview(false);
    setUncertainWrite(undefined);
    setRecoveryBusy(false);
    setRecoveryConfirmed(false);
    setRemoteConflict(false);
    setPublishing(false);
    publicationPending.current = false;
    revision.current = undefined;
    saved.current = "";
  }, [invalidateWrites]);
  useEffect(() => {
    if (server.denied) clearPrivate();
  }, [server.denied, clearPrivate]);
  useEffect(() => {
    if (source && !latest.current) {
      setForm(structuredClone(source));
      setSelected(source.fields[0]?.id || "");
      revision.current = source.revision;
      saved.current = signature(source);
      setSaveStatus("Saved");
      sourceSeen.current = source;
    } else if (source && sourceSeen.current !== source) {
      sourceSeen.current = source;
      if (source.revision !== revision.current) setRemoteConflict(true);
      else
        setForm((value) =>
          value ? { ...value, actions: source.actions } : value,
        );
    }
  }, [source]);
  const persist = useCallback(
    (snapshot: PreviewForm) => {
      const operationGeneration = generation.current;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (
            !mounted.current ||
            operationGeneration !== generation.current ||
            !allowed.current ||
            !navigator.onLine
          )
            throw new DOMException(
              "The form editor context is paused or changed.",
              "AbortError",
            );
          if (saved.current === signature(snapshot)) return snapshot;
          if (serverRef.current.form?.status === "Archived")
            throw new ApiFailure(
              409,
              "FORM_ARCHIVED",
              "Restore the archived form as a private draft before saving changes.",
            );
          if (!serverRef.current.form?.actions?.includes("edit"))
            throw new ApiFailure(
              403,
              "FORBIDDEN",
              "Current form editing permission is required before saving changed questions.",
            );
          const controller = new AbortController();
          activeWrites.current.add(controller);
          const intent: FormWriteIntent = {
            action: "draft",
            key: crypto.randomUUID(),
            startedAt: Date.now(),
            snapshot: {
              ...structuredClone(snapshot),
              ...draftDefinition(snapshot),
              revision: revision.current,
            },
          };
          setSaveStatus("Saving…");
          setSaveError("");
          try {
            const result = await formsApi.save(
              intent.snapshot,
              controller.signal,
              intent.key,
            );
            if (
              !mounted.current ||
              controller.signal.aborted ||
              operationGeneration !== generation.current
            )
              throw new DOMException(
                "The form editor context changed.",
                "AbortError",
              );
            revision.current = result.revision;
            saved.current = signature(snapshot);
            setSaveStatus(
              latest.current && signature(latest.current) === saved.current
                ? "Saved"
                : "Unsaved changes",
            );
            return result;
          } catch (e) {
            if (
              !mounted.current ||
              controller.signal.aborted ||
              operationGeneration !== generation.current
            )
              throw e;
            if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
              clearPrivate();
              serverRef.current.clear();
              throw e;
            }
            if (!(e instanceof ApiFailure) || e.status !== 400) {
              allowed.current = false;
              setRemoteConflict(true);
              if (!(e instanceof ApiFailure) || e.status >= 500) {
                setUncertainWrite(intent);
                setRecoveryConfirmed(false);
              }
            }
            setSaveStatus("Not saved");
            setSaveError(
              e instanceof TypeError
                ? "The save response was interrupted. Recheck its outcome before trying again."
                : (e as Error).message,
            );
            throw e;
          } finally {
            activeWrites.current.delete(controller);
          }
        });
      return queue.current;
    },
    [clearPrivate],
  );
  useEffect(() => {
    if (
      !form ||
      !ready ||
      source?.status === "Archived" ||
      publishing ||
      saved.current === signature(form) ||
      !form.actions?.includes("edit")
    )
      return;
    setSaveStatus("Unsaved changes");
    const timer = setTimeout(() => {
      void persist(structuredClone(form)).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [form, persist, ready, publishing, source?.status]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        unconfirmed.current ||
        (latest.current && saved.current !== signature(latest.current))
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useDraftGuard(
    unconfirmed.current || (!!form && saved.current !== signature(form)),
    {
      busy: publishing || recoveryBusy || saveStatus === "Saving…",
      label:
        unconfirmed.current && uncertainWrite
          ? `Form changes with an unconfirmed ${uncertainWrite.action === "draft" ? "save" : "publication"}; it may already have completed`
          : "Form definition changes",
    },
  );
  if (!form || server.denied)
    return (
      <div className="gt-admin-page">
        {server.loading ? (
          <div role="status" aria-label="Loading form builder">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">Loading your form…</span>
          </div>
        ) : (
          <EmptyState
            title={
              server.denied
                ? "Form access needs to be rechecked"
                : "This form is not available"
            }
            action={
              <div className="gt-inline-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void server.reload();
                    document.getElementById("workspace-content")?.focus();
                  }}
                >
                  Try loading form again
                </Button>
                <Link to="/admin/forms">Back to forms</Link>
              </div>
            }
          >
            {server.error ||
              "Your saved draft could not be loaded from the chapter server."}
          </EmptyState>
        )}
      </div>
    );
  const archived = source?.status === "Archived";
  const editable =
      ready && !archived && !publishing && !!source?.actions?.includes("edit"),
    field = form.fields.find((item) => item.id === selected),
    issues = validateDefinition(form),
    canPreview =
      ready && !publishing && (saved.current === signature(form) || editable);
  const update = (next: PreviewForm) => {
    if (!editable) return;
    undo.current.push(structuredClone(form));
    redo.current = [];
    setForm(next);
  };
  const updateField = (values: Partial<NonNullable<typeof field>>) => {
    if (field)
      update({
        ...form,
        fields: form.fields.map((item) =>
          item.id === field.id
            ? {
                ...item,
                ...values,
                ...(values.options
                  ? {
                      optionIds: reconcileOptionIds(
                        item.options,
                        item.optionIds,
                        values.options,
                      ),
                    }
                  : {}),
                ...(values.columns
                  ? {
                      columnIds: reconcileOptionIds(
                        item.columns || [],
                        item.columnIds,
                        values.columns,
                      ),
                    }
                  : {}),
              }
            : item,
        ),
      });
  };
  const add = (
    type: FieldType,
    sectionId = form.sections[form.sections.length - 1].id,
  ) => {
    if (!editable) return;
    const item = newField(type, sectionId);
    update({ ...form, fields: [...form.fields, item] });
    setSelected(item.id);
    setPaletteOpen(false);
  };
  const move = (fieldId: string, delta: number) => {
    const fields = [...form.fields],
      index = fields.findIndex((item) => item.id === fieldId),
      section = fields[index]?.sectionId,
      peers = fields.flatMap((item, position) =>
        item.sectionId === section ? [position] : [],
      ),
      target = peers[peers.indexOf(index) + delta];
    if (!editable || index < 0 || target === undefined) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ ...form, fields });
  };
  const palette = (
    <>
      <div className="gt-builder-panel-title">
        <h2>{editable ? "Add a field" : "Field types"}</h2>
        <Plus size={17} />
      </div>
      <SearchBox
        value={query}
        onChange={setQuery}
        label="Search field types"
        placeholder="Find a field…"
      />
      {[...new Set(fieldTypes.map((item) => item[2]))].map((group) => (
        <div className="gt-palette-group" key={group}>
          <h3>{group}</h3>
          {fieldTypes
            .filter(
              (item) =>
                item[2] === group &&
                item[1].toLowerCase().includes(query.toLowerCase()),
            )
            .map(([type, label]) => (
              <button
                key={type}
                disabled={!editable}
                draggable={editable}
                onDragStart={(event) =>
                  event.dataTransfer.setData("field-type", type)
                }
                onClick={() => add(type)}
              >
                <Type size={15} />
                <span>{label}</span>
                <Plus size={14} />
              </button>
            ))}
        </div>
      ))}
    </>
  );
  const leaveAccess = (run: () => void) => {
    if (accessState.busy || accessState.uncertain) return;
    const leave = () => {
      setAccessState({ dirty: false, busy: false, uncertain: false });
      run();
    };
    if (tab === "Access" && accessState.dirty) navigationSafety.request(leave);
    else leave();
  };
  const inspector = (prefix: string) => (
    <>
      <div className="gt-builder-panel-title">
        <h2>Inspector</h2>
        <Settings2 size={17} />
      </div>
      {tab === "Access" && accessState.uncertain && (
        <p role="status">
          Check the original access outcome or review stopping recovery before
          leaving this panel.
        </p>
      )}
      <div className="gt-tabs" role="tablist" aria-label="Builder inspector">
        {["Field", "Logic", "Settings", "Access"].map((value, index, tabs) => (
          <button
            role="tab"
            id={`${prefix}-builder-tab-${value}`}
            aria-controls={`${prefix}-builder-panel`}
            tabIndex={tab === value ? 0 : -1}
            aria-selected={tab === value}
            key={value}
            disabled={
              value !== tab && (accessState.busy || accessState.uncertain)
            }
            onClick={() => {
              if (value !== tab) leaveAccess(() => setTab(value));
            }}
            onKeyDown={(event) => {
              const target =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (target < 0) return;
              event.preventDefault();
              if (accessState.busy || accessState.uncertain) return;
              leaveAccess(() => setTab(tabs[target]));
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons?.[target]?.focus();
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-builder-panel`}
        aria-labelledby={`${prefix}-builder-tab-${tab}`}
        tabIndex={0}
      >
        <fieldset
          className="gt-builder-definition-panel"
          disabled={!editable && tab !== "Access"}
          aria-label={`Form ${tab.toLowerCase()} controls`}
        >
          {tab === "Access" ? (
            prefix === "dialog" || !inspectorOpen ? (
              <AccessPanel
                form={form}
                onStateChange={setAccessState}
                onAccessChanged={() => {
                  void server.reload();
                }}
              />
            ) : null
          ) : tab === "Field" ? (
            field ? (
              <div className="gt-form">
                <Badge tone="coral">
                  {fieldTypes.find((item) => item[0] === field.type)?.[1]}
                </Badge>
                <Field
                  label={
                    field.type === "image"
                      ? "Image description (alt text)"
                      : "Question label"
                  }
                  required
                >
                  <input
                    value={field.label}
                    onChange={(event) =>
                      updateField({ label: event.target.value })
                    }
                  />
                </Field>
                {field.type === "image" && (
                  <FormImagePicker
                    scope={form.id + ":field:" + field.id}
                    label="Published image"
                    selected={field.imageMediaId}
                    onChange={(photo) =>
                      updateField({
                        imageMediaId: photo?.id,
                        imageWidth: photo?.width,
                        imageHeight: photo?.height,
                        ...(photo
                          ? {
                              label:
                                photo.alt_text ||
                                photo.description ||
                                field.label,
                            }
                          : {}),
                      })
                    }
                  />
                )}
                <Field label="Description">
                  <textarea
                    rows={3}
                    value={field.description}
                    onChange={(event) =>
                      updateField({ description: event.target.value })
                    }
                  />
                </Field>
                {!["image", "title", "description", "divider"].includes(
                  field.type,
                ) && (
                  <>
                    <label className="gt-toggle-row">
                      Required question
                      <input
                        type="checkbox"
                        role="switch"
                        checked={field.required}
                        onChange={(event) =>
                          updateField({ required: event.target.checked })
                        }
                      />
                    </label>
                    <label className="gt-toggle-row">
                      Sensitive answer
                      <input
                        type="checkbox"
                        role="switch"
                        checked={field.sensitive}
                        onChange={(event) =>
                          updateField({ sensitive: event.target.checked })
                        }
                      />
                    </label>
                  </>
                )}
                {[
                  "radio",
                  "checkbox",
                  "dropdown",
                  "likert",
                  "grid",
                  "ranking",
                ].includes(field.type) && (
                  <Field label="Options" hint="One option per line">
                    <textarea
                      rows={5}
                      value={field.options.join("\n")}
                      onChange={(event) =>
                        updateField({ options: event.target.value.split("\n") })
                      }
                    />
                  </Field>
                )}
                {["scale", "rating", "number"].includes(field.type) && (
                  <div className="gt-form-two">
                    <Field label="Minimum">
                      <input
                        type="number"
                        min={field.type === "number" ? undefined : 0}
                        max={field.type === "number" ? undefined : 9}
                        step={field.type === "number" ? "any" : 1}
                        value={field.min ?? (field.type === "number" ? "" : 1)}
                        onChange={(event) =>
                          updateField({
                            min:
                              event.target.value === ""
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Maximum">
                      <input
                        type="number"
                        step={field.type === "number" ? "any" : 1}
                        min={field.type === "number" ? undefined : 2}
                        max={field.type === "number" ? undefined : 10}
                        value={field.max ?? (field.type === "number" ? "" : 5)}
                        onChange={(event) =>
                          updateField({
                            max:
                              event.target.value === ""
                                ? undefined
                                : field.type === "number"
                                  ? Number(event.target.value)
                                  : Math.min(
                                      10,
                                      Math.max(2, Number(event.target.value)),
                                    ),
                          })
                        }
                      />
                    </Field>
                  </div>
                )}
                {["short", "long", "phone", "url"].includes(field.type) && (
                  <div className="gt-form-two">
                    <Field label="Minimum length">
                      <input
                        type="number"
                        min={0}
                        value={field.minLength ?? ""}
                        onChange={(event) =>
                          updateField({
                            minLength: event.target.value
                              ? Math.max(0, Number(event.target.value))
                              : undefined,
                          })
                        }
                      />
                    </Field>
                    <Field label="Maximum length">
                      <input
                        type="number"
                        min={1}
                        value={field.maxLength ?? ""}
                        onChange={(event) =>
                          updateField({
                            maxLength: event.target.value
                              ? Math.max(1, Number(event.target.value))
                              : undefined,
                          })
                        }
                      />
                    </Field>
                  </div>
                )}
                {field.type === "email" && (
                  <Field
                    label="Allowed email domain"
                    hint="Optional, for example gatech.edu. This is a format rule, not identity verification."
                  >
                    <input
                      value={field.allowedDomain || ""}
                      onChange={(event) =>
                        updateField({
                          allowedDomain: event.target.value
                            .trim()
                            .replace(/^@/, ""),
                        })
                      }
                      placeholder="Any email domain"
                    />
                  </Field>
                )}
                {field.type === "checkbox" && (
                  <Field
                    label="Maximum choices"
                    hint="Leave empty for no maximum"
                  >
                    <input
                      type="number"
                      min={1}
                      value={field.maxChoices ?? ""}
                      onChange={(event) =>
                        updateField({
                          maxChoices: event.target.value
                            ? Math.max(1, Number(event.target.value))
                            : undefined,
                        })
                      }
                    />
                  </Field>
                )}
                {["date", "datetime"].includes(field.type) && (
                  <>
                    <Field label="Earliest date">
                      <input
                        type={field.type === "date" ? "date" : "datetime-local"}
                        value={field.dateFrom || ""}
                        onChange={(event) =>
                          updateField({ dateFrom: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Latest date">
                      <input
                        type={field.type === "date" ? "date" : "datetime-local"}
                        value={field.dateTo || ""}
                        onChange={(event) =>
                          updateField({ dateTo: event.target.value })
                        }
                      />
                    </Field>
                  </>
                )}
                {["likert", "grid"].includes(field.type) && (
                  <Field
                    label="Grid columns"
                    hint="One column per line. The options above define your rows."
                  >
                    <textarea
                      rows={4}
                      value={(
                        field.columns || ["Disagree", "Neutral", "Agree"]
                      ).join("\n")}
                      onChange={(event) =>
                        updateField({ columns: event.target.value.split("\n") })
                      }
                    />
                  </Field>
                )}
                <FieldValidationSettings field={field} onChange={updateField} />
                <Field label="Section">
                  <select
                    value={field.sectionId}
                    onChange={(event) =>
                      updateField({ sectionId: event.target.value })
                    }
                  >
                    {form.sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="gt-inspector-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const item = {
                        ...structuredClone(field),
                        id: crypto.randomUUID(),
                      };
                      update({ ...form, fields: [...form.fields, item] });
                      setSelected(item.id);
                    }}
                  >
                    <Copy size={15} />
                    Duplicate
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      update({
                        ...form,
                        fields: form.fields.filter(
                          (item) => item.id !== field.id,
                        ),
                      });
                      setSelected("");
                    }}
                  >
                    <Trash2 size={15} />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState title="Select a question">
                Choose a field on the canvas to edit its settings.
              </EmptyState>
            )
          ) : tab === "Logic" ? (
            <div className="gt-form">
              <h3>Keep the conversation relevant.</h3>
              <p className="gt-helper">
                Show a question only when an earlier answer matches your rule.
              </p>
              {field ? (
                <>
                  <Field label="Show this field when">
                    <select
                      value={field.condition?.fieldId || ""}
                      onChange={(event) =>
                        updateField({
                          condition: event.target.value
                            ? { fieldId: event.target.value, value: "" }
                            : undefined,
                        })
                      }
                    >
                      <option value="">Always visible</option>
                      {form.fields
                        .slice(0, form.fields.indexOf(field))
                        .filter((item) =>
                          [
                            "radio",
                            "checkbox",
                            "dropdown",
                            "scale",
                            "rating",
                          ].includes(item.type),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {field.condition && (
                    <Field label="Answer equals">
                      <input
                        value={field.condition.value}
                        onChange={(event) =>
                          updateField({
                            condition: {
                              ...field.condition!,
                              value: event.target.value,
                            },
                          })
                        }
                        list="condition-options"
                      />
                      <datalist id="condition-options">
                        {form.fields
                          .find((item) => item.id === field.condition?.fieldId)
                          ?.options.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                      </datalist>
                    </Field>
                  )}
                  <div className="gt-logic-valid">
                    <ShieldCheck size={18} />
                    {issues.length
                      ? `${issues.length} items to review`
                      : "No circular dependencies"}
                  </div>
                </>
              ) : (
                <p>Select a question to add a rule.</p>
              )}
              <SectionLogic
                form={form}
                sectionId={field?.sectionId || form.sections[0].id}
                onChange={(section) =>
                  update({
                    ...form,
                    sections: form.sections.map((value) =>
                      value.id === section.id ? section : value,
                    ),
                  })
                }
              />
            </div>
          ) : (
            <div className="gt-form">
              <Field label="Access mode">
                <select
                  value={form.settings.access}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        access: event.target
                          .value as PreviewForm["settings"]["access"],
                      },
                    })
                  }
                >
                  {[
                    ["public", "Public · name and email required"],
                    ["verified", "Verified email"],
                    ["unlisted", "Unlisted link"],
                    ["invited", "Invitation only"],
                    ["internal", "Chapter members"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                  <option value="georgia-tech-sso-planned" disabled>
                    Georgia Tech SSO · Coming soon
                  </option>
                </select>
              </Field>
              {form.settings.access !== "public" && (
                <p className="gt-helper">
                  Access is checked by the server. Token-restricted forms
                  require a valid invitation or access link; chapter forms
                  require an active account.
                </p>
              )}
              <p className="gt-helper">
                Every respondent must enter a name and email. Entered details
                are unverified unless an existing access method verifies them.
                Georgia Tech SSO (preferred) and Google sign-in are planned, not
                connected.
              </p>
              <Field
                label="Form theme"
                hint="Approved chapter accents only. Content surfaces stay neutral and readable."
              >
                <select
                  value={form.settings.theme || "coral"}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        theme: event.target.value as "coral" | "charcoal",
                      },
                    })
                  }
                >
                  <option value="coral">Coral · chapter default</option>
                  <option value="charcoal">Charcoal · quiet accent</option>
                </select>
              </Field>
              <FormImagePicker
                scope={form.id + ":header"}
                label="Header image"
                selected={formImageId(form.settings.headerMedia)}
                onChange={(photo) =>
                  update({
                    ...form,
                    settings: {
                      ...form.settings,
                      headerMedia: photo
                        ? `/api/v1/media/public/${photo.id}`
                        : "",
                      headerAlt: photo?.alt_text || photo?.description || "",
                    },
                  })
                }
              />
              {form.settings.headerMedia && (
                <Field label="Header image description (alt text)" required>
                  <input
                    value={form.settings.headerAlt || ""}
                    onChange={(event) =>
                      update({
                        ...form,
                        settings: {
                          ...form.settings,
                          headerAlt: event.target.value,
                        },
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Response limit" hint="0 means no configured limit">
                <input
                  type="number"
                  min={0}
                  value={form.settings.limit}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        limit: Math.max(0, Number(event.target.value)),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Opens at">
                <input
                  type="datetime-local"
                  value={form.settings.opensAt}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        opensAt: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Closes at">
                <input
                  type="datetime-local"
                  value={form.settings.closesAt}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        closesAt: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              {(
                [
                  ["resume", "Save & resume"],
                  ["editing", "Allow response edits"],
                  ["receipts", "Legacy receipt publication review"],
                  ["review", "Final answer review"],
                  ["oneResponse", "One response per verified identity"],
                  ["progress", "Show progress bar"],
                  ["shuffleQuestions", "Shuffle independent questions"],
                  ["shuffleOptions", "Shuffle unordered choice options"],
                ] as const
              )
                .filter(([key]) => key !== "receipts" || form.settings.receipts)
                .map(([key, label]) => (
                  <label className="gt-toggle-row" key={key}>
                    {label}
                    <input
                      type="checkbox"
                      role="switch"
                      checked={
                        form.settings[key] ??
                        ["review", "progress"].includes(key)
                      }
                      disabled={
                        (key === "oneResponse" &&
                          form.settings.access === "public") ||
                        (key === "shuffleQuestions" &&
                          !form.settings.shuffleQuestions &&
                          !canShuffleQuestions(form.fields, form.sections))
                      }
                      onChange={(event) =>
                        update({
                          ...form,
                          settings: {
                            ...form.settings,
                            [key]: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              <p className="gt-helper">
                One-response enforcement requires a verified identity or unique
                private invitation. A public form with entered details cannot
                reliably identify respondents.
              </p>
              <p className="gt-helper">
                Question shuffling stays within each section and never crosses a
                content block; conditional/branching forms cannot enable it.
                Choice shuffling applies only to unordered single-choice,
                multiple-choice and dropdown questions. Scales, grids, rankings
                and relative-position choices keep their order.
              </p>
              {form.actions?.includes("manage_access") &&
                form.actions?.includes("view_responses") && (
                  <Button
                    variant="secondary"
                    disabled={saveStatus !== "Saved"}
                    onClick={() => setDeliveryOpen(true)}
                  >
                    Review chapter notifications
                  </Button>
                )}
              <p className="gt-helper">
                Respondents can request their own complete copy at submission,
                sent only to their entered email without confirmation. Chapter
                notifications are separate and only go to explicitly reviewed
                recipients. Older receipt-enabled drafts keep their existing
                publication-review requirement until that legacy setting is
                turned off.
              </p>
              <Field
                label="Response retention (days)"
                hint="1–365 days. Historical responses and files follow the published privacy policy."
              >
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.settings.retentionDays || 365}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        retentionDays: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Closed-form message">
                <textarea
                  maxLength={3000}
                  rows={3}
                  value={
                    form.settings.closedMessage ||
                    "This form is not accepting responses right now."
                  }
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        closedMessage: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Confirmation message">
                <textarea
                  rows={3}
                  value={form.settings.confirmation}
                  onChange={(event) =>
                    update({
                      ...form,
                      settings: {
                        ...form.settings,
                        confirmation: event.target.value,
                      },
                    })
                  }
                />
              </Field>
            </div>
          )}
        </fieldset>
      </div>
    </>
  );
  return (
    <div className="gt-builder-page">
      <div className="gt-builder-header">
        <div>
          <Link className="gt-breadcrumb" to="/admin/forms">
            <ArrowLeft size={14} /> Forms
          </Link>
          <input
            ref={titleInput}
            className="gt-builder-title"
            disabled={!editable}
            aria-label="Form title"
            value={form.title}
            onChange={(event) => update({ ...form, title: event.target.value })}
          />
          <span role="status" className="gt-save-state">
            <Check size={13} />
            {saveStatus}
          </span>
        </div>
        <div className="gt-builder-header-actions">
          <button
            className="gt-icon-button"
            disabled={!editable || !undo.current.length}
            aria-label="Undo change"
            onClick={() => {
              if (!editable) return;
              const previous = undo.current.pop();
              if (previous) {
                redo.current.push(form);
                setForm(previous);
              }
            }}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="gt-icon-button"
            disabled={!editable || !redo.current.length}
            aria-label="Redo change"
            onClick={() => {
              if (!editable) return;
              const next = redo.current.pop();
              if (next) {
                undo.current.push(form);
                setForm(next);
              }
            }}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="gt-icon-button"
            aria-label="Version history"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={18} />
          </button>
          <button
            className="gt-icon-button"
            aria-label={
              mobile ? "Switch to desktop canvas" : "Switch to mobile canvas"
            }
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <Laptop size={18} /> : <Smartphone size={18} />}
          </button>
          <Link
            to={`/forms/${form.slug}?preview=1`}
            aria-disabled={!canPreview}
            onClick={async (event) => {
              event.preventDefault();
              if (!canPreview || publicationPending.current) return;
              try {
                await persist(structuredClone(form));
                const preview = () => navigate(`/forms/${form.slug}?preview=1`);
                if (navigationSafety) navigationSafety.allow(preview);
                else preview();
              } catch {
                /* Save error is shown beside the draft. */
              }
            }}
            className="gt-button gt-button-secondary"
          >
            <Eye size={16} />
            <span>Preview</span>
          </Link>
          <Button
            disabled={
              !ready ||
              archived ||
              !source?.actions?.includes("publish") ||
              publishing ||
              recoveryBusy ||
              saveStatus === "Saving…"
            }
            onClick={() => {
              if (!archived && ready && !publicationPending.current)
                setPublishOpen(true);
            }}
          >
            Publish <ArrowUp size={15} />
          </Button>
        </div>
      </div>
      <section
        className="gt-builder-read-status gt-form"
        aria-label="Saved form read status"
      >
        {server.loading && (
          <p role="status">
            Refreshing saved draft and current permissions… Editing is paused.
          </p>
        )}
        {(server.error || !isOnline) && (
          <div role="alert">
            <p>{server.error || "You are offline. Form changes are paused."}</p>
            {server.at && (
              <p>
                Last successful saved draft read:{" "}
                <time dateTime={server.at}>
                  {new Date(server.at).toLocaleString()}
                </time>
                . Unsaved input remains on this page.
              </p>
            )}
          </div>
        )}
        {remoteConflict && (
          <p role="alert">
            Saved values changed or a save did not finish cleanly. Autosave is
            paused and your proposed draft remains on this page. Recheck saved
            values before reviewing which draft to keep.
          </p>
        )}
        <div className="gt-inline-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={
              server.loading ||
              !isOnline ||
              publishing ||
              recoveryBusy ||
              saveStatus === "Saving…"
            }
            onClick={() => {
              const readGeneration = generation.current;
              void server.reload().then(() => {
                if (mounted.current && generation.current === readGeneration)
                  document.getElementById("form-builder-read-status")?.focus();
              });
            }}
          >
            Recheck saved form
          </Button>
          {remoteConflict && (
            <Button
              type="button"
              variant="secondary"
              disabled={
                server.loading ||
                !!server.error ||
                !source ||
                !isOnline ||
                recoveryBusy
              }
              onClick={() => setLoadReview(true)}
            >
              Review loading saved draft
            </Button>
          )}
        </div>
        <p id="form-builder-read-status" tabIndex={-1}>
          {server.at
            ? `Saved draft snapshot: revision ${source?.revision ?? "unavailable"}.`
            : "A successful saved draft read is required before changes."}
        </p>
      </section>
      {uncertainWrite && (
        <FormWriteRecovery
          key={uncertainWrite.key}
          intent={uncertainWrite}
          onBusy={setRecoveryBusy}
          onDenied={() => {
            clearPrivate();
            server.clear();
          }}
          onReconciled={() => {
            setRecoveryConfirmed(true);
            setSaveError("");
            setSaveStatus("Previous change confirmed");
            void server.reload();
          }}
        />
      )}
      {archived && (
        <section
          className="gt-builder-read-status"
          aria-label="Archived form status"
        >
          <p>
            This saved form is archived. Draft editing and publication are
            read-only. Restore it as a private draft from the{" "}
            <Link to="/admin/forms">Forms library</Link> before making changes.
            Fields, settings, saved preview and published history remain
            available to inspect.
          </p>
        </section>
      )}
      {!archived && !source?.actions?.includes("edit") && (
        <p className="gt-data-note" role="status">
          View only. Draft editing requires additional permission. You can
          inspect fields, settings and published versions.
        </p>
      )}
      {saveError && (
        <p role="alert" className="gt-form-error">
          {saveError} Your changes remain on this page.{" "}
          {remoteConflict
            ? "Recheck the saved draft before another save."
            : "Correct the draft values before saving again."}
        </p>
      )}
      <div className="gt-builder-mobile-tools">
        <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
          <Plus size={16} />
          {editable ? "Add field" : "Field types"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            leaveAccess(() => {
              setTab("Settings");
              setInspectorOpen(true);
            });
          }}
        >
          <Settings2 size={16} />
          Settings
        </Button>
      </div>
      <div className="gt-builder-grid">
        <aside className="gt-builder-palette" aria-label="Field library">
          {palette}
        </aside>
        <div
          className={`gt-builder-canvas ${mobile ? "is-mobile-preview" : ""}`}
          data-form-theme={
            form.settings.theme === "charcoal" ? "charcoal" : "coral"
          }
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const type = event.dataTransfer.getData("field-type");
            if (type) add(type as FieldType);
          }}
        >
          <div className="gt-builder-form-sheet">
            <div className="gt-form-peach-band" />
            <div className="gt-builder-form-intro">
              <span className="gt-section-note">
                GDG on Campus · Georgia Tech
              </span>
              {form.settings.headerMedia && (
                <FormImage
                  header
                  id={formImageId(form.settings.headerMedia)}
                  alt={form.settings.headerAlt || ""}
                />
              )}
              <h1>{form.title || "Untitled form"}</h1>
              <textarea
                aria-label="Form description"
                disabled={!editable}
                value={form.description}
                onChange={(event) =>
                  update({ ...form, description: event.target.value })
                }
                placeholder="Introduce your form…"
                rows={2}
              />
            </div>
            {form.sections.map((section, sectionIndex) => (
              <section className="gt-builder-section" key={section.id}>
                <div className="gt-builder-section-label">
                  <Badge tone="coral">Section {sectionIndex + 1}</Badge>
                  <input
                    aria-label={`Section ${sectionIndex + 1} title`}
                    disabled={!editable}
                    value={section.title}
                    onChange={(event) =>
                      update({
                        ...form,
                        sections: form.sections.map((item) =>
                          item.id === section.id
                            ? { ...item, title: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="gt-icon-button"
                    aria-label={`Duplicate section ${sectionIndex + 1}`}
                    disabled={!editable}
                    title="Duplicate section"
                    onClick={() => update(duplicateSection(form, section.id))}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                {form.fields
                  .filter((item) => item.sectionId === section.id)
                  .map((item, sectionIndex, sectionFields) => (
                    <article
                      className={`gt-builder-field ${selected === item.id ? "is-selected" : ""}`}
                      key={item.id}
                      draggable={editable}
                      onDragStart={() => {
                        dragged.current = item.id;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.stopPropagation();
                        if (!editable) return;
                        const sourceIndex = form.fields.findIndex(
                            (value) => value.id === dragged.current,
                          ),
                          targetIndex = form.fields.findIndex(
                            (value) => value.id === item.id,
                          );
                        if (sourceIndex >= 0 && sourceIndex !== targetIndex) {
                          const fields = [...form.fields];
                          const [source] = fields.splice(sourceIndex, 1),
                            moved = { ...source, sectionId: item.sectionId };
                          fields.splice(targetIndex, 0, moved);
                          update({ ...form, fields });
                        }
                      }}
                      onClick={() => setSelected(item.id)}
                    >
                      <div className="gt-field-toolbar">
                        <button
                          onClick={() => {
                            leaveAccess(() => {
                              setSelected(item.id);
                              setInspectorOpen(true);
                              setTab("Field");
                            });
                          }}
                          aria-label={`${fieldTypes.find((type) => type[0] === item.type)?.[1] || "Question"}: ${editable ? "Edit" : "Inspect"} ${item.label}`}
                        >
                          <GripVertical size={15} />
                          {
                            fieldTypes.find(
                              (type) => type[0] === item.type,
                            )?.[1]
                          }
                        </button>
                        <div>
                          <button
                            className="gt-icon-button"
                            aria-label={`Move ${item.label} up`}
                            disabled={!editable || sectionIndex === 0}
                            onClick={(event) => {
                              event.stopPropagation();
                              move(item.id, -1);
                            }}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            className="gt-icon-button"
                            aria-label={`Move ${item.label} down`}
                            disabled={
                              !editable ||
                              sectionIndex === sectionFields.length - 1
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              move(item.id, 1);
                            }}
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="gt-field-canvas-preview">
                        <FieldRenderer
                          field={item}
                          preview
                          onChange={() => undefined}
                        />
                      </div>
                      {item.condition && (
                        <Badge tone="coral">Conditional field</Badge>
                      )}
                    </article>
                  ))}
                <button
                  className="gt-add-question"
                  disabled={!editable}
                  onClick={() => add("short", section.id)}
                >
                  <Plus size={17} /> Add question
                </button>
              </section>
            ))}
            <Button
              variant="ghost"
              disabled={!editable}
              onClick={() =>
                update({
                  ...form,
                  sections: [
                    ...form.sections,
                    {
                      id: crypto.randomUUID(),
                      title: `Section ${form.sections.length + 1}`,
                      description: "",
                    },
                  ],
                })
              }
            >
              <Plus size={16} /> Add section
            </Button>
          </div>
          <div className="gt-builder-validation">
            <ShieldCheck size={18} />
            <div>
              <strong>
                {issues.length
                  ? `${issues.length} publication checks need attention`
                  : "Looking good. Your questions are ready."}
              </strong>
              {issues.length ? (
                <ul>
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p>Visible labels · Stable field IDs · No circular logic</p>
              )}
            </div>
          </div>
          <p className="gt-builder-hint">
            {editable
              ? "Drag to reorder, or use the move up and down buttons. Draft changes autosave securely; publication creates a separate immutable version."
              : archived
                ? "Archived forms are read-only. Restore a private draft from the Forms library before editing."
                : source?.actions?.includes("edit")
                  ? "Editing is paused. Recheck the saved draft before changing fields or settings."
                  : "Select a question to inspect its settings. Draft changes require edit permission."}
          </p>
        </div>
        <aside className="gt-builder-inspector" aria-label="Form inspector">
          {inspector("inline")}
        </aside>
      </div>
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="gt-builder-tool-dialog">
          <DialogTitle>{editable ? "Add a field" : "Field types"}</DialogTitle>
          <DialogDescription>
            Choose a question or content block.
          </DialogDescription>
          {palette}
        </DialogContent>
      </Dialog>
      <Dialog
        open={inspectorOpen}
        onOpenChange={(open) => {
          if (open) setInspectorOpen(true);
          else leaveAccess(() => setInspectorOpen(false));
        }}
      >
        <DialogContent
          className="gt-builder-tool-dialog"
          closeDisabled={accessState.busy || accessState.uncertain}
          onEscapeKeyDown={(event) => {
            if (accessState.busy || accessState.uncertain)
              event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (accessState.busy || accessState.uncertain)
              event.preventDefault();
          }}
        >
          <DialogTitle>
            {tab === "Settings"
              ? "Form settings"
              : tab === "Access"
                ? "Form access"
                : "Question settings"}
          </DialogTitle>
          <DialogDescription>
            {editable
              ? "Edit the selected field or form settings."
              : "Inspect the selected field or form settings. Changes require edit permission."}
          </DialogDescription>
          {inspector("dialog")}
        </DialogContent>
      </Dialog>
      <Dialog
        open={deliveryOpen}
        onOpenChange={(open) => {
          if (deliveryState.busy) return;
          if (!open && deliveryState.dirty) {
            navigationSafety?.request(() => {
              setDeliveryOpen(false);
              setDeliveryState({ dirty: false, busy: false });
            });
            return;
          }
          setDeliveryOpen(open);
          if (!open) setDeliveryState({ dirty: false, busy: false });
        }}
      >
        <DialogContent className="gt-notification-dialog">
          <DialogTitle>Receipts &amp; notifications</DialogTitle>
          <DialogDescription>
            Explicit recipient approval for this form, with private answers
            protected.
          </DialogDescription>
          <DeliveryPanel
            formId={form.id}
            saved={saveStatus === "Saved"}
            receiptSetting={!!form.settings.receipts}
            access={form.settings.access}
            onStateChange={setDeliveryState}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="gt-notification-dialog">
          <DialogTitle>Published versions</DialogTitle>
          <DialogDescription>
            Publishing preserves a snapshot. Existing responses keep their
            original question labels.
          </DialogDescription>
          {form.versions.length ? (
            <VersionHistory form={form} />
          ) : (
            <EmptyState title="Your first version is still a draft">
              Publish when your form is ready.
            </EmptyState>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!publicationPending.current) setPublishOpen(open);
        }}
      >
        <DialogContent
          className={publishing ? "[&>button]:hidden" : undefined}
          onEscapeKeyDown={(event) => {
            if (publicationPending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (publicationPending.current) event.preventDefault();
          }}
        >
          <DialogTitle>
            {archived
              ? "Archived form is read-only"
              : issues.length
                ? "A few things before you publish"
                : "Ready to share?"}
          </DialogTitle>
          <DialogDescription>
            {archived
              ? "Restore this form as a private draft from the Forms library before publishing."
              : issues.length
                ? "Resolve these checks to create a published version."
                : `This publishes immutable version ${form.versions.length + 1}. Existing responses keep their original questions and labels.`}
          </DialogDescription>
          {issues.length ? (
            <ul className="gt-validation-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <div className="gt-publish-summary">
              <CheckCircle2 size={32} />
              <strong>{form.title}</strong>
              <span>
                {form.fields.length} fields · {form.sections.length} sections ·{" "}
                {form.settings.access} access
              </span>
            </div>
          )}
          <Button
            disabled={
              !!issues.length ||
              publishing ||
              !ready ||
              archived ||
              !source?.actions?.includes("publish")
            }
            onClick={async () => {
              if (
                publicationPending.current ||
                !ready ||
                archived ||
                !source?.actions?.includes("publish")
              )
                return;
              publicationPending.current = true;
              const currentGeneration = generation.current;
              const controller = new AbortController();
              let intent: FormWriteIntent | undefined;
              activeWrites.current.add(controller);
              setPublishing(true);
              try {
                await persist(structuredClone(form));
                if (
                  !mounted.current ||
                  controller.signal.aborted ||
                  generation.current !== currentGeneration ||
                  !allowed.current ||
                  serverRef.current.form?.status === "Archived" ||
                  !serverRef.current.form?.actions?.includes("publish")
                )
                  return;
                intent = {
                  action: "publish",
                  snapshot: {
                    ...structuredClone(form),
                    revision: revision.current,
                  },
                  key: crypto.randomUUID(),
                  startedAt: Date.now(),
                };
                const result = await formsApi.publish(
                  intent.snapshot,
                  controller.signal,
                  intent.key,
                );
                if (
                  !mounted.current ||
                  controller.signal.aborted ||
                  generation.current !== currentGeneration
                )
                  return;
                revision.current = result.revision;
                saved.current = signature(result);
                setForm(result);
                setSaveStatus("Published and saved");
                setPublishOpen(false);
              } catch (e) {
                if (
                  !mounted.current ||
                  controller.signal.aborted ||
                  generation.current !== currentGeneration
                )
                  return;
                if (
                  e instanceof ApiFailure &&
                  [401, 403, 404].includes(e.status)
                ) {
                  clearPrivate();
                  server.clear();
                  return;
                }
                if (!(e instanceof ApiFailure) || e.status !== 400) {
                  allowed.current = false;
                  setRemoteConflict(true);
                  if (
                    intent &&
                    (!(e instanceof ApiFailure) || e.status >= 500)
                  ) {
                    setUncertainWrite(intent);
                    setRecoveryConfirmed(false);
                  }
                }
                setSaveError(
                  e instanceof TypeError
                    ? "The publication response was interrupted. Recheck its outcome before trying again."
                    : (e as Error).message,
                );
                setPublishOpen(false);
              } finally {
                activeWrites.current.delete(controller);
                publicationPending.current = false;
                if (mounted.current && generation.current === currentGeneration)
                  setPublishing(false);
              }
            }}
          >
            {publishing ? "Publishing…" : "Publish version"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={loadReview} onOpenChange={setLoadReview}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (!remoteConflict) {
              event.preventDefault();
              titleInput.current?.focus();
            }
          }}
        >
          <DialogTitle>Load the currently saved draft?</DialogTitle>
          <DialogDescription>
            This replaces the proposed draft for “{form.title}” on this page
            with the current saved revision {source?.revision}. Unsaved field,
            setting and undo/redo changes will be discarded. No saved form or
            response is changed.
          </DialogDescription>
          {uncertainWrite && !recoveryConfirmed && (
            <p role="alert">
              The previous{" "}
              {uncertainWrite.action === "draft" ? "save" : "publication"} may
              already have completed. Loading this draft abandons its retry
              controls and does not undo that change. Inspect published history
              before publishing again.
            </p>
          )}
          <p>Your proposed title: {form.title}</p>
          <p>Current saved title: {source?.title}</p>
          <p>
            {form.fields.length} proposed fields · {source?.fields.length ?? 0}{" "}
            saved fields
          </p>
          <Button
            disabled={
              !source ||
              server.loading ||
              !!server.error ||
              !isOnline ||
              publishing ||
              recoveryBusy
            }
            onClick={() => {
              if (!source || server.loading || server.error || !isOnline)
                return;
              generation.current++;
              for (const controller of activeWrites.current) controller.abort();
              activeWrites.current.clear();
              queue.current = Promise.resolve(undefined);
              revision.current = source.revision;
              saved.current = signature(source);
              undo.current = [];
              redo.current = [];
              setForm(structuredClone(source));
              setSelected(source.fields[0]?.id || "");
              setRemoteConflict(false);
              setUncertainWrite(undefined);
              setRecoveryConfirmed(false);
              setSaveError("");
              setSaveStatus("Saved");
              setLoadReview(false);
            }}
          >
            Load saved draft and discard proposed changes
          </Button>
          <Button variant="secondary" onClick={() => setLoadReview(false)}>
            Keep proposed draft
          </Button>
          {(!uncertainWrite || recoveryConfirmed) && (
            <>
              <p>
                Resuming autosave instead keeps your proposed fields and
                settings and saves them over the current saved draft. Published
                questions and existing responses stay on their immutable
                versions.
              </p>
              <Button
                variant="secondary"
                disabled={
                  !source ||
                  server.loading ||
                  !!server.error ||
                  !isOnline ||
                  publishing ||
                  recoveryBusy ||
                  !source.actions?.includes("edit") ||
                  source.status === "Archived"
                }
                onClick={() => {
                  if (
                    !source ||
                    server.loading ||
                    server.error ||
                    !isOnline ||
                    recoveryBusy ||
                    !source.actions?.includes("edit") ||
                    source.status === "Archived"
                  )
                    return;
                  invalidateWrites();
                  queue.current = Promise.resolve(undefined);
                  revision.current = source.revision;
                  saved.current = signature(source);
                  setForm({
                    ...form,
                    revision: source.revision,
                    actions: source.actions,
                    versions: source.versions,
                    status: source.status,
                  });
                  setUncertainWrite(undefined);
                  setRecoveryConfirmed(false);
                  setRemoteConflict(false);
                  setSaveError("");
                  setSaveStatus("Unsaved changes");
                  setLoadReview(false);
                }}
              >
                Keep proposed draft and resume autosave
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
