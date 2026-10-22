import { useEffect, useRef, useState } from "react";
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
export function useNewsletterWork() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    pending = useRef<AbortController>(),
    running = useRef(false);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      pending.current?.abort();
    };
    const clear = () => {
      invalidate();
      running.current = false;
      setBusy(false);
      setError("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  async function work<T>(
    task: (signal: AbortSignal) => Promise<T>,
    done: (result: T) => void,
  ) {
    if (running.current) return;
    running.current = true;
    const current = generation.current,
      controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await task(controller.signal);
      if (current === generation.current) done(result);
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, error, setError, work };
}
