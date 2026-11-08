import {
  choiceSelection,
  isOtherChoiceAnswer,
  isOtherOption,
} from "./form-choice.ts";

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
  imageMediaId?: string;
  imageWidth?: number;
  imageHeight?: number;
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
  next?: string;
  rules?: { id: string; fieldId: string; value: string; target: string }[];
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
  headerAlt?: string;
  theme?: "coral" | "charcoal";
  progress?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
}
export interface FormVersion {
  versionId?: string;
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
  ownerLabel?: string;
  templateKey?: FormTemplate | null;
  revision?: number;
  responseCount?: number;
  actions?: string[];
  canDuplicate?: boolean;
}
export interface FormResponse {
  id: string;
  revision?: number;
  formId: string;
  version: number;
  submittedAt: string;
  answers: Record<string, Answer>;
  redacted?: boolean;
  versionId?: string;
  status?: string;
  revisions?: { editedAt: string; answers: Record<string, Answer> }[];
  respondent?: { name: string | null; email: string | null; source: string };
}
const id = () => crypto.randomUUID();
// Keep exact-label matches first; reserve their IDs before reusing a positional
// identity for a renamed label. Reorder+rename must never duplicate an ID.
export function reconcileOptionIds(
  previous: string[],
  previousIds: string[] | undefined,
  next: string[],
): string[] {
  const reserved = new Set<string>();
  const matched = next.map((label) => {
    const index = previous.indexOf(label),
      value = index < 0 ? undefined : previousIds?.[index];
    if (value && !reserved.has(value)) {
      reserved.add(value);
      return value;
    }
    return undefined;
  });
  return matched.map((value, index) => {
    if (value) return value;
    const positional = previousIds?.[index];
    if (positional && !reserved.has(positional)) {
      reserved.add(positional);
      return positional;
    }
    const created = id();
    reserved.add(created);
    return created;
  });
}
export function newField(type: FieldType, sectionId: string): FormField {
  return {
    id: id(),
    type,
    label: fieldTypes.find((item) => item[0] === type)?.[1] || "Question",
    description: "",
    required: false,
    options: ["Option 1", "Option 2", "Option 3"],
    optionIds: [id(), id(), id()],
    ...(["grid", "likert"].includes(type)
      ? {
          columns: ["Disagree", "Neutral", "Agree"],
          columnIds: [id(), id(), id()],
        }
      : {}),
    sectionId,
    sensitive: false,
  };
}
export type FormTemplate =
  "interest" | "feedback" | "volunteer" | "application" | "survey" | "blank";
