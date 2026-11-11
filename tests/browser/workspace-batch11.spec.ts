import {test,expect,accessibility} from './public-fixture';
import {newsletterFixture} from './operations-records';
test('pins up to three destinations and retains them after reload',async({page,fixture},info)=>{
 fixture.authenticated=true;await page.goto('/admin');
 const mobile=info.project.name.includes('mobile');if(mobile)await page.getByRole('button',{name:'Open workspace navigation',exact:true}).click();
 for(const label of ['Events','Forms','Members'])await page.getByRole('button',{name:'Pin '+label,exact:true}).click();
 await expect(page.getByRole('button',{name:'Pin Newsletter',exact:true})).toBeDisabled();
 await page.reload();if(mobile)await page.getByRole('button',{name:'Open workspace navigation',exact:true}).click();
 const pinned=page.locator('.gt-sidebar-pinned');await expect(pinned.getByRole('link')).toHaveCount(3);
 await pinned.getByRole('button',{name:'Unpin Events',exact:true}).click();await expect(pinned.getByRole('link')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Pin Newsletter',exact:true})).toBeEnabled();
 expect(await accessibility(page)).toEqual([]);await page.screenshot({path:info.outputPath('sidebar-pins.png')});expect(fixture.unexpected).toEqual([]);
});
test('waits for task capabilities before revealing the empty page and creation controls',async({page,fixture})=>{
 fixture.authenticated=true;let release!:()=>void;const deferred=new Promise<void>(resolve=>release=resolve);let requested=false;
 await page.route('**/api/v1/admin/communications/tasks**',async route=>{const cap=route.request().url().includes('/capabilities');if(cap){requested=true;await deferred;}await route.fulfill({json:{data:cap?{personalCreate:true,teams:[],assignable:[]}:{items:[],total:0,page:1,pageSize:30}}})});
 await page.goto('/admin/communications?tab=tasks');await expect.poll(()=>requested).toBe(true);
 await expect(page.getByRole('status',{name:'Loading workspace',exact:true})).toBeVisible();await expect(page.getByText('No tasks in this view',{exact:true})).not.toBeVisible();
 release();await expect(page.getByRole('button',{name:'New task',exact:true})).toBeVisible();await expect(page.getByText('No tasks in this view',{exact:true})).toBeVisible();expect(fixture.unexpected).toEqual([]);
});
test('resends a subscriber welcome email from its editor without a scope filter',async({page,fixture},info)=>{
 fixture.authenticated=true;const n=newsletterFixture(),id=n.id;let sent=0;
 const subscriber={id,teamId:null,revision:1,email:'fictional-subscriber@example.test',name:'Fictional Subscriber',state:'active',actions:['read','update','send_email'],deletedAt:null};
 await page.route('**/api/v1/admin/newsletter/**',route=>{const p=new URL(route.request().url()).pathname.replace('/api/v1','');const reply=(data:unknown)=>route.fulfill({json:{data}});if(p.endsWith('/notify')){sent++;expect(route.request().postDataJSON()).toEqual({});expect(route.request().headers()['idempotency-key']).toBeTruthy();return reply({queued:true,purpose:'welcome'});}if(p==='/admin/newsletter/subscribers/'+id)return reply({record:subscriber});if(p==='/admin/newsletter/subscribers')return reply({items:[subscriber],total:1,page:1,pageSize:50});return reply(n.response(p));});
 await page.goto('/admin/newsletter');await expect(page.getByRole('combobox',{name:'Scope',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Subscribers',exact:true}).click();
 await page.getByRole('button',{name:'fictional-subscriber@example.test',exact:true}).click();await page.getByRole('button',{name:'Resend welcome email',exact:true}).click();await expect(page.getByRole('dialog',{name:'Email queued',exact:true})).toBeVisible();await expect.poll(()=>sent).toBe(1);await page.screenshot({path:info.outputPath('subscriber-resend.png')});expect(fixture.unexpected).toEqual([]);
});
