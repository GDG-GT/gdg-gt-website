import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { jsonBody, checkOrigin, allowMethod, apiBoundary, unavailable } from '../../server/lib/http.mjs';
import { requestCounters } from '../../server/lib/telemetry.mjs';
const schema = z.object({ name: z.string().min(1) }).strict();
const headers = { 'content-type': 'application/json' };
describe('SEC-TEST HTTP request decoding and bounded failure paths', () => {
  it('reads objects, UTF-8 strings, buffers and actual chunked request streams', async () => {
    for (const body of [{ name:'fixture' }, '{"name":"fixture"}', Buffer.from('{"name":"fixture"}')])
      expect(await jsonBody({ headers, body }, schema)).toEqual({ name:'fixture' });
    const request = Readable.from(['{"na', Buffer.from('me":"fixture"}')]); request.headers=headers;
    expect(await jsonBody(request, schema)).toEqual({ name:'fixture' });
    expect(await jsonBody({headers:{'content-type':'application/csp-report; charset=utf-8'},body:{name:'fixture'}},schema,1024,{contentTypes:['application/csp-report']})).toEqual({name:'fixture'});
  });
  it('rejects unsupported types, malformed JSON, declared and actual excessive body lengths', async () => {
    for (const type of [undefined, 'text/plain', 'application/json; charset=latin-1'])
      await expect(jsonBody({headers:{'content-type':type},body:{}},schema)).rejects.toMatchObject({status:415});
    for (const size of ['-1','not-a-size','99999'])
      await expect(jsonBody({headers:{...headers,'content-length':size},body:{}},schema,16)).rejects.toMatchObject({status:413});
    await expect(jsonBody({headers,body:'{"name":"too large"}'},schema,5)).rejects.toMatchObject({status:413});
    await expect(jsonBody({headers,body:'{invalid'},schema)).rejects.toMatchObject({status:400,code:'BAD_REQUEST'});
    const large=Readable.from(['{"name":"', 'x'.repeat(50), '"}']); large.headers=headers;
    await expect(jsonBody(large,schema,16)).rejects.toMatchObject({status:413});
    const broken=Readable.from((async function*(){yield ''; throw Error('private-stream-provider-detail');})()); broken.headers=headers;
    await expect(jsonBody(broken,schema)).rejects.toMatchObject({status:400,message:'The request could not be read.'});
  });
  it('schema errors never reflect arbitrary user keys or values', async () => {
    await expect(jsonBody({headers,body:{name:0,'private-key':'never-reflect'}},schema)).rejects.toMatchObject({code:'VALIDATION_ERROR',fields:{name:'Check this field.'}});
    const unusual=z.object({'secret/email':z.string()});
    try { await jsonBody({headers,body:{}},unusual); throw Error('Expected failure'); }
    catch(error) { expect(error.fields).toEqual({}); expect(error.message).not.toContain('secret'); }
  });
  it('origin/method boundaries fail closed without blocking ordinary same-origin reads', () => {
    expect(()=>checkOrigin({headers:{}},'https://chapter.example.test')).not.toThrow();
    expect(()=>checkOrigin({headers:{}},'https://chapter.example.test',{mutation:true})).toThrow();
    expect(()=>checkOrigin({headers:{origin:'https://other.example.test'}},'https://chapter.example.test')).toThrow();
    expect(()=>checkOrigin({headers:{'sec-fetch-site':'cross-site'}},'https://chapter.example.test')).toThrow();
    const response={setHeader:vi.fn()};
    expect(()=>allowMethod({method:'GET'},response,['GET'])).not.toThrow();
    expect(()=>allowMethod({method:'DELETE'},response,['GET'])).toThrow();
    expect(response.setHeader).toHaveBeenCalledWith('Allow','GET');
    expect(unavailable()).toMatchObject({status:503,code:'TEMPORARILY_UNAVAILABLE'});
  });
  it('aborted responses are destroyed once and count as failures without logging exception text', async () => {
    const response={statusCode:200,headersSent:true,setHeader:vi.fn(),end:vi.fn(),destroy:vi.fn()}, log=vi.fn();
    await apiBoundary({url:'/api/v1/contact',method:'POST'},response,async()=>{throw Error('never-log-token');},{log});
    expect(response.destroy).toHaveBeenCalledOnce(); expect(response.end).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0].errorCode).toBe('RESPONSE_INTERRUPTED');
    expect(requestCounters(log.mock.calls[0][0]).server_failures).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('never-log-token');
  });
});
