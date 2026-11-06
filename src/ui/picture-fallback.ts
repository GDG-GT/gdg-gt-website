// WebKit can fetch an img's fallback while React is still constructing its
// picture parent. Assign it at commit, when media sources are already present.
export function pictureFallback(image: HTMLImageElement | null) {
  const source = image?.dataset.fallbackSrc;
  if (image && source && !image.hasAttribute("src")) image.src = source;
}
