import { useEffect, useState } from "react";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
export type Kind = "subscribers" | "templates" | "campaigns";
export type NewsletterRecord = {
  id: string;
  teamId: string | null;
  revision: number;
  actions: string[];
  deletedAt: string | null;
  name?: string;
  email?: string;
  state?: string;
  confirmedAt?: string;
  consentAt?: string;
  suppressedAt?: string;
  suppressionReason?: string;
  description?: string;
  content?: string;
  subject?: string;
  status?: string;
  audience?: "all" | "custom";
  recipientIds?: string[];
  scheduledAt?: string;
  sentAt?: string;
  recipientCount?: number;
  createdAt: string;
  updatedAt: string;
};
export type Listing = {
  items: NewsletterRecord[];
  total: number;
  page: number;
  pageSize: number;
};
export type Capabilities = {
  chapterRead: boolean;
  chapterCreate: boolean;
  chapterSend: boolean;
  teams: { id: string; name: string; canCreate: boolean; canSend: boolean }[];
};
export type Delivery = {
  status: string;
  counts: Record<string, number>;
  page: number;
  total: number;
  items: {
    id: string;
    email: string;
    state: string;
    provider_state: string | null;
    error_code: string | null;
    attempt_count: number;
  }[];
};
export const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "—";
export function useNewsletterWork(scope = "newsletter") {
  const [error, setError] = useState("");
  const { busy, begin, current, finish, cancel, pending } =
    usePrivateMutation(scope);
  useEffect(() => {
    setError("");
    const clear = () => setError("");
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [scope]);
  async function work<T>(
    task: (signal: AbortSignal) => Promise<T>,
    done: (result: T) => void,
  ) {
    const controller = begin();
    if (!controller) return;
    setError("");
    try {
      const result = await task(controller.signal);
      if (current(controller)) done(result);
    } catch (e) {
      if (current(controller)) setError((e as Error).message);
    } finally {
      finish(controller);
    }
  }
  return { busy, error, setError, work, cancel, pending };
}
