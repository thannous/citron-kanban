// Small HTTP harness used by contract tests. The user-facing app runs in Next.js.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createService, allowLocalRequest } from './service.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
export async function createApp({storePath=join(root,'.runtime/contract-demo.json'),dataDir=join(root,'data')}={}) {
  const service=await createService({root,dataDir,storePath});
  return http.createServer(async(req,res)=>{
    const send=(status,data,type='application/json; charset=utf-8')=>{
      res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(type.startsWith('application/json')?JSON.stringify(data):data);
    };
    try {
      const host=req.headers.host||'';
      if(!allowLocalRequest(host,req.headers.origin,req.headers['sec-fetch-site']))return send(403,{error:'ORIGIN_DENIED'});
      const url=new URL(req.url,`http://${host}`);let body={};
      if(req.method==='POST'){
        if(req.headers['content-type']!=='application/json')return send(415,{error:'JSON_REQUIRED'});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return send(413,{error:'BODY_TOO_LARGE'});}
        try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'INVALID_JSON'});}
      }
      if(url.pathname.startsWith('/api/'))return send(200,await service.dispatch({method:req.method,path:url.pathname,mode:url.searchParams.get('mode')||'snapshot',body}));
      const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/model.js':['model.js','text/javascript; charset=utf-8'],'/standalone.js':['standalone.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
      if(req.method==='GET'&&files[url.pathname]){const[file,type]=files[url.pathname];return send(200,await readFile(join(root,'public',file)),type);}
      send(404,{error:'NOT_FOUND'});
    }catch(e){send(e.status||500,{error:e.code||'INTERNAL_ERROR',...e.details});}
  });
}
