import { describe, it, expect, vi } from "vitest";
import { createBackgroundScanner } from "../../server/background-scanner.mjs";
import { createBackgroundWorker } from "../../server/background-worker.mjs";
import { scanQueuedObject } from "../../server/lib/remote-scanner.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
import { scannerDebPayload } from "../../scripts/prepare-serverless-scanner.mjs";
import { scanBuffer } from "../../server/lib/scanner.mjs";
const env = { APP_ORIGIN: "https://chapter.example.test", CRON_SECRET: "fictional-only-private-worker-key-".repeat(2) };
const id = "a7500000-0000-4000-8000-000000000001", lease = "a7500000-0000-4000-8000-000000000002";
const bytes = Buffer.from("owned unit fixture"), hash = tokenHash(bytes);
async function invoke(handler, body, changes = {}) {
  const request = { method: "POST", url: "/api/scanner", headers: { authorization: "Bearer " + env.CRON_SECRET, "content-type": "application/json" }, body, ...changes };
  const response = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(v) { this.body = JSON.parse(v); } };
  await handler(request, response); return response;
}
function fixture(jobChange={}, uploadChange={}) {
  const job = {id, kind:"media_upload_scan", payload:{uploadId:id}, state:"running", lease_token:lease, locked_until:new Date(Date.now()+300000).toISOString(), ...jobChange};
  const upload = {purpose:"media",state:"queued",deleted_at:null,bucket:"media",quarantine_key:"quarantine/fixture",expected_bytes:bytes.length,expected_sha256:hash,...uploadChange};
  const database = vi.fn(()=>({ from: table=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==="delivery_jobs"?job:upload})}) }));
  const storage = {bytes:vi.fn(async()=>bytes),close:vi.fn()}, storageFactory=vi.fn(()=>storage), ensure=vi.fn(async()=>({signatureVersion:"12345"})),scan=vi.fn(async()=>({clean:true}));
  return {handler:createBackgroundScanner({env,database,storageFactory,ensure,scan}),database,storageFactory,storage,ensure,scan};
}
const body={mode:"job",jobId:id,leaseToken:lease,sha256:hash};
describe("isolated private workers",()=>{
  it("reads only a currently leased exact object and returns its checked checksum without promotion",async()=>{
    const f=fixture(), r=await invoke(f.handler,body);
    expect(r.statusCode).toBe(200);expect(r.body.data).toEqual({clean:true,sha256:hash,signatureVersion:"12345"});
    expect(f.storage.bytes).toHaveBeenCalledWith("media","quarantine/fixture",bytes.length);
    expect(f.storage.close).toHaveBeenCalledOnce();expect(f.scan).toHaveBeenCalledWith(bytes,expect.objectContaining({SCANNER_TRANSPORT:"clamd"}));
  });
  it.each([{method:"GET"},{headers:{}},{headers:{authorization:"Bearer wrong"}},{headers:{authorization:"Bearer "+env.CRON_SECRET,origin:env.APP_ORIGIN}},{url:"/api/scanner?mode=self-test"}])("rejects invalid transports before storage access: %j",async changes=>{
    const f=fixture();const r=await invoke(f.handler,body,changes);expect(r.statusCode).toBeGreaterThanOrEqual(400);expect(f.storageFactory).not.toHaveBeenCalled();expect(f.ensure).not.toHaveBeenCalled();
  });
  it.each([{state:"pending"},{lease_token:id},{locked_until:new Date(0).toISOString()},{kind:"newsletter_email"},{locked_until:"invalid"}])("fences expired or different queue ownership: %j",async change=>{
    const f=fixture(change);expect((await invoke(f.handler,body)).statusCode).toBe(409);expect(f.storageFactory).not.toHaveBeenCalled();
  });
  it.each([{state:"clean"},{purpose:"form"},{deleted_at:"now"},{expected_bytes:52428801},{expected_bytes:0},{expected_sha256:"0".repeat(64)}])("fences changed or unsupported uploads: %j",async change=>{
    const f=fixture({},change);expect((await invoke(f.handler,body)).statusCode).toBe(409);expect(f.storageFactory).not.toHaveBeenCalled();
  });
  it("checks the downloaded bytes again and closes storage on native failure",async()=>{
    let f=fixture();f.storage.bytes.mockResolvedValue(Buffer.from("changed"));expect((await invoke(f.handler,body)).statusCode).toBe(409);expect(f.ensure).not.toHaveBeenCalled();expect(f.storage.close).toHaveBeenCalledOnce();
    f=fixture();f.ensure.mockRejectedValue(Error("private native detail"));const r=await invoke(f.handler,body);expect(r.statusCode).toBeGreaterThanOrEqual(500);expect(JSON.stringify(r.body)).not.toContain("private native");expect(f.storage.close).toHaveBeenCalledOnce();
  });
  it("requires clean and EICAR results for the authenticated real-engine verification mode",async()=>{
    const f=fixture();f.scan.mockResolvedValueOnce({clean:true}).mockResolvedValueOnce({clean:false,code:"MALWARE_DETECTED"});
    expect((await invoke(f.handler,{mode:"self-test"})).body.data.verified).toBe(true);expect(f.database).not.toHaveBeenCalled();expect(f.scan.mock.calls[1][0].toString()).toContain("EICAR-STANDARD");
    expect((await invoke(f.handler,{mode:"self-test"})).statusCode).toBe(503);
  });
  it("rejects metadata fields and oversized request bodies before initializing the engine",async()=>{
    const f=fixture();expect((await invoke(f.handler,{...body,bucket:"elsewhere"})).statusCode).toBe(400);
    expect((await invoke(f.handler,{...body,padding:"x".repeat(4096)})).statusCode).toBe(413);expect(f.ensure).not.toHaveBeenCalled();
  });
  it("runs one selected worker group and marks nested lost leases or retries as unavailable",async()=>{
    const workers={uploads:vi.fn(async()=>({claimed:1,clean:1})),media:vi.fn(async()=>({scanned:{lostLease:1}})),exports:vi.fn(async()=>({cleanupRetried:1}))};
    const handler=createBackgroundWorker({env,workers});expect((await invoke(handler,{group:"uploads"})).statusCode).toBe(200);expect(workers.uploads).toHaveBeenCalledOnce();expect(workers.media).not.toHaveBeenCalled();
    for(const group of ["media","exports"])expect((await invoke(handler,{group})).statusCode).toBe(503);
    expect((await invoke(handler,{group:"all"})).statusCode).toBe(400);expect((await invoke(handler,{group:"uploads",limit:100})).statusCode).toBe(400);
  });
});
describe("metadata-only private scanner transport",()=>{
  const context={jobId:id,leaseToken:lease};
  it("sends only lease metadata to the exact configured HTTPS origin",async()=>{
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({data:{clean:true,sha256:hash,signatureVersion:"12345"}})}));
    expect(await scanQueuedObject(bytes,env,context,fetcher)).toEqual({clean:true});
    const [url,options]=fetcher.mock.calls[0];expect(url).toBe(env.APP_ORIGIN+"/api/scanner");expect(options.redirect).toBe("error");expect(JSON.parse(options.body)).toEqual(body);expect(options.body).not.toContain(bytes.toString());
  });
  it("uses the same fail-closed transport through the upload worker scanner entry point",async()=>{
    const original=globalThis.fetch;
    globalThis.fetch=vi.fn(async()=>({ok:true,json:async()=>({data:{clean:true,sha256:hash,signatureVersion:"12345"}})}));
    try { expect(await scanBuffer(bytes,{...env,SCANNER_TRANSPORT:"job-http"},context)).toEqual({clean:true}); }
    finally { globalThis.fetch=original; }
  });
  it.each([{APP_ORIGIN:"http://chapter.example.test"},{APP_ORIGIN:"https://chapter.example.test/path"},{APP_ORIGIN:"https://user:pass@chapter.example.test"},{APP_ORIGIN:"not-url"},{CRON_SECRET:"short"}])("refuses unsafe endpoints or credentials: %j",async change=>{
    const fetcher=vi.fn();await expect(scanQueuedObject(bytes,{...env,...change},context,fetcher)).rejects.toMatchObject({code:"SCANNER_UNAVAILABLE"});expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects missing leases, provider errors, malformed checksums and inconclusive verdicts",async()=>{
    await expect(scanQueuedObject(bytes,env,{},vi.fn())).rejects.toMatchObject({status:503});
    for(const data of [{clean:true,sha256:"bad",signatureVersion:"1"},{clean:false,sha256:hash,signatureVersion:"1"},{clean:true,sha256:hash,signatureVersion:"invalid"},null])
      await expect(scanQueuedObject(bytes,env,context,async()=>({ok:true,json:async()=>({data})}))).rejects.toMatchObject({status:503});
    await expect(scanQueuedObject(bytes,env,context,async()=>({ok:false}))).rejects.toMatchObject({status:503});
    await expect(scanQueuedObject(bytes,env,context,async()=>{throw Error("private") })).rejects.toMatchObject({status:503});
    expect(await scanQueuedObject(bytes,env,context,async()=>({ok:true,json:async()=>({data:{clean:false,code:"MALWARE_DETECTED",sha256:hash,signatureVersion:"1"}})}))).toEqual({clean:false,code:"MALWARE_DETECTED"});
  });
});
describe("checksum-pinned vendor archive boundaries",()=>{
 const member=(name,data)=>Buffer.concat([Buffer.from(name.padEnd(16)+"0".padEnd(12)+"0".padEnd(6)+"0".padEnd(6)+"100644".padEnd(8)+String(data.length).padEnd(10)+"`\n"),data,...(data.length%2?[Buffer.from("\n")]:[])]);
 const data=Buffer.from([0x1f,0x8b,0,0]), valid=()=>Buffer.concat([Buffer.from("!<arch>\n"),member("data.tar.gz/",data)]);
 it("extracts a single complete gzip payload from ar without trusting filenames",()=>{expect(scannerDebPayload(valid())).toEqual(data);});
 it("rejects corrupt, truncated, missing and ambiguous publisher payloads",()=>{
   for(const value of [Buffer.from("bad"),valid().subarray(0,-1),Buffer.concat([Buffer.from("!<arch>\n"),member("other",data)]),Buffer.concat([valid(),member("data.tar.gz/",data)])])expect(()=>scannerDebPayload(value)).toThrow();
 });
});

