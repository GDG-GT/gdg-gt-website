// Browser-created CSV/JSON exports stay inside the app's private share directory.
(() => {
  if (window.top !== window || location.origin !== "https://gdggt.dev") return;
  const send = body => GDGNative.postMessage(JSON.stringify({ kind: "export", body }));
  const pending = new Map();
  window.addEventListener("gdg:export-ack", event => {
    const data = event.detail, reply = pending.get(data?.id);
    if (reply) { pending.delete(data.id); reply(data); }
  });
  const request = body => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(body.id); reject(Error("Export timed out")); }, 10000);
    pending.set(body.id, data => { clearTimeout(timer); data.error ? reject(Error(data.error)) : resolve(data); });
    send(body);
  });
  document.addEventListener("click", async event => {
    const anchor = event.target?.closest?.("a[download]");
    if (!anchor || !/^\/admin(?:\/|$)/.test(location.pathname) || !/^blob:https:\/\/gdggt\.dev\/[0-9a-f-]{36}$/i.test(anchor.href)) return;
    event.preventDefault();
    const id = crypto.randomUUID();
    try {
      const response = await fetch(anchor.href), blob = await response.blob();
      if (blob.size > 64 * 1024 * 1024) throw Error("Export exceeds 64 MB");
      await request({ id, action: "begin", size: blob.size, mime: blob.type });
      for (let offset = 0; offset < blob.size; offset += 8192) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + 8192).arrayBuffer());
        await request({ id, action: "chunk", offset, data: btoa(String.fromCharCode(...bytes)) });
      }
      await request({ id, action: "finish" });
    } catch {
      send({ id, action: "cancel" });
      alert("The export could not finish. Try again or open the website to export it.");
    }
  }, true);
})();
