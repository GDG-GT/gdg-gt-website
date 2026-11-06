import { api } from "@/lib/api";
export type UploadContext = {
  slug: string;
  versionId: string;
  uploadToken: string;
  accessToken?: string;
  protected?: boolean;
};
export type UploadStatus = {
  uploadId: string;
  state: "pending" | "queued" | "clean" | "rejected" | "expired";
  scanState: string;
  filename: string;
  bytes: number;
  message?: string;
};
export type UploadIntent = {
  document: string;
  key: string;
  bytes: ArrayBuffer;
  filename: string;
  startedAt: number;
};
export type UploadInspection = {
  committed: boolean;
  canRetry: boolean;
  uploadId: string | null;
  state: UploadStatus["state"] | null;
};
export const uploadTypes: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const state = (v: unknown) =>
  ["pending", "queued", "clean", "rejected", "expired"].includes(String(v));
export const validUploadStatus = (value: UploadStatus, expected: string) =>
  !!value &&
  value.uploadId === expected &&
  state(value.state) &&
  ["pending", "queued", "scanning", "clean", "rejected", "expired"].includes(
    value.scanState,
  ) &&
  typeof value.filename === "string" &&
  !!value.filename &&
  Number.isInteger(value.bytes) &&
  value.bytes >= 1 &&
  value.bytes <= 26214400;
export const uploadBody = (context: UploadContext) => ({
  versionId: context.versionId,
  uploadToken: context.uploadToken,
  ...(context.accessToken ? { accessToken: context.accessToken } : {}),
});
export async function inspectUploadPreparation(
  context: UploadContext,
  intent: UploadIntent,
  signal: AbortSignal,
) {
  const value = await api<UploadInspection>(
    `/forms/${context.slug}/uploads/recovery`,
    {
      method: "POST",
      body: JSON.parse(intent.document),
      idempotencyKey: intent.key,
      signal,
      protected: context.protected,
    },
  );
  if (
    !value ||
    typeof value.committed !== "boolean" ||
    typeof value.canRetry !== "boolean" ||
    (value.committed
      ? !id(value.uploadId) || !state(value.state) || value.canRetry
      : value.uploadId !== null || value.state !== null)
  )
    throw Error(
      "The original upload outcome could not be verified. Check it again before continuing.",
    );
  return value;
}
export async function prepareUpload(
  context: UploadContext,
  intent: UploadIntent,
  signal: AbortSignal,
) {
  const value = await api<{
    uploadId: string;
    state: UploadStatus["state"];
    url?: string;
    headers?: Record<string, string>;
  }>(`/forms/${context.slug}/uploads/prepare`, {
    method: "POST",
    body: JSON.parse(intent.document),
    idempotencyKey: intent.key,
    signal,
    protected: context.protected,
  });
  if (
    !value ||
    !id(value.uploadId) ||
    !["pending", "queued", "clean"].includes(value.state)
  )
    throw Error(
      "The prepared upload could not be verified. Check its original outcome.",
    );
  if (value.state === "pending") {
    const url = new URL(value.url || ""),
      body = JSON.parse(intent.document);
    if (
      url.username ||
      url.password ||
      url.hash ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      ) ||
      value.headers?.["Content-Type"] !== body.mime ||
      value.headers?.["x-amz-meta-sha256"] !== body.sha256 ||
      Object.keys(value.headers || {}).some(
        (key) => !["Content-Type", "x-amz-meta-sha256"].includes(key),
      )
    )
      throw Error(
        "The prepared upload destination could not be verified. Check its original outcome.",
      );
  }
  return value;
}
export function waitForUploadCheck(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 2000);
    signal.addEventListener("abort", abort, { once: true });
  });
}
