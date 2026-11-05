import type { ReactNode } from "react";

// Explicit horizontal keyboard scrolling also works in touch-oriented engines
// that can focus an overflow region but do not scroll it for arrow keys.
export default function ScrollableTable({
  label,
  className = "gt-table-wrap",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={className}
      onKeyDown={(event) => {
        const region = event.currentTarget;
        if (
          event.target !== region ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          region.scrollWidth <= region.clientWidth
        )
          return;
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        region.scrollLeft =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? region.scrollWidth - region.clientWidth
              : region.scrollLeft + (event.key === "ArrowRight" ? 48 : -48);
      }}
    >
      {children}
    </div>
  );
}
