// The server already rendered the complete public reading surface. Give it a
// paint opportunity before downloading the application graph. Forms stay inert
// until React attaches their handlers. Private/client-only documents bypass this.
(() => {
  const entry = document.currentScript?.dataset.entry;
  if (!/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(entry || "") || entry.includes("..")) return;
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    clearTimeout(fallback);
    import(entry).catch(() => {
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "Interactive controls could not load. Refresh this page to try again.";
      document.getElementById("root")?.prepend(message);
    });
  };
  const fallback = setTimeout(begin, 200);
  if (document.hidden) begin();
  else {
    const primary = document.querySelector(".gt-hero-art");
    const imageReady = primary?.decode ? primary.decode().catch(() => {}) : Promise.resolve();
    Promise.all([document.fonts?.ready, imageReady]).then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(begin, 0)));
    }).catch(begin);
  }
})();