describe("hosted media/storage technical verification boundaries",()=>{
 it("uses generated owned files, checks exact reads and removes both objects",async()=>{
  const {verifyBackgroundRuntime}=await import("../../server/lib/background-runtime-check.mjs");
  const objects=new Map(),storage={put:vi.fn(async(b,k,v)=>objects.set(b+":"+k,v)),bytes:vi.fn(async(b,k)=>objects.get(b+":"+k)),delete:vi.fn(async(b,k)=>objects.delete(b+":"+k)),close:vi.fn()};
  const normalize=vi.fn(async buffer=>{expect(buffer.subarray(0,4).toString()).toBe("RIFF");return{kind:"audio",duration:0.1};});
  const r=await verifyBackgroundRuntime(env,{storageFactory:()=>storage,normalize});expect(r.verified).toBe(true);expect(r.exactRoundTrips).toBe(2);expect(objects.size).toBe(0);expect(storage.close).toHaveBeenCalledOnce();
  expect(storage.put.mock.calls.map(c=>c[0])).toEqual(["media","form-exports"]);
 });
 it("cleans up a written object even when the provider loses its PUT response",async()=>{
  const {verifyBackgroundRuntime}=await import("../../server/lib/background-runtime-check.mjs");
  const storage={put:vi.fn(async()=>{throw Error("lost response")}),delete:vi.fn(async()=>{}),close:vi.fn()};
  await expect(verifyBackgroundRuntime(env,{storageFactory:()=>storage,normalize:async()=>({kind:"audio",duration:1})})).rejects.toThrow("lost response");expect(storage.delete).toHaveBeenCalledOnce();expect(storage.close).toHaveBeenCalledOnce();
 });
 it("does not access storage when the real media reader cannot validate the owned WAV",async()=>{
  const {verifyBackgroundRuntime}=await import("../../server/lib/background-runtime-check.mjs"),storageFactory=vi.fn();
  await expect(verifyBackgroundRuntime(env,{storageFactory,normalize:async()=>({kind:"audio",duration:null})})).rejects.toMatchObject({code:"WORKER_UNAVAILABLE"});expect(storageFactory).not.toHaveBeenCalled();
 });
 it("authorizes technical verification before invoking tools and never invokes a business worker",async()=>{
  const verify=vi.fn(async()=>({verified:true})),workers={uploads:vi.fn()},handler=createBackgroundWorker({env,workers,verify});
  expect((await invoke(handler,{group:"self-test"})).body.data.verified).toBe(true);expect(verify).toHaveBeenCalledWith(expect.objectContaining({SCANNER_TRANSPORT:"job-http"}));expect(workers.uploads).not.toHaveBeenCalled();
  expect((await invoke(handler,{group:"self-test"},{headers:{}})).statusCode).toBe(401);expect(verify).toHaveBeenCalledOnce();
 });
});
