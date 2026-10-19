import { createServer } from 'node:http';
import handler from '../server/handler.mjs';

const port=Number(process.env.LOCAL_API_PORT || 8081);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local API port.');
const server=createServer((request,response)=>{
  // Loopback only. No CORS relaxation and no user-controlled upstream proxy.
  if(!request.url?.startsWith('/api/v1/')){response.writeHead(404);response.end();return;}
  handler(request,response).catch(()=>{
    if(!response.headersSent)response.writeHead(500,{'Cache-Control':'no-store'});
    response.end();
  });
});
server.requestTimeout=15000;
server.headersTimeout=10000;
server.listen(port,'127.0.0.1',()=>console.info(`Local versioned API listening at http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
