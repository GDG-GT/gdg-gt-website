// Reapply the complete canonical sheets in their original order after the
// public subset. Every earlier rule has its later exact duplicate, preserving
// the original admin cascade rather than changing selector precedence.
import "../styles/gt.css";
import "../styles/media.css";
import "../styles/newsletter.css";
import "../styles/contact-inbox.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  FolderOpen,
  Globe2,
  Hash,
  Image,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  PenTool,
  Search,
  Settings2,
  Shield,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import NotificationBell from "@/components/admin/NotificationBell";
import { nativeScanner } from "./rewards/nativeScanner";
import { useAdmin } from "@/contexts/AdminContext";
import { PermissionsService } from "@/services/permissionsService";
import {
  WorkspaceAccessContext,
  type WorkspaceAccessSnapshot,
} from "@/contexts/WorkspaceAccessContext";
import { Brand, Button, SearchBox } from "./primitives";
import { localPreviewEnabled } from "./preview-data";

type Destination = { label: string; href: string; icon: LucideIcon };
const groups: { title: string; links: Destination[] }[] = [
  {
    title: "Overview",
    links: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Events", href: "/admin/events", icon: CalendarDays },
      { label: "Forms", href: "/admin/forms", icon: ClipboardList },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Members", href: "/admin/members", icon: Users },
      { label: "Points & cards", href: "/admin/rewards", icon: Activity },
      { label: "Teams & permissions", href: "/admin/teams", icon: Shield },
      {
        label: "Communications",
        href: "/admin/communications",
        icon: MessageSquare,
      },
      { label: "Channels", href: "/admin/channels", icon: Hash },
      { label: "Whiteboards", href: "/admin/whiteboard", icon: PenTool },
    ],
  },
  {
    title: "Chapter",
    links: [
      { label: "Finances", href: "/admin/finances", icon: DollarSign },
      { label: "Newsletter", href: "/admin/newsletter", icon: Mail },
      { label: "Sponsors", href: "/admin/sponsors", icon: Globe2 },
      { label: "Linktree", href: "/admin/linktree", icon: Link2 },
    ],
  },
  {
    title: "Content",
    links: [
      { label: "Site content", href: "/admin/content", icon: FileText },
      { label: "Resources", href: "/admin/resources", icon: BookOpen },
      { label: "Gallery", href: "/admin/gallery", icon: Image },
      { label: "Media library", href: "/admin/media", icon: FolderOpen },
      { label: "Blog · private", href: "/admin/blog", icon: FileText },
      {
        label: "Projects · private",
        href: "/admin/projects",
        icon: FolderOpen,
      },
      { label: "Editor workspace", href: "/admin/blog-editor", icon: PenTool },
      { label: "Editor files", href: "/admin/blog-media", icon: FolderOpen },
    ],
  },
  {
    title: "Administration",
    links: [
      { label: "Users & security", href: "/admin/users", icon: Shield },
      { label: "Site status", href: "/admin/site-status", icon: Settings2 },
      { label: "Audit history", href: "/admin/audit-log", icon: Activity },
      { label: "Person-data privacy", href: "/admin/privacy", icon: Shield },
      {
        label: "Operations & retention",
        href: "/admin/operations",
        icon: Activity,
      },
      { label: "Operating guide", href: "/admin/guide", icon: BookOpen },
      { label: "My profile", href: "/admin/profile", icon: Users },
    ],
  },
];
const workspaceDestinations = groups.flatMap((group) => group.links);

