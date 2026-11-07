import type { ReactNode } from "react";
import { scrollWithKeyboard } from "./keyboard-scroll";

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
      onKeyDown={(event) => scrollWithKeyboard(event, "horizontal")}
    >
      {children}
    </div>
  );
}
