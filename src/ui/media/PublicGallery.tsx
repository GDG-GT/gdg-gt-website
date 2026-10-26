import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PublicImage from "../PublicImage";
import { PublicCollectionNotice, PublicPagination } from "../PublicCollection";
import {
  publicPageNumber,
  usePublicCollection,
  type PublicListing,
} from "../public-collections";
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
  const [params, setParams] = useSearchParams(),
    event = params.get("event") || "",
    page = publicPageNumber(params.get("page")),
    path = `/gallery?page=${page}${event ? "&event=" + encodeURIComponent(event) : ""}`,
    collection = usePublicCollection<Photo>(path),
    listing = collection.data as
      | (PublicListing<Photo> & { events?: { id: string; title: string }[] })
      | undefined,
    [selected, setSelected] = useState<string | null>(null),
    opener = useRef<HTMLButtonElement | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setSelected(null);
  }, [path]);
  useEffect(() => {
    if (selected) heading.current?.focus();
  }, [selected]);
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
              disabled={collection.loading}
              onChange={(e) => {
                setParams(e.target.value ? { event: e.target.value } : {});
              }}
            >
              <option value="">All chapter moments</option>
              {event && !listing?.events?.some((v) => v.id === event) && (
                <option value={event}>Selected event</option>
              )}
              {listing?.events?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </Field>
          <p className="gt-helper" role="status">
            {illustrative
              ? "Illustrative local preview"
              : collection.loading
                ? "Loading approved photos…"
                : listing
                  ? `${listing.total} approved photo${listing.total === 1 ? "" : "s"}`
                  : "Only approved chapter images appear here."}
          </p>
        </div>
        <PublicCollectionNotice {...collection} />
        {photos.length ? (
          <>
            <div className="gt-gallery">
              {photos.map((p) => (
                <button
                  className="gt-gallery-photo"
                  key={p.id}
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setSelected(p.id);
                  }}
                  aria-label={`View photo: ${p.alt_text}`}
                >
                  <PublicImage
                    src={p.url}
                    srcSet={p.srcSet}
                    sizes="(max-width: 600px) 92vw, (max-width: 1000px) 45vw, 31vw"
                    alt={p.alt_text}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                    fallback="Photo unavailable. Open its caption and event details."
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
        ) : !collection.loading && !collection.error ? (
          <EmptyState title="More moments are on the way">
            {event
              ? "No approved photos are currently available for this event."
              : "Chapter event photography will appear here once it is approved."}
          </EmptyState>
        ) : null}
        {listing && !illustrative && (
          <PublicPagination
            {...listing}
            label="Gallery pages"
            busy={collection.loading}
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
      <Dialog
        open={!!photo}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="gt-lightbox"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            heading.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (opener.current?.isConnected
              ? opener.current
              : document.getElementById("main-content")
            )?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              navigate(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          {photo && (
            <>
              <DialogTitle ref={heading} tabIndex={-1}>
                {photo.description || photo.alt_text}
              </DialogTitle>
              <DialogDescription>
                {illustrative ? "Illustrative local preview · " : ""}
                {photo.event_title || "Chapter community"}. Use Left and Right
                arrow keys to browse this page.
              </DialogDescription>
              <PublicImage
                src={
                  photo.id.startsWith("preview-")
                    ? photo.url
                    : photo.url + "?width=1920"
                }
                alt={photo.alt_text}
                width={photo.width}
                height={photo.height}
                decoding="async"
                fallback="This photo could not load. Its caption and event details are still available."
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
