import { expect, it, vi } from 'vitest';
import { contentRecordRoutes } from '../../server/content-records.mjs';
import { token, tokenHash } from '../../server/lib/security.mjs';
const actor='f1480000-0000-4000-8000-000000000001',session='f1480000-0000-4000-8000-000000000002',id='f1480000-0000-4000-8000-000000000003',other='f1480000-0000-4000-8000-000000000004';
const body={action:'reconcile',keepId:id,profiles:[{id,revision:3},{id:other,revision:1}]};
function fixture(role='super_admin') {
 const raw=token(),csrf=token(),db={rpc:vi.fn(async()=>({data:{record:{id},archived:1}}))};
 const store={validateSession:vi.fn(async()=>({sessionId:session,user:{id:actor,role,is_active:true}})),csrf:vi.fn(async()=>({token_hash:tokenHash(csrf),expires_at:new Date(Date.now()+60000).toISOString()}))};
 async function call(method='POST',document=body,key='fictional-key-00000001') {
  const request={url:'/api/v1/admin/content-records/team-profiles/'+id+(method==='GET'?'?duplicates=true':''),method,body:document,headers:{origin:'https://chapter.example.test','content-type':'application/json',cookie:'__Host-gdg_session='+raw,'x-csrf-token':csrf,...(key?{'idempotency-key':key}:{})}};
  const response={setHeader(){},end(value){this.body=JSON.parse(value);}};
  await contentRecordRoutes(request,response,{db,store,config:{origin:'https://chapter.example.test',sessionCookie:'__Host-gdg_session'},requestId:id});return response;
 }
 return {call,db};
}
it.each(['admin','team_member'])('blocks %s from reviewing or reconciling public identities',async(role)=>{
 const f=fixture(role);
 for(const method of ['GET','POST'])await expect(f.call(method)).rejects.toMatchObject({status:403});
 expect(f.db.rpc).not.toHaveBeenCalled();
});
it('binds reconciliation to the current session, exact review and hashed retry identity',async()=>{
 const f=fixture();await f.call();
 expect(f.db.rpc).toHaveBeenCalledWith('reconcile_team_profiles',expect.objectContaining({p_actor:actor,p_session:session,p_id:id,p_keep:id,p_profiles:body.profiles,p_key_hash:tokenHash('fictional-key-00000001')}));
 const input=f.db.rpc.mock.calls[0][1];expect(input.p_request_hash).toMatch(/^[a-f0-9]{64}$/);
 expect(JSON.stringify(input)).not.toContain('fictional-key-00000001');
});
it('reviews through the protected duplicate inventory and rejects missing retry keys',async()=>{
 const f=fixture();await f.call('GET');
 expect(f.db.rpc).toHaveBeenCalledWith('review_team_profile_duplicates',{p_actor:actor,p_id:id});
 f.db.rpc.mockClear();await expect(f.call('POST',body,null)).rejects.toMatchObject({status:400});expect(f.db.rpc).not.toHaveBeenCalled();
});
it('rejects injected identity and incomplete or repeated reviewed records',async()=>{
 const f=fixture();
 for(const document of [{...body,actorId:actor},{...body,profiles:[body.profiles[0]]},{...body,profiles:[body.profiles[0],body.profiles[0]]}])await expect(f.call('POST',document)).rejects.toMatchObject({status:400});
 expect(f.db.rpc).not.toHaveBeenCalled();
});
