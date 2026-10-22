import { api } from "./api";
export type ContactUpload = {
  file: File;
  uploadToken: string;
  uploadId?: string;
  createKey: string;
  completeKey: string;
  uploaded: boolean;
  queued: boolean;
  rejected?: boolean;
};
export function contactUpload(file: File): ContactUpload {
  const bytes = crypto.getRandomValues(new Uint8Array(32)),
    uploadToken = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return {
    file,
    uploadToken,
    createKey: crypto.randomUUID(),
    completeKey: crypto.randomUUID(),
    uploaded: false,
    queued: false,
  };
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("Upload cancelled"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 2000);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
}
export async function prepareContactAttachment(
  state: ContactUpload,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  if (state.rejected)
    throw Error(
      "This attachment was rejected or expired. Remove it or choose another file before sending.",
    );
  const { file, uploadToken } = state;
  if (!state.uploaded) {
    progress("Preparing your private attachment…");
    const bytes = await file.arrayBuffer(),
      digest = await crypto.subtle.digest("SHA-256", bytes),
      sha256 = Array.from(new Uint8Array(digest))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
    signal.throwIfAborted();
    const intent = await api<{
      uploadId: string;
      url: string;
      headers: Record<string, string>;
    }>("/contact/upload-intents", {
      method: "POST",
      body: {
        filename: file.name,
        mime: file.type,
        bytes: file.size,
        sha256,
        uploadToken,
        website: "",
      },
      idempotencyKey: state.createKey,
      signal,
    });
    state.uploadId = intent.uploadId;
    progress("Uploading privately…");
    const result = await fetch(intent.url, {
      method: "PUT",
      headers: intent.headers,
      body: file,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    });
    if (!result.ok)
      throw Error(
        "The attachment did not finish uploading. Try sending again while this page remains open.",
      );
    state.uploaded = true;
  }
  if (!state.queued) {
    await api(`/contact/uploads/${state.uploadId}/complete`, {
      method: "POST",
      body: { uploadToken },
      idempotencyKey: state.completeKey,
      signal,
    });
    state.queued = true;
  }
  progress(
    "Checking the attachment for safe content… Your message has not been sent yet.",
  );
  for (let n = 0; n < 30; n++) {
    const result = await api<{ state: string }>(
      `/contact/uploads/${state.uploadId}/status`,
      { method: "POST", body: { uploadToken }, signal },
    );
    if (result.state === "clean" || result.state === "attached") {
      progress(
        result.state === "attached"
          ? "Confirming the saved message…"
          : "Attachment checked. Saving your message…",
      );
      return { uploadId: state.uploadId, uploadToken };
    }
    if (["rejected", "expired"].includes(result.state)) {
      state.rejected = true;
      throw Error(
        "This attachment could not be accepted. Remove it or choose a different file.",
      );
    }
    await pause(signal);
  }
  throw Error(
    "The attachment is still being checked. Your message has not been sent. Try Send message again in a moment, or remove the attachment.",
  );
}
export async function abandonContactAttachment(state?: ContactUpload) {
  if (state?.uploadId)
    await api(`/contact/uploads/${state.uploadId}`, {
      method: "DELETE",
      body: { uploadToken: state.uploadToken },
      idempotencyKey: crypto.randomUUID(),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
}
