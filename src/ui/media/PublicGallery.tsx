import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, EmptyState, Field, PageHeader } from "../primitives";
import { localPreviewEnabled } from "../preview-data";
type Photo = {
  id: string;
  url: string;
  srcSet?: string;
  alt_text: string;
  description: string;
  width: number;
  height: number;
  event_id: string | null;
  event_title: string | null;
  downloadUrl: string | null;
};
type Listing = {
  items: Photo[];
  total: number;
  pageSize: number;
  events?: { id: string; title: string }[];
};
const previews: Photo[] = [
  {
    id: "preview-workshop",
    url: "/assets/event-workshop.jpg",
    alt_text: "A speaker shares ideas with students at a workshop",
    description: "Learning starts with a conversation.",
    event_title: "Illustrative workshop",
    width: 1000,
    height: 667,
    event_id: null,
    downloadUrl: null,
  },
  {
    id: "preview-hackathon",
    url: "/assets/event-hackathon.jpg",
    alt_text: "Students work together around laptops",
    description: "Better ideas, built together.",
    event_title: "Illustrative hackathon",
    width: 1000,
    height: 667,
    event_id: null,
    downloadUrl: null,
  },
  {
    id: "preview-community",
    url: "/assets/event-community.jpg",
    alt_text: "A student presents their work to an audience",
    description: "Making room for new perspectives.",
    event_title: "Illustrative community gathering",
    width: 1000,
    height: 667,
    event_id: null,
    downloadUrl: null,
  },
];
export default function PublicGallery() {
  const [event, setEvent] = useState(""),
    [page, setPage] = useState(1),
    [listing, setListing] = useState<Listing>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    api<Listing>(`/gallery?page=${page}${event ? "&event=" + event : ""}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setListing(r);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setListing(undefined);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event, page, tick]);
  const illustrative =
      !!listing && listing.total === 0 && !event && localPreviewEnabled,
    photos = illustrative ? previews : listing?.items || [],
    index = photos.findIndex((p) => p.id === selected),
    photo = photos[index],
    navigate = (delta: number) => {
      if (photos.length)
        setSelected(photos[(index + delta + photos.length) % photos.length].id);
    };
  return (
    <>
      <PageHeader
        title="Community in"
        accent="motion."
        description="Workshops, hackathons, demos, and the people behind them."
      />
      <section className="gt-container gt-section">
        <div className="gt-public-gallery-toolbar">
          <Field label="Filter by event">
            <select
              value={event}
              disabled={loading}
              onChange={(e) => {
                setEvent(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All chapter moments</option>
              {listing?.events?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </Field>
          <p className="gt-helper">
            {illustrative
              ? "Illustrative local preview"
              : listing
                ? `${listing.total} approved photo${listing.total === 1 ? "" : "s"}`
                : "Only approved chapter images appear here."}
          </p>
        </div>
        {error ? (
          <div role="alert" className="gt-inline-error">
            <p>The gallery could not be loaded. {error}</p>
            <Button variant="secondary" onClick={() => setTick((v) => v + 1)}>
              Retry gallery
            </Button>
          </div>
        ) : loading ? (
          <div
            className="gt-skeleton gt-detail-skeleton"
            role="status"
            aria-label="Loading approved gallery"
          />
        ) : photos.length ? (
          <>
            <div className="gt-gallery">
              {photos.map((p) => (
                <button
                  className="gt-gallery-photo"
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  aria-label={`View photo: ${p.alt_text}`}
                >
                  <img
                    src={p.url}
                    srcSet={p.srcSet}
                    sizes="(max-width: 600px) 92vw, (max-width: 1000px) 45vw, 31vw"
                    alt={p.alt_text}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                  />
                  <span>
                    <span>{p.event_title || "Chapter community"}</span>
                    <strong>{p.description || p.alt_text}</strong>
                    <span>View photo ↗</span>
                  </span>
                </button>
              ))}
            </div>
            {illustrative && (
              <p className="gt-data-note">
                Illustrative development photos, not official chapter
                photography. Approved chapter photos replace this local preview.
              </p>
            )}
          </>
        ) : (
          <EmptyState title="More moments are on the way">
            {event
              ? "No approved photos are currently available for this event."
              : "Chapter event photography will appear here once it is approved."}
          </EmptyState>
        )}
        {listing && !illustrative && listing.total > listing.pageSize && (
          <nav
            className="gt-inline-actions gt-media-pagination"
            aria-label="Gallery pages"
          >
            <Button
              variant="secondary"
              disabled={loading || page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous page
            </Button>
            <span>
              Page {page} of {Math.ceil(listing.total / listing.pageSize)}
            </span>
            <Button
              variant="secondary"
              disabled={loading || page * listing.pageSize >= listing.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next page
            </Button>
          </nav>
        )}
      </section>
      <Dialog
        open={!!photo}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="gt-lightbox"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              navigate(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          {photo && (
            <>
              <DialogTitle>{photo.description || photo.alt_text}</DialogTitle>
              <DialogDescription>
                {illustrative ? "Illustrative local preview · " : ""}
                {photo.event_title || "Chapter community"}. Use Left and Right
                arrow keys to browse this page.
              </DialogDescription>
              <img
                src={
                  photo.id.startsWith("preview-")
                    ? photo.url
                    : photo.url + "?width=1920"
                }
                alt={photo.alt_text}
                width={photo.width}
                height={photo.height}
                decoding="async"
              />
              <div className="gt-lightbox-actions">
                <Button
                  variant="secondary"
                  onClick={() => navigate(-1)}
                  disabled={photos.length < 2}
                >
                  ← Previous photo
                </Button>
                <span aria-live="polite">
                  {index + 1} / {photos.length}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => navigate(1)}
                  disabled={photos.length < 2}
                >
                  Next photo →
                </Button>
              </div>
              {photo.downloadUrl && (
                <a
                  className="gt-button gt-button-secondary"
                  href={photo.downloadUrl}
                  download
                >
                  Download approved WebP image
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
