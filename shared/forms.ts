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
  optionIds?: string[];
  columnIds?: string[];
  pattern?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  allowedMime?: string[];
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
  oneResponse?: boolean;
  retentionDays?: number;
  hold?: boolean;
  closedMessage?: string;
  indexable?: boolean;
  review?: boolean;
  headerMedia?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
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
  teamId?: string | null;
  ownerId?: string;
  revision?: number;
  responseCount?: number;
  actions?: string[];
}
export interface FormResponse {
  id: string;
  formId: string;
  version: number;
  submittedAt: string;
  answers: Record<string, Answer>;
  redacted?: boolean;
  versionId?: string;
  status?: string;
  revisions?: { editedAt: string; answers: Record<string, Answer> }[];
}
const id = () => crypto.randomUUID();
export function newField(type: FieldType, sectionId: string): FormField {
  return {
    id: id(),
    type,
    label: fieldTypes.find((item) => item[0] === type)?.[1] || "Question",
    description: "",
    required: false,
    options: ["Option 1", "Option 2", "Option 3"],
    optionIds: [id(), id(), id()],
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
    fields: [name, email, experience, interests].map((field) => ({
      ...field,
      optionIds: field.options.map(() => id()),
    })),
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
  if (field.type === "consent")
    return value === "Agreed" ? null : "Consent must be acknowledged.";
  if (
    ["checkbox", "ranking", "file"].includes(field.type) &&
    !Array.isArray(value)
  )
    return "Choose the expected answer format.";
  if (
    !["checkbox", "ranking", "file", "likert", "grid"].includes(field.type) &&
    typeof value !== "string"
  )
    return "Enter a single answer.";
  if (
    typeof value === "string" &&
    [...value].some(
      (char) => char.codePointAt(0)! < 32 && !["\n", "\r", "\t"].includes(char),
    )
  )
    return "Remove unsupported control characters.";
  if (Array.isArray(value)) {
    if (field.maxChoices && value.length > field.maxChoices)
      return `Choose no more than ${field.maxChoices} options.`;
    if (new Set(value).size !== value.length)
      return "Each answer may be selected only once.";
    if (
      field.type !== "file" &&
      value.some((item) => !field.options.includes(item))
    )
      return "Choose available options only.";
    if (field.type === "ranking" && value.length !== field.options.length)
      return "Rank every available option.";
    if (
      field.type === "file" &&
      (value.length > (field.maxFiles || 1) ||
        value.some((item) => !z.string().uuid().safeParse(item).success))
    )
      return "Choose valid uploaded files within the limit.";
  }
  if (["likert", "grid"].includes(field.type)) {
    if (typeof value !== "object" || Array.isArray(value))
      return "Answer using the grid.";
    const columns = field.columns || ["Disagree", "Neutral", "Agree"];
    if (Object.keys(value).some((key) => !field.options.includes(key)))
      return "Choose available grid rows only.";
    for (const answer of Object.values(value)) {
      if (
        field.type === "likert" &&
        (typeof answer !== "string" || !columns.includes(answer))
      )
        return "Choose an available grid column.";
      if (
        field.type === "grid" &&
        (!Array.isArray(answer) ||
          new Set(answer).size !== answer.length ||
          answer.some((item) => !columns.includes(item)))
      )
        return "Choose available grid columns only.";
    }
  }
  if (typeof value === "string") {
    if (text.length > 20000) return "Use no more than 20,000 characters.";
    if (
      field.pattern &&
      (!safePattern(field.pattern) ||
        text.length > 512 ||
        !new RegExp(field.pattern, "u").test(text))
    )
      return "Use the requested format (up to 512 characters).";
    if (field.type === "phone" && !/^[+0-9() .-]{5,32}$/.test(text))
      return "Enter a valid phone number.";
    if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
        !Number.isFinite(Date.parse(text)) ||
        new Date(text).toISOString().slice(0, 10) !== text)
    )
      return "Enter a valid calendar date.";
    if (
      field.type === "time" &&
      !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)
    )
      return "Enter a valid time.";
    if (
      field.type === "datetime" &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ||
        !Number.isFinite(Date.parse(text)))
    )
      return "Enter a valid date and time.";
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

// A deliberately bounded regex subset: anchored, no groups/alternation,
// backreferences, lookarounds, or more than one unbounded repetition.
export function safePattern(pattern: string): boolean {
  if (
    pattern.length > 120 ||
    !pattern.startsWith("^") ||
    !pattern.endsWith("$") ||
    /[()|*?{}]/.test(pattern) ||
    /\\[1-9]/.test(pattern)
  )
    return false;
  if ((pattern.match(/(?<!\\)\+/g) || []).length > 1) return false;
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}
const bounded = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (v) =>
        ![...v].some(
          (c) => c.codePointAt(0)! < 32 && !["\n", "\r", "\t"].includes(c),
        ),
      "Unsupported control character",
    );
