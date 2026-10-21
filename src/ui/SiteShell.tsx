import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
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
import AdminLoginModal from "@/components/AdminLoginModal";
import { PublicNewsletterService as NewsletterService } from "@/services/publicWorkflows";
import { Brand, Button } from "./primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { chapterName, localPreviewEnabled, publicLinks } from "./preview-data";
import { useContent } from "@/contexts/ContentContext";
import { newsletterEntryIntent } from "./newsletter-entry";
import { MaintenanceBanner } from "./status/SiteAvailability";
import { useSiteAvailability } from "@/contexts/SiteAvailabilityContext";

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
  const { navigationItems, socialLinks, footerContent } = useContent();
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
  const subscriptionRequest = useRef({ email: "", key: crypto.randomUUID() });

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
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
    } else {
      document.getElementById("newsletter-email")?.focus();
      setNotice("Chapter officers can enter their access code here.");
    }
  };
  const subscribe = async (event: FormEvent, officerAccess = false) => {
    event.preventDefault();
    if (sending) return;
    setNotice("");
    if (localPreviewEnabled && email === "local-preview") {
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
      className={`gt-site${availability?.is_live === false ? " gt-site-is-maintenance" : ""}`}
    >
      <MaintenanceBanner />
      <a href="#main-content" className="gt-skip">
        Skip to content
      </a>
      <div className="gt-nav-wrap">
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
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </nav>
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent
            id="mobile-navigation"
            className="gt-mobile-nav gt-public-menu"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuButtonRef.current?.focus();
            }}
          >
            <DialogTitle>Explore GDG@GT</DialogTitle>
            <DialogDescription>
              Find your next event, resource, or connection.
            </DialogDescription>
            {navigation.map(([label, href]) => (
              <NavLink
                key={href}
                to={href}
                end={href === "/"}
                onClick={() => setMenuOpen(false)}
              >
                {label}
                <ArrowUpRight size={17} />
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
            <button
              className="gt-button gt-button-ghost"
              onClick={() => setMenuOpen(false)}
            >
              Close menu
            </button>
          </DialogContent>
        </Dialog>
      </div>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="gt-footer">
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
                  >
                    {item.platform === "github" ? (
                      <Github size={19} />
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
                  >
                    <Github size={19} />
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
            <form onSubmit={subscribe} className="gt-newsletter" noValidate>
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
            </form>
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
      {localPreviewEnabled && (
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
        error={error}
      />
    </div>
  );
}
