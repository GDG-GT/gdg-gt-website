import {it,expect}from'vitest';
import{chapterLaunchContent}from'../../scripts/lib/chapter-launch-content.mjs';
it('prepares a bounded, private-review executive application without requiring SSO or a resume',()=>{
 const {form,links}=chapterLaunchContent(),d=form.definition;
 expect(d.settings.access).toBe('public');expect(d.settings.oneResponse).toBe(false);expect(d.settings.retentionDays).toBe(180);expect(d.settings.review).toBe(true);
 const file=d.fields.find(f=>f.type==='file');expect(file).toMatchObject({required:false,sensitive:true,maxFileBytes:10485760,allowedMime:['application/pdf']});
 expect(d.fields.find(f=>f.type==='consent')).toMatchObject({required:true});
 expect(d.settings.closesAt).toBe('');expect(links.some(l=>l.url==='/forms/'+form.slug)).toBe(true);
 expect(links.some(l=>/example\.|placeholder|discord\.gg/.test(l.url))).toBe(false);
});
