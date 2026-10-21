import { publicQueue } from "../../shared/public-queue.mjs";
export async function savePendingSubmission(kind: "event" | "newsletter", payload: Record<string, unknown>, key?: string) {
  const item = await publicQueue.add(kind, payload, key);
  window.dispatchEvent(new Event("gdg:queue-changed")); window.dispatchEvent(new Event("gdg:queue-added"));
  return item.id;
}
