/** QR coordinates are in source-video pixels; the preview uses object-fit: cover. */
export function qrFocus(
  points: { x: number; y: number }[],
  width: number,
  height: number,
) {
  if (
    points.length !== 4 ||
    width <= 0 ||
    height <= 0 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return { left: 30, top: 25, width: 40, height: 50 };
  const ratio = width / height,
    preview = 4 / 3;
  const xs = points.map(
    (p) => ((p.x / width - 0.5) * Math.max(1, ratio / preview) + 0.5) * 100,
  );
  const ys = points.map(
    (p) => ((p.y / height - 0.5) * Math.max(1, preview / ratio) + 0.5) * 100,
  );
  const left = Math.max(2, Math.min(94, Math.min(...xs) - 3));
  const top = Math.max(2, Math.min(94, Math.min(...ys) - 3));
  return {
    left,
    top,
    width: Math.max(4, Math.min(98 - left, Math.max(...xs) + 3 - left)),
    height: Math.max(4, Math.min(98 - top, Math.max(...ys) + 3 - top)),
  };
}
