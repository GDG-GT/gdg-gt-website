import { useEffect, useRef, useState, useCallback } from "react";
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
import FormImage from './FormImage';
import FormImagePicker from './FormImagePicker';
import { formsApi, useServerForm } from "./api";
import AccessPanel from "./AccessPanel";
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
  const navigationSafety = useNavigationSafety();
  const { formId } = useParams(),
    server = useServerForm(formId),
    source = server.form,
    navigate = useNavigate();
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
    [publishOpen, setPublishOpen] = useState(false),
    [saveError, setSaveError] = useState(""),
    [publishing, setPublishing] = useState(false);
  const undo = useRef<PreviewForm[]>([]),
    redo = useRef<PreviewForm[]>([]),
    dragged = useRef<string | null>(null);
  const latest = useRef(form);
  latest.current = form;
  const revision = useRef<number>(),
    queue = useRef<Promise<PreviewForm | undefined>>(
      Promise.resolve(undefined),
    ),
    saved = useRef("");
  useEffect(() => {
    if (source && !latest.current) {
      setForm(structuredClone(source));
      setSelected(source.fields[0]?.id || "");
      revision.current = source.revision;
      saved.current = signature(source);
      setSaveStatus("Saved");
    }
  }, [source]);
  const persist = useCallback((snapshot: PreviewForm) => {
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (saved.current === signature(snapshot)) return snapshot;
        setSaveStatus("Saving…");
        setSaveError("");
        try {
          const result = await formsApi.save({
            ...snapshot,
            revision: revision.current,
          });
          revision.current = result.revision;
          saved.current = signature(snapshot);
          setSaveStatus(
            latest.current && signature(latest.current) === saved.current
              ? "Saved"
              : "Unsaved changes",
          );
          return result;
        } catch (e) {
          setSaveStatus("Not saved");
          setSaveError((e as Error).message);
          throw e;
        }
      });
    return queue.current;
  }, []);
  useEffect(() => {
    if (
      !form ||
      saved.current === signature(form) ||
      !form.actions?.includes("edit")
    )
      return;
    setSaveStatus("Unsaved changes");
    const timer = setTimeout(() => {
      void persist(structuredClone(form)).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [form, persist]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current && saved.current !== signature(latest.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useDraftGuard(!!form && saved.current !== signature(form), {
    busy: publishing || saveStatus === "Saving…",
    label: "Form definition changes",
  });
  if (!form)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title={
            server.loading ? "Loading your form…" : "This form is not available"
          }
          action={<Link to="/admin/forms">Back to forms</Link>}
        >
          {server.error ||
            "Your saved draft is loaded from the chapter server."}
        </EmptyState>
      </div>
    );
  const field = form.fields.find((item) => item.id === selected),
    issues = validateDefinition(form);
  const update = (next: PreviewForm) => {
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
    const item = newField(type, sectionId);
    update({ ...form, fields: [...form.fields, item] });
    setSelected(item.id);
    setPaletteOpen(false);
  };
  const move = (fieldId: string, delta: number) => {
    const fields = [...form.fields],
      index = fields.findIndex((item) => item.id === fieldId),
      target = index + delta;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    update({ ...form, fields });
  };
  const palette = (
    <>
      <div className="gt-builder-panel-title">
        <h2>Add a field</h2>
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
                draggable
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
  const inspector = (
    <>
      <div className="gt-builder-panel-title">
        <h2>Inspector</h2>
        <Settings2 size={17} />
      </div>
      <div className="gt-tabs" role="tablist" aria-label="Builder inspector">
        {["Field", "Logic", "Settings", "Access"].map((value) => (
          <button
            role="tab"
            aria-selected={tab === value}
            key={value}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {tab === "Access" ? (
        <AccessPanel form={form} />
      ) : tab === "Field" ? (
        field ? (
          <div className="gt-form">
            <Badge tone="coral">
              {fieldTypes.find((item) => item[0] === field.type)?.[1]}
            </Badge>
            <Field label={field.type === 'image' ? 'Image description (alt text)' : 'Question label'} required>
              <input
                value={field.label}
                onChange={(event) => updateField({ label: event.target.value })}
              />
            </Field>
            {field.type === 'image' && <FormImagePicker label="Published image" selected={field.imageMediaId} onChange={photo => updateField({
              imageMediaId: photo?.id, imageWidth: photo?.width, imageHeight: photo?.height,
              ...(photo ? { label: photo.alt_text || photo.description || field.label } : {}),
            })} />}
            <Field label="Description">
              <textarea
                rows={3}
                value={field.description}
                onChange={(event) =>
                  updateField({ description: event.target.value })
                }
              />
            </Field>
            {!["image", "title", "description", "divider"].includes(field.type) && <><label className="gt-toggle-row">
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
            </label></>}
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
              <Field label="Maximum choices" hint="Leave empty for no maximum">
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
                    fields: form.fields.filter((item) => item.id !== field.id),
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
              Access is checked by the server. Token-restricted forms require a
              valid invitation or access link; chapter forms require an active
              account.
            </p>
          )}
          <p className="gt-helper">
            Every respondent must enter a name and email. Entered details are
            unverified unless an existing access method verifies them. Georgia
            Tech SSO (preferred) and Google sign-in are planned, not connected.
          </p>
          <FormImagePicker label="Header image" selected={formImageId(form.settings.headerMedia)} onChange={photo => update({ ...form,
            settings: { ...form.settings, headerMedia: photo ? `/api/v1/media/public/${photo.id}` : '', headerAlt: photo?.alt_text || photo?.description || '' },
          })} />
          {form.settings.headerMedia && <Field label="Header image description (alt text)" required><input value={form.settings.headerAlt || ''} onChange={event => update({ ...form, settings: { ...form.settings, headerAlt: event.target.value } })} /></Field>}
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
                  settings: { ...form.settings, opensAt: event.target.value },
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
                  settings: { ...form.settings, closesAt: event.target.value },
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
            ] as const
          )
            .filter(([key]) => key !== "receipts" || form.settings.receipts)
            .map(([key, label]) => (
              <label className="gt-toggle-row" key={key}>
                {label}
                <input
                  type="checkbox"
                  role="switch"
                  checked={form.settings[key] ?? key === "review"}
                  disabled={
                    key === "oneResponse" && form.settings.access === "public"
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
            Respondents can request their own complete copy at submission, sent
            only to their entered email without confirmation. Chapter
            notifications are separate and only go to explicitly reviewed
            recipients. Older receipt-enabled drafts keep their existing
            publication-review requirement until that legacy setting is turned
            off.
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
            className="gt-builder-title"
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
            disabled={!undo.current.length}
            aria-label="Undo change"
            onClick={() => {
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
            disabled={!redo.current.length}
            aria-label="Redo change"
            onClick={() => {
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
            onClick={async (event) => {
              event.preventDefault();
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
            disabled={!form.actions?.includes("publish") || publishing}
            onClick={() => setPublishOpen(true)}
          >
            Publish <ArrowUp size={15} />
          </Button>
        </div>
      </div>
      {saveError && (
        <p role="alert" className="gt-form-error">
          {saveError} Your changes remain on this page.{" "}
          <button
            onClick={() => persist(structuredClone(form)).catch(() => {})}
          >
            Retry save
          </button>
        </p>
      )}
      <div className="gt-builder-mobile-tools">
        <Button variant="secondary" onClick={() => setPaletteOpen(true)}>
          <Plus size={16} />
          Add field
        </Button>
        <Button variant="secondary" onClick={() => setInspectorOpen(true)}>
          <Settings2 size={16} />
          Settings
        </Button>
      </div>
      <div className="gt-builder-grid">
        <aside className="gt-builder-palette">{palette}</aside>
        <div
          className={`gt-builder-canvas ${mobile ? "is-mobile-preview" : ""}`}
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
              {form.settings.headerMedia && <FormImage header id={formImageId(form.settings.headerMedia)} alt={form.settings.headerAlt || ''} />}
              <h1>{form.title || "Untitled form"}</h1>
              <textarea
                aria-label="Form description"
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
                    title="Duplicate section"
                    onClick={() => update(duplicateSection(form, section.id))}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                {form.fields
                  .filter((item) => item.sectionId === section.id)
                  .map((item) => (
                    <article
                      className={`gt-builder-field ${selected === item.id ? "is-selected" : ""}`}
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        dragged.current = item.id;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.stopPropagation();
                        const sourceIndex = form.fields.findIndex(
                            (value) => value.id === dragged.current,
                          ),
                          targetIndex = form.fields.findIndex(
                            (value) => value.id === item.id,
                          );
                        if (sourceIndex >= 0 && sourceIndex !== targetIndex) {
                          const fields = [...form.fields];
                          const [moved] = fields.splice(sourceIndex, 1);
                          moved.sectionId = item.sectionId;
                          fields.splice(targetIndex, 0, moved);
                          update({ ...form, fields });
                        }
                      }}
                      onClick={() => setSelected(item.id)}
                    >
                      <div className="gt-field-toolbar">
                        <button
                          onClick={() => {
                            setSelected(item.id);
                            setInspectorOpen(true);
                          }}
                          aria-label={`Edit ${item.label}`}
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
                            disabled={form.fields.indexOf(item) === 0}
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
                              form.fields.indexOf(item) ===
                              form.fields.length - 1
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
                  onClick={() => add("short", section.id)}
                >
                  <Plus size={17} /> Add question
                </button>
              </section>
            ))}
            <Button
              variant="ghost"
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
            Drag to reorder, or use the move up and down buttons. Draft changes
            autosave securely; publication creates a separate immutable version.
          </p>
        </div>
        <aside className="gt-builder-inspector">{inspector}</aside>
      </div>
      <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogContent className="gt-builder-tool-dialog">
          <DialogTitle>Add a field</DialogTitle>
          <DialogDescription>
            Choose a question or content block.
          </DialogDescription>
          {palette}
        </DialogContent>
      </Dialog>
      <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <DialogContent className="gt-builder-tool-dialog">
          <DialogTitle>Question settings</DialogTitle>
          <DialogDescription>
            Edit the selected field or form settings.
          </DialogDescription>
          {inspector}
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
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogTitle>
            {issues.length
              ? "A few things before you publish"
              : "Ready to share?"}
          </DialogTitle>
          <DialogDescription>
            {issues.length
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
            disabled={!!issues.length || publishing}
            onClick={async () => {
              setPublishing(true);
              try {
                await persist(structuredClone(form));
                const result = await formsApi.publish({
                  ...form,
                  revision: revision.current,
                });
                revision.current = result.revision;
                saved.current = signature(result);
                setForm(result);
                setSaveStatus("Published and saved");
                setPublishOpen(false);
              } catch (e) {
                setSaveError((e as Error).message);
                setPublishOpen(false);
              } finally {
                setPublishing(false);
              }
            }}
          >
            {publishing ? "Publishing…" : "Publish version"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