export function createTemplate(
  title = "Untitled form",
  kind: FormTemplate = "interest",
): PreviewForm {
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
  let templateFields: FormField[] = [name, email, experience, interests];
  const templateSections: FormSection[] = [section];
  const question = (
    type: FieldType,
    label: string,
    values: Partial<FormField> = {},
  ): FormField => ({ ...newField(type, section.id), label, ...values });
  if (kind === "blank") {
    section.title = "Your questions";
    templateFields = [question("short", "Your question")];
  }
  if (kind === "feedback") {
    section.title = "Your experience";
    templateFields = [
      question("rating", "How was the event?", {
        required: true,
        min: 1,
        max: 5,
      }),
      question("long", "What worked well?", { maxLength: 2000 }),
      question("long", "What should we improve?", { maxLength: 2000 }),
      question("radio", "Would you attend another chapter event?", {
        required: true,
        options: ["Yes", "No", "Not sure"],
      }),
    ];
  }
  if (kind === "volunteer") {
    section.title = "Get involved";
    templateFields = [
      name,
      email,
      question("checkbox", "Where would you like to help?", {
        required: true,
        options: ["Event logistics", "Workshop support", "Design", "Outreach"],
      }),
      question("checkbox", "When are you usually available?", {
        options: ["Weekday afternoons", "Weekday evenings", "Weekends"],
      }),
      question("long", "Skills or interests you would like to share", {
        maxLength: 2000,
      }),
      question(
        "consent",
        "The chapter may contact me about these volunteering opportunities.",
        { required: true },
      ),
    ];
  }
  if (kind === "application") {
    const background = {
      id: id(),
      title: "Your interests and experience",
      description: "",
    };
    templateSections.push(background);
    templateFields = [
      name,
      email,
      question("radio", "Which team interests you?", {
        required: true,
        options: ["Engineering", "Design", "Community", "Operations"],
      }),
      question("long", "Why would you like to join?", {
        sectionId: background.id,
        required: true,
        maxLength: 2000,
      }),
      question("long", "Tell us about relevant experience", {
        sectionId: background.id,
        maxLength: 2000,
      }),
      question("url", "Portfolio or project link (optional)", {
        sectionId: background.id,
      }),
      question(
        "consent",
        "I understand that authorized chapter reviewers will use these answers to review my application.",
        { sectionId: background.id, required: true },
      ),
    ];
  }
  if (kind === "survey") {
    section.title = "Your perspective";
    templateFields = [
      question("radio", "How would you describe your experience?", {
        required: true,
        options: ["Positive", "Neutral", "Could be better"],
      }),
      question("long", "What would you like the chapter to know?", {
        maxLength: 2000,
      }),
    ];
  }
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
    fields: templateFields.map((field) => ({
      ...field,
      optionIds: field.options.map(() => id()),
    })),
    sections: templateSections,
    settings,
    versions: [],
    team: "Chapter",
    templateKey: kind,
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
  copied.rules = copied.rules?.map((rule) => ({
    ...rule,
    id: id(),
    fieldId: mapping.get(rule.fieldId) || rule.fieldId,
  }));
  return {
    ...form,
    sections: form.sections.flatMap((value) =>
      value.id === sectionId ? [value, copied] : [value],
    ),
    fields: [
      ...form.fields.filter(
        (field) =>
          form.sections.findIndex((value) => value.id === field.sectionId) <=
          form.sections.indexOf(section),
      ),
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
      ...form.fields.filter(
        (field) =>
          form.sections.findIndex((value) => value.id === field.sectionId) >
          form.sections.indexOf(section),
      ),
    ],
  };
}
export function visibleFields(
  fields: FormField[],
  answers: Record<string, Answer>,
  sections?: FormSection[],
) {
  if (sections) {
    const visited = new Set(
      formPath({ fields, sections }, answers).sections.map(
        (section) => section.id,
      ),
    );
    fields = fields.filter((field) => visited.has(field.sectionId));
  }
  const visible = new Set<string>();
  return fields.filter((field) => {
    const show =
      !field.condition ||
      (visible.has(field.condition.fieldId) &&
        answerMatches(answers[field.condition.fieldId], field.condition.value));
    if (show) visible.add(field.id);
    return show;
  });
}
const choiceTypes = ["radio", "checkbox", "dropdown", "scale", "rating"];
function answerMatches(answer: Answer | undefined, value: string) {
  const selected = choiceSelection(answer);
  return Array.isArray(selected)
    ? selected.includes(value)
    : selected === value;
}
export function conditionValues(field: FormField): string[] {
  if (["scale", "rating"].includes(field.type)) {
    const min = field.min ?? 1,
      max = field.max ?? 5;
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      max > 10 ||
      min >= max
    )
      return [];
    return Array.from(
      { length: Math.max(0, Math.min(101, max - min + 1)) },
      (_, i) => String(min + i),
    );
  }
  return field.options;
}
export function formPath(
  definition: Pick<FormDefinition, "fields" | "sections">,
  answers: Record<string, Answer>,
) {
  const sections: FormSection[] = [],
    visited = new Set<string>(),
    visible = new Set<string>();
  let index = 0,
    ended = false;
  while (index >= 0 && index < definition.sections.length) {
    const section = definition.sections[index];
    if (visited.has(section.id)) break;
    visited.add(section.id);
    sections.push(section);
    for (const field of definition.fields.filter(
      (field) => field.sectionId === section.id,
    )) {
      if (
        !field.condition ||
        (visible.has(field.condition.fieldId) &&
          answerMatches(
            answers[field.condition.fieldId],
            field.condition.value,
          ))
      )
        visible.add(field.id);
    }
    const rule = section.rules?.find(
        (rule) =>
          visible.has(rule.fieldId) &&
          answerMatches(answers[rule.fieldId], rule.value),
      ),
      target = rule?.target || section.next || "next";
    if (target === "end") {
      ended = true;
      break;
    }
    index =
      target === "next"
        ? index + 1
        : definition.sections.findIndex((candidate) => candidate.id === target);
  }
  return { sections, ended };
}
export function validateDefinition(form: PreviewForm): string[] {
  const issues: string[] = [];
  if (!form.title.trim()) issues.push("Give your form a title.");
  if (!form.fields.length) issues.push("Add at least one question.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug))
    issues.push("Use a URL slug with lowercase letters, numbers, and hyphens.");
  if (!form.sections.length) issues.push("Add at least one section.");
  const sectionIndex = new Map(
    form.sections.map((section, index) => [section.id, index]),
  );
  const possibleTargets = (
    section: FormSection,
    forced: Map<string, string> = new Map(),
  ) => {
    const rules = section.rules || [],
      known = rules.find((rule) => forced.get(rule.fieldId) === rule.value);
    if (known) return [known.target];
    const possible = rules.filter((rule) => !forced.has(rule.fieldId)),
      source = form.fields.find((field) => field.id === rules[0]?.fieldId);
    const exhaustive =
      source?.required &&
      !source.condition &&
      rules.every((rule) => rule.fieldId === source.id) &&
      conditionValues(source).every((value) =>
        rules.some((rule) => rule.value === value),
      );
    return [
      ...possible.map((rule) => rule.target),
      ...(!exhaustive ? [section.next || "next"] : []),
    ];
  };
  const edges = new Map<string, string[]>();
  for (const [index, section] of form.sections.entries()) {
    const targets: string[] = [],
      rules = section.rules || [];
    const target = (value: string) => {
      if (value === "end") return;
      const destination =
        value === "next" ? form.sections[index + 1]?.id : value;
      if (destination === undefined) return;
      if (!sectionIndex.has(destination))
        issues.push(`“${section.title}” has an invalid branch target.`);
      else if (sectionIndex.get(destination)! <= index)
        issues.push(`“${section.title}” must branch forward to avoid cycles.`);
      targets.push(destination);
    };
    // Validate even an unreachable fallback, but only include feasible edges.
    const feasible = new Set(possibleTargets(section));
    if (feasible.has(section.next || "next")) target(section.next || "next");
    else if (
      section.next &&
      !["next", "end"].includes(section.next) &&
      (!sectionIndex.has(section.next) ||
        sectionIndex.get(section.next)! <= index)
    )
      issues.push(`“${section.title}” has an invalid default destination.`);
    if (new Set(rules.map((rule) => rule.id)).size !== rules.length)
      issues.push("Branch rule IDs must be unique.");
    for (const rule of rules) {
      const source = form.fields.find((field) => field.id === rule.fieldId);
      if (
        !source ||
        !choiceTypes.includes(source.type) ||
        !conditionValues(source).includes(rule.value) ||
        (sectionIndex.get(source.sectionId) ?? Infinity) > index
      )
        issues.push(
          `“${section.title}” needs a valid prior choice, scale, or rating answer for each branch.`,
        );
      target(rule.target);
    }
    for (let a = 0; a < rules.length; a++)
      for (let b = a + 1; b < rules.length; b++) {
        const left = rules[a],
          right = rules[b],
          source = form.fields.find((field) => field.id === left.fieldId);
        if (left.fieldId === right.fieldId && left.value === right.value)
          issues.push(
            `“${section.title}” has duplicate or contradictory branch rules.`,
          );
        else if (
          left.target !== right.target &&
          (left.fieldId !== right.fieldId || source?.type === "checkbox")
        )
          issues.push(
            `“${section.title}” has branch rules that could match at the same time. Use one single-choice source or a shared destination.`,
          );
      }
    edges.set(section.id, targets);
  }
  const reachable = new Set<string>();
  const walk = (sectionId: string) => {
    if (reachable.has(sectionId)) return;
    reachable.add(sectionId);
    for (const next of edges.get(sectionId) || []) walk(next);
  };
  if (form.sections[0]) walk(form.sections[0].id);
  for (const section of form.sections)
    if (!reachable.has(section.id))
      issues.push(
        `“${section.title}” is unreachable. Add a path to it or remove it before publishing.`,
      );
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
      ["scale", "rating"].includes(field.type) &&
      !conditionValues(field).length
    )
      issues.push(
        `“${field.label}” needs whole-number scale bounds from 0 to 10, with the maximum above the minimum.`,
      );
    if (["date", "datetime"].includes(field.type)) {
      const from = field.dateFrom
          ? formTemporalValue(field.type, field.dateFrom)
          : undefined,
        to = field.dateTo
          ? formTemporalValue(field.type, field.dateTo)
          : undefined;
      if (
        (field.dateFrom && !from) ||
        (field.dateTo && !to) ||
        (from && to && from > to)
      )
        issues.push(
          `Review the valid earliest and latest dates for “${field.label}”.`,
        );
    }
    if (
      ["likert", "grid"].includes(field.type) &&
      field.columns &&
      field.columns.filter((column) => column.trim()).length < 2
    )
      issues.push(`“${field.label}” needs at least two grid columns.`);
    if (!form.sections.some((section) => section.id === field.sectionId))
      issues.push(`“${field.label}” needs a valid section.`);
    if (!field.label.trim() && field.type !== "divider")
      issues.push("Every question needs a visible label.");
    if (field.pattern && !safePattern(field.pattern))
      issues.push(
        `Use a supported anchored answer pattern for “${field.label}”.`,
      );
    if (
      field.type === "file" &&
      ((field.maxFiles !== undefined &&
        (!Number.isInteger(field.maxFiles) ||
          field.maxFiles < 1 ||
          field.maxFiles > 10)) ||
        (field.maxFileBytes !== undefined &&
          (!Number.isInteger(field.maxFileBytes) ||
            field.maxFileBytes < 1 ||
            field.maxFileBytes > 26214400)))
    )
      issues.push(
        `Review the file count and size limits for “${field.label}”.`,
      );
    if (field.type === "image" && !field.imageMediaId)
      issues.push("Choose an approved published image for every image block.");
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
      const sourceField = form.fields[source];
      if (
        sourceField &&
        (!choiceTypes.includes(sourceField.type) ||
          !conditionValues(sourceField).includes(field.condition.value) ||
          (sectionIndex.get(sourceField.sectionId) ?? Infinity) >
            (sectionIndex.get(field.sectionId) ?? -1))
      )
        issues.push(
          `“${field.label}” has an unreachable visibility condition.`,
        );
      if (field.required && sourceField) {
        const forced = new Map<string, string>();
        let dependency: FormField | undefined = field;
        for (
          let step = 0;
          dependency?.condition && step < form.fields.length;
          step++
        ) {
          const condition: NonNullable<FormField["condition"]> =
            dependency.condition;
          if (
            forced.has(condition.fieldId) &&
            forced.get(condition.fieldId) !== condition.value
          ) {
            issues.push(`“${field.label}” has contradictory visibility rules.`);
            break;
          }
          forced.set(condition.fieldId, condition.value);
          dependency = form.fields.find(
            (candidate) => candidate.id === condition.fieldId,
          );
        }
        const seen = new Set<string>(),
          queue = form.sections[0] ? [form.sections[0].id] : [];
        while (queue.length) {
          const current = queue.shift()!;
          if (seen.has(current)) continue;
          seen.add(current);
          const section = form.sections.find(
            (candidate) => candidate.id === current,
          );
          if (!section) continue;
          for (const target of possibleTargets(section, forced)) {
            const destination =
              target === "next"
                ? form.sections[(sectionIndex.get(current) ?? -1) + 1]?.id
                : target;
            if (destination && destination !== "end") queue.push(destination);
          }
        }
        if (!seen.has(field.sectionId))
          issues.push(
            `Required question “${field.label}” cannot be reached with its visibility condition.`,
          );
      }
    }
  }
  return [...new Set(issues)];
}

