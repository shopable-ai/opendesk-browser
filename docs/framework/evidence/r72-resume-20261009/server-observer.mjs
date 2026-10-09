import {createDemoHttpServer} from '/Users/shopme/Documents/workspace/opendesk-browser-r72-resume/examples/tasks/http-test-server.mjs';
import {appendFileSync} from 'node:fs';
const port=Number(process.argv[2]??43111);const path='/Users/shopme/Documents/workspace/opendesk-browser-r72-resume/docs/framework/evidence/r72-resume-20261009/http-requests'+(port===43111?'':'-'+port)+'.jsonl';
let sequence=0;
const server=createDemoHttpServer();
server.on('request',(req,res)=>{const id=++sequence,at=new Date().toISOString();let body='';req.on('data',b=>{if(body.length<16384)body+=b.toString();});const record=state=>appendFileSync(path,JSON.stringify({at,id,port,method:req.method,url:req.url,body,status:res.statusCode,state})+'\n');res.once('finish',()=>record('finish'));res.once('close',()=>{if(!res.writableFinished)record('closed-before-response');});});
server.listen(port,'127.0.0.1',()=>console.log('observing existing HTTP fixture on '+port));
