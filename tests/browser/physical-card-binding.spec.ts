import {test,expect,accessibility} from './public-fixture';
const member={id:'b2100000-0000-4000-8000-000000000003',name:'Card Test Member',email:'card-test@example.test',points:0};
const id='b2100000-0000-4000-8000-000000000005',credential='B'.repeat(43),uid='04aabbccddeeff';
test('physical programming registers the chip and retries a lost response without writing again',async({page,fixture},info)=>{
 fixture.authenticated=true;let writes=0,binds=0;const requests:unknown[]=[];
 await page.addInitScript(({credential,uid})=>{
  const w=window as unknown as {gdgScanner:unknown;webkit:unknown;cardWrites:number};w.cardWrites=0;
  w.gdgScanner={version:1,wallet:false,cardBinding:true};
  w.webkit={messageHandlers:{gdgScanner:{postMessage:(m:{action:string;id:string})=>{if(m.action==='writeCard'){w.cardWrites++;setTimeout(()=>window.dispatchEvent(new CustomEvent('gdg:scanner-result',{detail:{id:m.id,value:JSON.stringify({v:2,credential,uid})}})),0);}}}}};
 },{credential,uid});
 await page.route('**/api/v1/admin/rewards**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='GET')return route.fulfill({json:{data:{members:[member],selectedMember:member,total:1,rules:[],activities:[],perks:[],credentials:[],ledger:[],claims:[]}}});
  if(path.endsWith('/credential')){writes++;return route.fulfill({json:{data:{id,credential,url:'https://gdggt.dev/tap#card='+credential,emailQueued:false}}});}
  if(path.endsWith('/card-bind')){binds++;requests.push(request.postDataJSON());if(binds===1)return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'Registration response was interrupted.'}}});return route.fulfill({json:{data:{id,uidHash:'a'.repeat(64),emailQueued:true}}});}
  return route.fulfill({status:404,json:{error:{code:'NOT_FOUND',message:'Fixture route missing'}}});
 });
 await page.goto('/admin/rewards');await page.getByRole('button',{name:/Card Test Member.*0 pts/}).click();
 await page.getByRole('textbox',{name:'Credential label',exact:true}).fill('Sample card');await page.getByRole('button',{name:'Issue credential',exact:true}).click();
 await expect(page.getByText('Card credential created. Write and register its physical chip before use.')).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Issued NFC URL'})).toHaveCount(0);await expect(page.getByAltText('Member credential QR code')).toHaveCount(0);
 await page.getByRole('button',{name:'Write and register NFC card'}).click();await expect(page.getByRole('button',{name:'Retry card registration'})).toBeVisible();
 await page.getByRole('button',{name:'Retry card registration'}).click();await expect(page.getByText('Card written, verified and registered. The member email is queued.')).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {cardWrites:number}).cardWrites)).toBe(1);expect(writes).toBe(1);expect(requests).toEqual([{id,uid},{id,uid}]);
 expect(await accessibility(page)).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('physical-card-registered.png'),fullPage:true});
});
test('a casual tap opens the public leaderboard without forwarding its old credential',async({page})=>{
 let destination='';await page.route('https://leaderboards.gdggt.dev/**',route=>{destination=route.request().url();return route.fulfill({contentType:'text/html',body:'<h1>Member leaderboard</h1>'});});
 await page.goto('/tap#card='+credential);await expect(page.getByRole('heading',{name:'Member leaderboard'})).toBeVisible();expect(destination).toBe('https://leaderboards.gdggt.dev/');expect(page.url()).not.toContain(credential);
});