export default function AdminShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    window.dispatchEvent(new Event("gdg:auth-needed"));
  }, []);
  const { currentAdmin, logout, isAuthenticated } = useAdmin();
  const navigationSafety = useNavigationSafety();
  const location = useLocation(),
    navigate = useNavigate();
  const navigationOpener = useRef<HTMLButtonElement>(null),
    navigationOrigin = useRef(location.pathname),
    currentPath = useRef(location.pathname),
    restoreNavigationFocus = useRef(false),
    navigationSamePage = useRef(false),
    searchOpener = useRef<HTMLButtonElement>(null),
    searchPrevious = useRef<HTMLElement | null>(null),
    searchOrigin = useRef(location.pathname),
    restoreSearchFocus = useRef(false),
    searchSamePage = useRef(false);
  currentPath.current = location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState("");
  const [allowed, setAllowed] = useState<string[]>([]),
    [navFailed, setNavFailed] = useState(false),
    [navRetry, setNavRetry] = useState(0);
  const [accessSnapshot, setAccessSnapshot] =
    useState<WorkspaceAccessSnapshot>();
  const retryAccess = useCallback(() => setNavRetry((value) => value + 1), []);
  const access = useMemo(
    () => ({
      snapshot: accessSnapshot,
      failed: navFailed,
      retry: retryAccess,
    }),
    [accessSnapshot, navFailed, retryAccess],
  );
  const openSearch = useCallback((invoker?: HTMLElement) => {
    const focused = document.activeElement;
    searchPrevious.current =
      invoker ||
      (focused instanceof HTMLElement && focused !== document.body
        ? focused
        : null);
    searchOrigin.current = currentPath.current;
    restoreSearchFocus.current = true;
    searchSamePage.current = false;
    setSearchOpen(true);
  }, []);
  useEffect(() => {
    if (!currentAdmin) return;
    let cancelled = false;
    const controller = new AbortController();
    PermissionsService.getAccessiblePages(currentAdmin, controller.signal)
      .then((routes) => {
        if (!cancelled) {
          setAccessSnapshot({ actor: currentAdmin, routes });
          setAllowed(
            routes.filter(
              (route) =>
                !route.startsWith("/admin/blog-") ||
                currentAdmin.role === "blog_editor" ||
                localPreviewEnabled,
            ),
          );
          setNavFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAllowed([]);
          setNavFailed(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentAdmin, navRetry, location.pathname]);
  useEffect(() => {
    window.addEventListener("focus", retryAccess);
    const visible = () => {
      if (document.visibilityState === "visible") retryAccess();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", retryAccess);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retryAccess]);
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (searchOpen) setSearchOpen(false);
        else openSearch();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [searchOpen, openSearch]);
  const title = location.pathname.startsWith("/admin/team/")
    ? "Team workspace"
    : [...workspaceDestinations]
        .sort((a, b) => b.href.length - a.href.length)
        .find(
          (item) =>
            location.pathname === item.href ||
            (item.href !== "/admin" &&
              location.pathname.startsWith(`${item.href}/`)),
        )?.label || "Workspace";
  useEffect(() => {
    document.title = `${title} · GDG workspace`;
  }, [title]);
  const destinations = useMemo(
    () =>
      workspaceDestinations.filter(
        (item) =>
          allowed.includes(item.href) &&
          item.label.toLowerCase().includes(query.toLowerCase()),
      ),
    [allowed, query],
  );
  if (!isAuthenticated) return <>{children}</>;
  const sidebar = (
    <>
      <div className="gt-sidebar-brand">
        <Brand inverse compact />
        <span className="gt-workspace-label">Chapter workspace</span>
      </div>
      {navFailed && (
        <button
          className="gt-button gt-button-secondary"
          onClick={() => setNavRetry((v) => v + 1)}
        >
          Retry workspace navigation
        </button>
      )}
      <nav aria-label="Workspace navigation" className="gt-sidebar-navigation">
        {groups.map((group) => {
          const links = group.links.filter((item) =>
            allowed.includes(item.href),
          );
          return links.length ? (
            <div className="gt-sidebar-group" key={group.title}>
              <p>{group.title}</p>
              {links.map(({ href, label, icon: Icon }) => (
                <NavLink
                  key={href}
                  to={href}
                  end={href === "/admin" || href === "/admin/team"}
                  className={({ isActive }) =>
                    isActive ||
                    (href === "/admin/teams" &&
                      location.pathname.startsWith("/admin/team/"))
                      ? "active"
                      : undefined
                  }
                  onClick={() => {
                    restoreNavigationFocus.current = false;
                    navigationSamePage.current = href === currentPath.current;
                    setMobileOpen(false);
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {location.pathname === href && <ChevronRight size={14} />}
                </NavLink>
              ))}
            </div>
          ) : null;
        })}
      </nav>
      <div className="gt-sidebar-bottom">
        <Link
          to="/"
          onClick={() => {
            restoreNavigationFocus.current = false;
            setMobileOpen(false);
          }}
        >
          <ArrowUpRight size={17} /> View public site
        </Link>
        <button
          onClick={() => {
            const leave = async () => {
              await logout();
              navigate(nativeScanner() ? "/admin/scanner" : "/");
            };
            if (navigationSafety)
              navigationSafety.request(() => {
                void leave();
              });
            else void leave();
          }}
        >
          <LogOut size={17} /> Sign out
        </button>
        {localPreviewEnabled && (
          <small>Local UI preview · no live services</small>
        )}
      </div>
    </>
  );
  return (
    <div className="gt-admin-app">
      <a href="#workspace-content" className="gt-skip">
        Skip to workspace
      </a>
      <aside className="gt-sidebar">{sidebar}</aside>
      <div className="gt-workspace">
        <header className="gt-workspace-topbar">
          <button
            className="gt-icon-button gt-admin-menu"
            ref={navigationOpener}
            onClick={() => {
              navigationOrigin.current = location.pathname;
              restoreNavigationFocus.current = true;
              navigationSamePage.current = false;
              setMobileOpen(true);
            }}
            aria-label="Open workspace navigation"
          >
            <Menu size={21} />
          </button>
          <div className="gt-workspace-breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <button
            className="gt-command-trigger"
            aria-label="Search the workspace · ⌘ K"
            aria-keyshortcuts="Meta+K Control+K"
            ref={searchOpener}
            onClick={(event) => openSearch(event.currentTarget)}
          >
            <Search size={16} />
            <span>Search the workspace</span>
            <kbd aria-hidden="true">⌘ K</kbd>
          </button>
          <div className="gt-workspace-account">
            <NotificationBell />
            <Link to="/admin/profile" className="gt-profile-button">
              <span className="gt-avatar">
                {(currentAdmin?.display_name || "Local Preview")
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                {currentAdmin?.display_name || "Chapter officer"}
                <small>{currentAdmin?.role.replace(/_/g, " ")}</small>
              </span>
            </Link>
          </div>
        </header>
        {localPreviewEnabled && (
          <div className="gt-workspace-preview">
            <span className="gt-status-dot" />
            Local preview{" "}
            <span>
              Changes use sample data. No emails or production actions.
            </span>
            <Link to="/">
              View website <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main id="workspace-content" className="gt-admin-body" tabIndex={-1}>
          <WorkspaceAccessContext.Provider value={access}>
            {children}
          </WorkspaceAccessContext.Provider>
        </main>
      </div>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="gt-mobile-sidebar"
          onEscapeKeyDown={(event) => {
            if (event.isComposing) event.preventDefault();
          }}
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            // Reopened drawers must dismiss even when a focused child or
            // another layer consumes Escape before the document listener.
            event.stopPropagation();
            if (!event.nativeEvent.isComposing) {
              event.preventDefault();
              setMobileOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (navigationSamePage.current)
              document
                .getElementById("workspace-content")
                ?.focus({ preventScroll: true });
            else if (
              restoreNavigationFocus.current &&
              navigationOrigin.current === currentPath.current
            )
              navigationOpener.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate chapter management tools.
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent
          className="gt-command-dialog"
          onEscapeKeyDown={(event) => {
            if (event.isComposing) event.preventDefault();
          }}
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            // Handle palette dismissal before a search input or another layer
            // consumes Escape. An IME may still use it to finish composition.
            event.stopPropagation();
            if (!event.nativeEvent.isComposing) {
              event.preventDefault();
              setSearchOpen(false);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (searchSamePage.current)
              document
                .getElementById("workspace-content")
                ?.focus({ preventScroll: true });
            else if (
              restoreSearchFocus.current &&
              searchOrigin.current === currentPath.current
            ) {
              if (searchPrevious.current?.isConnected)
                searchPrevious.current.focus({ preventScroll: true });
              else searchOpener.current?.focus({ preventScroll: true });
            }
          }}
        >
          <DialogTitle>Go to a workspace</DialogTitle>
          <DialogDescription>
            Find chapter tools and management pages.
          </DialogDescription>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search events, forms, people…"
            label="Search workspace destinations"
          />
          <div className="gt-command-results">
            {destinations.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                to={href}
                onClick={() => {
                  restoreSearchFocus.current = false;
                  searchSamePage.current = href === currentPath.current;
                  setSearchOpen(false);
                  setQuery("");
                }}
              >
                <Icon size={18} />
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
            {!destinations.length && <p>No pages match “{query}”.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
