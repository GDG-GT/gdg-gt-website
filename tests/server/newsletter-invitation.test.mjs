import {it,expect,vi} from 'vitest';
import {newsletterRoutes} from '../../server/newsletter.mjs';
import {decryptPayload} from '../../server/lib/encryption.mjs';
import {tokenHash} from '../../server/lib/security.mjs';
it('marks only admin-created subscriber mail as an invitation in the encrypted outbox secret',async()=>{
 const actor='a5100000-0000-4000-8000-000000000001',secret='A'.repeat(43),encryptionSecret='fictional-newsletter-invitation-key';
 const db={rpc:vi.fn(async()=>({data:{id:actor},error:null}))};
 const store={validateSession:async()=>({user:{id:actor,role:'super_admin',is_active:true},sessionId:actor}),csrf:async()=>({token_hash:tokenHash(secret),expires_at:new Date(Date.now()+60000).toISOString()}),rateLimit:async()=>({allowed:true})};
 const config={origin:'https://gdggt.dev',sessionCookie:'__Host-gdg_session',secureCookies:true,riskSecret:'fictional-newsletter-risk-secret',encryptionSecret};
 await newsletterRoutes({url:'/api/v1/admin/newsletter/subscribers',method:'POST',body:{teamId:null,email:'fixture@example.test',name:'Fixture',consentAcknowledged:true},headers:{cookie:'__Host-gdg_session='+secret,'content-type':'application/json','x-csrf-token':secret,'idempotency-key':'fictional-invite-request'}},{setHeader(){},end(){}},{db,store,config,requestId:actor});
 expect(db.rpc.mock.calls[0][0]).toBe('invite_newsletter_subscriber');
 const document=db.rpc.mock.calls[0][1],payload=decryptPayload(document.p_secret_payload,encryptionSecret);
 expect(payload.source).toBe('admin_invitation');expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(document.p_token_hash).toBe(tokenHash(payload.token));expect(document).not.toHaveProperty('source');
});
