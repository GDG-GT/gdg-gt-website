import { HydratedForm } from "./PublicHydrationBoundary";
import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Github,
  Menu,
  X,
  Mail,
  ExternalLink,
  Monitor,
  LogIn,
} from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { PublicNewsletterService as NewsletterService } from "@/services/publicWorkflows";
import { Brand, Button } from "./primitives";
import { chapterName, localPreviewEnabled, publicLinks } from "./preview-data";
import { useContent } from "@/contexts/ContentContext";
import { newsletterEntryIntent } from "./newsletter-entry";
import { MaintenanceBanner } from "./status/SiteAvailability";
import { useSiteAvailability } from "@/contexts/SiteAvailabilityContext";
import { InstallApp } from "@/pwa/PwaControls";
const AdminLoginModal = lazy(() => import("@/components/AdminLoginModal"));
const standaloneRoutes = [
  "/leaderboard", "/leaderboard/member", "/tap",
  "/links",
  "/l/:username",
  "/forms/:slug",
  "/account/setup",
  "/team/join",
  "/admin/invite/:token",
  "/newsletter/confirm",
  "/newsletter/unsubscribe",
];

export default function SiteShell({ children }: { children: ReactNode }) {
  const { status: availability } = useSiteAvailability();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const { login, isLoading, error, isAuthenticated } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const standalone = standaloneRoutes.some((path) =>
    matchPath(path, location.pathname),
  );
  const {
    navigationItems,
    socialLinks,
    footerContent,
    contentError,
    isLoading: contentLoading,
    lastUpdated,
    refreshPageContent,
  } = useContent();
  const navigation: readonly (readonly [string, string])[] =
    navigationItems.length
      ? navigationItems.map(
          (item) => [String(item.label), String(item.href)] as const,
        )
      : publicLinks;
  const footerAbout = footerContent.about || {},
    footerNewsletter = footerContent.newsletter || {},
    footerCopyright = footerContent.copyright || {};
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const focusMenuOnOpen = useRef(false);
  const subscriptionRequest = useRef({ email: "", key: crypto.randomUUID() });

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    if (focusMenuOnOpen.current) {
      focusMenuOnOpen.current = false;
      mobileMenuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    }
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !navigationRef.current?.contains(event.target)
      )
        setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    desktop.addEventListener("change", closeDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
      desktop.removeEventListener("change", closeDesktop);
    };
  }, [menuOpen]);
  const previewWorkspace = async () => {
    if (isAuthenticated) {
      navigate("/admin");
      return;
    }
    if (localPreviewEnabled) {
      const ok = await login({
        username: "admin@example.test",
        password: "local-preview",
      });
      if (ok) navigate("/admin");
    }
  };
  const subscribe = async (event: FormEvent, officerAccess = false) => {
    event.preventDefault();
    if (sending) return;
    setNotice("");
    if (localPreviewEnabled && email === "local-preview") {
      window.dispatchEvent(new Event("gdg:auth-needed"));
      setLoginOpen(true);
      return;
    }
    if (newsletterEntryIntent(email, officerAccess) === "gate") {
      setSending(true);
      try {
        const response = await fetch("/api/v1/auth/gate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: email }),
        });
        const result = response.ok ? await response.json() : null;
        if (result?.data?.gateValid) {
          window.dispatchEvent(new Event("gdg:auth-needed"));
      setLoginOpen(true);
          setEmail("");
        } else setNotice("We couldn’t process that entry. Please try again.");
      } catch {
        setNotice("We couldn’t process that entry. Please try again.");
      } finally {
        setSending(false);
      }
      return;
    }
    setSending(true);
    try {
      if (localPreviewEnabled) {
        setNotice("Preview complete. No subscription or email was created.");
        setEmail("");
      } else {
        if (subscriptionRequest.current.email !== email)
          subscriptionRequest.current = { email, key: crypto.randomUUID() };
        const result = await NewsletterService.subscribe(
          email,
          undefined,
          subscriptionRequest.current.key,
        );
        if (result.gateValid) {
          window.dispatchEvent(new Event("gdg:auth-needed"));
      setLoginOpen(true);
          setEmail("");
          return;
        }
        setNotice(result.message);
        if (result.success) setEmail("");
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "We could not save your signup. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };
  return (
    <div
      className={`gt-site${standalone ? " gt-site-standalone" : ""}${availability?.is_live === false ? " gt-site-is-maintenance" : ""}`}
    >
      <MaintenanceBanner />
      <a href="#main-content" className="gt-skip">
        Skip to content
      </a>
      {!standalone && (
        <div
          className="gt-nav-wrap"
          ref={navigationRef}
          onKeyDown={(event) => {
            if (!menuOpen || event.key !== "Tab") return;
            const controls = event.currentTarget.querySelectorAll<HTMLElement>(
              ".gt-nav > .gt-brand, .gt-nav-login:not(:disabled), .gt-menu-button:not(:disabled), #mobile-navigation a[href], #mobile-navigation button:not(:disabled)",
            );
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onBlur={(event) => {
            if (
              menuOpen &&
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              setMenuOpen(false);
          }}
        >
          <nav className="gt-nav" aria-label="Main navigation">
            <Brand compact />
            <div className="gt-nav-links">
              {navigation.map(([label, href]) => (
                <NavLink key={href} to={href} end={href === "/"}>
                  {label}
                </NavLink>
              ))}
            </div>
            {(localPreviewEnabled || isAuthenticated) && (
              <button
                className="gt-button gt-button-primary gt-nav-login"
                onClick={previewWorkspace}
                disabled={isLoading}
              >
                {isAuthenticated ? "Workspace" : "Login"}
                <LogIn size={15} />
              </button>
            )}
            <button
              className="gt-icon-button gt-menu-button"
              ref={menuButtonRef}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                focusMenuOnOpen.current = true;
                setMenuOpen(true);
                if (menuOpen) {
                  focusMenuOnOpen.current = false;
                  mobileMenuRef.current
                    ?.querySelector<HTMLAnchorElement>("a")
                    ?.focus();
                }
              }}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </nav>
          {menuOpen && (
            <nav
              id="mobile-navigation"
              className="gt-mobile-nav"
              aria-label="Mobile navigation"
              ref={mobileMenuRef}
            >
              {navigation.map(([label, href]) => (
                <NavLink
                  key={href}
                  to={href}
                  end={href === "/"}
                  onClick={() => setMenuOpen(false)}
                >
                  {label}
                </NavLink>
              ))}
              {(localPreviewEnabled || isAuthenticated) && (
                <Button
                  onClick={() => {
                    setMenuOpen(false);
                    previewWorkspace();
                  }}
                >
                  Open workspace
                </Button>
              )}
            </nav>
          )}
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        {!standalone && contentError && (
          <div className="gt-container gt-content-notice" role="alert">
            <p>
              {lastUpdated
                ? `Chapter updates could not refresh. Showing content last loaded ${new Date(lastUpdated).toLocaleString()}.`
                : "Chapter updates could not load. The page is using its built-in copy."}
            </p>
            <Button
              variant="secondary"
              disabled={contentLoading}
              onClick={() => {
                void refreshPageContent();
                document.getElementById("main-content")?.focus();
              }}
            >
              {contentLoading
                ? "Loading chapter updates…"
                : "Retry chapter updates"}
            </Button>
          </div>
        )}
        {children}
      </main>
      {!standalone && (
        <footer className="gt-footer">
          <div className="gt-container">
            <InstallApp />
            <Link to="/offline">Offline help &amp; pending submissions</Link>
          </div>
          <div className="gt-container gt-footer-grid">
            <div>
              <Brand inverse compact />
              <p className="gt-footer-name">{chapterName}</p>
              <p>
                {footerAbout.description ||
                  "A student-led community of builders, learners, and leaders creating impact through technology."}
              </p>
              <div className="gt-socials">
                {socialLinks.length ? (
                  socialLinks.map((item) => (
                    <a
                      key={item.platform + item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${item.platform} (opens a new tab)`}
                      className="gt-external-social"
                    >
                      {item.platform === "github" ? (
                        <>
                          <Github size={19} />
                          <ArrowUpRight
                            className="gt-external-marker"
                            size={10}
                            aria-hidden="true"
                          />
                        </>
                      ) : (
                        <ExternalLink size={19} />
                      )}
                    </a>
                  ))
                ) : (
                  <>
                    <a
                      href="https://github.com/gdg-on-campus"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="GDG on Campus on GitHub (opens a new tab)"
                      className="gt-external-social"
                    >
                      <Github size={19} />
                      <ArrowUpRight
                        className="gt-external-marker"
                        size={10}
                        aria-hidden="true"
                      />
                    </a>
                    <Link to="/contact" aria-label="Contact the chapter">
                      <Mail size={19} />
                    </Link>
                    <a
                      href="https://gdg.community.dev/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Google Developer Groups community (opens a new tab)"
                    >
                      <ExternalLink size={19} />
                    </a>
                  </>
                )}
              </div>
            </div>
            <div>
              <h2>Explore the community</h2>
              <div className="gt-footer-links">
                {navigation.map(([label, href]) => (
                  <Link to={href} key={href}>
                    {label}
                  </Link>
                ))}
                {!navigation.some(([, href]) => href === "/links") && (
                  <Link to="/links">Chapter links</Link>
                )}
                {localPreviewEnabled && (
                  <button onClick={previewWorkspace}>Preview workspace</button>
                )}
              </div>
            </div>
            <div>
              <h2>
                {footerNewsletter.newsletter_title ||
                  footerNewsletter.title ||
                  "Stay in the loop"}
              </h2>
              <p>
                {footerNewsletter.newsletter_description ||
                  footerNewsletter.description ||
                  "Events, workshops, and new opportunities. A little inspiration for your inbox."}
              </p>
              <HydratedForm onSubmit={subscribe} className="gt-newsletter" noValidate>
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="newsletter-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && event.shiftKey) {
                      void subscribe(event, true);
                    }
                  }}
                  placeholder="Your email address"
                  required
                />
                <Button type="submit" disabled={sending}>
                  {sending ? "Saving…" : "Subscribe"}
                  <ArrowRight size={16} />
                </Button>
              </HydratedForm>
              <p className="gt-footer-feedback" role="status">
                {notice}
              </p>
              <small>No spam. Unsubscribe whenever you like.</small>
            </div>
          </div>
          <div className="gt-container gt-footer-bottom">
            <span>
              {footerCopyright.copyright ||
                `© ${new Date().getFullYear()} GDG on Campus at Georgia Tech`}
            </span>
            <div>
              <Link to="/privacy">Privacy</Link>
              <Link to="/accessibility">Accessibility</Link>
              <Link to="/contact">
                Contact us <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        </footer>
      )}
      {!standalone && localPreviewEnabled && (
        <button
          className="gt-preview-badge"
          onClick={previewWorkspace}
          title="Open the local admin preview"
        >
          <Monitor size={14} />
          <span>Local preview · sample data</span>
          <ArrowUpRight size={13} />
        </button>
      )}
      {loginOpen && (
        <Suspense fallback={<p role="status">Opening sign in…</p>}>
          <AdminLoginModal
            isOpen={loginOpen}
            onClose={() => setLoginOpen(false)}
            onLogin={async (credentials) => {
              if (await login(credentials)) {
                setLoginOpen(false);
                setEmail("");
                navigate("/admin");
              }
            }}
            isLoading={isLoading}
            error={error || undefined}
          />
        </Suspense>
      )}
    </div>
  );
}
