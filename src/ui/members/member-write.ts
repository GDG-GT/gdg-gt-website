import { api } from "@/lib/api";
export type MemberWriteIntent = {
  path: string;
  action: string;
  body: string;
  key: string;
  startedAt: number;
  needsProof: boolean;
};
export type MemberReceipt = {
  id: string;
  revision: number;
  profileId?: string | null;
};
export type MemberInspection = {
  committed: boolean;
  canRetry: boolean;
  currentRevision: number;
  receipt: MemberReceipt | null;
};
export const memberIntent = (
  path: string,
  action: string,
  document: Record<string, unknown>,
): MemberWriteIntent =>
  Object.freeze({
    path,
    action,
    body: JSON.stringify(document),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    needsProof: !["create", "update"].includes(action),
  });
export function validMemberReceipt(
  value: MemberReceipt,
  intent: MemberWriteIntent,
) {
  const id = intent.path.split("/").at(-1);
  return (
    !!value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    (intent.action === "create" ||
      value.revision > JSON.parse(intent.body).revision) &&
    (intent.action === "create" || value.id === id) &&
    (value.profileId === undefined ||
      value.profileId === null ||
      typeof value.profileId === "string")
  );
}
export async function submitMemberWrite(
  intent: MemberWriteIntent,
  signal: AbortSignal,
  password?: string,
) {
  const result = await api<MemberReceipt>(intent.path, {
    method: "POST",
    protected: true,
    body: {
      ...JSON.parse(intent.body),
      ...(intent.needsProof ? { currentPassword: password } : {}),
    },
    idempotencyKey: intent.key,
    signal,
  });
  if (!validMemberReceipt(result, intent))
    throw Error(
      "The original member save could not be confirmed. Check its outcome before making changes.",
    );
  return result;
}
export async function inspectMemberWrite(
  intent: MemberWriteIntent,
  signal: AbortSignal,
) {
  const result = await api<MemberInspection>(intent.path + "/recovery", {
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
    result.currentRevision < 0 ||
    (result.committed
      ? result.canRetry || !validMemberReceipt(result.receipt!, intent)
      : result.receipt !== null)
  )
    throw Error(
      "The original member outcome could not be verified. Check it again before retrying.",
    );
  return result;
}
export const memberRetryWindow = (intent: MemberWriteIntent) =>
  Date.now() >= intent.startedAt &&
  Date.now() - intent.startedAt < 47 * 60 * 60 * 1000;
