/** Follow only static imports. Route-lazy editors and 3D never belong to the
 * offline install merely because they were emitted in the same build. */
export function entryAssets(manifest, entry) {
  const assets = new Set(),
    visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== "string")
      throw Error("Missing build entry dependency: " + key);
    for (const file of [
      chunk.file,
      ...(chunk.css || []),
      ...(chunk.assets || []),
    ]) {
      if (
        !/^[A-Za-z0-9_./-]+$/.test(file) ||
        file.startsWith("/") ||
        file.split("/").includes("..")
      )
        throw Error("Unsafe build asset path.");
      assets.add(file);
    }
    for (const dependency of chunk.imports || []) visit(dependency);
  }
  visit(entry);
  return assets;
}
export function offlinePrecacheAssets(manifest) {
  return new Set([
    ...entryAssets(manifest, "offline.html"),
    "offline.html",
    "manifest.json",
    "favicon.png",
    "logo.png",
    "icons/pwa-192.png",
    "icons/pwa-512.png",
    "icons/pwa-maskable-512.png",
    "icons/pwa-apple-180.png",
  ]);
}
