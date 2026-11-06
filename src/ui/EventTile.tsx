import { Link } from "react-router-dom";
import { Clock3, MapPin, ArrowRight } from "lucide-react";
import PublicImage from "./PublicImage";
import { Badge } from "./primitives";
import { eventDateLabel as dateLabel, eventTimeLabel } from "./events";
import { isPast, slugFor, levelLabel, type SiteEvent } from "./public-events";

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
