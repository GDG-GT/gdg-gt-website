import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Field } from '../primitives';
type Photo = { id: string; alt_text: string; description: string; width: number; height: number };
export default function FormImagePicker({ label, selected, onChange }: {
  label: string; selected?: string; onChange: (photo: Photo | null) => void;
}) {
  const [page, setPage] = useState(1), [tick, setTick] = useState(0);
  const [listing, setListing] = useState<{ items: Photo[]; total: number; pageSize: number }>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setListing(undefined); setError('');
    api<{ items: Photo[]; total: number; pageSize: number }>(`/gallery?page=${page}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setListing(value); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Images could not be loaded.'); });
    return () => controller.abort();
  }, [page, tick]);
  return <div className="gt-form-image-picker">
    <Field label={label} hint="Only already-public, approved chapter images are listed. Form access does not make these images private.">
      <select value={selected || ''} disabled={!listing} onChange={event => {
        const photo = listing?.items.find(photo => photo.id === event.target.value);
        if (photo) onChange(photo); else if (!event.target.value) onChange(null);
      }}>
        <option value="">No image selected</option>
        {selected && !listing?.items.some(photo => photo.id === selected) && <option value={selected}>Current image (another page or no longer public)</option>}
        {listing?.items.map(photo => <option key={photo.id} value={photo.id}>{photo.alt_text || photo.description || `Chapter image ${photo.id.slice(0, 8)}`}</option>)}
      </select>
    </Field>
    {!listing && !error && <p role="status" className="gt-helper">Loading published images…</p>}
    {error && <p role="alert" className="gt-form-error">{error} <Button type="button" variant="ghost" onClick={() => setTick(value => value + 1)}>Retry</Button></p>}
    {listing?.total === 0 && <p className="gt-helper">No images are published. Upload, scan and explicitly publish an image in the media library first.</p>}
    {listing && listing.total > listing.pageSize && <div className="gt-inline-actions" aria-label="Published image pages">
      <Button type="button" variant="ghost" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous images</Button>
      <span>Page {page}</span>
      <Button type="button" variant="ghost" disabled={page * listing.pageSize >= listing.total} onClick={() => setPage(value => value + 1)}>Next images</Button>
    </div>}
    {selected && <Button type="button" variant="ghost" onClick={() => onChange(null)}>Remove selected image</Button>}
  </div>;
}
