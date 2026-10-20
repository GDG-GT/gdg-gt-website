import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { api } from "@/lib/api";
interface ContentContextType {
  siteSettings: Record<string, any>;
  pageContent: Record<string, Record<string, any>>;
  navigationItems: any[];
  footerContent: Record<string, any>;
  events: any[];
  teamMembers: any[];
  projects: any[];
  sponsors: any[];
  resources: any[];
  isLoading: boolean;
  isLoadingEvents: boolean;
  isLoadingTeam: boolean;
  isLoadingProjects: boolean;
  isLoadingSponsors: boolean;
  isLoadingResources: boolean;
  lastUpdated: number;
  refreshContent: () => Promise<void>;
  refreshPageContent: (pageSlug?: string) => Promise<void>;
  forceRefreshPageContent: (pageSlug?: string) => Promise<void>;
  loadEvents: (forceReload?: boolean) => Promise<void>;
  loadTeamMembers: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadSponsors: () => Promise<void>;
  loadResources: () => Promise<void>;
  getSiteSetting: (key: string) => any;
  getPageSection: (pageSlug: string, sectionKey: string) => any;
  getFooterSection: (sectionKey: string) => any;
  getLink: (linkType: string) => string;
  getAllLinks: (category?: string) => any[];
}

type Row = Record<string, any>;
const ContentContext = createContext<ContentContextType | undefined>(undefined);
export const useContent = () => {
  const value = useContext(ContentContext);
  if (!value) throw new Error("ContentProvider is required.");
  return value;
};
export const ContentProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [siteSettings, setSiteSettings] = useState<Record<string, any>>({}),
    [pageContent, setPageContent] = useState<
      Record<string, Record<string, any>>
    >({});
  const [navigationItems, setNavigationItems] = useState<Row[]>([]),
    [footerContent, setFooterContent] = useState<Record<string, any>>({});
  const [events, setEvents] = useState<Row[]>([]),
    [teamMembers, setTeamMembers] = useState<Row[]>([]),
    [sponsors, setSponsors] = useState<Row[]>([]),
    [resources, setResources] = useState<Row[]>([]);
  const [isLoading, setLoading] = useState(true),
    [isLoadingEvents, setEventsLoading] = useState(false),
    [isLoadingTeam, setTeamLoading] = useState(false),
    [isLoadingSponsors, setSponsorsLoading] = useState(false),
    [isLoadingResources, setResourcesLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const loadEssential = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{
        settings: Row[];
        navigation: Row[];
        footer: Row[];
        pages: Row[];
      }>("/public/home");
      setSiteSettings(
        Object.fromEntries(data.settings.map((r) => [r.key, r.value])),
      );
      setNavigationItems(data.navigation);
      setFooterContent(
        Object.fromEntries(data.footer.map((r) => [r.section_key, r.content])),
      );
      const pages: Record<string, Record<string, any>> = {};
      for (const row of data.pages) {
        pages[row.page_slug] ||= {};
        pages[row.page_slug][row.section_key] = row.content;
      }
      setPageContent(pages);
    } finally {
      setLoading(false);
      setLastUpdated(Date.now());
    }
  }, []);
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const result = await api<{ items: Row[] }>(
        "/events?status=all&pageSize=100",
      );
      setEvents(
        result.items.map((e) => ({
          ...e,
          date: e.start_at,
          time: new Intl.DateTimeFormat("en-US", {
            timeZone: e.timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(e.start_at)),
        })),
      );
    } finally {
      setEventsLoading(false);
    }
  }, []);
  const loadTeamMembers = useCallback(async () => {
    setTeamLoading(true);
    try {
      setTeamMembers((await api<{ items: Row[] }>("/team?pageSize=100")).items);
    } finally {
      setTeamLoading(false);
    }
  }, []);
  const loadSponsors = useCallback(async () => {
    setSponsorsLoading(true);
    try {
      setSponsors(
        (await api<{ items: Row[] }>("/sponsors?pageSize=100")).items,
      );
    } finally {
      setSponsorsLoading(false);
    }
  }, []);
  const loadResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      setResources(
        (await api<{ items: Row[] }>("/resources?pageSize=100")).items,
      );
    } finally {
      setResourcesLoading(false);
    }
  }, []);
  useEffect(() => {
    loadEssential().catch(() => {});
  }, [loadEssential]);
  const refreshContent = async () => {
    await Promise.all([loadEssential(), loadEvents()]);
    setLastUpdated(Date.now());
  };
  const refreshPageContent = async () => {
    await loadEssential();
  };
  const getAllLinks = (category?: string) => {
    const items = Array.isArray(siteSettings.all_links)
      ? siteSettings.all_links
      : [];
    return category ? items.filter((r) => r.category === category) : items;
  };
  return (
    <ContentContext.Provider
      value={{
        siteSettings,
        pageContent,
        navigationItems,
        footerContent,
        events,
        teamMembers,
        projects: [],
        sponsors,
        resources,
        isLoading,
        isLoadingEvents,
        isLoadingTeam,
        isLoadingProjects: false,
        isLoadingSponsors,
        isLoadingResources,
        lastUpdated,
        refreshContent,
        refreshPageContent,
        forceRefreshPageContent: refreshPageContent,
        loadEvents,
        loadTeamMembers,
        loadProjects: async () => {},
        loadSponsors,
        loadResources,
        getSiteSetting: (key) => siteSettings[key] ?? null,
        getPageSection: (page, section) => pageContent[page]?.[section] ?? null,
        getFooterSection: (section) => footerContent[section] ?? null,
        getAllLinks,
        getLink: (key) =>
          getAllLinks().find(
            (item) =>
              item.id === key ||
              String(item.name).toLowerCase().replace(/\s+/g, "_") === key,
          )?.url ||
          siteSettings[key + "_url"] ||
          "#",
      }}
    >
      {children}
    </ContentContext.Provider>
  );
};
