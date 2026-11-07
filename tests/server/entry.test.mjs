import { describe,it,expect } from 'vitest';
import handler from '../../server/handler.mjs';
import retired from '../../server/retired.mjs';
import { applicationHandler } from '../../server/handler.mjs';
import { hashSecret, token,tokenHash } from '../../server/lib/security.mjs';

function response(){return{statusCode:200,headers:new Map(),setHeader(k,v){this.headers.set(k.toLowerCase(),v);},getHeader(k){return this.headers.get(k.toLowerCase());},end(body){this.body=JSON.parse(body);}};}
describe('deployed entry boundaries',()=>{
  it('missing private server configuration fails closed without returning environment values',async()=>{
    const r=response();await handler({url:'/api/v1/auth/session',method:'GET',headers:{}},r);
    expect(r.statusCode).toBe(503);expect(r.body.error.code).toBe('TEMPORARILY_UNAVAILABLE');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('retired source endpoints do not accept unsigned identity, email, or media mutations',async()=>{
    for(const method of ['GET','POST','DELETE']){
      const r=response();await retired({url:'/api/session',method,headers:{cookie:'gdg_admin={"role":"super_admin"}'}},r);
      expect(r.statusCode).toBe(410);expect(r.body.error.code).toBe('ENDPOINT_RETIRED');
    }
  });
  it('gate rotation is unavailable to Admin and requires current CSRF for Super Admin',async()=>{
    const raw=token(),csrf=token(), passwordHash=await hashSecret('Fictional reviewed password');let role='admin',rotations=0;
    const store={validateSession:async()=>({sessionId:'s',user:{id:'u',email:'fictional@example.test',role,is_active:true}}),
      csrf:async()=>({token_hash:tokenHash(csrf),expires_at:new Date(Date.now()+60000).toISOString()}),
      rateLimit:async()=>({allowed:true}),accountByEmail:async()=>({password_hash:passwordHash})};
    const config={origin:'https://chapter.example.test',riskSecret:'fictional-risk-secret',sessionCookie:'__Host-gdg_session'};
    const app=applicationHandler({config,store,db:{rpc:async()=>{rotations++;return {data:{rotated:true,version:2}};}}});
    const request=(csrfHeader)=>({url:'/api/v1/admin/security/gate',method:'POST',body:{code:'A new gate code of sufficient length',currentPassword:'Fictional reviewed password',expectedVersion:1,confirmation:'ROTATE GATE'},
      headers:{origin:config.origin,'content-type':'application/json',cookie:'__Host-gdg_session='+raw,'x-csrf-token':csrfHeader,'idempotency-key':'fictional-rotation-01'}});
    let r=response();await app(request(csrf),r);expect(r.statusCode).toBe(403);
    role='super_admin';r=response();await app(request(undefined),r);expect(r.statusCode).toBe(403);
    r=response();await app(request(csrf),r);expect(r.statusCode).toBe(200);expect(rotations).toBe(1);
  });
});
