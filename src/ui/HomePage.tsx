import { useInitialPictureSource } from "./public-hydration";
import { EventTile } from "./EventTile";
import { pictureFallback } from "./picture-fallback";
import {
  ArrowDown,
  MapPin,
  Users,
  CalendarDays,
  Code2,
  Heart,
} from "lucide-react";
import HeroScene from "./HeroScene";
import PublicImage from "./PublicImage";
import { useContent } from "@/contexts/ContentContext";
import type { PageCopy } from "../../shared/site-content";
import { chapterName, localPreviewEnabled } from "./preview-data";
import { ActionLink, EmptyState } from "./primitives";
import { PublicCollectionNotice } from "./PublicCollection";
import { isPast, useEvents, usePageTitle } from "./public-events";

export function HomePage() {
  const initialPicture = useInitialPictureSource("/assets/hero-atmosphere.webp");
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
        <picture className="gt-hero-picture">
          <source
            media="(max-width: 480px)"
            srcSet="/assets/hero-atmosphere-mobile.webp"
          />
          <img
            className="gt-hero-art"
            data-fallback-src="/assets/hero-atmosphere.webp"
            src={initialPicture}
            ref={pictureFallback}
            width="1920"
            height="800"
            alt=""
            fetchPriority="high"
          />
        </picture>
        <HeroScene />
        <div className="gt-container gt-hero-layout">
          <div className="gt-hero-card">
            <span className="gt-hero-intro">{chapterName}</span>
            <h1>
              <span className="gt-google-name">
                <img
                  src="/assets/google-wordmark.webp"
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
          aria-label="Chapter impact"
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
              decoding="async"
              fetchPriority="low"
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
