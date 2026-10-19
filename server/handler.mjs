import { createAuthHandler,requireSession,requireCsrf } from './auth.mjs';
import { serverConfig } from './config.mjs';
import { serverDatabase } from './db/client.mjs';
import { SecurityStore } from './db/security-store.mjs';
import { ApiError,apiBoundary,allowMethod,checkOrigin,jsonBody,sendJson } from './lib/http.mjs';
import { hashSecret } from './lib/security.mjs';
import { z } from 'zod';

export function applicationHandler({store,config,log}={}) {
  const auth=createAuthHandler({store,config,log});
  return async(request,response)=>{
    const pathname=new URL(request.url,config.origin).pathname;
    if(pathname.startsWith('/api/v1/auth/'))return auth(request,response);
    return apiBoundary(request,response,async(requestId)=>{
      checkOrigin(request,config.origin,{mutation:!['GET','HEAD'].includes(request.method)});
      if(pathname==='/api/v1/admin/security/gate') {
        allowMethod(request,response,['POST']);
        const session=await requireSession(request,store,config);
        await requireCsrf(request,session,store);
        if(session.user.role!=='super_admin')throw new ApiError(403,'FORBIDDEN','This action is not allowed.');
        const {code}=await jsonBody(request,z.object({code:z.string().min(24).max(128)}).strict(),4096);
        await store.rotateGate(session.user.id,await hashSecret(code),requestId);
        return sendJson(response,200,{rotated:true},requestId);
      }
      throw new ApiError(404,'NOT_FOUND','This endpoint was not found.');
    },{log});
  };
}
let configured;
export default async function handler(request,response) {
  try {
    configured ||= applicationHandler({config:serverConfig(),store:new SecurityStore(serverDatabase()),
      log:(record)=>console.info(JSON.stringify(record))});
  } catch(error) {
    return apiBoundary(request,response,async()=>{throw error;});
  }
  return configured(request,response);
}