/** Calendar/local date-time validation is independent of the server's timezone.
 * No normalization of February 30, offset-bearing input or trailing text. */
export function formTemporalValue(
  type: string,
  value: string,
): string | undefined {
  const date = value.slice(0, 10),
    parsed = new Date(date + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== date
  )
    return undefined;
  if (type === "date") return value === date ? date : undefined;
  if (type !== "datetime") return undefined;
  const time = value
    .slice(10)
    .match(/^T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$/);
  return time
    ? `${date}T${time[1]}:${time[2]}:${time[3] || "00"}.${(time[4] || "").padEnd(3, "0")}`
    : undefined;
}

export function validateAnswer(
  field: FormField,
  value: Answer | undefined,
  partial = false,
): string | null {
  if (["divider", "title", "description", "image"].includes(field.type))
    return null;
  if (isOtherChoiceAnswer(value)) {
    const detail = value;
    if (
      !["radio", "checkbox"].includes(field.type) ||
      (field.type === "radio"
        ? typeof detail.selected !== "string"
        : !Array.isArray(detail.selected))
    )
      return "Choose the expected answer format.";
    const selected = Array.isArray(detail.selected)
      ? detail.selected
      : [detail.selected];
    if (
      !selected.some(
        (option) => field.options.includes(option) && isOtherOption(option),
      )
    )
      return "Select Other before adding a written answer.";
    if ((!partial && !detail.other.trim()) || detail.other.length > 300)
      return "Please specify your Other answer using 1 to 300 characters.";
    if (
      [...detail.other].some(
        (char) =>
          char.codePointAt(0)! < 32 && !["\n", "\r", "\t"].includes(char),
      )
    )
      return "Remove unsupported control characters.";
    value = detail.selected;
  } else if (["radio", "checkbox"].includes(field.type) && !partial) {
    const selected = Array.isArray(value) ? value : [value];
    if (
      selected.some(
        (option) =>
          typeof option === "string" &&
          field.options.includes(option) &&
          isOtherOption(option),
      )
    )
      return "Please specify your Other answer using 1 to 300 characters.";
  }
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
    if (field.type === "date" && !formTemporalValue("date", text))
      return "Enter a valid calendar date.";
    if (
      field.type === "time" &&
      !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)
    )
      return "Enter a valid time.";
    if (field.type === "datetime" && !formTemporalValue("datetime", text))
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
      field.type === "number" &&
      (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) ||
        !Number.isFinite(Number(text)) ||
        Number(text) < (field.min ?? -Infinity) ||
        Number(text) > (field.max ?? Infinity))
    )
      return "Enter a number within the allowed range.";
    if (
      ["scale", "rating"].includes(field.type) &&
      !conditionValues(field).includes(value)
    )
      return "Choose one of the displayed whole-number scores.";
    if (
      ["radio", "dropdown"].includes(field.type) &&
      !field.options.includes(value)
    )
      return "Choose an available option.";
    if (["date", "datetime"].includes(field.type)) {
      const current = formTemporalValue(field.type, text)!,
        from = field.dateFrom
          ? formTemporalValue(field.type, field.dateFrom)
          : undefined,
        to = field.dateTo
          ? formTemporalValue(field.type, field.dateTo)
          : undefined;
      if ((from && current < from) || (to && current > to))
        return "Choose a date within the allowed range.";
    }
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
export function formImageId(path?: string): string | undefined {
  return path?.match(
    /^\/api\/v1\/media\/public\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/,
  )?.[1];
}
const fieldSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(fieldTypes.map((f) => f[0]) as [FieldType, ...FieldType[]]),
    label: bounded(500),
    description: bounded(3000),
    required: z.boolean(),
    sensitive: z.boolean(),
    imageMediaId: z.string().uuid().optional(),
    imageWidth: z.number().int().min(1).max(20000).optional(),
    imageHeight: z.number().int().min(1).max(20000).optional(),
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
            next: z
              .union([z.literal("next"), z.literal("end"), z.string().uuid()])
              .optional(),
            rules: z
              .array(
                z
                  .object({
                    id: z.string().uuid(),
                    fieldId: z.string().uuid(),
                    value: bounded(300),
                    target: z.union([z.literal("end"), z.string().uuid()]),
                  })
                  .strict(),
              )
              .max(20)
              .optional(),
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
        headerMedia: z
          .union([
            z.literal(""),
            z
              .string()
              .regex(
                /^\/api\/v1\/media\/public\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
              ),
          ])
          .optional(),
        headerAlt: bounded(500).optional(),
        theme: z.enum(["coral", "charcoal"]).optional(),
        progress: z.boolean().optional(),
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
        const condition = field.condition;
        const source = fields.find((f) => f.id === condition.fieldId);
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
    if (
      definition.settings.shuffleQuestions &&
      (fields.some((f) => f.condition) || sections.some((s) => s.rules?.length))
    )
      issues.push("Conditional questions cannot be shuffled.");
    if (
      definition.settings.headerMedia &&
      !definition.settings.headerAlt?.trim()
    )
      issues.push(
        "Describe the header image for respondents who cannot see it.",
      );
    if (fields.filter((field) => field.type === "image").length > 20)
      issues.push("Use at most twenty image blocks in a form.");
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
  const fields = visibleFields(definition.fields, answers, definition.sections),
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
      partial,
    );
    if (error) errors[field.id] = error;
  }
  return errors;
}

import { z } from "zod";
