import type { FormField, FormSection, FormSettings } from "./forms";
const content = new Set(["title", "description", "image", "divider"]);
export function canShuffleQuestions(
  fields: FormField[],
  sections: FormSection[],
) {
  return (
    !fields.some((field) => field.condition) &&
    !sections.some((section) => section.rules?.length)
  );
}
/** Stable per attempt. This is presentation randomness, never a security token
 * generator. The real respondent capability supplies independent entropy. */
function permutation<T>(values: T[], seed: string): T[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++)
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  state ||= 0x6d2b79f5;
  const output = [...values];
  for (let i = output.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = Math.floor(((state >>> 0) / 4294967296) * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
export function presentationFields(
  fields: FormField[],
  sections: FormSection[],
  settings: FormSettings,
  seed: string,
): FormField[] {
  let output = fields.map((field) => {
    if (
      !settings.shuffleOptions ||
      !["radio", "checkbox", "dropdown"].includes(field.type)
    )
      return field;
    // Relative-position language cannot safely survive a permutation. Keep
    // terminal escape/decline choices anchored after all randomized choices.
    if (
      field.options.some((option) =>
        /\b(above|below|previous|next|first|second|last)\b/i.test(option),
      )
    )
      return field;
    const pairs = field.options.map((option, index) => ({
      option,
      id: field.optionIds?.[index],
    }));
    const anchored = pairs.filter((item) =>
      /^(other(?:\b.*)?|none(?: of these)?|prefer not to (?:say|answer))$/i.test(
        item.option.trim(),
      ),
    );
    const shuffled = [
      ...permutation(
        pairs.filter((item) => !anchored.includes(item)),
        seed + ":options:" + field.id,
      ),
      ...anchored,
    ];
    return {
      ...field,
      options: shuffled.map((item) => item.option),
      ...(field.optionIds
        ? { optionIds: shuffled.map((item) => item.id!) }
        : {}),
    };
  });
  if (settings.shuffleQuestions && canShuffleQuestions(fields, sections)) {
    const ordered: FormField[] = [];
    let run: FormField[] = [];
    const flush = () => {
      ordered.push(...permutation(run, seed + ":questions:" + run[0]?.id));
      run = [];
    };
    for (const field of output) {
      if (content.has(field.type)) {
        flush();
        ordered.push(field);
      } else {
        if (run.length && run[0].sectionId !== field.sectionId) flush();
        run.push(field);
      }
    }
    flush();
    output = ordered;
  }
  return output;
}
