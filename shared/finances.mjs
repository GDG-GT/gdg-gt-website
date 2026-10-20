import { z } from "zod";
import { taskDate } from "./tasks.mjs";
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        !Array.from(v).some((c) => {
          const n = c.codePointAt(0);
          return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
        }),
      "Remove control characters.",
    );
// Money crosses every JSON boundary as a canonical decimal string, never a float.
export const money = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
    "Use a positive amount with at most two decimal places.",
  )
  .transform((v) => {
    const [whole, fraction = ""] = v.split(".");
    return whole + "." + fraction.padEnd(2, "0");
  });
export const positiveMoney = money.refine(
  (v) => v !== "0.00",
  "The amount must be greater than zero.",
);
export const financeStates = [
  "draft",
  "pending",
  "team-lead-approved",
  "admin-approved",
  "completed",
  "rejected",
  "cancelled",
];
export const financeCategories = {
  income: [
    "Sponsorship",
    "Membership Fees",
    "Event Revenue",
    "Donations",
    "Grants",
    "Merchandise Sales",
    "Other Income",
  ],
  expense: [
    "Event Costs",
    "Venue Rental",
    "Catering & Food",
    "Marketing & Promotion",
    "Equipment & Supplies",
    "Software & Subscriptions",
    "Travel & Transportation",
    "Speaker Fees",
    "Merchandise Production",
    "Administrative",
    "Other Expenses",
  ],
  transfer: ["Internal Transfer", "Bank Transfer"],
  reimbursement: ["Member Reimbursement", "Vendor Reimbursement"],
};
export const financeDetails = z
  .object({
    transactionType: z.enum(["income", "expense", "transfer", "reimbursement"]),
    category: text(100, 1),
    amount: positiveMoney,
    currency: z.literal("USD").default("USD"),
    description: text(5000, 2),
    vendorName: text(200).default(""),
    referenceNumber: text(150).default(""),
    transactionDate: taskDate,
    budgetId: z.string().uuid().nullable().default(null),
    eventId: z.string().uuid().nullable().default(null),
    projectId: z.string().uuid().nullable().default(null),
    recurringFrequency: z
      .enum(["weekly", "monthly", "quarterly", "yearly"])
      .nullable()
      .default(null),
  })
  .strict()
  .refine(
    (v) => financeCategories[v.transactionType].includes(v.category),
    "Choose a category for this transaction type.",
  );
export const financeCreate = z
  .object({
    record: financeDetails,
    teamId: z.string().uuid().nullable().default(null),
    requireTeamApproval: z.boolean().optional(),
  })
  .strict();
const decision = {
  revision: z.number().int().positive(),
  currentPassword: z.string().min(1).max(128),
  confirmation: text(150, 1),
};
export const financeMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision: z.number().int().positive(),
      record: financeDetails,
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "submit",
        "team_approve",
        "admin_approve",
        "complete",
        "cancel",
      ]),
      ...decision,
    })
    .strict(),
  z
    .object({ action: z.literal("reject"), ...decision, reason: text(2000, 3) })
    .strict(),
]);
export const financeNote = z.object({ note: text(5000, 1) }).strict();
export const budgetRecord = z
  .object({
    name: text(150, 2),
    description: text(3000).default(""),
    totalAmount: positiveMoney,
    fiscalYear: z
      .string()
      .regex(/^\d{4}$/)
      .refine((v) => Number(v) >= 2000 && Number(v) <= 9999),
    startDate: taskDate,
    endDate: taskDate,
  })
  .strict()
  .refine(
    (v) => v.endDate >= v.startDate,
    "Budget end must be on or after its start.",
  );
export const budgetCreate = z
  .object({
    record: budgetRecord,
    teamId: z.string().uuid().nullable().default(null),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();
export const budgetMutation = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("update"), ...decision, record: budgetRecord })
    .strict(),
  z.object({ action: z.enum(["activate", "close"]), ...decision }).strict(),
]);
