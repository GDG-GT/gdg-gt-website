import { randomUUID } from "node:crypto";
import { objectStorage } from "./object-storage.mjs";
import { normalizeMedia } from "./media-content.mjs";
import { tokenHash } from "./security.mjs";
import { ApiError } from "./http.mjs";
import { createExportBytes } from "../form-export-worker.mjs";
export async function verifyBackgroundRuntime(env, { storageFactory = objectStorage, normalize = normalizeMedia } = {}) {
  const samples = 800, wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(samples*2,40);
  const result = await normalize(wav,"owned-runtime-check.wav","audio/wav",env);
  if (result.kind!=="audio" || !Number.isFinite(result.duration) || result.duration<=0) throw new ApiError(503,"WORKER_UNAVAILABLE","Media verification did not pass.");
  const storage = storageFactory(env), key = "technical-check/"+randomUUID(),
    objects = [["media",wav],["form-exports",createExportBytes("csv",[{check:"owned runtime verification"}])]], created=[];
  let cleaned=true, problem;
  try {
    for (const [bucket,bytes] of objects) {
      // Record ownership before the request: a lost PUT response still needs
      // cleanup. Only this invocation's random technical object is removed.
      created.push(bucket);await storage.put(bucket,key,bytes,"application/octet-stream");
      const read = await storage.bytes(bucket,key,bytes.length);
      if (read.length!==bytes.length || tokenHash(read)!==tokenHash(bytes)) throw new ApiError(503,"WORKER_UNAVAILABLE","Private storage verification did not pass.");
    }
  } catch (error) { problem=error; } finally {
    const cleanup = await Promise.allSettled(created.map(bucket=>storage.delete(bucket,key)));
    cleaned=cleanup.every(r=>r.status==="fulfilled");storage.close();
  }
  if (!cleaned) throw new ApiError(503,"WORKER_CLEANUP_RETRY","Technical file cleanup needs a retry.");
  if (problem) throw problem;
  return { verified:true, mediaProbeVerified:true, privateStorageBuckets:2, exactRoundTrips:2, ownedTemporaryObjectsRemoved:cleaned };
}
