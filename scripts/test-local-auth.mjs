import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { serverDatabase } from '../server/db/client.mjs';
import { tokenHash } from '../server/lib/security.mjs';
import { command } from './lib/disposable-postgres.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const env=parseEnv(await readFile(path.join(root,'.env.server.local'),'utf8'));
if(env.NODE_ENV!=='development' || env.SUPABASE_URL!=='http://127.0.0.1:54361'
  || env.APP_ORIGIN!=='http://127.0.0.1:8080')throw new Error('This integration test is restricted to the dedicated loopback environment.');
const credentials=JSON.parse(await readFile(path.join(root,'.docs/local-auth.local'),'utf8'));
const evidence=[];
function check(condition,name){if(!condition)throw new Error('FAIL '+name);evidence.push({name,passed:true});console.info('PASS '+name);}
const statusResult=await command(process.env.SUPABASE_CLI || path.join(root,'node_modules/.bin/supabase'),
  ['status','--workdir','infra','--output','json'],undefined,{env:{...process.env,DOCKER_CONTEXT:'colima-gdg-gt'}});
if(statusResult.code!==0)throw new Error('Local stack status is unavailable.');
const status=JSON.parse(statusResult.stdout),publicKey=status.ANON_KEY || status.PUBLISHABLE_KEY;
if(!publicKey)throw new Error('Missing local low-privilege transport key.');
const anonymousHeaders={apikey:publicKey,...(status.ANON_KEY ? {Authorization:'Bearer '+status.ANON_KEY} : {})};
for(const table of ['admin_users','events']){
  const denied=await fetch(env.SUPABASE_URL+'/rest/v1/'+table+'?select=id',{headers:anonymousHeaders,signal:AbortSignal.timeout(15000)});
  check([401,403].includes(denied.status),'anonymous direct table access is denied: '+table);
}
const rpcDenied=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/take_rate_limit',{method:'POST',
  headers:{...anonymousHeaders,'Content-Type':'application/json'},
  body:JSON.stringify({p_scope:'unauthorized-test',p_risk_hash:'7'.repeat(64),p_limit:5,p_window_seconds:900}),signal:AbortSignal.timeout(15000)});
check([401,403,404].includes(rpcDenied.status),'anonymous direct security RPC access is denied');
const jar=new Map();
async function call(route,{method='GET',body,csrf,origin=env.APP_ORIGIN,cookies=jar}={}){
  const response=await fetch(env.APP_ORIGIN+'/api/v1/'+route,{method,
    headers:{origin,...(body ? {'Content-Type':'application/json'} : {}),...(csrf ? {'X-CSRF-Token':csrf} : {}),
      Cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')},
    ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(15000)});
  for(const cookie of response.headers.getSetCookie()){
    const pair=cookie.split(';')[0],index=pair.indexOf('=');
    if(cookie.includes('Max-Age=0'))cookies.delete(pair.slice(0,index));else cookies.set(pair.slice(0,index),pair.slice(index+1));
  }
  const json=await response.json();return{response,json};
}
let result=await call('auth/login',{method:'POST',body:{email:credentials.email,password:credentials.password}});
check(result.response.status===403 && result.json.error.code==='GATE_REQUIRED','live login requires a gate');
result=await call('auth/gate',{method:'POST',origin:'https://not-the-chapter.example.test',body:{code:credentials.gateCode}});
check(result.response.status===403,'live origin validation rejects cross-origin mutations');
result=await call('auth/gate',{method:'POST',body:{code:credentials.gateCode}});
check(result.response.status===200 && result.json.data.gateValid===true
  && Object.keys(result.json.data).length===1 && jar.has('gdg_dev_gate'),'live gate verifies the protected hash and sets a cookie');
result=await call('auth/login',{method:'POST',body:{email:credentials.email,password:credentials.password,role:'super_admin'}});
check(result.response.status===400,'live login rejects a supplied role');
result=await call('auth/login',{method:'POST',body:{email:credentials.email,password:credentials.password}});
check(result.response.status===200 && result.json.data.user.role==='super_admin' && jar.has('gdg_dev_session'),'live password verification creates a server session');
const csrf=result.json.data.csrfToken,raw=jar.get('gdg_dev_session');
check(result.response.headers.get('cache-control')==='no-store' && result.response.headers.get('x-request-id')===result.json.meta.requestId
  && !JSON.stringify(result.json).includes(raw) && !JSON.stringify(result.json).includes('password_hash'),'live session response is private and contains no bearer token or password hash');
const db=serverDatabase(env);
const {data:session,error}=await db.from('admin_sessions').select('id,token_hash').eq('token_hash',tokenHash(raw)).single();
check(!error && session.token_hash===tokenHash(raw) && session.token_hash!==raw,'live database stores only the opaque token hash');
const {data:csrfRow,error:csrfError}=await db.from('csrf_tokens').select('session_id,token_hash').eq('session_id',session.id).single();
check(!csrfError && csrfRow.token_hash===tokenHash(csrf),'live CSRF is hashed and bound to the session');
result=await call('auth/session',{csrf});
check(result.response.status===200 && result.json.data.user.email===credentials.email && Array.isArray(result.json.data.memberships),'live session resolves current account and memberships');
result=await call('auth/session',{cookies:new Map([['gdg_admin','{"role":"super_admin"}']])});
check(result.response.status===401,'live unsigned identity cookies cannot authenticate');
result=await call('auth/session',{method:'DELETE'});
check(result.response.status===403 && result.json.error.code==='CSRF_INVALID','live logout requires the bound CSRF token');
result=await call('auth/session',{method:'DELETE',csrf});
check(result.response.status===200 && jar.size===0,'live logout revokes the session and clears both cookies');
result=await call('auth/session',{cookies:new Map([['gdg_dev_session',raw]])});
check(result.response.status===401,'a replayed logged-out cookie is rejected');
await mkdir(path.join(root,'.docs/phase0'),{recursive:true});
await writeFile(path.join(root,'.docs/phase0/local-auth-integration.json'),JSON.stringify({
  note:'Real HTTP through Vite proxy to Node API and dedicated local Supabase. No mock store. No provider emails or cloud writes.',
  tests:evidence,
},null,2)+'\n');
