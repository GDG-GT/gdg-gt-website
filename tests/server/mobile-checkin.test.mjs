import {describe,it,expect,vi} from 'vitest';
import {mobileCheckinRoutes,fastCheckinInput} from '../../server/mobile-checkin.mjs';
import {encryptPayload} from '../../server/lib/encryption.mjs';
import {tokenHash} from '../../server/lib/security.mjs';
const target='a5100000-0000-4000-8000-000000000001',actor='a5100000-0000-4000-8000-000000000002',sid='a5100000-0000-4000-8000-000000000003',token='A'.repeat(43);
function fixture(role='super_admin'){
 const config={origin:'https://gdggt.dev',secureCookies:true,sessionCookie:'__Host-gdg_session',riskSecret:'fixture-risk'.repeat(3),encryptionSecret:'fixture-encryption'.repeat(3)};
 const store={validateSession:vi.fn(async()=>({user:{id:actor,role,is_active:true},sessionId:sid})),csrf:vi.fn(async()=>({token_hash:tokenHash(token),expires_at:new Date(Date.now()+60000).toISOString()})),rateLimit:vi.fn(async()=>({allowed:true}))};
 const db={rpc:vi.fn(async()=>({data:{status:'checked_in',memberName:'Fictional person',points:10},error:null}))},response={setHeader:vi.fn(),getHeader:vi.fn(),end:vi.fn()};
 const req=(body,headers={})=>({url:'/api/v1/admin/mobile/check-in',method:body?'POST':'GET',body,headers:{cookie:'__Host-gdg_session='+token,'content-type':'application/json','x-csrf-token':token,'idempotency-key':'native-checkin-fixture-request',...headers},socket:{remoteAddress:'127.0.0.1'}});
 const adapter=vi.fn(async()=>({status:'registered',checkedIn:true,checkinId:'external-checkin'}));const call=r=>mobileCheckinRoutes(r,response,{config,store,db,adapter,requestId:sid});return{store,db,response,req,call,adapter,config};
}
describe('Native automatic check-in',()=>{
 it.each(['admin','team_member','blog_editor'])('rejects %s before any private read',async role=>{const f=fixture(role);await expect(f.call(f.req())).rejects.toMatchObject({status:403});expect(f.db.rpc).not.toHaveBeenCalled()});
 it('fetches current targets with authenticated actor and session',async()=>{const f=fixture();await f.call(f.req());expect(f.db.rpc).toHaveBeenCalledWith('native_checkin_targets',{p_actor:actor,p_session:sid})});
 it('performs exactly one operation for a Wallet QR',async()=>{const f=fixture();await f.call(f.req({kind:'activity',targetId:target,credential:token}));expect(f.db.rpc).toHaveBeenCalledTimes(1);expect(f.db.rpc).toHaveBeenCalledWith('native_member_checkin',expect.objectContaining({p_kind:'activity',p_target:target,p_hash:tokenHash(token),p_uid_hash:null,p_key_hash:tokenHash('native-checkin-fixture-request')}));expect(JSON.parse(f.response.end.mock.calls[0][0]).data.status).toBe('checked_in')});
 it('passes physical UID proof without accepting a browser token as proof',async()=>{const f=fixture();await f.call(f.req({kind:'event',targetId:target,activityId:actor,credential:JSON.stringify({v:2,credential:token,uid:'04abcdef012345'})}));expect(f.db.rpc).toHaveBeenCalledWith('native_member_checkin',expect.objectContaining({p_uid_hash:tokenHash('04abcdef012345'),p_activity:actor}));expect(fastCheckinInput.safeParse({kind:'activity',targetId:target,activityId:actor,credential:token}).success).toBe(false)});
 it('requires CSRF and idempotency before attendance writes',async()=>{const f=fixture();await expect(f.call(f.req({kind:'event',targetId:target,credential:token},{'x-csrf-token':''}))).rejects.toMatchObject({status:403});expect(f.db.rpc).not.toHaveBeenCalled()});
 it('rate limits without losing the original operation',async()=>{const f=fixture();f.store.rateLimit.mockResolvedValue({allowed:false,retryAfter:5});await expect(f.call(f.req({kind:'activity',targetId:target,credential:token}))).rejects.toMatchObject({status:429});expect(f.db.rpc).not.toHaveBeenCalled()});
 it.each([false,true])('checks in a connected registration with one queue quota (duplicate=%s)',async duplicate=>{
  const f=fixture();const event={id:target,title:'Fictional event',activity_id:actor,revision:1,encrypted_key:encryptPayload({secret:'fictional-adapter-key'},f.config.encryptionSecret)};
  f.adapter.mockImplementation(async(_e,_s,action)=>({status:'registered',checkedIn:action==='checkin'||duplicate,checkinId:action==='checkin'||duplicate?'external-checkin':null}));
  f.db.rpc.mockImplementation(async(_name,args)=>({data:({lookup:{event,member:{name:'Fixture member'},memberRef:actor},review:{reviewId:sid},begin:duplicate?{id:actor,state:'completed',alreadyCheckedIn:true}:{id:actor,state:'pending',event,memberRef:actor},finish:{id:actor,state:'completed'},connection:event,points:duplicate?{id:actor,alreadyAwarded:true}:{id:actor,points:10}})[args.p_action],error:null}));
  await f.call(f.req({kind:'connection',targetId:target,credential:token}));
  expect(f.store.rateLimit).toHaveBeenCalledTimes(1);expect(f.store.rateLimit.mock.calls[0][0]).toBe('mobile.checkin');
  expect(JSON.parse(f.response.end.mock.calls[0][0]).data).toMatchObject({status:duplicate?'duplicate':'checked_in',points:duplicate?0:10});
  const receipts=f.db.rpc.mock.calls.filter(([,a])=>a.p_key_hash).map(([,a])=>a.p_key_hash);expect(new Set(receipts).size).toBe(3);
  expect(f.adapter).toHaveBeenCalledTimes(duplicate?1:2);
 });

});
