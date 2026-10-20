import { describe, expect, it } from "vitest";
import {
  boardCreate,
  boardDocument,
  boardMutation,
} from "../../server/whiteboards.mjs";
const rectangle = {
  id: "fixture-rectangle",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 140,
  height: 80,
  angle: 0,
  strokeColor: "#2d2d2d",
  backgroundColor: "transparent",
};
const doc = (change = {}) => ({
  elements: [{ ...rectangle, ...change }],
  appState: { viewBackgroundColor: "#f2f3f5" },
});
describe("private whiteboard input boundaries", () => {
  it("accepts bounded supported shapes and safe text while keeping embeds out", () => {
    expect(boardDocument.safeParse(doc()).success).toBe(true);
    expect(
      boardDocument.safeParse(
        doc({
          type: "text",
          text: "<script>canvas text is not HTML</script>",
          fontSize: 20,
        }),
      ).success,
    ).toBe(true);
    for (const type of ["image", "iframe", "embeddable", "magicframe"])
      expect(boardDocument.safeParse(doc({ type })).success).toBe(false);
  });
  it("rejects executable links, remote images, embedded data and prototype keys", () => {
    for (const change of [
      { link: "javascript:alert(1)" },
      { fileId: "private-file" },
      { customData: { src: "https://other.test/image" } },
      { constructor: { prototype: { evil: true } } },
    ])
      expect(boardDocument.safeParse(doc(change)).success).toBe(false);
    expect(
      boardDocument.safeParse(doc({ link: "https://developers.google.com/" }))
        .success,
    ).toBe(true);
  });
  it("bounds coordinates, styles, text and shape counts", () => {
    for (const change of [
      { x: Infinity },
      { y: 1e8 },
      { fontSize: 1e8 },
      { opacity: 101 },
      { strokeWidth: 10000 },
      { backgroundColor: "url(https://other.test)" },
      { type: "text", text: 7 },
    ])
      expect(boardDocument.safeParse(doc(change)).success).toBe(false);
    expect(
      boardDocument.safeParse({ ...doc(), elements: [rectangle, rectangle] })
        .success,
    ).toBe(false);
    expect(
      boardDocument.safeParse({
        ...doc(),
        elements: Array.from({ length: 2001 }, (_, i) => ({
          ...rectangle,
          id: String(i),
        })),
      }).success,
    ).toBe(false);
  });
  it("rejects arbitrary root/app state fields and unsafe create fields", () => {
    expect(boardDocument.safeParse({ ...doc(), files: {} }).success).toBe(
      false,
    );
    expect(
      boardDocument.safeParse({
        ...doc(),
        appState: { viewBackgroundColor: "#f2f3f5", collaborators: [] },
      }).success,
    ).toBe(false);
    expect(boardCreate.parse({ name: "Fictional private board" }).teamId).toBe(
      null,
    );
    expect(
      boardCreate.safeParse({ name: "Board", created_by: "forged" }).success,
    ).toBe(false);
  });
  it("requires both optimistic version and saved timestamp on every update", () => {
    const body = {
      action: "save",
      version: 1,
      updatedAt: "2026-10-20T12:00:00.000Z",
      document: doc(),
    };
    expect(boardMutation.safeParse(body).success).toBe(true);
    for (const change of [
      { version: 0 },
      { updatedAt: "yesterday" },
      { updatedAt: undefined },
      { version: undefined },
    ])
      expect(boardMutation.safeParse({ ...body, ...change }).success).toBe(
        false,
      );
  });
  it("requires password confirmation for explicit sharing and never accepts chapter roles", () => {
    const body = {
      action: "share",
      version: 1,
      updatedAt: "2026-10-20T12:00:00Z",
      email: "fictional@example.test",
      role: "viewer",
      currentPassword: "fixture",
    };
    expect(boardMutation.safeParse(body).success).toBe(true);
    expect(boardMutation.safeParse({ ...body, role: "admin" }).success).toBe(
      false,
    );
    expect(
      boardMutation.safeParse({ ...body, currentPassword: undefined }).success,
    ).toBe(false);
  });
});
