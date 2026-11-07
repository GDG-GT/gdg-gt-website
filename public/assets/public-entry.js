// Run independently of the React graph so the home image can arrive before
// client rendering. Other routes must not spend bandwidth on home-only artwork.
(() => {
  if (/^\/(?:events(?:\/|$)|team$|resources$|sponsors$|gallery$|contact$|privacy$|accessibility$|offline$)/.test(location.pathname)) {
    for (const href of (document.currentScript?.dataset.publicModules || "").split(" ")) {
      if (!/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(href) || href.includes("..")) continue;
      const hint = document.createElement("link");
      hint.rel = "modulepreload";
      hint.href = href;
      hint.crossOrigin = "anonymous";
      document.head.append(hint);
    }
  }
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
