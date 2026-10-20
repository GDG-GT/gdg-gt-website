import { describe, expect, it } from "vitest";
import { mergeMessageChanges, mergeMessageHistory } from "./message-sync";
import type { SequencedMessage } from "./message-sync";
const msg = (id: number, change = id, extras = {}): SequencedMessage => ({
  id: String(id),
  created_at: String(id).padStart(5, "0"),
  creation_sequence: id,
  change_sequence: change,
  is_pinned: false,
  is_deleted: false,
  ...extras,
});
describe("durable channel reconnect merge", () => {
  it("recovers more than a latest-50 window across bounded batches", () => {
    let loaded = [msg(1)];
    loaded = mergeMessageChanges(
      loaded,
      Array.from({ length: 100 }, (_, i) => msg(i + 2)),
      1,
      false,
    );
    loaded = mergeMessageChanges(
      loaded,
      Array.from({ length: 25 }, (_, i) => msg(i + 102)),
      101,
      false,
    );
    expect(loaded).toHaveLength(126);
    expect(loaded.map((m) => m.id)).toEqual(
      Array.from({ length: 126 }, (_, i) => String(i + 1)),
    );
  });
  it("applies known edits and tombstones without injecting old unloaded edits", () => {
    const r = mergeMessageChanges(
      [msg(20)],
      [msg(1, 31), msg(20, 32, { is_deleted: true }), msg(33)],
      30,
      false,
    );
    expect(r.map((m) => m.id)).toEqual(["20", "33"]);
    expect(r[0].is_deleted).toBe(true);
  });
  it("does not let an older history request resurrect a changed message", () => {
    const current = msg(1, 20, { is_deleted: true });
    expect(mergeMessageHistory([current], [msg(1)], false)).toEqual([current]);
  });
  it("admits newly pinned old messages and removes unpinned/deleted ones", () => {
    const r = mergeMessageChanges(
      [msg(10, 12, { is_pinned: true })],
      [msg(1, 30, { is_pinned: true }), msg(10, 31)],
      20,
      true,
    );
    expect(r.map((m) => m.id)).toEqual(["1"]);
  });
  it("recovers a new message whose later edit moved it to a later page", () => {
    const first = mergeMessageChanges([msg(1)], [msg(3)], 1, false);
    expect(
      mergeMessageChanges(first, [msg(2, 150)], 1, false).map((m) => m.id),
    ).toEqual(["1", "2", "3"]);
  });
  it("refreshes a loaded quote when its unloaded original is removed", () => {
    const child = msg(20, 20, {
      reply: { id: "1", message: "Old quote", is_deleted: false },
    });
    const removed = msg(1, 31, { message: "", is_deleted: true, reply: null });
    const r = mergeMessageChanges([child], [removed], 30, false);
    expect(r).toHaveLength(1);
    expect(r[0].reply).toEqual({ id: "1", message: "", is_deleted: true });
  });
});
