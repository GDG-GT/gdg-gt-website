import { useEffect, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field } from "../primitives";
type Photo = {
  id: string;
  alt_text: string | null;
  description: string | null;
  width: number;
  height: number;
};
type Listing = {
  items: Photo[];
  total: number;
  pageSize: number;
  page: number;
};
type Props = {
  label: string;
  scope: string;
  selected?: string;
  onChange: (photo: Photo | null) => void;
};
const valid = (value: Listing | undefined): value is Listing =>
  !!value &&
  Array.isArray(value.items) &&
  Number.isInteger(value.page) &&
  value.page >= 1 &&
  Number.isInteger(value.pageSize) &&
  value.pageSize >= 1 &&
  value.pageSize <= 100 &&
  Number.isInteger(value.total) &&
  value.total >= value.items.length &&
  value.items.length <= value.pageSize &&
  new Set(value.items.map((row) => row?.id)).size === value.items.length &&
  value.items.every(
    (row) =>
      !!row &&
      typeof row.id === "string" &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(row.id) &&
      (row.alt_text === null || typeof row.alt_text === "string") &&
      (row.description === null || typeof row.description === "string") &&
      Number.isInteger(row.width) &&
      row.width > 0 &&
      Number.isInteger(row.height) &&
      row.height > 0,
  );
export default function FormImagePicker(props: Props) {
  const { currentAdmin } = useAdmin(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <PublishedImagePicker
      key={JSON.stringify([
        props.scope,
        currentAdmin?.id,
        currentAdmin?.role,
        epoch,
      ])}
      {...props}
    />
  );
}
function PublishedImagePicker({ label, selected, onChange }: Props) {
  const [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [needsRecheck, setNeedsRecheck] = useState(false),
    { isOnline } = useOnlineStatus(),
    read = usePrivateRead<Listing>(`/gallery?page=${page}`, tick),
    listing =
      valid(read.data) && read.data.page === page ? read.data : undefined,
    error =
      read.error ||
      (!read.loading && read.data && !listing
        ? "The published image list could not be verified. Retry before choosing an image."
        : ""),
    ready =
      !!listing &&
      !read.loading &&
      !error &&
      !read.denied &&
      isOnline &&
      !needsRecheck;
  useEffect(() => {
    if (!isOnline) setNeedsRecheck(true);
  }, [isOnline]);
  return (
    <div className="gt-form-image-picker">
      <Field
        label={label}
        hint="Only already-public, approved chapter images are listed. Form access does not make these images private."
      >
        <select
          value={selected || ""}
          disabled={!ready}
          onChange={(event) => {
            if (!ready) return;
            const photo = listing.items.find(
              (item) => item.id === event.target.value,
            );
            if (photo) onChange(photo);
            else if (!event.target.value) onChange(null);
          }}
        >
          <option value="">No image selected</option>
          {selected &&
            !listing?.items.some((photo) => photo.id === selected) && (
              <option value={selected}>
                Current image (another page or no longer public)
              </option>
            )}
          {listing?.items.map((photo) => (
            <option key={photo.id} value={photo.id}>
              {photo.alt_text ||
                photo.description ||
                `Chapter image ${photo.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </Field>
      {read.loading && (
        <p
          role="status"
          aria-label="Loading published images"
          className="gt-helper"
        >
          Loading published images…
        </p>
      )}
      {(!isOnline || needsRecheck) && (
        <p role="status">
          Reconnect, then recheck published images before choosing one. Your
          current selection is preserved.
        </p>
      )}
      {error && (
        <div role="alert" className="gt-form-error">
          <p>{error}</p>
          {listing && read.at && (
            <p>
              Showing the last successful published image list, checked{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              . Selection is paused.
            </p>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={read.loading || !isOnline}
        onClick={() => {
          setNeedsRecheck(false);
          setTick((value) => value + 1);
        }}
      >
        {error ? "Retry published images" : "Recheck published images"}
      </Button>
      {ready && listing.total === 0 && (
        <p className="gt-helper">
          No images are published. Upload, scan and explicitly publish an image
          in the media library first.
        </p>
      )}
      {listing && (listing.total > listing.pageSize || page > 1) && (
        <div className="gt-inline-actions" aria-label="Published image pages">
          <Button
            type="button"
            variant="ghost"
            disabled={page === 1 || read.loading || !isOnline}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous images
          </Button>
          <span>
            Page {page} · {listing.total} matching
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={!ready || page * listing.pageSize >= listing.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Next images
          </Button>
        </div>
      )}
      {!listing && page > 1 && (
        <Button
          type="button"
          variant="ghost"
          disabled={read.loading || !isOnline}
          onClick={() => setPage(1)}
        >
          Return to first image page
        </Button>
      )}
      {selected && (
        <Button type="button" variant="ghost" onClick={() => onChange(null)}>
          Remove selected image
        </Button>
      )}
    </div>
  );
}
