import { describe, expect, it } from "vitest";
import { createDraftRegistry } from "../../src/lib/draft-registry.mjs";
const state = (changes = {}) => ({
  dirty: false,
  busy: false,
  privateDraft: true,
  label: "Fictional editor",
  ...changes,
});
describe("transient navigation draft registry", () => {
  it("reads live state rather than a stale registration snapshot", () => {
    const r = createDraftRegistry();
    let current = state();
    r.register(Symbol(), () => current);
    expect(r.shouldBlock()).toBe(false);
    current = state({ dirty: true });
    expect(r.shouldBlock()).toBe(true);
    current = state();
    expect(r.shouldBlock()).toBe(false);
  });
  it("blocks operations in flight, including when the editor is otherwise clean", () => {
    const r = createDraftRegistry();
    r.register(Symbol(), () => state({ busy: true }));
    expect(r.shouldBlock()).toBe(true);
    expect(r.states()[0].busy).toBe(true);
  });
  it("allows only the explicitly approved synchronous transition and restores protection on failure", () => {
    const r = createDraftRegistry();
    r.register(Symbol(), () => state({ dirty: true }));
    r.allow(() => {
      expect(r.shouldBlock()).toBe(false);
      r.allow(() => expect(r.shouldBlock()).toBe(false));
    });
    expect(r.shouldBlock()).toBe(true);
    expect(() =>
      r.allow(() => {
        throw new Error("fixture");
      }),
    ).toThrow("fixture");
    expect(r.shouldBlock()).toBe(true);
  });
  it("releases private session-bound editors without discarding public form protection", () => {
    const r = createDraftRegistry(),
      publicId = Symbol();
    r.register(Symbol(), () => state({ dirty: true }));
    const removePublic = r.register(publicId, () =>
      state({ dirty: true, privateDraft: false, label: "Public form" }),
    );
    r.clearPrivate();
    expect(r.states().map((s) => s.label)).toEqual(["Public form"]);
    removePublic();
    expect(r.shouldBlock()).toBe(false);
  });
  it("does not let old effect cleanup unregister a newer registration", () => {
    const r = createDraftRegistry(),
      id = Symbol();
    const old = r.register(id, () => state());
    const current = r.register(id, () => state({ dirty: true }));
    old();
    expect(r.shouldBlock()).toBe(true);
    current();
    expect(r.shouldBlock()).toBe(false);
  });
});
