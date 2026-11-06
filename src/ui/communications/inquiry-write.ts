import { api } from "@/lib/api";
export type InquiryWriteIntent = {
  path: string;
  action: string;
  body: string;
  key: string;
  startedAt: number;
  needsProof: boolean;
};
export type InquiryReceipt = {
  id: string;
  revision: number;
  action: string;
};
export type InquiryInspection = {
  committed: boolean;
  canRetry: boolean;
  currentRevision: number;
  receipt: InquiryReceipt | null;
};
export const inquiryIntent = (
  path: string,
  action: string,
  document: Record<string, unknown>,
): InquiryWriteIntent =>
  Object.freeze({
    path,
    action,
    body: JSON.stringify(document),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    needsProof: action === "hold",
  });
export function validInquiryReceipt(
  value: InquiryReceipt,
  intent: InquiryWriteIntent,
) {
  const id = intent.path.split("/").at(-1);
  return (
    !!value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    value.revision > JSON.parse(intent.body).revision &&
    value.id === id &&
    value.action === intent.action
  );
}
export async function submitInquiryWrite(
  intent: InquiryWriteIntent,
  signal: AbortSignal,
  password?: string,
) {
  const result = await api<InquiryReceipt>(intent.path, {
    method: "POST",
    protected: true,
    body: {
      ...JSON.parse(intent.body),
      ...(intent.needsProof ? { currentPassword: password } : {}),
    },
    idempotencyKey: intent.key,
    signal,
  });
  if (!validInquiryReceipt(result, intent))
    throw Error(
      "The original inquiry save could not be confirmed. Check its outcome before making changes.",
    );
  return result;
}
export async function inspectInquiryWrite(
  intent: InquiryWriteIntent,
  signal: AbortSignal,
) {
  const result = await api<InquiryInspection>(intent.path + "/recovery", {
    method: "POST",
    protected: true,
    body: JSON.parse(intent.body),
    idempotencyKey: intent.key,
    signal,
  });
  if (
    !result ||
    typeof result.committed !== "boolean" ||
    typeof result.canRetry !== "boolean" ||
    !Number.isInteger(result.currentRevision) ||
    result.currentRevision < 1 ||
    (result.canRetry &&
      result.currentRevision !== JSON.parse(intent.body).revision) ||
    (result.committed
      ? result.canRetry ||
        !validInquiryReceipt(result.receipt!, intent) ||
        result.receipt!.revision > result.currentRevision
      : result.receipt !== null)
  )
    throw Error(
      "The original inquiry outcome could not be verified. Check it again before retrying.",
    );
  return result;
}
export const inquiryRetryWindow = (intent: InquiryWriteIntent) =>
  Date.now() >= intent.startedAt &&
  Date.now() - intent.startedAt < 47 * 60 * 60 * 1000;
