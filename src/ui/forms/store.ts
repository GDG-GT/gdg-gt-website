import { useSyncExternalStore } from "react";
import { localPreviewEnabled } from "../preview-data";
import type { PreviewForm, FormResponse, Answer } from "../../../shared/forms";
import { createTemplate } from "../../../shared/forms";
export * from "../../../shared/forms";
const key = "gdg-preview-forms",
  responseKey = "gdg-preview-form-responses",
  id = () => crypto.randomUUID();
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
