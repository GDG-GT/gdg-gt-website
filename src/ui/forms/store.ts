import { useSyncExternalStore } from "react";
import { localPreviewEnabled } from "../preview-data";

export const fieldTypes = [
  ["short", "Short text", "Text"],
  ["long", "Long text", "Text"],
  ["email", "Email", "Text"],
  ["phone", "Phone", "Text"],
  ["number", "Number", "Text"],
  ["url", "URL", "Text"],
  ["radio", "Single choice", "Choice"],
  ["checkbox", "Multiple choice", "Choice"],
  ["dropdown", "Dropdown", "Choice"],
  ["date", "Date", "Date & time"],
  ["time", "Time", "Date & time"],
  ["datetime", "Date and time", "Date & time"],
  ["scale", "Linear scale", "Scale"],
  ["rating", "Rating", "Scale"],
  ["likert", "Likert grid", "Scale"],
  ["grid", "Checkbox grid", "Scale"],
  ["ranking", "Ranking", "Scale"],
  ["file", "File upload", "Files"],
  ["consent", "Consent", "Files"],
  ["title", "Title", "Content"],
  ["description", "Description", "Content"],
  ["image", "Image", "Content"],
  ["divider", "Divider", "Content"],
] as const;
export type FieldType = (typeof fieldTypes)[number][0];
export type Answer = string | string[] | Record<string, string | string[]>;
export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description: string;
  required: boolean;
  options: string[];
  sectionId: string;
  sensitive: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  maxChoices?: number;
  allowedDomain?: string;
  dateFrom?: string;
  dateTo?: string;
  columns?: string[];
  condition?: { fieldId: string; value: string };
}
export interface FormSection {
  id: string;
  title: string;
  description: string;
}
export interface FormSettings {
  access: "public" | "verified" | "unlisted" | "invited" | "internal";
  limit: number;
  resume: boolean;
  editing: boolean;
  receipts: boolean;
  confirmation: string;
  opensAt: string;
  closesAt: string;
}
export interface FormVersion {
  version: number;
  title: string;
  description: string;
  fields: FormField[];
  sections: FormSection[];
  settings: FormSettings;
  publishedAt: string;
}
export interface PreviewForm {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "Draft" | "Open" | "Scheduled" | "Closed" | "Archived";
  updatedAt: string;
  fields: FormField[];
  sections: FormSection[];
  settings: FormSettings;
  versions: FormVersion[];
  team: string;
}
export interface FormResponse {
  id: string;
  formId: string;
  version: number;
  submittedAt: string;
  answers: Record<string, Answer>;
  redacted?: boolean;
  revisions?: { editedAt: string; answers: Record<string, Answer> }[];
}
const key = "gdg-preview-forms",
  responseKey = "gdg-preview-form-responses";
const id = () => crypto.randomUUID();
export function newField(type: FieldType, sectionId: string): FormField {
  return {
    id: id(),
    type,
    label: fieldTypes.find((item) => item[0] === type)?.[1] || "Question",
    description: "",
    required: false,
    options: ["Option 1", "Option 2", "Option 3"],
    sectionId,
    sensitive: false,
  };
}
export function createTemplate(title = "Untitled form"): PreviewForm {
  const section = { id: id(), title: "About you", description: "" };
  const settings: FormSettings = {
    access: "public",
    limit: 0,
    resume: true,
    editing: true,
    receipts: false,
    confirmation: "Thank you for sharing your response with the chapter.",
    opensAt: "",
    closesAt: "",
  };
  const name = {
    ...newField("short", section.id),
    label: "Full name",
    required: true,
  };
  const email = {
    ...newField("email", section.id),
    label: "Email address",
    required: true,
    description: "We’ll use this only for chapter-related communication.",
  };
  const experience = {
    ...newField("radio", section.id),
    label: "How would you describe your experience?",
    options: [
      "Just getting started",
      "I’ve built a few things",
      "Experienced builder",
    ],
    required: true,
  };
  const interests = {
    ...newField("checkbox", section.id),
    label: "What would you like to explore?",
    options: [
      "AI & machine learning",
      "Web development",
      "Cloud computing",
      "Mobile development",
    ],
  };
  return {
    id: id(),
    slug: `${title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, "")}-${id().slice(0, 6)}`,
    title,
    description: "Help us create experiences that are right for our community.",
    status: "Draft",
    updatedAt: new Date().toISOString(),
    fields: [name, email, experience, interests],
    sections: [section],
    settings,
    versions: [],
    team: "Chapter",
  };
}

