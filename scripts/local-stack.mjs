import { spawn } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { command } from './lib/disposable-postgres.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const action=process.argv[2];
if(!['start','stop','status'].includes(action))throw new Error('Use local:start, local:stop, or local:status.');
const context='colima-gdg-gt',network='gdg-gt-prd-loopback';
const env={...process.env,DOCKER_CONTEXT:context};
const cli=path.join(root,'node_modules/.bin/supabase');
async function run(program,args,{capture=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',(chunk)=>{stdout+=chunk;});child.stderr.on('data',(chunk)=>{stderr+=chunk;});
    child.on('error',reject);child.on('close',(code)=>{
      if(code!==0)return reject(new Error(`${path.basename(program)} ${args[0]} failed. No volumes were reset. Inspect the local runtime before retrying.`));
      if(capture)return resolve(stdout);
      // Do not print the CLI credential banner, DB connection URL, or provider
      // debug output. Only fixed startup milestones can reach this wrapper's log.
      for(const line of (stdout+'\n'+stderr).split('\n')){
        if(/^Applying migration \d+_[a-z0-9_]+\.sql\.\.\.$/.test(line))console.info(line);
      }
      resolve();
    });
  });
}
if(action==='start'){
  const disk=await statfs(root);
  if(disk.bavail*disk.bsize<8*1024**3)throw new Error('Reserve at least 8 GiB free before starting/downloading the local stack.');
  console.info('Starting the isolated gdg-gt Colima profile; the default profile and context are not modified.');
  await run('colima',['start','gdg-gt','--cpu','4','--memory','4','--disk','40','--vm-type','vz','--runtime','docker','--activate=false']);
  const check=await command('docker',['--context',context,'network','inspect',network,'--format','{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}']);
  if(check.code!==0)await run('docker',['network','create','--label','dev.gdggt.purpose=local-prd','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);
  else if(check.stdout.trim()!=='127.0.0.1')throw new Error('The target network does not enforce loopback; refusing to start.');
  await run(process.execPath,['scripts/prepare-local-db.mjs']);
  await run(cli,['start','--workdir','infra','--network-id',network,'--exclude','imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor']);
  console.info('Local stack is ready. Run setup:local-auth once, then dev:api and dev.');
}
if(action==='stop'){
  await run(cli,['stop','--workdir','infra']);
  console.info('Stopped this project’s Supabase containers with backup enabled; database data was preserved.');
}
if(action!=='stop'){
  const status=JSON.parse(await run(cli,['status','--workdir','infra','--output','json'],{capture:true}));
  console.info(JSON.stringify({context,api:status.API_URL,rest:status.REST_URL,mail:status.MAILPIT_URL || status.INBUCKET_URL}));
}
