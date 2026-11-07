// Test-only, passive synthetic page events; never calls Browser or Provider APIs.
import {createServer} from 'node:http';
import {mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Explicit fresh evidence directory required');
await mkdir(directory,{mode:0o700});
const events=[];let writes=Promise.resolve();
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:43114'){res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/events'){await writes;res.setHeader('content-type','application/json');res.end(JSON.stringify(events));return;}
  if(req.method!=='POST'||req.url!=='/events'||req.headers.origin!=='http://127.0.0.1:43111'){res.writeHead(403).end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error('oversize');}
  const value=JSON.parse(body);
  if(Object.keys(value).sort().join(',')!=='at,documentInstance,eventSeq,name,submits,type'||
    !/^[a-f0-9-]{36}$/.test(value.documentInstance)||!Number.isSafeInteger(value.eventSeq)||
    !['ready','input','submit','done','button-ready','pagehide'].includes(value.type)||
    typeof value.name!=='string'||value.name.length>40||!Number.isSafeInteger(value.submits))throw Error('schema');
  const entry={...value,receivedAt:new Date().toISOString()};
  writes=writes.then(()=>appendFile(resolve(directory,'events.jsonl'),JSON.stringify(entry)+'\n',{mode:0o600}));await writes;
  events.push(entry);res.writeHead(204).end();
 }catch{res.writeHead(400).end();}
});
await new Promise((yes,no)=>{server.once('error',no);server.listen(43114,'127.0.0.1',yes);});
console.log(JSON.stringify({ready:true,port:43114,directory}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{process.exitCode=0;}));
