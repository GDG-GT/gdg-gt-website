// Public reading does not require an officer session. Keep the restoration
// probe off initial rendering, but start immediately on user/workspace intent.
export function schedulePublicSessionCheck(begin: () => void) {
  let cancelled = false, started = false, timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener("load", loaded);
    window.removeEventListener("pointerdown", run);
    window.removeEventListener("keydown", run);
    window.removeEventListener("gdg:auth-needed", run);
  };
  const run = () => {
    if (cancelled || started) return;
    started = true; cleanup(); begin();
  };
  const loaded = () => { timer = setTimeout(run, 300); };
  window.addEventListener("pointerdown", run, { once: true, passive: true });
  window.addEventListener("keydown", run, { once: true });
  window.addEventListener("gdg:auth-needed", run, { once: true });
  if (document.readyState === "complete") loaded();
  else window.addEventListener("load", loaded, { once: true });
  return () => { cancelled = true; cleanup(); };
}
