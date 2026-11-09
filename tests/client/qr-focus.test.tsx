// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NfcControls from "../../src/ui/rewards/NfcControls";
import { qrFocus } from "../../src/ui/rewards/qrFocus";
const qr = vi.hoisted(() => ({
  receive: undefined as
    | undefined
    | ((value: {
        data: string;
        cornerPoints: { x: number; y: number }[];
      }) => void),
  stop: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("qr-scanner", () => ({
  default: class {
    constructor(_video: unknown, receive: typeof qr.receive) {
      qr.receive = receive;
    }
    start = async () => {};
    stop = qr.stop;
    destroy = qr.destroy;
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  qr.receive = undefined;
  qr.stop.mockClear();
  qr.destroy.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function start(onRead: (value: string) => void) {
  render(<NfcControls onRead={onRead} />);
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Use QR instead" })),
  );
}
const code = { data: "A".repeat(43), cornerPoints: [] };
it("focuses a valid QR before one member lookup and ignores duplicate decodes", async () => {
  const onRead = vi.fn();
  await start(onRead);
  act(() => {
    qr.receive!(code);
    qr.receive!(code);
  });
  expect(screen.getByRole("status").textContent).toContain(
    "QR detected. Finding member",
  );
  expect(qr.stop).toHaveBeenCalledTimes(1);
  expect(onRead).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(519));
  expect(onRead).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(onRead).toHaveBeenCalledExactlyOnceWith(code.data);
});
it("cancels the pending lookup when scanning stops", async () => {
  const onRead = vi.fn();
  await start(onRead);
  act(() => qr.receive!(code));
  fireEvent.click(screen.getByRole("button", { name: "Stop scanning" }));
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onRead).not.toHaveBeenCalled();
});
it("keeps scanning an unrelated QR without showing a detected state", async () => {
  const onRead = vi.fn();
  await start(onRead);
  act(() =>
    qr.receive!({ ...code, data: "https://evil.test/tap#card=" + code.data }),
  );
  expect(screen.getByRole("status").textContent).toContain(
    "not a GDG member credential",
  );
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onRead).not.toHaveBeenCalled();
  expect(qr.stop).not.toHaveBeenCalled();
});
it("uses a short static confirmation for reduced motion and cancels on unmount", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const onRead = vi.fn();
  await start(onRead);
  act(() => qr.receive!(code));
  await act(async () => vi.advanceTimersByTime(100));
  expect(onRead).toHaveBeenCalledTimes(1);
  cleanup();
  onRead.mockClear();
  await start(onRead);
  act(() => qr.receive!(code));
  cleanup();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(onRead).not.toHaveBeenCalled();
});
it("maps QR bounds into a cropped video preview and clamps hostile coordinates", () => {
  expect(qrFocus([], 0, 0)).toEqual({
    left: 30,
    top: 25,
    width: 40,
    height: 50,
  });
  const box = qrFocus(
    [
      { x: 720, y: 405 },
      { x: 1200, y: 405 },
      { x: 1200, y: 675 },
      { x: 720, y: 675 },
    ],
    1920,
    1080,
  );
  expect(box.left).toBeCloseTo(30.333, 2);
  expect(box.width).toBeCloseTo(39.333, 2);
  const extreme = qrFocus(Array(4).fill({ x: -1000, y: 10000 }), 100, 100);
  expect(extreme.left).toBeGreaterThanOrEqual(2);
  expect(extreme.top + extreme.height).toBeLessThanOrEqual(98);
});
