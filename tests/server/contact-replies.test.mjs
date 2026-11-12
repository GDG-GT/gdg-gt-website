import {afterEach,describe,it,expect,vi} from 'vitest';
import {deliveryMessage,runDelivery} from '../../server/delivery.mjs';
import {createMailTransport} from '../../server/lib/mail-transport.mjs';
import {contactMutation,contactMutationInspection} from '../../shared/contact.mjs';
const env={MAIL_MODE:'resend',EMAIL_SEND_ENABLED:'true',RESEND_API_KEY:'re_fictional_only',FROM_EMAIL:'hello@gdggt.dev',REPLY_TO_EMAIL:'gdg@gatech.edu',CHAPTER_CONTACT_EMAIL:'gdg@gatech.edu',APP_ORIGIN:'https://gdggt.dev',RISK_HASH_SECRET:'fictional-risk'.repeat(4),DATA_ENCRYPTION_KEY:'fictional-key'.repeat(4)};
const id='f1580000-0000-4000-8000-000000000001';
afterEach(()=>vi.unstubAllGlobals());
describe('contact email reply routing',()=>{
 it('sets notification Reply-To to the submitter and retains the verified chapter sender',async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:'provider-fixture'}),{status:200}));vi.stubGlobal('fetch',fetcher);
  const job={id,kind:'contact_notification',payload:{contactId:id},lease_token:id};
  const db={rpc:vi.fn(async name=>({data:name==='claim_delivery_jobs'?[job]:true})),from(){const q={select(){return q},eq(){return q},single:async()=>({data:{name:'Fictional Person',email:'submitter@example.test',inquiry_type:'membership',message:'Fictional inquiry'}})};return q}};
  expect(await runDelivery({db,env,limit:1})).toMatchObject({claimed:1,completed:1,retried:0});
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.reply_to).toBe('submitter@example.test');expect(body.to).toBe('gdg@gatech.edu');expect(body.from).toBe('GDG at Georgia Tech <contact@gdggt.dev>');expect(body.html).toContain('respond directly to the person');
 });
 it('keeps acknowledgments and outbound inquiry replies directed back to the chapter',async()=>{
  const config={origin:env.APP_ORIGIN},mail={from:env.FROM_EMAIL,replyTo:env.REPLY_TO_EMAIL};
  const db={rpc:vi.fn(async()=>({data:{email:'submitter@example.test',type:'membership',body:'Thanks for reaching out. <script>private()</script>'}}))};
  const message=await deliveryMessage({id,kind:'contact_reply',lease_token:id},db,config,mail,env);expect(message.to).toBe('submitter@example.test');expect(message.replyTo).toBe('gdg@gatech.edu');expect(message.html).toContain('&lt;script&gt;');expect(message.html).not.toContain('<script>');expect(message.subject).toBe('Re: Your membership inquiry to GDG at Georgia Tech');
  db.rpc.mockResolvedValueOnce({data:null});expect(await deliveryMessage({id,kind:'contact_reply',lease_token:id},db,config,mail,env)).toBeNull();
 });
 it('rejects injected addresses and reply routing outside the contact category',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const transport=createMailTransport(env);
  for(const options of [{category:'contact',replyTo:'x@example.test\r\nBcc:other@example.test'},{category:'forms',replyTo:'x@example.test'}])await expect(transport.send({to:'chapter@example.test',subject:'Fixture',text:'Fixture'},{jobId:id,idempotencyKey:'fixture',...options})).rejects.toThrow('Invalid server reply address');
  expect(fetcher).not.toHaveBeenCalled();transport.close();
 });
 it('allows only the bounded message and original revision for reply and recovery',()=>{
  const good={action:'reply',revision:1,body:'A fictional reply.'};expect(contactMutation.parse(good)).toEqual(good);expect(contactMutationInspection.parse(good)).toEqual(good);
  for(const extra of [{body:''},{body:'x'.repeat(5001)},{email:'arbitrary@example.test'},{from:'other@example.test'},{body:'bad\u0000message'}])expect(contactMutation.safeParse({...good,...extra}).success).toBe(false);
 });
});
