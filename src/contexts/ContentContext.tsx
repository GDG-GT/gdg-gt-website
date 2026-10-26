import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { api } from "@/lib/api";
import {
  managedLink,
  managedLinks,
  projectContent,
  readHomeContent,
  type ContentSnapshot,
  type FooterCopy,
  type HomeContent,
} from "@/lib/content-snapshot";
import type { ManagedLink, PageCopy } from "../../shared/site-content";
import type { PublicMetric } from "@/ui/public-collections";
export type { ContentSnapshot } from "@/lib/content-snapshot";
interface ContentContextType {
  siteSettings: Record<string, unknown>;
  pageContent: Record<string, Record<string, PageCopy>>;
  navigationItems: ContentSnapshot["navigation"];
  socialLinks: ContentSnapshot["social"];
  footerContent: Record<string, FooterCopy>;
  chapterMetrics: PublicMetric[];
  isLoading: boolean;
  contentError: string;
  lastUpdated?: number;
  refreshContent: () => Promise<boolean>;
  refreshPageContent: (pageSlug?: string) => Promise<boolean>;
  forceRefreshPageContent: (pageSlug?: string) => Promise<boolean>;
  getSiteSetting: (key: string) => unknown;
  getPageSection: (pageSlug: string, sectionKey: string) => PageCopy | null;
  getFooterSection: (sectionKey: string) => FooterCopy | null;
  getLink: (linkType: string) => string;
  getAllLinks: (category?: string) => ManagedLink[];
}
const ContentContext = createContext<ContentContextType | undefined>(undefined);
export const useContent = () => {
  const value = useContext(ContentContext);
  if (!value) throw new Error("ContentProvider is required.");
  return value;
};
// Private composition overrides only curated CMS fields. Public inventories
// still use their independently authorized public read APIs.
export function ContentSnapshotProvider({
  snapshot,
  children,
}: {
  snapshot: ContentSnapshot;
  children: React.ReactNode;
}) {
  const base = useContent(),
    { settings, pages, footer } = projectContent(snapshot);
  return (
    <ContentContext.Provider
      value={{
        ...base,
        siteSettings: settings,
        pageContent: pages,
        navigationItems: snapshot.navigation,
        socialLinks: snapshot.social,
        footerContent: footer,
        contentError: "",
        isLoading: false,
        getSiteSetting: (key) => settings[key] ?? null,
        getPageSection: (page, section) => pages[page]?.[section] ?? null,
        getFooterSection: (section) => footer[section] ?? null,
        getAllLinks: (category) => managedLinks(settings, category),
        getLink: (key) => managedLink(settings, key),
      }}
    >
      {children}
    </ContentContext.Provider>
  );
}
export const ContentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [snapshot, setSnapshot] = useState<HomeContent>(),
    [isLoading, setLoading] = useState(true),
    [contentError, setError] = useState(""),
    [lastUpdated, setLastUpdated] = useState<number>();
  const request = useRef(0);
  const loadEssential = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = readHomeContent(await api<unknown>("/public/home", { signal }));
      if (signal?.aborted || sequence !== request.current) return false;
      setSnapshot(data);
      setLastUpdated(Date.now());
      return true;
    } catch (error) {
      if (!signal?.aborted && sequence === request.current)
        setError(error instanceof Error ? error.message : "Please try again.");
      return false;
    } finally {
      if (!signal?.aborted && sequence === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadEssential(controller.signal);
    return () => {
      controller.abort();
      request.current++;
    };
  }, [loadEssential]);
  const { settings, pages, footer } = projectContent(
    snapshot || {
      settings: [],
      pages: [],
      navigation: [],
      social: [],
      footer: [],
    },
  );
  const refreshContent = useCallback(() => loadEssential(), [loadEssential]);
  return (
    <ContentContext.Provider
      value={{
        siteSettings: settings,
        pageContent: pages,
        navigationItems: snapshot?.navigation || [],
        socialLinks: snapshot?.social || [],
        footerContent: footer,
        chapterMetrics: snapshot?.metrics || [],
        isLoading,
        contentError,
        lastUpdated,
        refreshContent,
        refreshPageContent: refreshContent,
        forceRefreshPageContent: refreshContent,
        getSiteSetting: (key) => settings[key] ?? null,
        getPageSection: (page, section) => pages[page]?.[section] ?? null,
        getFooterSection: (section) => footer[section] ?? null,
        getAllLinks: (category) => managedLinks(settings, category),
        getLink: (key) => managedLink(settings, key),
      }}
    >
      {children}
    </ContentContext.Provider>
  );
};
