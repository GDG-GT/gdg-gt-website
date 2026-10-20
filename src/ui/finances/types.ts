export type Finance = {
  id: string;
  reference: string;
  transactionType: string;
  category: string;
  amount: string;
  currency: string;
  description: string;
  vendorName: string;
  referenceNumber: string;
  transactionDate: string;
  teamId: string | null;
  teamName: string | null;
  budgetId: string | null;
  budgetName: string | null;
  eventId: string | null;
  projectId: string | null;
  recurringFrequency: string | null;
  requiresTeamApproval: boolean;
  status: string;
  revision: number;
  createdBy: string;
  creatorName: string | null;
  approverName: string | null;
  teamApproverName: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rejectionReason: string | null;
  actions: string[];
};
export type Budget = {
  id: string;
  name: string;
  description: string;
  totalAmount: string;
  teamId: string | null;
  teamName: string | null;
  fiscalYear: string;
  startDate: string;
  endDate: string;
  status: string;
  revision: number;
  usage: { spent: string; reserved: string };
  canManage: boolean;
};
export type Detail = {
  record: Finance;
  decisions: {
    id: string;
    actorName: string;
    from: string;
    to: string;
    revision: number;
    reason: string | null;
    createdAt: string;
  }[];
  notes: { id: string; actorName: string; note: string; createdAt: string }[];
  noteTotal: number;
  notePageSize: number;
  retention: string;
};
export type Capabilities = {
  actorId: string;
  globalAdmin: boolean;
  canCreate: boolean;
  teams: { id: string; name: string }[];
  fundingReferences: { source: string; amount: string; state: string }[];
  fundingNotice: string;
};
export type Listing = {
  stateCounts: Record<string, number>;
  items: Finance[];
  total: number;
  pageSize: number;
  summary: {
    completedIncome: string;
    completedExpenses: string;
    reservedExpenses: string;
    awaitingApproval: number;
    net: string;
  };
};
export type BudgetListing = {
  items: Budget[];
  total: number;
  pageSize: number;
};
export type Report = {
  months: { month: string; income: string; expenses: string }[];
  categories: {
    category: string;
    transaction_type: string;
    amount: string;
    count: number;
  }[];
  note: string;
};
export const human = (v: string) =>
  v.replace(/[_-]/g, " ").replace(/\b\w/g, (v) => v.toUpperCase());
export function dollars(value: string) {
  const negative = value.startsWith("-"),
    [whole, fraction = "00"] = value.replace(/^-/, "").split(".");
  return `${negative ? "−" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function remaining(b: Budget) {
  const cents = (v: string) => {
    const [a, f = ""] = v.split(".");
    return BigInt(a) * 100n + BigInt(f.padEnd(2, "0"));
  };
  const n =
    cents(b.totalAmount) - cents(b.usage.spent) - cents(b.usage.reserved);
  return (
    (n < 0n ? "-" : "") +
    (n < 0n ? -n / 100n : n / 100n).toString() +
    "." +
    ((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")
  );
}
