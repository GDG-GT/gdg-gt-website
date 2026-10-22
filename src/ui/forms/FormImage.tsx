import { useEffect, useState } from 'react';
export default function FormImage({ id, alt, header = false, width = 1600, height = 900 }: {
  id?: string; alt: string; header?: boolean; width?: number; height?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id) || failed) return <p className="gt-helper" role="status">{id ? 'This image is currently unavailable.' : 'Choose a published chapter image to complete this block.'}</p>;
  const url = `/api/v1/media/public/${id}`;
  return <figure className={`gt-form-image-block${header ? ' gt-form-header-image' : ''}`}>
    <img src={url + '?width=960'} srcSet={`${url}?width=360 360w, ${url}?width=960 960w, ${url}?width=1920 1920w`}
      sizes="(max-width: 700px) calc(100vw - 48px), 760px" alt={alt} width={width} height={height}
      loading={header ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  </figure>;
}
