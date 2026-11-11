// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeScanner, scanNative } from "../../src/ui/rewards/nativeScanner";
import NfcControls from "../../src/ui/rewards/NfcControls";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async original => ({...(await original<typeof import("../../src/lib/api")>()),api:apiMock}));
const post = vi.fn();
const result = (id: string, value?: string, error?: string) =>
  window.dispatchEvent(
    new CustomEvent("gdg:scanner-result", { detail: { id, value, error } }),
  );
beforeEach(() => {
  vi.stubGlobal("webkit", {
    messageHandlers: { gdgScanner: { postMessage: post } },
  });
  vi.stubGlobal("gdgScanner", { version: 1, wallet: false, cardBinding:true });
  post.mockReset();
  apiMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Owned iPhone scanner bridge", () => {
  it("requires both a supported native marker and a message handler", async () => {
    expect(nativeScanner()).toEqual({ version: 1, wallet: false, cardBinding:true });
    vi.stubGlobal("gdgScanner", { version: 2, wallet: false });
    expect(nativeScanner()).toBeNull();
    await expect(scanNative("readCard")).rejects.toThrow(/GDG Scanner/);
  });
  it("matches replies to a request and discards late results", async () => {
    const promise = scanNative("readCard");
    const [{ id }] = post.mock.calls[0];
    result("other", "unrelated");
    result(id, "credential");
    result(id, "late");
    await expect(promise).resolves.toBe("credential");
    expect(post).toHaveBeenCalledTimes(1);
  });
  it("cancels aborted work and never resolves it later", async () => {
    const controller = new AbortController(),
      promise = scanNative("writeCard", { url: "example" }, controller.signal);
    const [{ id }] = post.mock.calls[0];
    controller.abort();
    result(id, "late");
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(post).toHaveBeenLastCalledWith({ id, action: "cancel" });
    await expect(
      scanNative("readCard", {}, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("cancels on sign-out and on timeout", async () => {
    const promise = scanNative("readCard");
    window.dispatchEvent(new Event("gdg:session-cleared"));
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    vi.useFakeTimers();
    const timed = scanNative("readCard");
    const expectation = expect(timed).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(70001);
    await expectation;
  });
  it("rejects malformed and error replies", async () => {
    let pending = scanNative("readCard");
    let [{ id }] = post.mock.calls.at(-1)!;
    result(id, undefined, "Not blank");
    await expect(pending).rejects.toThrow("Not blank");
    pending = scanNative("readCard");
    [{ id }] = post.mock.calls.at(-1)!;
    result(id, "A".repeat(1025));
    await expect(pending).rejects.toThrow(/invalid response/);
  });
  it("uses native NFC and validates the returned credential before resolution", async () => {
    const onRead = vi.fn();
    render(<NfcControls onRead={onRead} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Start NFC scanning" }),
    );
    let [{ id }] = post.mock.calls.find(([v]) => v.action === "readCard")!;
    result(id, "https://evil.test/tap#card=" + "A".repeat(43));
    await screen.findByText("This is not a GDG member credential with a physical chip ID.");
    expect(onRead).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start NFC scanning" }));
    [{ id }] = post.mock.calls.at(-1)!;
    const proof=JSON.stringify({v:2,credential:"A".repeat(43),uid:"04aabbccddeeff"});
    result(id,proof);
    await waitFor(() => expect(onRead).toHaveBeenCalledWith(proof));
  });
  it("writes through the native confirmation and reports read-back success", async () => {
    const url = "https://gdggt.dev/tap#card=" + "B".repeat(43);
    apiMock.mockResolvedValue({uidHash:"a".repeat(64)});
    render(<NfcControls writeUrl={url} writeId="b2100000-0000-4000-8000-000000000001" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Write and register NFC card" }),
    );
    const [{ id, action, url: sent }] = post.mock.calls.at(-1)!;
    expect(action).toBe("writeCard");
    expect(sent).toBe(url);
    const uid="04aabbccddeeff";
    result(id,JSON.stringify({v:2,credential:"B".repeat(43),uid}));
    await screen.findByText("Card written, verified and registered. The member email is queued.");
    expect(apiMock).toHaveBeenCalledWith("/admin/rewards/card-bind",expect.objectContaining({body:{id:"b2100000-0000-4000-8000-000000000001",uid}}));
    fireEvent.click(screen.getByRole("button",{name:"Write and register NFC card"}));
    expect(post.mock.calls.at(-1)![0]).toMatchObject({uidHash:"a".repeat(64)});
  });
  it("requires native and server approval for Wallet NFC, then verifies through the session API", async () => {
    vi.stubGlobal("gdgScanner", { version: 1, wallet: true });
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("wallet-reader")
          ? { available: true }
          : path.endsWith("wallet-challenge")
            ? {
                challenge: "challenge",
                passTypeIdentifier: "pass.dev.gdggt.membership",
              }
            : { credential: "C".repeat(43) },
      ),
    );
    const onRead = vi.fn();
    render(<NfcControls onRead={onRead} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Scan Apple Wallet NFC" }),
    );
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [{ id, action, passTypeIdentifier }] = post.mock.calls.at(-1)!;
    expect(action).toBe("readWallet");
    expect(passTypeIdentifier).toBe("pass.dev.gdggt.membership");
    result(id, "encrypted-data");
    await waitFor(() => expect(onRead).toHaveBeenCalledWith("C".repeat(43)));
    expect(apiMock).toHaveBeenCalledWith(
      "/admin/rewards/wallet-read",
      expect.objectContaining({
        method: "POST",
        body: { challenge: "challenge", data: "encrypted-data" },
      }),
    );
  });
});
