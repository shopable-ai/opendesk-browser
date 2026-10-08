import {createDemoHttpServer} from '/Users/shopme/Documents/workspace/opendesk-browser-r72-axiosx/examples/tasks/http-test-server.mjs';
import {appendFileSync} from 'node:fs';
const path='/Users/shopme/Documents/workspace/opendesk-browser-r72-axiosx/docs/framework/evidence/r72-axiosx-01a11c27/http-requests.jsonl';
let sequence=0;
const server=createDemoHttpServer();
server.on('request',(req,res)=>{const id=++sequence,at=new Date().toISOString();let body='';req.on('data',b=>{if(body.length<16384)body+=b.toString();});const record=state=>appendFileSync(path,JSON.stringify({at,id,method:req.method,url:req.url,body,status:res.statusCode,state})+'\n');res.once('finish',()=>record('finish'));res.once('close',()=>{if(!res.writableFinished)record('closed-before-response');});});
server.listen(43111,'127.0.0.1',()=>console.log('observing existing HTTP fixture on 43111'));
