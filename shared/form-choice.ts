export type OtherChoiceAnswer = {
  kind: "choice_other";
  selected: string | string[];
  other: string;
};

export function isOtherOption(option: string) {
  return option.trim().toLowerCase() === "other";
}

export function isOtherChoiceAnswer(
  value: unknown,
): value is OtherChoiceAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.kind === "choice_other" &&
    typeof record.other === "string" &&
    (typeof record.selected === "string" ||
      (Array.isArray(record.selected) &&
        record.selected.every((item) => typeof item === "string"))) &&
    Object.keys(record).length === 3
  );
}

export function choiceSelection(value: unknown): unknown {
  return isOtherChoiceAnswer(value) ? value.selected : value;
}

export function otherChoiceText(value: unknown) {
  if (!isOtherChoiceAnswer(value)) return undefined;
  const selected = Array.isArray(value.selected)
    ? value.selected
    : [value.selected];
  return selected
    .map((option) =>
      isOtherOption(option) ? `${option}: ${value.other}` : option,
    )
    .join(", ");
}
