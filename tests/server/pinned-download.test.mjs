import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  downloadPinnedArtifact,
  ArtifactIntegrityError,
} from "../../scripts/lib/pinned-download.mjs";
const bytes = Buffer.from("fictional verified source archive"),
  sha256 = createHash("sha256").update(bytes).digest("hex");
const options = {
  urls: [
    "https://publisher.example.test/source",
    "https://mirror.example.test/source",
  ],
  sha256,
  maxBytes: 100,
};
describe("Checksum-pinned build dependency availability", () => {
  it("falls back after bounded connection failures without changing the expected archive", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("timeout"))
      .mockRejectedValueOnce(new TypeError("timeout"))
      .mockResolvedValueOnce(new Response(bytes));
    expect(await downloadPinnedArtifact(options, fetchImpl)).toEqual(bytes);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      options.urls[0],
      options.urls[0],
      options.urls[1],
    ]);
  });
  it("never falls back around a checksum mismatch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("changed source"));
    await expect(
      downloadPinnedArtifact(options, fetchImpl),
    ).rejects.toBeInstanceOf(ArtifactIntegrityError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("enforces the streamed size limit even without content-length", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(Buffer.alloc(101)));
    await expect(
      downloadPinnedArtifact(options, fetchImpl),
    ).rejects.toBeInstanceOf(ArtifactIntegrityError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("skips a mirror missing the pinned release and refuses all-unavailable sources", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(bytes));
    expect(await downloadPinnedArtifact(options, fetchImpl)).toEqual(bytes);
    await expect(
      downloadPinnedArtifact(
        options,
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      ),
    ).rejects.toThrow("unavailable");
  });
});
