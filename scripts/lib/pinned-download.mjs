import { createHash } from "node:crypto";
export class ArtifactIntegrityError extends Error {}
/** Retry availability failures; never relax a publisher checksum or size cap. */
export async function downloadPinnedArtifact(
  { urls, sha256, maxBytes, timeoutMs = 30000, headers },
  fetchImpl = fetch,
) {
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs),
          ...(headers ? { headers } : {}),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if ([400, 401, 403, 404].includes(response.status)) break;
          continue;
        }
        const declared = Number(response.headers.get("content-length") || 0);
        if (declared > maxBytes) {
          await response.body?.cancel();
          throw new ArtifactIntegrityError(
            "Publisher archive exceeds its size limit.",
          );
        }
        const chunks = [];
        let size = 0;
        if (!response.body) throw new Error("Archive body unavailable.");
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > maxBytes)
            throw new ArtifactIntegrityError(
              "Publisher archive exceeds its size limit.",
            );
          chunks.push(Buffer.from(chunk));
        }
        const bytes = Buffer.concat(chunks);
        if (createHash("sha256").update(bytes).digest("hex") !== sha256)
          throw new ArtifactIntegrityError(
            "Publisher archive checksum mismatch.",
          );
        return bytes;
      } catch (error) {
        if (error instanceof ArtifactIntegrityError) throw error;
      }
    }
  }
  throw new Error(
    "Verified publisher archive is unavailable from the configured sources.",
  );
}
