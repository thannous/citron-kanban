import { join } from 'node:path';
import { createService, localDataDir, allowLocalRequest } from '../../../service.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
let servicePromise;
const respond = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request) {
  if (!allowLocalRequest(request.headers.get('host'),request.headers.get('origin'),request.headers.get('sec-fetch-site'))) return respond({error:'ORIGIN_DENIED'},403);
  try {
    let body={};
    if(request.method==='POST') {
      if(request.headers.get('content-type')!=='application/json') return respond({error:'JSON_REQUIRED'},415);
      const reader=request.body?.getReader();const decoder=new TextDecoder();let raw='',size=0;
      if(reader) { while(true) {const {value,done}=await reader.read();if(done) break;size+=value.byteLength;if(size>8192) {await reader.cancel();return respond({error:'BODY_TOO_LARGE'},413);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
      try{body=JSON.parse(raw||'{}');}catch{return respond({error:'INVALID_JSON'},400);}
    }
    if(!servicePromise) servicePromise=(async()=>{const root=process.cwd();const dataDir=await localDataDir(root);return createService({root,dataDir,storePath:process.env.DEMO_STORE_PATH||join(root,'.runtime',dataDir.endsWith('.private')?'private-demo.json':'fixture-demo.json')});})().catch(e=>{servicePromise=undefined;throw e;});
    const service=await servicePromise;
    const url=new URL(request.url);
    return respond(await service.dispatch({method:request.method,path:url.pathname,mode:url.searchParams.get('mode')||'snapshot',body}));
  }catch(e){return respond({error:e.code||'INTERNAL_ERROR',...e.details},e.status||500);}
}
export const GET=handle;
export const POST=handle;