const timestamp = z.union([
  z.literal(""),
  z.string().datetime({ offset: true }),
]);
const webUrl = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2048)
    .refine((v) => {
      const url = new URL(v);
      return url.protocol === "https:" && !url.username && !url.password;
    }),
]);
const fieldSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(fieldTypes.map((f) => f[0]) as [FieldType, ...FieldType[]]),
    label: bounded(500),
    description: bounded(3000),
    required: z.boolean(),
    sensitive: z.boolean(),
    sectionId: z.string().uuid(),
    options: z.array(bounded(300)).max(100),
    columns: z.array(bounded(300)).max(30).optional(),
    optionIds: z.array(z.string().uuid()).max(100).optional(),
    columnIds: z.array(z.string().uuid()).max(30).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    minLength: z.number().int().min(0).max(20000).optional(),
    maxLength: z.number().int().min(1).max(20000).optional(),
    maxChoices: z.number().int().min(1).max(100).optional(),
    allowedDomain: z
      .string()
      .max(253)
      .regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/)
      .optional(),
    dateFrom: z.string().max(40).optional(),
    dateTo: z.string().max(40).optional(),
    pattern: z.string().refine(safePattern).optional(),
    maxFiles: z.number().int().min(1).max(10).optional(),
    maxFileBytes: z.number().int().min(1).max(26214400).optional(),
    allowedMime: z
      .array(
        z.enum([
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "image/png",
          "image/jpeg",
          "image/webp",
        ]),
      )
      .min(1)
      .max(6)
      .optional(),
    condition: z
      .object({ fieldId: z.string().uuid(), value: bounded(300) })
      .strict()
      .optional(),
  })
  .strict();
export const formDraftDefinitionSchema = z
  .object({
    title: bounded(200).refine((v) => v.trim().length >= 2),
    description: bounded(10000),
    fields: z.array(fieldSchema).min(1).max(200),
    sections: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            title: bounded(200),
            description: bounded(3000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    settings: z
      .object({
        access: z.enum([
          "public",
          "verified",
          "unlisted",
          "invited",
          "internal",
        ]),
        limit: z.number().int().min(0).max(1000000),
        resume: z.boolean(),
        editing: z.boolean(),
        receipts: z.boolean(),
        confirmation: bounded(3000),
        opensAt: timestamp,
        closesAt: timestamp,
        oneResponse: z.boolean().optional(),
        retentionDays: z.number().int().min(1).max(365).default(365),
        hold: z.boolean().default(false),
        closedMessage: bounded(3000).default(
          "This form is not accepting responses right now.",
        ),
        indexable: z.boolean().default(false),
        review: z.boolean().default(true),
        headerMedia: webUrl.optional(),
        shuffleQuestions: z.boolean().default(false),
        shuffleOptions: z.boolean().default(false),
      })
      .strict(),
  })
  .strict();
export const formDefinitionSchema = formDraftDefinitionSchema.superRefine(
  (definition, context) => {
    const issues = validateDefinition({
      ...definition,
      slug: "validation-only",
    } as PreviewForm);
    const fields = definition.fields,
      sections = definition.sections;
    if (
      new Set(fields.map((f) => f.id)).size !== fields.length ||
      new Set(sections.map((s) => s.id)).size !== sections.length
    )
      issues.push("Field and section IDs must be unique.");
    for (const field of fields) {
      if (
        new Set(field.options).size !== field.options.length ||
        field.options.some((v) => !v.trim())
      )
        issues.push("Options must be nonempty and unique.");
      if (
        field.columns &&
        (new Set(field.columns).size !== field.columns.length ||
          field.columns.some((v) => !v.trim()))
      )
        issues.push("Grid columns must be nonempty and unique.");
      if (
        field.optionIds &&
        (field.optionIds.length !== field.options.length ||
          new Set(field.optionIds).size !== field.optionIds.length)
      )
        issues.push("Option IDs must be unique and match options.");
      if (
        field.columnIds &&
        (field.columnIds.length !== field.columns?.length ||
          new Set(field.columnIds).size !== field.columnIds.length)
      )
        issues.push("Column IDs must be unique and match columns.");
      if (field.condition) {
        const source = fields.find((f) => f.id === field.condition.fieldId);
        if (
          !source ||
          !["radio", "checkbox", "dropdown", "scale", "rating"].includes(
            source.type,
          )
        )
          issues.push(
            "Conditions require an earlier choice, scale, or rating field.",
          );
      }
    }
    if (
      definition.settings.oneResponse &&
      definition.settings.access === "public"
    )
      issues.push(
        "One-response mode requires verified identity or an invitation.",
      );
    if (definition.settings.shuffleQuestions && fields.some((f) => f.condition))
      issues.push("Conditional questions cannot be shuffled.");
    for (const message of new Set(issues))
      context.addIssue({ code: z.ZodIssueCode.custom, message });
  },
);
export type FormDefinition = Pick<
  PreviewForm,
  "title" | "description" | "fields" | "sections" | "settings"
>;
export function validateSubmission(
  definition: FormDefinition,
  answers: Record<string, Answer>,
  partial = false,
): Record<string, string> {
  const fields = visibleFields(definition.fields, answers),
    allowed = new Set(
      fields
        .filter(
          (f) => !["title", "description", "divider", "image"].includes(f.type),
        )
        .map((f) => f.id),
    );
  const errors: Record<string, string> = {};
  for (const key of Object.keys(answers))
    if (!allowed.has(key)) errors[key] = "This field is unknown or hidden.";
  for (const field of fields) {
    const error = validateAnswer(
      partial ? { ...field, required: false } : field,
      answers[field.id],
    );
    if (error) errors[field.id] = error;
  }
  return errors;
}

import { z } from "zod";
