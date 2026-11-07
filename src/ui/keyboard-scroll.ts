import type { KeyboardEvent } from "react";

/** Keep bounded read-only panels usable with a keyboard in touch engines too. */
export function scrollWithKeyboard(
  event: KeyboardEvent<HTMLElement>,
  direction: "horizontal" | "vertical",
) {
  const region = event.currentTarget;
  if (
    event.target !== region ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;
  const vertical = direction === "vertical";
  const viewport = vertical ? region.clientHeight : region.clientWidth;
  const extent = vertical ? region.scrollHeight : region.scrollWidth;
  if (extent <= viewport) return;
  const backward = vertical ? "ArrowUp" : "ArrowLeft";
  const forward = vertical ? "ArrowDown" : "ArrowRight";
  if (
    ![
      backward,
      forward,
      "Home",
      "End",
      ...(vertical ? ["PageUp", "PageDown"] : []),
    ].includes(event.key)
  )
    return;
  event.preventDefault();
  const position = vertical ? region.scrollTop : region.scrollLeft;
  const step = event.key.startsWith("Page")
    ? Math.max(48, viewport * 0.85)
    : 48;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? extent - viewport
        : position +
          (event.key === forward || event.key === "PageDown" ? step : -step);
  const bounded = Math.max(0, Math.min(extent - viewport, next));
  if (vertical) region.scrollTop = bounded;
  else region.scrollLeft = bounded;
}
