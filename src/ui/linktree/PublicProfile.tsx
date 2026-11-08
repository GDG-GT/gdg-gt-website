import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  CalendarDays,
  Code2,
  ExternalLink,
  FileText,
  Link2,
  Mail,
  Users,
  Video,
} from "lucide-react";
import { api, ApiFailure } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import {
  embedUrl,
  linktreeProfile,
  linktreeLink,
} from "../../../shared/linktree.mjs";
import { NotFoundPage } from "../PublicPages";
import { Button } from "../primitives";
import PublicImage from "../PublicImage";
import { type ProfileFields, type LinkFields, countLabel } from "./types";
type PublicLink = LinkFields & { id: string; clickCount: string | null };
type PublicProfileRecord = ProfileFields & { id: string; links: PublicLink[] };
const icons = {
  link: Link2,
  code: Code2,
  calendar: CalendarDays,
  video: Video,
  form: FileText,
  community: Users,
  mail: Mail,
};
export default function PublicProfile() {
  const { username = "gdg-gt" } = useParams();
  const [profile, setProfile] = useState<PublicProfileRecord>(),
    [loading, setLoading] = useState(true),
    [missing, setMissing] = useState(false),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0),
    [embed, setEmbed] = useState<PublicLink>(),
    [embedLoaded, setEmbedLoaded] = useState(false);
  const navigation = useNavigationSafety(),
    embedHeading = useRef<HTMLHeadingElement>(null),
    embedOpener = useRef<HTMLButtonElement | null>(null),
    hadEmbed = useRef(false);
  useDraftGuard(embedLoaded && embed?.embedType === "google_form", {
    label: "Open third-party embedded content",
    privateDraft: false,
  });
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setProfile(undefined);
    setMissing(false);
    setError("");
    setEmbed(undefined);
    setEmbedLoaded(false);
    embedOpener.current = null;
    api<{ profile: PublicProfileRecord }>(
      `/linktree/${encodeURIComponent(username || "")}`,
      { signal: c.signal },
    )
      .then((r) => {
        if (c.signal.aborted) return;
        const p = r.profile;
        const checked = linktreeProfile.safeParse({
          username: p.username,
          displayName: p.displayName,
          bio: p.bio,
          avatarUrl: p.avatarUrl,
          background: p.background,
          theme: p.theme,
        });
        if (!checked.success) {
          setMissing(true);
          return;
        }
        const links = p.links.filter(
          (l) =>
            linktreeLink.safeParse({
              title: l.title,
              url: l.url,
              description: l.description,
              icon: l.icon,
              buttonStyle: l.buttonStyle,
              buttonColor: l.buttonColor,
              textColor: l.textColor,
              embedType: l.embedType,
              showClickCount: l.showClickCount,
            }).success,
        );
        setProfile({ ...p, links });
        void api(`/linktree/${encodeURIComponent(p.username)}/views`, {
          method: "POST",
          body: {},
        }).catch(() => {});
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          if (e instanceof ApiFailure && [400, 404].includes(e.status))
            setMissing(true);
          else setError("This link page could not load. Please try again.");
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [username, tick]);
  useEffect(() => {
    if (profile) document.title = `${profile.displayName} · GDG links`;
  }, [profile]);
  useEffect(() => {
    if (!embed && !hadEmbed.current) return;
    hadEmbed.current = !!embed;
    if (embed) embedHeading.current?.focus();
    else if (embedOpener.current?.isConnected) embedOpener.current.focus();
    else document.getElementById("main-content")?.focus();
  }, [embed]);
  const track = (link: PublicLink) => {
    if (profile)
      void api(
        `/linktree/${encodeURIComponent(profile.username)}/links/${link.id}/click`,
        { method: "POST", body: {} },
      ).catch(() => {});
  };
  const changeEmbed = (link?: PublicLink, opener?: HTMLButtonElement) => {
    const change = () => {
      if (link) embedOpener.current = opener || null;
      setEmbedLoaded(false);
      setEmbed(link);
    };
    if (embedLoaded && embed?.embedType === "google_form" && navigation)
      navigation.request(change);
    else change();
  };
  if (missing) return <NotFoundPage />;
  if (loading)
    return (
      <section
        className="gt-container gt-linktree-loading"
        role="status"
        aria-busy="true"
      >
        <div className="gt-skeleton gt-loading-heading" />
        <div className="gt-skeleton gt-detail-skeleton" />
        <span className="sr-only">Loading public link page…</span>
      </section>
    );
  if (!profile)
    return (
      <section className="gt-container gt-linktree-loading">
        <h1>Link page unavailable</h1>
        <p role="alert">{error}</p>
        <Button onClick={() => setTick((v) => v + 1)}>Try again</Button>
      </section>
    );
  const background = profile.background;
  const style =
    background.type === "gradient"
      ? {
          backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
        }
      : background.type === "color"
        ? { backgroundColor: background.value }
        : {};
  const source = embed ? embedUrl(embed.url, embed.embedType) : null;
  return (
    <section className="gt-linktree-public" style={style}>
      {background.type === "image" && (
        <img
          className="gt-linktree-background"
          src={background.value}
          alt=""
          aria-hidden="true"
          width={1600}
          height={1200}
        />
      )}
      <div className="gt-linktree-page" data-theme={profile.theme}>
        <header className="gt-linktree-identity">
          {profile.avatarUrl ? (
            <PublicImage
              className="gt-linktree-avatar"
              src={profile.avatarUrl}
              fallbackSrc="/logo.png"
              width={96}
              height={96}
              alt=""
            />
          ) : (
            <img
              className="gt-linktree-mark"
              src="/logo.png"
              width={78}
              height={48}
              alt=""
            />
          )}
          <p className="gt-linktree-handle">@{profile.username}</p>
          <h1>{profile.displayName}</h1>
          {profile.bio && <p className="gt-linktree-bio">{profile.bio}</p>}
        </header>
        <nav
          className="gt-linktree-links"
          aria-label={`${profile.displayName} links`}
        >
          {profile.links.map((link) => {
            const Icon = icons[link.icon as keyof typeof icons] || Link2;
            const child = (
              <>
                <Icon aria-hidden="true" size={21} />
                <span>
                  <strong>{link.title}</strong>
                  {link.description && <small>{link.description}</small>}
                  {link.showClickCount && link.clickCount !== null && (
                    <small>
                      {countLabel(link.clickCount)} approximate clicks
                    </small>
                  )}
                </span>
                <ExternalLink aria-hidden="true" size={17} />
              </>
            );
            const className = `gt-linktree-link gt-linktree-link-${link.buttonStyle}`,
              color = {
                backgroundColor: link.buttonColor,
                color: link.textColor,
              };
            return embedUrl(link.url, link.embedType) ? (
              <button
                key={link.id}
                className={className}
                style={color}
                onClick={(event) =>
                  changeEmbed(
                    embed?.id === link.id ? undefined : link,
                    event.currentTarget,
                  )
                }
                aria-expanded={embed?.id === link.id}
              >
                {child} <span className="sr-only">(opens a preview)</span>
              </button>
            ) : (
              <a
                key={link.id}
                className={className}
                style={color}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track(link)}
              >
                {child} <span className="sr-only">(opens a new tab)</span>
              </a>
            );
          })}
        </nav>
        {!profile.links.length && (
          <p className="gt-linktree-empty">
            New chapter links will appear here when they are ready.
          </p>
        )}
        {embed && source && (
          <section className="gt-linktree-embed">
            <div className="gt-button-row">
              <h2 ref={embedHeading} tabIndex={-1}>
                {embed.title}
              </h2>
              <Button variant="ghost" onClick={() => changeEmbed()}>
                Close preview
              </Button>
            </div>
            {!embedLoaded ? (
              <>
                <p>
                  This preview loads content from{" "}
                  {embed.embedType === "youtube" ? "YouTube" : "Google Forms"}.
                  Their privacy practices apply. No third-party frame loads
                  until you choose to continue.
                </p>
                <div className="gt-button-row">
                  <Button
                    onClick={() => {
                      track(embed);
                      setEmbedLoaded(true);
                    }}
                  >
                    Load{" "}
                    {embed.embedType === "youtube" ? "YouTube" : "Google Forms"}{" "}
                    preview
                  </Button>
                  <a
                    className="gt-button gt-button-secondary"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={embed.url}
                    onClick={() => track(embed)}
                  >
                    Open externally
                    <ExternalLink aria-hidden="true" size={17} />
                    <span className="sr-only"> (opens a new tab)</span>
                  </a>
                </div>
              </>
            ) : (
              <>
                <p>
                  External content may be blocked by browser privacy settings.
                  This website cannot save or verify answers in an external
                  form.
                </p>
                <iframe
                  className={
                    embed.embedType === "youtube"
                      ? "gt-linktree-video"
                      : "gt-linktree-form"
                  }
                  src={source}
                  title={embed.title}
                  loading="lazy"
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-presentation"
                  allow="fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                />
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={embed.url}
                  onClick={() => track(embed)}
                >
                  Having trouble? Open the original page
                  <ExternalLink aria-hidden="true" size={17} />
                  <span className="sr-only"> (opens a new tab)</span>
                </a>
              </>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
