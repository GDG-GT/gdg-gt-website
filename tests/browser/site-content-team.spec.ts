import {test,expect} from './public-fixture';
for(const entry of ['/admin/team','/admin/content/team']) test(`public team is grouped under Site content from ${entry}`,async({page,fixture})=>{
 fixture.authenticated=true;
 await page.route('**/api/v1/admin/content-records/team-profiles**',route=>{
  const url=new URL(route.request().url());
  return route.fulfill({json:{data:url.pathname.endsWith('/capabilities')?{globalCreate:true,teams:[]}:{items:[],total:0,page:1,pageSize:30}}});
 });
 await page.goto(entry);
 await expect(page).toHaveURL(/\/admin\/content\/team$/);
 await expect(page.getByRole('heading',{name:'Public team profiles',exact:true})).toBeVisible();
 const tabs=page.getByRole('navigation',{name:'Site content sections',exact:true});
 await expect(tabs.getByRole('link',{name:'Public team',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('navigation',{name:'Workspace navigation',exact:true}).getByRole('link',{name:'Public team',exact:true})).toHaveCount(0);
 expect(fixture.writes).toEqual([]);
 expect(fixture.unexpected).toEqual([]);
});
