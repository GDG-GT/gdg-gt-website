import PrivacyNoticeDetails from "./PrivacyNoticeDetails";
import HeroScene from "./HeroScene";
import PublicImage from "./PublicImage";
import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import EventReminders from "@/pwa/EventReminders";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Github,
  GraduationCap,
  Heart,
  Image as ImageIcon,
  Linkedin,
  MapPin,
  MessageCircle,
  Rocket,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useContent } from "@/contexts/ContentContext";
import { ContactService } from "@/services/contactService";
import {
  contactUpload,
  prepareContactAttachment,
  abandonContactAttachment,
  type ContactUpload,
} from "@/lib/contact-upload";
import { api, ApiFailure } from "@/lib/api";
import {
  eventForPage,
  eventDateLabel as dateLabel,
  eventTimeLabel,
  type ChapterEvent,
} from "./events";
import SubmissionQueue from "@/pwa/SubmissionQueue";
import { savePendingSubmission } from "@/pwa/queue-actions";
import type { EventRecord } from "@/lib/chapter-types";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  PageHeader,
  SearchBox,
} from "./primitives";
import { chapterName, localPreviewEnabled } from "./preview-data";
import PublicGallery from "./media/PublicGallery";
import { PublicCollectionNotice, PublicPagination } from "./PublicCollection";
import {
  usePublicCollection,
  publicPageNumber,
  type PublicPerson,
  type PublicResource,
  type PublicSponsor,
  type PublicTier,
  type PublicMetric,
} from "./public-collections";
import type { PageCopy } from "../../shared/site-content";
import { usePublicMetadata } from "./usePublicMetadata";

type SiteEvent = EventRecord & {
  slug?: string;
  publication_status?: string;
  end_at?: string | null;
  status?: string;
  accurate_attendee_count?: number;
  linked_forms?: ChapterEvent["linked_forms"];
};
const slugFor = (event: SiteEvent) =>
  event.slug ||
  event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const isPast = (event: SiteEvent) =>
  new Date(event.end_at || event.date).getTime() < Date.now();
