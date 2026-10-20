import { Button, Field } from "../primitives";
import { conditionValues, type PreviewForm, type FormSection } from "./store";
export default function SectionLogic({
  form,
  sectionId,
  onChange,
}: {
  form: PreviewForm;
  sectionId: string;
  onChange: (section: FormSection) => void;
}) {
  const index = form.sections.findIndex((section) => section.id === sectionId),
    section = form.sections[index];
  if (!section) return null;
  const sources = form.fields.filter(
      (field) =>
        ["radio", "checkbox", "dropdown", "rating", "scale"].includes(
          field.type,
        ) && form.sections.findIndex((s) => s.id === field.sectionId) <= index,
    ),
    targets = form.sections.slice(index + 1);
  const update = (
    id: string,
    values: Partial<NonNullable<FormSection["rules"]>[number]>,
  ) =>
    onChange({
      ...section,
      rules: section.rules?.map((rule) =>
        rule.id === id ? { ...rule, ...values } : rule,
      ),
    });
  return (
    <div className="gt-form">
      <h3>After “{section.title}”</h3>
      <p className="gt-helper">
        Rules are evaluated after this section. A matching answer can skip ahead
        or end the form. Conflicting routes and unreachable sections must be
        fixed before publication.
      </p>
      <Field label="Default destination">
        <select
          value={section.next || "next"}
          onChange={(event) =>
            onChange({ ...section, next: event.target.value })
          }
        >
          <option value="next">Next section</option>
          <option value="end">End and review</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.title}
            </option>
          ))}
        </select>
      </Field>
      {(section.rules || []).map((rule, ruleIndex) => {
        const source = form.fields.find((field) => field.id === rule.fieldId);
        return (
          <fieldset key={rule.id} className="gt-branch-rule">
            <legend>Branch {ruleIndex + 1}</legend>
            <Field label="When this answer">
              <select
                value={rule.fieldId}
                onChange={(event) => {
                  const field = sources.find(
                    (field) => field.id === event.target.value,
                  );
                  if (field)
                    update(rule.id, {
                      fieldId: field.id,
                      value: conditionValues(field)[0] || "",
                    });
                }}
              >
                {sources.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Matches">
              <select
                value={rule.value}
                onChange={(event) =>
                  update(rule.id, { value: event.target.value })
                }
              >
                {source &&
                  conditionValues(source).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Go to">
              <select
                value={rule.target}
                onChange={(event) =>
                  update(rule.id, { target: event.target.value })
                }
              >
                <option value="end">End and review</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.title}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onChange({
                  ...section,
                  rules: section.rules?.filter((value) => value.id !== rule.id),
                })
              }
            >
              Remove branch {ruleIndex + 1}
            </Button>
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        disabled={!sources.length || (section.rules?.length || 0) >= 20}
        onClick={() => {
          const field = sources[0];
          onChange({
            ...section,
            rules: [
              ...(section.rules || []),
              {
                id: crypto.randomUUID(),
                fieldId: field.id,
                value: conditionValues(field)[0] || "",
                target: targets[0]?.id || "end",
              },
            ],
          });
        }}
      >
        Add section branch
      </Button>
      {!sources.length && (
        <p className="gt-helper">
          Add a choice, rating, or scale question in this or an earlier section
          first.
        </p>
      )}
    </div>
  );
}
