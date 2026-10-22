import { z } from "zod";

export const formTemplateSchema = z.enum([
  "blank",
  "interest",
  "feedback",
  "volunteer",
  "application",
  "survey",
]);
export const formTemplateLabels = {
  blank: "Blank form",
  interest: "Event interest",
  feedback: "Event feedback",
  volunteer: "Volunteer signup",
  application: "Team application",
  survey: "General survey",
};
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date.");
const paging = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  q: z
    .string()
    .trim()
    .max(100)
    .refine(
      (value) =>
        !Array.from(value).some((character) => {
          const code = character.charCodeAt(0);
          return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
        }),
    )
    .optional(),
};
export const formLibraryQuerySchema = z
  .object({
    ...paging,
    team: z.union([z.string().uuid(), z.literal("chapter")]).optional(),
    owner: z.string().uuid().optional(),
    state: z
      .enum(["Draft", "Open", "Scheduled", "Closed", "Archived"])
      .optional(),
    template: z
      .union([formTemplateSchema, z.literal("unspecified")])
      .optional(),
    updatedFrom: day.optional(),
    updatedTo: day.optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.updatedFrom ||
      !value.updatedTo ||
      value.updatedFrom <= value.updatedTo,
    {
      message: "The end date must be on or after the start date.",
      path: ["updatedTo"],
    },
  );
export const formLibraryOptionsSchema = z
  .object({
    ...paging,
    kind: z.enum(["owner", "team"]),
  })
  .strict();
