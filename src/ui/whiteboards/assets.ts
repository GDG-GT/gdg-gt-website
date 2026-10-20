// Evaluate before the editor package so its font registry never selects a CDN.
(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH =
  "/assets/excalidraw/";
