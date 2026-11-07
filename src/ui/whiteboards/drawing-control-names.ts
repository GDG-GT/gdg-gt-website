/** The editor does not expose props for its menu/zoom button names. Keep this
 * adapter confined to those two native controls; never change drawing state. */
export function observeDrawingControlNames(drawingRoot: HTMLElement) {
  const sync = () => {
    const menu =
      drawingRoot.querySelector<HTMLButtonElement>(".main-menu-trigger");
    if (menu && !menu.getAttribute("aria-label")?.trim())
      menu.setAttribute("aria-label", "Drawing menu");
    const zoom =
      drawingRoot.querySelector<HTMLButtonElement>(".reset-zoom-button");
    const percentage = zoom?.textContent?.trim();
    if (zoom && percentage && /^\d{1,4}%$/.test(percentage)) {
      const name = `${percentage} · ${zoom.title || "Reset zoom"}`;
      if (zoom.getAttribute("aria-label") !== name)
        zoom.setAttribute("aria-label", name);
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(drawingRoot, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "title"],
  });
  sync();
  return () => observer.disconnect();
}