export function duplicateSection(
  form: PreviewForm,
  sectionId: string,
): PreviewForm {
  const section = form.sections.find((section) => section.id === sectionId);
  if (!section) return form;
  const copied = {
    ...structuredClone(section),
    id: id(),
    title: `${section.title} (copy)`,
  };
  const fields = form.fields.filter((field) => field.sectionId === sectionId),
    mapping = new Map(fields.map((field) => [field.id, id()]));
  return {
    ...form,
    sections: [...form.sections, copied],
    fields: [
      ...form.fields,
      ...fields.map((field) => ({
        ...structuredClone(field),
        id: mapping.get(field.id)!,
        sectionId: copied.id,
        condition: field.condition
          ? {
              ...field.condition,
              fieldId:
                mapping.get(field.condition.fieldId) || field.condition.fieldId,
            }
          : undefined,
      })),
    ],
  };
}
function initialForms(): PreviewForm[] {
  if (!localPreviewEnabled) return [];
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch {
    /* Start from clean demo fixtures when browser storage is unavailable. */
  }
  const form = createTemplate("Event Interest Form");
  form.slug = "event-interest";
  form.status = "Open";
  form.versions = [
    {
      version: 1,
      title: form.title,
      description: form.description,
      fields: structuredClone(form.fields),
      sections: structuredClone(form.sections),
      settings: structuredClone(form.settings),
      publishedAt: new Date().toISOString(),
    },
  ];
  return [
    form,
    createTemplate("Volunteer Signup"),
    createTemplate("Team Application"),
    createTemplate("Post-Event Feedback"),
  ];
}
let forms = initialForms();
let responses: FormResponse[] = [];
try {
  if (localPreviewEnabled) {
    localStorage.setItem(key, JSON.stringify(forms));
    responses = JSON.parse(localStorage.getItem(responseKey) || "[]");
  }
} catch {
  /* Empty local dataset. */
}
const listeners = new Set<() => void>();
function emit() {
  if (localPreviewEnabled) {
    localStorage.setItem(key, JSON.stringify(forms));
    localStorage.setItem(responseKey, JSON.stringify(responses));
  }
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const formsStore = {
  getForms: () => forms as readonly PreviewForm[],
  getResponses: () => responses as readonly FormResponse[],
  save(form: PreviewForm) {
    if (!localPreviewEnabled) return;
    const saved = {
      ...structuredClone(form),
      updatedAt: new Date().toISOString(),
    };
    forms = forms.some((item) => item.id === form.id)
      ? forms.map((item) => (item.id === form.id ? saved : item))
      : [...forms, saved];
    emit();
  },
  publish(form: PreviewForm) {
    const version = form.versions.length + 1;
    const next = {
      ...form,
      status: "Open" as const,
      versions: [
        ...form.versions,
        {
          version,
          title: form.title,
          description: form.description,
          fields: structuredClone(form.fields),
          sections: structuredClone(form.sections),
          settings: structuredClone(form.settings),
          publishedAt: new Date().toISOString(),
        },
      ],
    };
    this.save(next);
    return next;
  },
  duplicate(form: PreviewForm) {
    const next = {
      ...structuredClone(form),
      id: id(),
      slug: `${form.slug}-${id().slice(0, 6)}`,
      title: `${form.title} (copy)`,
      status: "Draft" as const,
      versions: [],
    };
    this.save(next);
    return next;
  },
  submit(response: FormResponse) {
    if (!localPreviewEnabled) return;
    const previous = responses.find((item) => item.id === response.id);
    if (previous)
      response = {
        ...response,
        revisions: [
          ...(previous.revisions || []),
          {
            editedAt: new Date().toISOString(),
            answers: structuredClone(previous.answers),
          },
        ],
      };
    responses = responses.some((item) => item.id === response.id)
      ? responses.map((item) => (item.id === response.id ? response : item))
      : [...responses, response];
    emit();
  },
  redact(responseId: string) {
    responses = responses.map((response) => {
      const definition = forms
        .find((form) => form.id === response.formId)
        ?.versions.find((version) => version.version === response.version);
      const redactAnswers = (answers: Record<string, Answer>) =>
        Object.fromEntries(
          Object.entries(answers).map(([id, value]) => {
            const field = definition?.fields.find((field) => field.id === id);
            return [
              id,
              field &&
              (field.sensitive ||
                ["email", "phone"].includes(field.type) ||
                /\b(name|e-?mail|phone|address|student\s*id)\b/i.test(
                  field.label,
                ))
                ? "[Identity redacted]"
                : value,
            ];
          }),
        );
      return response.id === responseId
        ? {
            ...response,
            answers: redactAnswers(response.answers),
            revisions: response.revisions?.map((revision) => ({
              ...revision,
              answers: redactAnswers(revision.answers),
            })),
            redacted: true,
          }
        : response;
    });
    emit();
  },
  removeResponse(responseId: string) {
    responses = responses.filter((response) => response.id !== responseId);
    emit();
  },
};
export function useForms() {
  return useSyncExternalStore(subscribe, () => forms);
}
export function useResponses() {
  return useSyncExternalStore(subscribe, () => responses);
}
export function visibleFields(
  fields: FormField[],
  answers: Record<string, Answer>,
) {
  const visible = new Set<string>();
  return fields.filter((field) => {
    const show =
      !field.condition ||
      (visible.has(field.condition.fieldId) &&
        (Array.isArray(answers[field.condition.fieldId])
          ? (answers[field.condition.fieldId] as string[]).includes(
              field.condition.value,
            )
          : answers[field.condition.fieldId] === field.condition.value));
    if (show) visible.add(field.id);
    return show;
  });
}
export function validateDefinition(form: PreviewForm): string[] {
  const issues: string[] = [];
  if (!form.title.trim()) issues.push("Give your form a title.");
  if (!form.fields.length) issues.push("Add at least one question.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))
    issues.push("Use a URL slug with lowercase letters, numbers, and hyphens.");
  if (!form.sections.length) issues.push("Add at least one section.");
  if (
    form.settings.opensAt &&
    form.settings.closesAt &&
    new Date(form.settings.opensAt) >= new Date(form.settings.closesAt)
  )
    issues.push("The closing time must be after the opening time.");
  for (const field of form.fields) {
    if (
      (field.minLength ?? 0) > (field.maxLength ?? Infinity) ||
      (field.min ?? -Infinity) > (field.max ?? Infinity)
    )
      issues.push(`Review the minimum and maximum for “${field.label}”.`);
    if (
      ["likert", "grid"].includes(field.type) &&
      field.columns &&
      field.columns.filter((column) => column.trim()).length < 2
    )
      issues.push(`“${field.label}” needs at least two grid columns.`);
    if (!form.sections.some((section) => section.id === field.sectionId))
      issues.push(`“${field.label}” needs a valid section.`);
    if (!field.label.trim() && !["divider", "image"].includes(field.type))
      issues.push("Every question needs a visible label.");
    if (
      ["radio", "checkbox", "dropdown", "likert", "grid", "ranking"].includes(
        field.type,
      ) &&
      field.options.filter((option) => option.trim()).length < 2
    )
      issues.push(`“${field.label}” needs at least two options.`);
    if (field.condition) {
      const source = form.fields.findIndex(
        (item) => item.id === field.condition?.fieldId,
      );
      if (source < 0 || source >= form.fields.indexOf(field))
        issues.push(
          `“${field.label}” must depend on an earlier question to avoid cycles.`,
        );
      if (!field.condition.value.trim())
        issues.push(`Choose a matching answer for “${field.label}”.`);
    }
  }
  return [...new Set(issues)];
}

export function validateAnswer(
  field: FormField,
  value: Answer | undefined,
): string | null {
  if (["divider", "title", "description", "image"].includes(field.type))
    return null;
  const text = typeof value === "string" ? value.trim() : "";
  const empty =
    value == null ||
    (typeof value === "string" && !text) ||
    (Array.isArray(value) && !value.length) ||
    (typeof value === "object" && !Object.keys(value).length);
  if (empty) return field.required ? `Please answer “${field.label}”.` : null;
  if (typeof value === "string") {
    if (field.minLength && text.length < field.minLength)
      return `Use at least ${field.minLength} characters.`;
    if (field.maxLength && text.length > field.maxLength)
      return `Use no more than ${field.maxLength} characters.`;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
      return "Enter a valid email address.";
    if (
      field.type === "email" &&
      field.allowedDomain &&
      text.split("@")[1]?.toLowerCase() !==
        field.allowedDomain.toLowerCase().replace(/^@/, "")
    )
      return `Use an email address at ${field.allowedDomain}.`;
    if (field.type === "url") {
      try {
        if (!["https:", "http:"].includes(new URL(text).protocol))
          return "Use an http or https URL.";
      } catch {
        return "Enter a valid URL.";
      }
    }
    if (
      ["number", "scale", "rating"].includes(field.type) &&
      (!Number.isFinite(Number(text)) ||
        Number(text) < (field.min ?? -Infinity) ||
        Number(text) > (field.max ?? Infinity))
    )
      return "Enter a number within the allowed range.";
    if (
      ["radio", "dropdown"].includes(field.type) &&
      !field.options.includes(text)
    )
      return "Choose an available option.";
    if (
      ["date", "datetime"].includes(field.type) &&
      ((field.dateFrom && text < field.dateFrom) ||
        (field.dateTo && text > field.dateTo))
    )
      return "Choose a date within the allowed range.";
  }
  if (
    Array.isArray(value) &&
    field.maxChoices &&
    value.length > field.maxChoices
  )
    return `Choose no more than ${field.maxChoices} options.`;
  if (["likert", "grid"].includes(field.type) && field.required) {
    const grid =
      typeof value === "object" && !Array.isArray(value) ? value : {};
    if (
      field.options.some(
        (row) => !grid[row] || (Array.isArray(grid[row]) && !grid[row].length),
      )
    )
      return "Answer each row in this grid.";
  }
  return null;
}
