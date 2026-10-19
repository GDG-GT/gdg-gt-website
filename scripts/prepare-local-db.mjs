import { readdir,readFile,mkdir,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'database/migrations');
const destination=path.join(root,'infra/supabase/migrations');
await mkdir(destination,{recursive:true});
const files=(await readdir(source)).filter((file)=>file.endsWith('.sql')).sort();
for(const file of await readdir(destination)) {
  if(!files.includes(file))throw new Error('Unexpected local migration file; refusing to remove or overwrite it: '+file);
}
for(const file of files) {
  let existing;
  try{existing=await readFile(path.join(destination,file),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const current=await readFile(path.join(source,file),'utf8');
  if(existing!==undefined && existing!==current)throw new Error('A prepared migration changed. Add a forward migration; do not overwrite applied history: '+file);
  if(existing===undefined)await copyFile(path.join(source,file),path.join(destination,file));
}
console.log(`Prepared ${files.length} target migrations; no source seeds or policies copied.`);
