export type BoardDocument = {
  elements: Record<string, unknown>[];
  appState: { viewBackgroundColor: string };
};
export type Board = {
  id: string;
  name: string;
  team_id: string | null;
  version: number;
  created_by: string;
  updated_at: string;
  deleted_at: string | null;
  actions?: string[];
  document?: BoardDocument;
};
export type OpenBoard = {
  record: Board & { document: BoardDocument };
  actions: string[];
};
export function downloadBoard(name: string, document: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }),
  );
  const anchor = documentLink(url, name);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function documentLink(url: string, name: string) {
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download =
    (name
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 80) || "Whiteboard") + ".excalidraw";
  window.document.body.append(anchor);
  return anchor;
}
export const exportDocument = (scene: BoardDocument) => ({
  type: "excalidraw",
  version: 2,
  source: window.location.origin,
  elements: scene.elements,
  appState: scene.appState,
  files: {},
});