const safePublicUrl = (value?: string) => {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
const levelLabel = (level?: string) =>
  ({
    beginner: "Beginner friendly",
    intermediate: "Intermediate",
    advanced: "Advanced",
    open_for_all: "Everyone welcome",
  })[level || ""] || "Everyone welcome";
function useEvents() {
  const listing = usePublicCollection<ChapterEvent>(
    `/events?status=${localPreviewEnabled ? "all" : "upcoming"}&sort=soonest&pageSize=3`,
  );
  return {
    events: (listing.data?.items || []).map(eventForPage),
    loading: listing.loading,
    error: listing.error,
    at: listing.at,
    retry: listing.retry,
  };
}
function usePageTitle(title: string, description?: string, image?: string) {
  const { getSiteSetting } = useContent(),
    siteTitle = String(getSiteSetting("site_title") || "GDG at Georgia Tech");
  usePublicMetadata(`${title} · ${siteTitle}`, { description, image });
}

export function EventTile({ event }: { event: SiteEvent }) {
  const date = new Date(event.date),
    timeZone = event.timezone || "America/New_York",
    state =
      event.registration_state ||
      (isPast(event)
        ? "ended"
        : event.registration_enabled === false
          ? "closed"
          : undefined),
    availability = state
      ? {
          open: "Registration open",
          full: "Event full",
          closed: "Registration closed",
          ended: "Event ended",
        }[state]
      : undefined;
  return (
    <article className="gt-event-card">
      <Link
        to={`/events/${slugFor(event)}`}
        className="gt-event-image"
        tabIndex={-1}
        aria-hidden="true"
      >
        <PublicImage
          src={event.image_url || "/assets/event-community.jpg"}
          fallbackSrc="/assets/event-community.jpg"
          alt=""
          width="640"
          height="360"
          loading="lazy"
        />
        <span className="gt-date-badge">
          <span>
            {date.toLocaleDateString("en-US", {
              month: "short",
              timeZone,
            })}
          </span>
          <strong>
            {date.toLocaleDateString("en-US", {
              day: "numeric",
              timeZone,
            })}
          </strong>
        </span>
        {isPast(event) && <span className="gt-event-past">Past event</span>}
      </Link>
      <div className="gt-event-body">
        <div className="gt-event-tags">
          <Badge tone="coral">{event.type || "Community"}</Badge>
          <span>{levelLabel(event.level)}</span>
        </div>
        <h3>
          <Link to={`/events/${slugFor(event)}`}>{event.title}</Link>
        </h3>
        {event.short_description && (
          <p className="gt-event-summary">{event.short_description}</p>
        )}
        {availability && (
          <p className="gt-event-availability">
            <Badge
              tone={
                state === "open"
                  ? "success"
                  : state === "full"
                    ? "warning"
                    : "neutral"
              }
            >
              {availability}
            </Badge>
          </p>
        )}
        <p className="gt-event-meta">
          <Clock3 size={16} />
          <time dateTime={event.date} title={timeZone}>
            {dateLabel(event.date, timeZone)} ·{" "}
            {eventTimeLabel(event.date, timeZone)}
          </time>
        </p>
        <p className="gt-event-meta">
          <MapPin size={16} />
          <span>{event.location || "Venue to be announced"}</span>
        </p>
        <Link
          to={`/events/${slugFor(event)}`}
          className={`gt-button gt-button-${isPast(event) ? "secondary" : "primary"}`}
        >
          {isPast(event) ? "View event" : "Explore event"}
          <ArrowRight size={17} />
        </Link>
      </div>
    </article>
  );
}

export function HomePage() {
  usePageTitle("A community of builders");
  const { getPageSection, chapterMetrics, featuredSponsors } = useContent(),
    hero = (getPageSection("home", "hero") || {}) as PageCopy,
    community = (getPageSection("home", "community") || {}) as PageCopy,
    eventCopy = (getPageSection("home", "events") || {}) as PageCopy,
    mission = (getPageSection("home", "mission") || {}) as PageCopy;
  const { events, loading, error, at, retry } = useEvents();
  const upcoming = [...events]
    .filter((event) => !isPast(event))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const displayEvents = localPreviewEnabled
    ? [...events].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
    : upcoming;
  return (
    <>
      <section className="gt-home-hero">
        <img
          className="gt-hero-art"
          src="/assets/hero-atmosphere.webp"
          width="1920"
          height="800"
          alt=""
        />
        <HeroScene />
        <div className="gt-container gt-hero-layout">
          <div className="gt-hero-card">
            <span className="gt-hero-intro">{chapterName}</span>
            <h1>
              <span className="gt-google-name">
                <img
                  src="/assets/google-wordmark.png"
                  alt="Google"
                  width="272"
                  height="92"
                />
              </span>
              <span>
                {hero.title || (
                  <>
                    Developer
                    <br className="gt-hero-break" /> Groups
                  </>
                )}
              </span>
            </h1>
            <p>
              {hero.description || (
                <>
                  Building the future
                  <br className="gt-mobile-break" /> together at Georgia Tech.
                </>
              )}
            </p>
            <div className="gt-hero-actions">
              <ActionLink to={hero.primary_cta_link || "/events"} arrow>
                {hero.primary_cta_text || "Upcoming Events"}
              </ActionLink>
              <ActionLink
                to={hero.secondary_cta_link || "/contact?type=membership"}
                variant="secondary"
              >
                {hero.secondary_cta_text || "Join Us"}
              </ActionLink>
            </div>
            <a className="gt-scroll-cue" href="#community-events">
              Scroll to explore <ArrowDown size={15} />
            </a>
          </div>
          <span className="gt-hero-location">
            <MapPin size={13} /> A little imagination. A lot of Georgia Tech.
          </span>
        </div>
        <svg
          className="gt-hero-wave"
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,42 C180,115 350,15 560,50 C790,95 930,15 1110,45 C1260,75 1350,25 1440,5 L1440,90 L0,90Z"
            fill="var(--canvas)"
          />
        </svg>
      </section>
      {!localPreviewEnabled && chapterMetrics.length > 0 && (
        <section
          className="gt-container gt-community-stats"
          aria-label="Chapter-approved impact"
        >
          {chapterMetrics.map((metric) => (
            <div className="gt-stat" key={metric.id}>
              <span>
                <Users size={24} />
              </span>
              <div>
                <strong>{metric.stat_value}</strong>
                <p>{metric.stat_label}</p>
              </div>
            </div>
          ))}
        </section>
      )}
      {localPreviewEnabled && (
        <section
          className="gt-container gt-community-stats"
          aria-label="Chapter snapshot from PRD reference data"
        >
          {[
            [Users, "47", "Interested students"],
            [CalendarDays, "3", "Fall events"],
            [Code2, "8", "Officer roles"],
            [Heart, "1", "Community"],
          ].map(([Icon, value, label]) => {
            const MetricIcon = Icon as typeof Users;
            return (
              <div className="gt-stat" key={String(label)}>
                <span>
                  <MetricIcon size={24} />
                </span>
                <div>
                  <strong>{String(value)}</strong>
                  <p>{String(label)}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
      <section id="community-events" className="gt-section gt-container">
        <div className="gt-section-heading">
          <div>
            <p className="gt-section-note">A community of builders</p>
            <h2>
              {eventCopy.title || (
                <>
                  {localPreviewEnabled ? "Fall" : "Upcoming"}{" "}
                  <span>Events</span>
                </>
              )}
            </h2>
            <p>
              {eventCopy.description ||
                "Come curious. Leave with something you made."}
            </p>
          </div>
          <ActionLink
            to={eventCopy.cta_link || "/events"}
            variant="secondary"
            arrow
          >
            {eventCopy.cta_text || "View all events"}
          </ActionLink>
        </div>
        {error && (
          <PublicCollectionNotice
            error={error}
            loading={loading}
            at={at}
            retry={retry}
          />
        )}
        {loading && !at ? (
          <div
            className="gt-event-grid"
            role="status"
            aria-label="Loading upcoming events"
          >
            {[1, 2, 3].map((id) => (
              <div className="gt-skeleton gt-event-skeleton" key={id} />
            ))}
          </div>
        ) : displayEvents.length ? (
          <div className="gt-event-grid">
            {displayEvents.map((event) => (
              <EventTile key={event.id} event={event} />
            ))}
          </div>
        ) : !error && !loading ? (
          <EmptyState title="The next chapter is taking shape">
            {eventCopy.no_events_message ||
              "New workshops and gatherings will appear here. Join the newsletter to hear first."}
          </EmptyState>
        ) : null}
        {localPreviewEnabled && (
          <p className="gt-data-note">
            PRD reference events · Illustrative photography · Dates and venues
            shown as supplied.
          </p>
        )}
      </section>
      <section className="gt-community-section">
        <div className="gt-container gt-community-layout">
          <div>
            <span className="gt-section-note">
              Built by students. Open to everyone.
            </span>
            <h2>
              {community.title || (
                <>
                  Your next idea
                  <br />
                  belongs <span>here.</span>
                </>
              )}
            </h2>
            <p>
              {community.description ||
                "Whether you’re writing your first line of code or building your next big thing, there’s a place for you in our community."}
            </p>
            <ActionLink
              to={community.cta_link || "/contact?type=membership"}
              arrow
            >
              {community.cta_text || "Find your people"}
            </ActionLink>
          </div>
          <div className="gt-community-photo">
            <img
              src="/assets/event-hackathon.jpg"
              alt="Illustrative photo of people collaborating around laptops"
              loading="lazy"
              width="720"
              height="480"
            />
            <span>
              <Users size={17} /> Learn together. Build together.
            </span>
          </div>
        </div>
      </section>
      <section className="gt-container gt-section gt-join-strip">
        <div>
          <h2>
            {mission.title || (
              <>
                Big ideas start with a <span>hello.</span>
              </>
            )}
          </h2>
          <p>
            {mission.description ||
              "Meet the students making this community happen."}
          </p>
        </div>
        <ActionLink to={mission.cta_link || "/team"} variant="secondary" arrow>
          {mission.cta_text || "Meet the team"}
        </ActionLink>
      </section>
      {featuredSponsors.length > 0 && (
        <section
          className="gt-container gt-section gt-home-partners"
          aria-label="Chapter partners"
        >
          <div className="gt-section-heading">
            <div>
              <p className="gt-section-note">With our community</p>
              <h2>
                Built with our <span>partners.</span>
              </h2>
            </div>
            <ActionLink to="/sponsors" variant="secondary" arrow>
              Meet our partners
            </ActionLink>
          </div>
          <div className="gt-home-partner-grid">
            {featuredSponsors.map((partner) => (
              <div key={partner.id} className="gt-home-partner">
                <PublicImage
                  src={partner.logo_url}
                  alt={partner.name}
                  fallback={partner.name}
                  loading="lazy"
                  decoding="async"
                  width={320}
                  height={160}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function EventsPage() {
  usePageTitle("Events");
  const [events, setEvents] = useState<SiteEvent[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [total, setTotal] = useState(0),
    [refresh, setRefresh] = useState(0);
  const [params, setParams] = useSearchParams();
  const legacyFilter = params.get("filter") || "";
  const rawStatus = params.get("status") || legacyFilter;
  const query = params.get("q") || "",
    status = ["all", "past", "upcoming"].includes(rawStatus)
      ? rawStatus
      : "upcoming",
    type =
      params.get("type") ||
      (legacyFilter && !["all", "past", "upcoming"].includes(legacyFilter)
        ? legacyFilter === "demo day"
          ? "Demo Day"
          : legacyFilter[0].toUpperCase() + legacyFilter.slice(1)
        : ""),
    sort = ["soonest", "newest", "title", "availability"].includes(
      params.get("sort") || "",
    )
      ? params.get("sort")!
      : "soonest";
  const page = publicPageNumber(params.get("page")),
    level = params.get("level") || "";
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const search = new URLSearchParams({
      q: query,
      status,
      sort,
      page: String(page),
      pageSize: "12",
    });
    if (type) search.set("type", type);
    if (level) search.set("level", level);
    api<{ items: ChapterEvent[]; total: number }>("/events?" + search, {
      signal: controller.signal,
    })
      .then((r) => {
        if (controller.signal.aborted) return;
        setEvents(r.items.map(eventForPage));
        setTotal(r.total);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, status, type, sort, page, level, refresh]);
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("filter");
      next.set("status", status);
      if (type) next.set("type", type);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });
  const filtered = events;
  return (
    <>
      <PageHeader
        title="Make room for"
        accent="what’s next."
        description="Workshops, hackathons, and conversations worth showing up for."
      />
      <section className="gt-container gt-section gt-listing-section">
        <div
          className="gt-filter-row"
          role="group"
          aria-label="Event date status"
        >
          {[
            ["upcoming", "Upcoming"],
            ["all", "All events"],
            ["past", "Past"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`gt-filter-pill ${status === value ? "is-active" : ""}`}
              onClick={() => change("status", value)}
              aria-pressed={status === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gt-toolbar gt-events-toolbar">
          <SearchBox
            value={query}
            onChange={(value) => change("q", value)}
            label="Search events"
            placeholder="Find your next event…"
          />
          <label className="gt-sort">
            <span>Event type</span>
            <select
              value={type}
              onChange={(event) => change("type", event.target.value)}
            >
              <option value="">All types</option>
              {[
                ...new Set([
                  "Workshop",
                  "Hackathon",
                  "Demo Day",
                  "Tech Talk",
                  "Social",
                  ...(type ? [type] : []),
                ]),
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="gt-sort">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => change("sort", event.target.value)}
            >
              <option value="soonest">Soonest first</option>
              <option value="newest">Recently added</option>
              <option value="title">Title A–Z</option>
              <option value="availability">Registration availability</option>
            </select>
          </label>
          <label className="gt-sort">
            <span>Level</span>
            <select
              value={level}
              onChange={(e) => change("level", e.target.value)}
            >
              <option value="">All levels</option>
              {["beginner", "intermediate", "advanced", "open_for_all"].map(
                (value) => (
                  <option key={value} value={value}>
                    {levelLabel(value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <Button variant="ghost" onClick={() => setParams({})}>
            Reset
          </Button>
        </div>
        <p className="gt-results-count" role="status">
          {loading
            ? "Finding events…"
            : `${total} ${total === 1 ? "event" : "events"}`}
        </p>
        {loadError ? (
          <div role="alert" className="gt-form-error">
            {loadError}
            <Button
              variant="secondary"
              onClick={() => setRefresh((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : loading ? (
          <div className="gt-event-grid">
            {[1, 2, 3].map((id) => (
              <div key={id} className="gt-skeleton gt-event-skeleton" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="gt-event-grid">
            {filtered.map((event) => (
              <EventTile event={event} key={event.id} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nothing on the calendar with those filters"
            action={
              <Button
                variant="secondary"
                onClick={() => setParams({ status: "all" })}
              >
                Show all events
              </Button>
            }
          >
            Try another search or see what the community has been building.
          </EmptyState>
        )}
        <div className="gt-inline-actions">
          <Button
            variant="secondary"
            disabled={page === 1 || loading}
            onClick={() => change("page", String(page - 1))}
          >
            Previous
          </Button>
          <span>Page {page}</span>
          <Button
            variant="secondary"
            disabled={page * 12 >= total || loading}
            onClick={() => change("page", String(page + 1))}
          >
            Next
          </Button>
        </div>
        {localPreviewEnabled && (
          <p className="gt-data-note">
            Local reference data. Images illustrate the experience and are not
            official event photographs.
          </p>
        )}
      </section>
    </>
  );
}

export function EventDetailPage() {
  const { slug } = useParams();
  const [event, setEvent] = useState<SiteEvent | null>(null),
    [events, setRelated] = useState<SiteEvent[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [loadedFor, setLoadedFor] = useState<string>(),
    [reload, setReload] = useState(0);
  const [submitted, setSubmitted] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [registrationErrors, setRegistrationErrors] = useState<
      Record<string, string>
    >({});
  const [registrationDirty, setRegistrationDirty] = useState(false);
  const [queueCandidate, setQueueCandidate] = useState<{
      body: Record<string, unknown>;
      key: string;
    }>(),
    [pendingReference, setPendingReference] = useState("");
  const registrationRequest = useRef<{ body: string; key: string } | null>(
      null,
    ),
    registrationPending = useRef(false),
    registrationEpoch = useRef(0),
    registrationForm = useRef<HTMLFormElement>(null),
    registrationHeading = useRef<HTMLHeadingElement>(null),
    registrationFeedback = useRef<HTMLParagraphElement>(null),
    registrationFocus = useRef<"fields" | "state" | "feedback" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const epoch = ++registrationEpoch.current;
    registrationRequest.current = null;
    registrationPending.current = false;
    registrationFocus.current = null;
    setEvent(null);
    setRelated([]);
    setSubmitted(false);
    setBusy(false);
    setFeedback("");
    setRegistrationErrors({});
    setRegistrationDirty(false);
    setQueueCandidate(undefined);
    setPendingReference("");
    setLoading(true);
    setLoadError("");
    api<{ event: ChapterEvent; related: ChapterEvent[] }>(
      "/events/" + encodeURIComponent(slug || ""),
      { signal: controller.signal },
    )
      .then((r) => {
        if (controller.signal.aborted) return;
        setLoadedFor(slug);
        setEvent(eventForPage(r.event));
        setRelated(r.related.map(eventForPage));
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadedFor(slug);
          setEvent(null);
          if (error.status !== 404) setLoadError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      registrationEpoch.current = epoch + 1;
    };
  }, [slug, reload]);
  useDraftGuard(registrationDirty && !submitted, {
    busy,
    label: "Event registration details",
    privateDraft: false,
  });
  useEffect(() => {
    if (busy || !registrationFocus.current) return;
    const target = registrationFocus.current;
    registrationFocus.current = null;
    if (target === "state") registrationHeading.current?.focus();
    else if (target === "feedback") registrationFeedback.current?.focus();
    else {
      const name = ["name", "email", "notes", "consent"].find(
        (key) => registrationErrors[key],
      );
      const control =
        name && registrationForm.current?.elements.namedItem(name);
      if (control instanceof HTMLElement) control.focus();
    }
  }, [busy, registrationErrors, submitted, event?.registration_state]);
  usePageTitle(event?.title || "Event", event?.description, event?.image_url);
  useEffect(() => {
    if (!event) return;
    const canonicalUrl = window.location.origin + "/events/" + slugFor(event);
    const metadata = document.createElement("script");
    metadata.type = "application/ld+json";
    metadata.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name: event.title,
      description: event.description.replace(/<[^>]*>/g, ""),
      startDate: event.date,
      endDate: event.end_at,
      url: canonicalUrl,
      eventStatus:
        event.publication_status === "cancelled"
          ? "https://schema.org/EventCancelled"
          : "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: event.location },
      organizer: { "@type": "Organization", name: chapterName },
    }).replace(/</g, "\\u003c");
    document.head.append(metadata);
    return () => {
      metadata.remove();
    };
  }, [event]);
  if (loading || loadedFor !== slug)
    return (
      <div
        className="gt-container gt-section"
        role="status"
        aria-label="Loading event"
      >
        <div className="gt-skeleton gt-detail-skeleton" />
      </div>
    );
  if (loadError)
    return (
      <div className="gt-container gt-section">
        <EmptyState
          title="This event could not load"
          action={
            <div className="gt-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setReload((value) => value + 1);
                  document.getElementById("main-content")?.focus();
                }}
              >
                Retry event
              </Button>
              <ActionLink to="/events">Return to events</ActionLink>
            </div>
          }
        >
          {loadError}
        </EmptyState>
      </div>
    );
  if (!event) return <NotFoundPage />;
  const past = event.registration_state === "ended" || isPast(event);
  const full =
    event.registration_state === "full" ||
    (!!event.max_participants &&
      (event.accurate_attendee_count ?? 0) >= event.max_participants);
  const unavailable =
    full ||
    event.registration_state === "closed" ||
    event.registration_state === "ended" ||
    event.status === "cancelled" ||
    event.registration_enabled === false;
  const externalRegistration = safePublicUrl(
    event.registration_url || event.google_form_url,
  );
  const calendar = () => {
    window.location.assign(
      "/api/v1/events/" +
        encodeURIComponent(event.slug || slug || "") +
        "/calendar.ics",
    );
  };
  const register = async (submit: FormEvent<HTMLFormElement>) => {
    submit.preventDefault();
    if (busy || registrationPending.current) return;
    const epoch = registrationEpoch.current;
    const form = new FormData(submit.currentTarget);
    registrationPending.current = true;
    registrationFocus.current = null;
    setRegistrationErrors({});
    setFeedback("");
    setBusy(true);
    try {
      if (localPreviewEnabled) {
        if (form.get("website")) return;
        const records = JSON.parse(
          localStorage.getItem("gdg-preview-registrations") || "[]",
        );
        const normalizedEmail = String(form.get("email")).trim().toLowerCase();
        if (
          !records.some(
            (record: { eventId: string; email: string }) =>
              record.eventId === event.id && record.email === normalizedEmail,
          )
        )
          records.push({
            eventId: event.id,
            name: form.get("name"),
            email: normalizedEmail,
            notes: form.get("notes"),
            idempotencyKey: crypto.randomUUID(),
          });
        localStorage.setItem(
          "gdg-preview-registrations",
          JSON.stringify(records),
        );
        registrationFocus.current = "state";
        setSubmitted(true);
      } else {
        const body = {
          name: String(form.get("name") || ""),
          email: String(form.get("email") || ""),
          notes: String(form.get("notes") || ""),
          consent: form.get("consent") === "on",
          website: String(form.get("website") || ""),
        };
        const serialized = JSON.stringify(body);
        setQueueCandidate(undefined);
        setPendingReference("");
        if (registrationRequest.current?.body !== serialized)
          registrationRequest.current = {
            body: serialized,
            key: crypto.randomUUID(),
          };
        try {
          await api(
            "/events/" +
              encodeURIComponent(event.slug || slug || "") +
              "/registrations",
            {
              method: "POST",
              body,
              idempotencyKey: registrationRequest.current.key,
            },
          );
        } catch (e) {
          if (epoch !== registrationEpoch.current) return;
          const status = (e as { status?: number }).status;
          if (status === undefined || status >= 500)
            setQueueCandidate({
              body: { ...body, slug: event.slug || slug },
              key: registrationRequest.current.key,
            });
          throw e;
        }
        if (epoch !== registrationEpoch.current) return;
        registrationFocus.current = "state";
        setSubmitted(true);
        setFeedback("");
      }
    } catch (error) {
      if (epoch !== registrationEpoch.current) return;
      if (error instanceof ApiFailure && error.code === "EVENT_FULL") {
        registrationFocus.current = "state";
        setRegistrationDirty(false);
        setEvent((previous) =>
          previous ? { ...previous, registration_state: "full" } : previous,
        );
      } else {
        const fields =
          error instanceof ApiFailure
            ? Object.fromEntries(
                Object.entries(error.fields || {}).filter(([key]) =>
                  ["name", "email", "notes", "consent"].includes(key),
                ),
              )
            : {};
        setRegistrationErrors(fields);
        registrationFocus.current = Object.keys(fields).length
          ? "fields"
          : "feedback";
      }
      setFeedback(
        error instanceof Error
          ? error.message
          : "Your registration could not be saved. Please try again.",
      );
    } finally {
      if (epoch === registrationEpoch.current) {
        registrationPending.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <div className="gt-detail-header">
        <div className="gt-container">
          <Link className="gt-back-link" to="/events">
            ← All events
          </Link>
          <div className="gt-event-detail-hero">
            <div className="gt-detail-photo">
              <PublicImage
                src={event.image_url || "/assets/event-community.jpg"}
                fallbackSrc="/assets/event-community.jpg"
                alt={
                  localPreviewEnabled ? "Illustrative event image" : event.title
                }
                width="1000"
                height="650"
              />
              <Badge tone="coral">{event.type || "Community event"}</Badge>
            </div>
            <div>
              <Badge tone={past ? "neutral" : "success"}>
                {past ? "Past event" : "Coming up"}
              </Badge>
              <h1>{event.title}</h1>
              <p>{levelLabel(event.level)}</p>
              <div className="gt-detail-facts">
                <p>
                  <CalendarDays size={19} />
                  {dateLabel(event.date, event.timezone)}
                </p>
                <p>
                  <Clock3 size={19} />
                  {event.time || "Time to be announced"}
                  <small>{event.timezone || "America/New_York"}</small>
                </p>
                <p>
                  <MapPin size={19} />
                  {event.location || "Venue to be announced"}
                </p>
              </div>
              <div className="gt-inline-actions">
                <Button variant="secondary" onClick={calendar}>
                  <CalendarDays size={16} />
                  Add to calendar
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setFeedback("Event link copied.");
                    } catch {
                      setFeedback(`Share this page: ${window.location.href}`);
                    }
                  }}
                >
                  <Share2 size={16} />
                  Share
                </Button>
              </div>
              <p role="status" className="gt-helper">
                {feedback}
              </p>
            </div>
          </div>
        </div>
      </div>
      <section className="gt-container gt-section gt-detail-grid">
        <article className="gt-prose">
          <h2>About this event</h2>
          <p>{event.description.replace(/<[^>]*>/g, "")}</p>
          {!!event.linked_forms?.length && (
            <section aria-label="Event forms">
              <h3>Event forms</h3>
              <div className="gt-inline-actions">
                {event.linked_forms.map((form) => (
                  <ActionLink key={form.href} to={form.href} arrow>
                    {form.label}
                  </ActionLink>
                ))}
              </div>
              <p className="gt-helper">
                Each form has its own access and verification requirements.
              </p>
            </section>
          )}
          {event.what_youll_learn && (
            <>
              <h3>What you’ll learn</h3>
              <p>{event.what_youll_learn}</p>
            </>
          )}
          {event.prerequisites && (
            <>
              <h3>Prerequisites</h3>
              <p>{event.prerequisites}</p>
            </>
          )}
          {event.room && (
            <>
              <h3>Room</h3>
              <p>{event.room}</p>
            </>
          )}
          {event.additional_info && (
            <>
              <h3>Additional information</h3>
              <p>{event.additional_info}</p>
            </>
          )}
          {event.contact_info && (
            <>
              <h3>Questions?</h3>
              <p>{event.contact_info}</p>
            </>
          )}
          {event.what_to_bring && (
            <>
              <h3>What to bring</h3>
              <p>{event.what_to_bring}</p>
            </>
          )}
          {event.schedule && (
            <>
              <h3>Schedule</h3>
              <p>{event.schedule}</p>
            </>
          )}
          <div className="gt-soft-callout">
            <Sparkles size={23} />
            <div>
              <h3>A place to learn together</h3>
              <p>
                Questions are welcome. Bring your perspective and meet the
                people building alongside you.
              </p>
            </div>
          </div>
        </article>
        <aside id="registration" className="gt-registration gt-panel">
          {submitted ? (
            <div className="gt-success">
              <CheckCircle2 size={38} />
              <h2 ref={registrationHeading} tabIndex={-1}>
                {localPreviewEnabled
                  ? "Saved in your local preview"
                  : "Your place is confirmed."}
              </h2>
              <p>
                {localPreviewEnabled
                  ? "Your sample registration is stored in this browser. No real registration or confirmation email was created."
                  : "Your registration was saved by the chapter. A confirmation message is queued; delivery may take a moment."}
              </p>
              <Button variant="secondary" onClick={() => setSubmitted(false)}>
                Try another registration
              </Button>
            </div>
          ) : (
            <>
              <h2 ref={registrationHeading} tabIndex={-1}>
                {past
                  ? "Thanks for being part of it."
                  : event.status === "cancelled"
                    ? "This event is cancelled."
                    : full
                      ? "This event is full."
                      : unavailable
                        ? "Registration is closed."
                        : "Save your place."}
              </h2>
              <p>
                {past
                  ? "This event has ended. Explore the next opportunity to build with us."
                  : "A few details, and you’re ready to go."}
              </p>
              {past || unavailable ? (
                <ActionLink to="/events" arrow>
                  See upcoming events
                </ActionLink>
              ) : event.registration_type === "external" &&
                externalRegistration ? (
                <a
                  href={externalRegistration}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gt-button gt-button-primary"
                >
                  Register with the event organizer <ArrowUpRight size={17} />
                  <span className="sr-only">(opens a new tab)</span>
                </a>
              ) : (
                <form
                  key={event.id}
                  ref={registrationForm}
                  onSubmit={register}
                  className="gt-form"
                  onChange={(event) => {
                    setRegistrationDirty(true);
                    setQueueCandidate(undefined);
                    const control = event.target;
                    if (
                      control instanceof HTMLInputElement ||
                      control instanceof HTMLTextAreaElement
                    )
                      setRegistrationErrors((previous) => {
                        if (!previous[control.name]) return previous;
                        const next = { ...previous };
                        delete next[control.name];
                        return next;
                      });
                  }}
                >
                  <label className="gt-honeypot" aria-hidden="true">
                    Leave this empty
                    <input
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </label>
                  <Field label="Full name" required>
                    <input
                      name="name"
                      disabled={busy}
                      aria-invalid={!!registrationErrors.name || undefined}
                      aria-describedby={
                        registrationErrors.name ? "event-name-error" : undefined
                      }
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={100}
                    />
                  </Field>
                  {registrationErrors.name && (
                    <p id="event-name-error" className="gt-registration-error">
                      {registrationErrors.name}
                    </p>
                  )}
                  <Field label="Email address" required>
                    <input
                      name="email"
                      disabled={busy}
                      aria-invalid={!!registrationErrors.email || undefined}
                      aria-describedby={
                        registrationErrors.email
                          ? "event-email-error"
                          : undefined
                      }
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </Field>
                  {registrationErrors.email && (
                    <p id="event-email-error" className="gt-registration-error">
                      {registrationErrors.email}
                    </p>
                  )}
                  <Field label="Anything we should know?">
                    <textarea
                      name="notes"
                      rows={3}
                      maxLength={2000}
                      disabled={busy}
                      aria-invalid={!!registrationErrors.notes || undefined}
                      aria-describedby={
                        registrationErrors.notes
                          ? "event-notes-error"
                          : undefined
                      }
                    />
                  </Field>
                  {registrationErrors.notes && (
                    <p id="event-notes-error" className="gt-registration-error">
                      {registrationErrors.notes}
                    </p>
                  )}
                  <label className="gt-check">
                    <input
                      type="checkbox"
                      name="consent"
                      required
                      disabled={busy}
                      aria-invalid={!!registrationErrors.consent || undefined}
                      aria-describedby={
                        registrationErrors.consent
                          ? "event-consent-error"
                          : undefined
                      }
                    />
                    <span>
                      I agree to be contacted about this event.{" "}
                      <Link to="/privacy">Privacy notice</Link>
                    </span>
                  </label>
                  {registrationErrors.consent && (
                    <p
                      id="event-consent-error"
                      className="gt-registration-error"
                    >
                      {registrationErrors.consent}
                    </p>
                  )}
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : localPreviewEnabled
                        ? "Try local registration"
                        : "Complete registration"}
                    <ArrowRight size={17} />
                  </Button>
                  {localPreviewEnabled && (
                    <small>UI demo only. No real registration or email.</small>
                  )}
                  {feedback && (
                    <p
                      role="alert"
                      className="gt-helper"
                      ref={registrationFeedback}
                      tabIndex={-1}
                    >
                      {feedback}
                    </p>
                  )}
                  {queueCandidate && !pendingReference && (
                    <div className="gt-form">
                      <p className="gt-helper">
                        You can save these details on this device for up to 48
                        hours and retry automatically when online. This does not
                        reserve a place. Do not use this on a shared device.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const reference = await savePendingSubmission(
                              "event",
                              queueCandidate.body,
                              queueCandidate.key,
                            );
                            setPendingReference(reference);
                            setRegistrationDirty(false);
                            setQueueCandidate(undefined);
                          } catch (e) {
                            setFeedback((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Save pending registration on this device
                      </Button>
                    </div>
                  )}
                  {pendingReference && (
                    <p role="status">
                      Pending submission saved—not registered yet.{" "}
                      <Link to="/offline">Review, retry or discard it</Link>.
                    </p>
                  )}
                </form>
              )}
            </>
          )}
          {!past && event.status !== "cancelled" && !localPreviewEnabled && (
            <EventReminders
              key={event.id}
              eventId={event.id}
              slug={event.slug || slug || ""}
            />
          )}
        </aside>
      </section>
      <section className="gt-container gt-section gt-related">
        <div className="gt-section-heading">
          <h2>
            Keep <span>exploring.</span>
          </h2>
          <ActionLink to="/events" variant="ghost" arrow>
            All events
          </ActionLink>
        </div>
        <div className="gt-event-grid">
          {events
            .filter((item) => item.id !== event.id)
            .slice(0, 3)
            .map((item) => (
              <EventTile event={item} key={item.id} />
            ))}
        </div>
      </section>
    </>
  );
}

export function TeamPage() {
  usePageTitle("Meet the team");
  const [params, setParams] = useSearchParams(),
    page = publicPageNumber(params.get("page")),
    listing = usePublicCollection<PublicPerson>(
      `/team?page=${page}&pageSize=24`,
    ),
    teamMembers = listing.data?.items || [];
  const groups = [
    ...new Set(teamMembers.map((person) => person.team_section || "Our team")),
  ];
  return (
    <>
      <PageHeader
        title="Meet the"
        accent="team."
        description="Students building a stronger developer community at Georgia Tech."
      />
      <section className="gt-container gt-section">
        <PublicCollectionNotice {...listing} />
        {teamMembers.length ? (
          groups.map((group) => (
            <section className="gt-team-group" key={group}>
              <h2>{group}</h2>
              <div className="gt-team-grid">
                {teamMembers
                  .filter(
                    (person) => (person.team_section || "Our team") === group,
                  )
                  .map((person) => (
                    <article className="gt-person" key={person.id}>
                      <div className="gt-person-portrait">
                        {person.image_url ? (
                          <PublicImage
                            src={person.image_url}
                            alt={person.name}
                            fallback={person.name
                              .split(" ")
                              .map((part) => part[0])
                              .slice(0, 2)
                              .join("")}
                            loading="lazy"
                            width={480}
                            height={480}
                            decoding="async"
                          />
                        ) : (
                          <span>
                            {person.name
                              .split(" ")
                              .map((part: string) => part[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                        )}
                      </div>
                      <h3>{person.name}</h3>
                      <p className="gt-person-role">{person.role}</p>
                      {person.bio && <p>{person.bio}</p>}
                      <div className="gt-inline-actions">
                        {safePublicUrl(person.linkedin_url) && (
                          <a
                            href={safePublicUrl(person.linkedin_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${person.name} on LinkedIn (opens a new tab)`}
                            className="gt-external-social"
                          >
                            <Linkedin size={18} />
                            <ArrowUpRight
                              className="gt-external-marker"
                              size={10}
                              aria-hidden="true"
                            />
                          </a>
                        )}
                        {safePublicUrl(person.github_url) && (
                          <a
                            href={safePublicUrl(person.github_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${person.name} on GitHub (opens a new tab)`}
                            className="gt-external-social"
                          >
                            <Github size={18} />
                            <ArrowUpRight
                              className="gt-external-marker"
                              size={10}
                              aria-hidden="true"
                            />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))
        ) : !listing.loading && !listing.error && listing.data?.total === 0 ? (
          <>
            <div className="gt-team-intro">
              <span className="gt-round-icon">
                <Users size={30} />
              </span>
              <h2>A chapter takes a team.</h2>
              <p>
                Our officer profiles are coming soon. Behind every workshop,
                gathering, and new idea is a student ready to make it happen.
              </p>
            </div>
            <div className="gt-role-list">
              {[
                "Chapter leadership",
                "Technology & workshops",
                "Events & community",
                "Design & communications",
              ].map((role, i) => (
                <div key={role}>
                  <span className="gt-role-number">0{i + 1}</span>
                  <h3>{role}</h3>
                  <span>Profiles coming soon</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {listing.data && (
          <PublicPagination
            label="Team profile pages"
            {...listing.data}
            busy={listing.loading}
            onPage={(value) => setParams({ page: String(value) })}
          />
        )}
        <div className="gt-join-strip gt-soft-callout">
          <div>
            <h2>Want to build with us?</h2>
            <p>Bring your interests. We’ll find a place to start.</p>
          </div>
          <ActionLink to="/contact?type=membership" arrow>
            Join the community
          </ActionLink>
        </div>
      </section>
    </>
  );
}

export function ResourcesPage() {
  usePageTitle("Resources for builders");
  const [params, setParams] = useSearchParams(),
    query = params.get("q") || "",
    type = params.get("type") || "all",
    level = params.get("level") || "all",
    status = params.get("status") || "",
    tag = params.get("tag") || "",
    page = publicPageNumber(params.get("page"));
  const search = new URLSearchParams({ page: String(page), pageSize: "12" });
  for (const [key, value] of [
    ["q", query],
    ["type", type],
    ["level", level],
    ["status", status],
    ["tag", tag],
  ])
    if (value && value !== "all")
      search.set(
        key,
        key === "level" ? value[0].toUpperCase() + value.slice(1) : value,
      );
  const listing = usePublicCollection<PublicResource>("/resources?" + search),
    filtered = listing.data?.items || [];
  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("page");
        if (value && value !== "all") next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return (
    <>
      <PageHeader
        title="Resources for"
        accent="builders."
        description="A good starting point for your next idea. Guides, tools, and learning paths for curious minds."
      />
      <section className="gt-container gt-section">
        <div className="gt-filter-row">
          {[
            ["all", "All resources"],
            ["study_jam", "Study jams"],
            ["cloud_credit", "Cloud credits"],
            ["documentation", "Documentation"],
            ["recording", "Recordings"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`gt-filter-pill ${type === value ? "is-active" : ""}`}
              onClick={() => change("type", value)}
              aria-pressed={type === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="gt-toolbar">
          <SearchBox
            value={query}
            onChange={(value) => change("q", value)}
            label="Search resources"
            placeholder="What do you want to learn?"
          />
          <label className="gt-sort">
            Level
            <select
              value={level}
              onChange={(event) => change("level", event.target.value)}
            >
              <option value="all">Any experience</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <Field label="Availability">
            <select
              value={status}
              onChange={(event) => change("status", event.target.value)}
            >
              <option value="">Any status</option>
              <option>Available</option>
              <option>Coming Soon</option>
              <option>Archived</option>
            </select>
          </Field>
          <Field label="Tag">
            <input
              type="search"
              value={tag}
              maxLength={100}
              placeholder="Exact tag, e.g. Cloud"
              onChange={(event) => change("tag", event.target.value)}
            />
          </Field>
        </div>
        <PublicCollectionNotice {...listing} />
        {filtered.length ? (
          <div className="gt-resource-grid">
            {filtered.map((resource, index) => (
              <article
                className={`gt-resource ${index === 0 && type === "all" ? "gt-resource-featured" : ""}`}
                key={resource.id}
              >
                <span className="gt-resource-icon">
                  {resource.type === "study_jam" ? (
                    <GraduationCap />
                  ) : resource.type === "cloud_credit" ? (
                    <Rocket />
                  ) : (
                    <FileText />
                  )}
                </span>
                <div>
                  <Badge tone="coral">{resource.type.replace(/_/g, " ")}</Badge>
                  <h2>{resource.title}</h2>
                  <p>{resource.description}</p>
                  <div className="gt-tags">
                    {(resource.tags || []).map((tag: string) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                {safePublicUrl(resource.url) && (
                  <a
                    href={safePublicUrl(resource.url)}
                    className="gt-resource-action"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void api(`/resources/${resource.id}/view`, {
                        method: "POST",
                      }).catch(() => {});
                    }}
                  >
                    Open resource <ArrowUpRight size={18} />
                    <span className="sr-only"> (opens a new tab)</span>
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : !listing.loading && !listing.error ? (
          <EmptyState
            title="No resources match just yet"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setParams({});
                }}
              >
                Reset filters
              </Button>
            }
          >
            Try a broader search or another resource type.
          </EmptyState>
        ) : null}
        {listing.data && (
          <PublicPagination
            label="Resource pages"
            {...listing.data}
            busy={listing.loading}
            onPage={(value) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("page", String(value));
                return next;
              })
            }
          />
        )}
      </section>
    </>
  );
}

export function SponsorsPage() {
  usePageTitle("Our partners");
  const [params, setParams] = useSearchParams(),
    page = publicPageNumber(params.get("page")),
    listing = usePublicCollection<PublicSponsor>(
      `/sponsors?page=${page}&pageSize=24`,
    ),
    tiers = usePublicCollection<PublicTier>("/sponsor-tiers?pageSize=100"),
    metrics = usePublicCollection<PublicMetric>(
      `/sponsor-stats?page=${publicPageNumber(params.get("impactPage"))}&pageSize=12`,
    ),
    sponsors = listing.data?.items || [],
    sponsorshipTiers = tiers.data?.items || [],
    chapterMetrics = metrics.data?.items || [];
  const tierOrder = [
    ...new Set([
      ...sponsorshipTiers.map((t) => t.tier_level),
      ...sponsors.map((s) => s.tier),
    ]),
  ];
  return (
    <>
      <PageHeader
        title="Partners who power"
        accent="student builders."
        description="Help curious minds turn promising ideas into something real."
      >
        <ActionLink to="/contact?type=sponsorship" arrow>
          Become a sponsor
        </ActionLink>
      </PageHeader>
      <section className="gt-container gt-section">
        <PublicCollectionNotice {...listing} />
        {sponsors.length ? (
          tierOrder.map(
            (tier) =>
              sponsors.some((sponsor) => sponsor.tier === tier) && (
                <section
                  key={tier}
                  className="gt-section"
                  aria-label={`${sponsorshipTiers.find((t) => t.tier_level === tier)?.tier_name || sponsors.find((s) => s.tier === tier)?.tier_label || tier} partners`}
                >
                  <h2>
                    {sponsorshipTiers.find((t) => t.tier_level === tier)
                      ?.tier_name ||
                      sponsors.find((s) => s.tier === tier)?.tier_label ||
                      tier}{" "}
                    partners
                  </h2>
                  <div className="gt-sponsor-grid">
                    {sponsors
                      .filter((sponsor) => sponsor.tier === tier)
                      .map((sponsor) => (
                        <article className="gt-sponsor" key={sponsor.id}>
                          <Badge tone="coral">{sponsor.tier} partner</Badge>
                          <PublicImage
                            src={sponsor.logo_url}
                            alt={sponsor.name}
                            fallback={sponsor.name}
                            loading="lazy"
                            width={320}
                            height={160}
                            decoding="async"
                            style={{ objectFit: "contain" }}
                          />
                          <h3>{sponsor.name}</h3>
                          {safePublicUrl(sponsor.website_url) && (
                            <a
                              href={safePublicUrl(sponsor.website_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Visit partner <ArrowUpRight size={17} />
                              <span className="sr-only">
                                {" "}
                                (opens a new tab)
                              </span>
                            </a>
                          )}
                        </article>
                      ))}
                  </div>
                </section>
              ),
          )
        ) : !listing.loading && !listing.error && listing.data?.total === 0 ? (
          <div className="gt-sponsor-invitation">
            <Heart size={38} />
            <h2>
              Good things grow
              <br />
              with good partners.
            </h2>
            <p>
              We’re building our partner community. If you believe in hands-on
              learning, student ideas, and the people behind them, let’s talk.
            </p>
            <ActionLink to="/contact?type=sponsorship" arrow>
              Start a conversation
            </ActionLink>
          </div>
        ) : null}
        {listing.data && (
          <PublicPagination
            label="Partner pages"
            {...listing.data}
            busy={listing.loading}
            onPage={(value) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("page", String(value));
                return next;
              })
            }
          />
        )}
        <PublicCollectionNotice {...tiers} />
        {sponsorshipTiers.length > 0 && (
          <section
            className="gt-section"
            aria-label="Approved sponsorship packages"
          >
            <h2>Ways to support the chapter</h2>
            <div className="gt-content-columns">
              {sponsorshipTiers.map((tier) => (
                <article key={tier.id}>
                  <Badge tone="coral">{tier.tier_level}</Badge>
                  <h3>{tier.tier_name}</h3>
                  <p>{tier.amount}</p>
                  <ul>
                    {(tier.benefits as string[]).map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                  <ActionLink
                    to="/contact?type=sponsorship"
                    variant="secondary"
                  >
                    Discuss this package
                  </ActionLink>
                </article>
              ))}
            </div>
          </section>
        )}
        <PublicCollectionNotice {...metrics} />
        {chapterMetrics.length > 0 && (
          <section className="gt-section" aria-label="Chapter-approved impact">
            <h2>Impact, with context</h2>
            <dl className="gt-content-columns">
              {chapterMetrics.map((metric) => (
                <div key={metric.id}>
                  <dt>{metric.stat_label}</dt>
                  <dd>
                    <strong>{metric.stat_value}</strong>
                    <p>{metric.stat_description}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {metrics.data && (
          <PublicPagination
            label="Impact pages"
            {...metrics.data}
            busy={metrics.loading}
            onPage={(value) =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("impactPage", String(value));
                return next;
              })
            }
          />
        )}
        <div className="gt-partner-benefits">
          {[
            [
              "Support hands-on learning",
              "Help make workshops, learning resources, and shared experiences possible.",
            ],
            [
              "Meet the next generation",
              "Connect with students who are curious about the tools and ideas shaping technology.",
            ],
            [
              "Build lasting community",
              "Be part of an environment where students learn from one another.",
            ],
          ].map(([title, text]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function GalleryPage() {
  usePageTitle("Community in motion");
  return <PublicGallery />;
}

export function ContactPage() {
  usePageTitle("Let’s build something together");
  const { getPageSection, getSiteSetting } = useContent(),
    copy = (getPageSection("contact", "main") ||
      getPageSection("contact", "header") ||
      {}) as PageCopy,
    contactEmail = getSiteSetting("contact_email");
  const [params] = useSearchParams(),
    [type, setType] = useState(params.get("type") || "general");
  const [message, setMessage] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false),
    [busy, setBusy] = useState(false);
  const [interests, setInterests] = useState(""),
    [uploadProgress, setUploadProgress] = useState("");
  const attachment = useRef<ContactUpload>(),
    contactPending = useRef<AbortController>(),
    contactActive = useRef(true),
    contactFileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    contactActive.current = true;
    return () => {
      contactActive.current = false;
      contactPending.current?.abort();
    };
  }, []);
  const contactRequest = useRef<{ body: string; key: string } | null>(null);
  const [contactDirty, setContactDirty] = useState(false);
  useDraftGuard(!success && (contactDirty || !!message || !!file), {
    busy,
    label: "Contact message or attachment",
    privateDraft: false,
  });
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    setUploadProgress("");
    const controller = new AbortController();
    contactPending.current = controller;
    const data = new FormData(event.currentTarget);
    if (
      file &&
      (file.size > 10 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          file.type,
        ))
    ) {
      setError("Choose a PDF, PNG, JPEG, or WebP smaller than 10 MB.");
      setBusy(false);
      return;
    }
    try {
      if (localPreviewEnabled) {
        localStorage.setItem(
          "gdg-preview-contact",
          JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            type,
            message,
            attachment: file?.name,
          }),
        );
        setSuccess(true);
      } else {
        if (data.get("website")) {
          setError("This message could not be accepted.");
          return;
        }
        const parsedInterests = interests
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          parsedInterests.length > 20 ||
          parsedInterests.some((v) => v.length > 100)
        ) {
          setError("Use up to 20 interests, each at most 100 characters.");
          return;
        }
        let approvedAttachment:
          { uploadId: string; uploadToken: string } | undefined;
        if (file) {
          if (attachment.current?.file !== file)
            attachment.current = contactUpload(file);
          approvedAttachment = await prepareContactAttachment(
            attachment.current,
            controller.signal,
            (text) => {
              if (contactActive.current) setUploadProgress(text);
            },
          );
        }
        const body = {
          name: String(data.get("name")),
          email: String(data.get("email")),
          message,
          type,
          website: String(data.get("website") || ""),
          interests: parsedInterests,
          ...(approvedAttachment ? { attachment: approvedAttachment } : {}),
        };
        const fingerprint = JSON.stringify(body);
        if (contactRequest.current?.body !== fingerprint)
          contactRequest.current = {
            body: fingerprint,
            key: crypto.randomUUID(),
          };
        const result = await ContactService.submitContactForm(
          body,
          contactRequest.current.key,
          controller.signal,
        );
        if (!contactActive.current) return;
        if (result.success) {
          setSuccess(true);
          setContactDirty(false);
          attachment.current = undefined;
          setUploadProgress("");
        } else
          setError(
            result.error || "We could not send your message. Please try again.",
          );
      }
    } catch (failure) {
      if (contactActive.current && !controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "We could not send your message. Please try again.",
        );
    } finally {
      if (contactActive.current) setBusy(false);
    }
  };
  return (
    <div className="gt-contact-page">
      <div className="gt-container gt-contact-layout">
        <div className="gt-contact-copy">
          <span className="gt-section-note">A good place to start</span>
          <h1>
            {copy.title || (
              <>
                Let’s build
                <br />
                something <span>together.</span>
              </>
            )}
          </h1>
          <p>
            {copy.description ||
              "Have an idea, a question, or a reason to connect? We’d love to hear from you."}
          </p>
          <div className="gt-contact-reasons">
            {[
              [Users, "Find your community", "Membership and getting involved"],
              [
                CalendarDays,
                "Make something happen",
                "Events, workshops, and speaking",
              ],
              [
                Heart,
                "Support student builders",
                "Partnerships and sponsorship",
              ],
            ].map(([Icon, title, text]) => {
              const ReasonIcon = Icon as typeof Users;
              return (
                <div key={String(title)}>
                  <span>
                    <ReasonIcon size={21} />
                  </span>
                  <div>
                    <h3>{String(title)}</h3>
                    <p>{String(text)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="gt-contact-small">
            Everyone is welcome. Tell us about any accessibility needs so we can
            help you take part.
          </p>
          {typeof contactEmail === "string" &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) && (
              <p>
                <a href={"mailto:" + contactEmail}>{contactEmail}</a>
              </p>
            )}
        </div>
        <div className="gt-contact-form gt-panel">
          {success ? (
            <div className="gt-success">
              <CheckCircle2 size={44} />
              <h2>
                {localPreviewEnabled
                  ? "Your preview message is saved."
                  : "Message received."}
              </h2>
              <p>
                {localPreviewEnabled
                  ? "It is stored in this browser for UI testing. No email or real contact submission was sent."
                  : copy.success_message ||
                    "Thank you for reaching out. The chapter will review your message."}
              </p>
              <Button
                onClick={() => {
                  setSuccess(false);
                  setMessage("");
                  setFile(null);
                  setContactDirty(false);
                  setInterests("");
                  setUploadProgress("");
                  contactRequest.current = null;
                }}
                variant="secondary"
              >
                Write another message
              </Button>
            </div>
          ) : (
            <form
              className="gt-form"
              onSubmit={submit}
              onChange={() => setContactDirty(true)}
            >
              <label className="gt-honeypot" aria-hidden="true">
                Leave this empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <h2>{copy.form_title || "Say hello."}</h2>
              <p>
                Fields marked <span className="gt-required">*</span> are
                required.
              </p>
              <div className="gt-form-two">
                <Field label="Full name" required>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    disabled={busy}
                  />
                </Field>
                <Field label="Email address" required>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    disabled={busy}
                  />
                </Field>
              </div>
              <Field label="What brings you here?" required>
                <select
                  value={type}
                  disabled={busy}
                  onChange={(event) => setType(event.target.value)}
                >
                  {[
                    ["general", "General question"],
                    ["membership", "Join the community"],
                    ["event", "Events & collaboration"],
                    ["sponsorship", "Sponsorship"],
                    ["speaker", "Speaking"],
                    ["accessibility", "Accessibility"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Your message"
                required
                hint={`${message.length.toLocaleString()} / 5,000 characters · At least 20 characters`}
              >
                <textarea
                  name="message"
                  disabled={busy}
                  rows={5}
                  minLength={20}
                  maxLength={5000}
                  required
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Tell us what’s on your mind…"
                />
              </Field>
              <Field
                label="Interests (optional)"
                hint="Separate interests with commas. Up to 20; avoid private or sensitive details."
              >
                <input
                  maxLength={2000}
                  value={interests}
                  disabled={busy}
                  onChange={(event) => setInterests(event.target.value)}
                />
              </Field>
              <Field
                label="Attachment (optional)"
                hint="PDF, PNG, JPEG, or WebP · Up to 10 MB. Uploaded privately and checked before the message is accepted."
              >
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  ref={contactFileInput}
                  disabled={busy}
                  onChange={(event) => {
                    void abandonContactAttachment(attachment.current);
                    attachment.current = undefined;
                    setFile(event.target.files?.[0] || null);
                    setUploadProgress("");
                    setError("");
                  }}
                />
              </Field>
              {file && (
                <small>
                  {file.name} · Selected locally. It stays private after
                  submission.
                </small>
              )}
              {file && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    void abandonContactAttachment(attachment.current);
                    attachment.current = undefined;
                    setFile(null);
                    if (contactFileInput.current)
                      contactFileInput.current.value = "";
                    setUploadProgress("");
                    setError("");
                  }}
                >
                  Remove attachment
                </Button>
              )}
              {uploadProgress && (
                <p role="status" aria-live="polite">
                  {uploadProgress}
                </p>
              )}
              {error && (
                <p className="gt-form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : localPreviewEnabled
                    ? "Save preview message"
                    : "Send message"}
                <ArrowRight size={18} />
              </Button>
              <small>
                We’ll use your information to respond to your inquiry.{" "}
                <Link to="/privacy">Read our privacy notice.</Link>
              </small>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <section className="gt-error-page gt-container">
      <span className="gt-error-number">404</span>
      <h1>A little off the beaten path.</h1>
      <p>We couldn’t find this page. Let’s get you back to the community.</p>
      <div className="gt-inline-actions">
        <ActionLink to="/" arrow>
          Back to home
        </ActionLink>
        <ActionLink to="/events" variant="secondary">
          Explore events
        </ActionLink>
      </div>
    </section>
  );
}
export function InfoPage({
  kind,
}: {
  kind: "privacy" | "accessibility" | "offline" | "maintenance";
}) {
  const copy = {
    privacy: [
      "Your information, handled with care.",
      "Development privacy notice",
      "Submitted test data can be stored in this installation’s database and private file storage, not only in your browser. Please use fictional information during local development.",
      "Registrations, newsletter signups, contact requests, Forms answers and uploads have separate access and retention controls. Forms require name and email; entered details alone are not verified. If you request an email copy, your own questions and answers (including sensitive answers) are sent directly to the address you enter, without separate confirmation. Check that address carefully. File contents and private download links are not emailed; delivered copies cannot be recalled. A final chapter privacy notice and institutional review are still required before collecting real participant data.",
    ],
    accessibility: [
      "A community everyone can take part in.",
      "Accessibility",
      "This experience is designed for keyboard navigation, screen readers, visible focus, readable contrast, and reduced motion. We are working toward WCAG 2.1 AA.",
      "If you encounter a barrier or need an accommodation, please use the accessibility inquiry option on our contact page.",
    ],
    offline: [
      "You’re offline. We’re still here.",
      "Offline",
      "You can explore pages already open in this browser. New data, registrations, and final form submissions need an internet connection.",
      "Event registrations and newsletter signups saved to the device queue remain pending until the server accepts them. Final native Forms responses are never background queued.",
    ],
    maintenance: [
      "A little work behind the scenes.",
      "We’ll be back soon",
      "The chapter website is taking a short break while we make improvements.",
      "Please check back later. Chapter officers can continue through their normal access flow.",
    ],
  }[kind];
  usePageTitle(copy[1]);
  return (
    <>
      <PageHeader title={copy[1]} description={copy[0]} />
      <section className="gt-container gt-section gt-prose gt-info-page">
        <h2>{copy[0]}</h2>
        <p>{copy[2]}</p>
        <p>{copy[3]}</p>
        {kind === "privacy" && <PrivacyNoticeDetails />}
        {kind === "offline" && <SubmissionQueue />}
        <div className="gt-inline-actions">
          <ActionLink to="/" arrow>
            Home
          </ActionLink>
          <ActionLink
            to={
              kind === "accessibility"
                ? "/contact?type=accessibility"
                : "/contact"
            }
            variant="secondary"
          >
            Contact the chapter
          </ActionLink>
        </div>
      </section>
    </>
  );
}
