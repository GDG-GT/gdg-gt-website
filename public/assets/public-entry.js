// Run independently of the React graph so the home image can arrive before
// client rendering. Other routes must not spend bandwidth on home-only artwork.
(() => {
  if (location.pathname !== "/") return;
  for (const [media, href] of [
    ["(min-width: 481px)", "/assets/hero-atmosphere.webp"],
    ["(max-width: 480px)", "/assets/hero-atmosphere-mobile.webp"],
  ]) {
    const hint = document.createElement("link");
    hint.rel = "preload";
    hint.as = "image";
    hint.fetchPriority = "high";
    hint.media = media;
    hint.href = href;
    document.head.append(hint);
  }
})();
