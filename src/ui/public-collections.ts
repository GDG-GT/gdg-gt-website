import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type PublicListing<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export function usePublicCollection<T>(path: string) {
  const [snapshot, setSnapshot] = useState<{
      path: string;
      data: PublicListing<T>;
      at: string;
    }>(),
    [request, setRequest] = useState({ path, error: "", loading: true }),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRequest({ path, error: "", loading: true });
    api<PublicListing<T>>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setSnapshot({ path, data, at: new Date().toLocaleString() });
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setRequest({
            path,
            loading: false,
            error:
              reason instanceof Error ? reason.message : "Please try again.",
          });
      })
      .finally(() => {
        if (!controller.signal.aborted)
          setRequest((previous) => ({ ...previous, loading: false }));
      });
    return () => controller.abort();
  }, [path, refresh]);
  const current = snapshot?.path === path ? snapshot : undefined;
  return {
    data: current?.data,
    at: current?.at,
    error: request.path === path ? request.error : "",
    loading: request.path !== path || request.loading,
    retry: () => setRefresh((value) => value + 1),
  };
}
export type PublicPerson = {
  id: string;
  name: string;
  role: string;
  bio?: string;
  image_url?: string;
  linkedin_url?: string;
  github_url?: string;
  team_section?: string;
};
export type PublicResource = {
  id: string;
  title: string;
  description: string;
  type: string;
  level?: string;
  status: string;
  tags?: string[];
  url?: string;
};
export type PublicSponsor = {
  id: string;
  name: string;
  logo_url: string;
  website_url?: string;
  tier: string;
  tier_label?: string;
};
export type PublicTier = {
  id: string;
  tier_name: string;
  tier_level: string;
  amount: string;
  benefits: string[];
};
export type PublicMetric = {
  id: string;
  stat_label: string;
  stat_value: string;
  stat_description: string;
};
export const publicPageNumber = (value: string | null) =>
  /^\d{1,5}$/.test(value || "") && Number(value) >= 1 && Number(value) <= 10000
    ? Number(value)
    : 1;
