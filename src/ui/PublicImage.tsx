import { useState, type ImgHTMLAttributes, type ReactNode } from "react";

// Failed managed images keep a useful, bounded fallback rather than a broken
// browser icon. A changed source gets its own fresh attempt.
export default function PublicImage({
  src,
  srcSet,
  alt,
  fallbackSrc,
  fallback,
  onError,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
  fallbackSrc?: string;
  fallback?: ReactNode;
}) {
  const [failure, setFailure] = useState<{
    source: string;
    primary: boolean;
    fallback: boolean;
  }>();
  const source = `${src || ""}\n${srcSet || ""}`,
    primaryFailed = failure?.source === source && failure.primary,
    fallbackFailed = failure?.source === source && failure.fallback,
    current = !src
      ? undefined
      : primaryFailed
        ? !fallbackFailed && fallbackSrc !== src
          ? fallbackSrc
          : undefined
        : src;
  if (!current)
    return (
      <span
        className={`gt-image-fallback ${props.className || ""}`}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        style={props.style}
      >
        {fallback || alt}
      </span>
    );
  return (
    <img
      {...props}
      src={current}
      srcSet={primaryFailed ? undefined : srcSet}
      alt={alt}
      onError={(event) => {
        setFailure({ source, primary: true, fallback: !!primaryFailed });
        onError?.(event);
      }}
    />
  );
}
