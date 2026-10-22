import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
import { api } from "../../src/lib/api";
import {
  contactUpload,
  prepareContactAttachment,
} from "../../src/lib/contact-upload";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(api).mockReset();
});
describe("private contact upload client", () => {
  it("creates a distinct in-memory 256-bit capability for each selection", () => {
    vi.stubGlobal("crypto", webcrypto);
    const file = new File(["synthetic"], "fictional.png", {
        type: "image/png",
      }),
      first = contactUpload(file),
      second = contactUpload(file);
    expect(first.uploadToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.uploadToken).not.toBe(second.uploadToken);
  });
  it("uses direct PUT without credentials and completes/scans before contact submission", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fake = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fake);
    vi.mocked(api)
      .mockResolvedValueOnce({
        uploadId: "fictional-upload",
        url: "https://storage.example.test/signed",
        headers: { "Content-Type": "image/png" },
      })
      .mockResolvedValueOnce({ state: "queued" })
      .mockResolvedValueOnce({ state: "clean" });
    const state = contactUpload(
      new File(["synthetic"], "fictional.png", { type: "image/png" }),
    );
    const result = await prepareContactAttachment(
      state,
      new AbortController().signal,
      () => {},
    );
    expect(result.uploadId).toBe("fictional-upload");
    expect(state.queued).toBe(true);
    expect(fake.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
      "/contact/upload-intents",
      "/contact/uploads/fictional-upload/complete",
      "/contact/uploads/fictional-upload/status",
    ]);
  });
  it("can retry a contact POST after ambiguous success without reuploading its bound file", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(api).mockResolvedValueOnce({ state: "attached" });
    const state = {
      ...contactUpload(
        new File(["fixture"], "fictional.pdf", { type: "application/pdf" }),
      ),
      uploadId: "fictional-upload",
      uploaded: true,
      queued: true,
    };
    expect(
      (
        await prepareContactAttachment(
          state,
          new AbortController().signal,
          () => {},
        )
      ).uploadToken,
    ).toBe(state.uploadToken);
    expect(api).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
