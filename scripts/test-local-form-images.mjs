import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import sharp from 'sharp';
import { localHttp } from './lib/local-http.mjs';
import { hashSecret } from '../server/lib/security.mjs';
import { runUploadWorker } from '../server/upload-worker.mjs';
import { runMediaPublicationWorker } from '../server/media-publication-worker.mjs';
import { createTemplate, newField } from '../shared/forms.ts';

if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === 'true') throw Error('This fixture requires its own fictional session.');
const h = await localHttp(), { db, env, call } = h, actor = randomUUID();
const email = `fictional-form-image-${actor}@example.test`, password = 'Fixture-image-' + randomUUID(), tests = [];
const checked = value => { if (value.error) throw Error('Fixture database failed: ' + value.error.code); return value.data; };
const data = value => { if (value.status !== 200) throw Error(`Fixture API failed: ${value.status} ${value.json?.error?.code}`); return value.json.data; };
const check = (ok, name) => { if (!ok) throw Error('FAIL ' + name); tests.push({ name, passed:true }); console.info('PASS',name); };
const post = (path, body) => call(path,{method:'POST',body,key:randomUUID()});
const fileRow = async id => checked(await db.from('media_files').select('*').eq('id',id).single());
let file, form;
async function publication(action) {
  file = await fileRow(file.id);
  return post(`/admin/media/files/${file.id}/publication`, { action, revision:file.revision, currentPassword:password,
    confirmation:action==='publish'?'PUBLISH IMAGE':'REVOKE IMAGE' });
}
async function untilReady(read, accept) {
  for(let attempt=0;attempt<60;attempt++) { const value=await read(); if(accept(value)) return value; await new Promise(resolve=>setTimeout(resolve,250)); }
  throw Error('The local fixture worker did not finish within its bounded wait.');
}
try {
  checked(await db.from('admin_users').insert({id:actor,email,password_hash:await hashSecret(password),role:'admin',is_active:true}));
  data(await post('/auth/gate',{code:h.credentials.gateCode}));
  data(await post('/auth/login',{email,password}));
  const bytes = await sharp({create:{width:120,height:80,channels:3,background:'#df7768'}}).png().toBuffer();
  const intent = data(await post('/admin/media/uploads',{teamId:null,folderId:null,filename:'fictional-form-header.png',mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
  file=await fileRow(intent.fileId);
  const put=await fetch(intent.url,{method:'PUT',headers:intent.headers,body:bytes});
  check(put.ok,'generated fictional image uploads through one-object private capability');
  data(await post(`/admin/media/uploads/${intent.uploadId}/complete`,{}));
  const queued=checked(await db.from('upload_intents').select('owner_id').eq('purpose','media').eq('state','queued').is('deleted_at',null));
  if(queued.some(row=>row.owner_id!==actor)) throw Error('Unrelated media queue present; refusing to claim it.');
  await runUploadWorker({env,db,media:true,limit:1});
  file=await untilReady(()=>fileRow(file.id),row=>row.scan_state==='clean');
  check(file.scan_state==='clean','actual local scanner approves the generated raster before use');
  data(await post('/admin/media/files',{action:'metadata',files:[{id:file.id,revision:file.revision}],document:{name:'Fictional form image',alt:'Generated coral rectangle for local form testing',description:'Fictional fixture, not chapter photography',tags:['fictional'],eventId:null,order:0,allowDownload:false}}));
  data(await publication('publish'));
  const pending=checked(await db.from('delivery_jobs').select('payload').eq('kind','media_publish').eq('state','pending'));
  if(pending.some(row=>row.payload?.fileId && row.payload.fileId!==file.id)) throw Error('Unrelated publication queue present; refusing to claim it.');
  await runMediaPublicationWorker({env,db,limit:1});
  file=await untilReady(()=>fileRow(file.id),row=>row.is_public);
  check((await call(`/media/public/${file.id}?width=960`,{anonymous:true})).status===200,'only explicitly published derivative bytes are publicly readable');
  const template=createTemplate('Fictional approved image form'), image={...newField('image',template.sections[0].id),imageMediaId:file.id,imageWidth:120,imageHeight:80,label:'Generated coral rectangle for local form testing'};
  const definition={title:template.title,description:'Fictional local verification, not a real chapter form.',sections:template.sections,
    fields:[image,newField('short',template.sections[0].id)],settings:{...template.settings,headerMedia:`/api/v1/media/public/${file.id}`,headerAlt:'Generated coral form header'}};
  const slug='fictional-image-'+actor.slice(0,8);
  check((await post('/admin/forms',{slug,definition:{...definition,settings:{...definition.settings,headerMedia:'https://outside.example.test/pixel'}}})).status===400,'form schema rejects external tracking images');
  check((await post('/admin/forms',{slug,definition:{...definition,fields:[{...image,imageMediaId:randomUUID()}]}})).status===409,'database rejects nonexistent/unpublished image identities before draft creation');
  form=data(await post('/admin/forms',{slug,definition})).form;
  check(form.fields[0].imageMediaId===file.id && form.settings.headerAlt==='Generated coral form header','real draft preserves selected media identity, dimensions and alternative text');
  form=data(await post(`/admin/forms/${form.id}/publish`,{revision:form.revision})).form;
  const publicForm=data(await call(`/forms/${slug}`,{anonymous:true})).form;
  check(publicForm.fields[0].imageMediaId===file.id && publicForm.settings.headerMedia===definition.settings.headerMedia,'immutable public version delivers selected block/header media without private paths');
  check(!JSON.stringify(publicForm).includes('clean/')&&!JSON.stringify(publicForm).includes('quarantine/'),'public form excludes private storage keys and scanner capabilities');
  if(process.argv.includes('--hold-for-browser')) {
    if(!process.stdin.isTTY) throw Error('Browser review requires a terminal.');
    console.info(`BROWSER_FORM_IMAGE /forms/${slug} /admin/forms/${form.id}/edit`);
    console.info('Type done after reviewing the fictional local form/header and image picker.');
    const input=createInterface({input:process.stdin,output:process.stdout});
    for await(const line of input) if(line.trim()==='done'){input.close();break;}
  }
  form=data(await call(`/admin/forms/${form.id}`)).form;
  const edited={...definition,fields:[definition.fields[1]],settings:{...definition.settings,headerMedia:'',headerAlt:''}};
  form=data(await call(`/admin/forms/${form.id}`,{method:'PATCH',body:{revision:form.revision,definition:edited}})).form;
  check(form.fields.length===1&&!form.settings.headerMedia,'draft media removal does not rewrite its published definition');
  const oldVersion=data(await call(`/forms/${slug}`,{anonymous:true})).form;
  check(oldVersion.fields[0].imageMediaId===file.id,'published historical image remains unchanged after a draft edit');
  data(await publication('revoke'));
  check((await call(`/media/public/${file.id}?width=960`,{anonymous:true})).status===404,'privacy revocation immediately removes public bytes even when a form references the image');
  file=await fileRow(file.id);
  check((await post('/admin/media/files',{action:'archive',files:[{id:file.id,revision:file.revision}],document:{}})).status===409,'published historical form references block media erasure even after draft removal');
  check((await post(`/admin/forms/${form.id}/publish`,{revision:form.revision})).status===200,'removing withdrawn media permits publishing a clean replacement version');
  form=data(await call(`/admin/forms/${form.id}`)).form;
} finally {
  if(file) { file=await fileRow(file.id); if(file.is_public) data(await publication('revoke')); }
  if(form) { const current=data(await call(`/admin/forms/${form.id}`)).form; data(await call(`/admin/forms/${form.id}`,{method:'DELETE',body:{revision:current.revision}})); }
  await h.logout();
  checked(await db.from('admin_users').update({is_active:false}).eq('id',actor));
}
await writeFile(new URL('../.docs/phase0/local-form-images.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),note:'Real loopback signed storage, scanner, derivative publication and Forms HTTP checks using a generated coral rectangle and fictional account/form only. Publication revoked and form/account recoverably archived; historical media remains private and retained. No real chapter photo or external provider.',tests},null,2)+'\n');
console.info(`${tests.length} actual local form-image checks passed.`);
