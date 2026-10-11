import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from './candidate-fixed/node_modules/acorn/dist/acorn.mjs';
const out=new URL('../../docs/framework/workstreams/evidence/ui-r23-final-01a1299e/native-turn2/',import.meta.url);
const launch=JSON.parse(await fs.readFile(new URL('chrome-launch.json',out),'utf8'));
const identity=JSON.parse(await fs.readFile(new URL('chrome-identity.json',out),'utf8'));
const [port,endpoint]=(await fs.readFile(launch.profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const code=await fs.readFile(new URL('./candidate-fixed/dist/production/native-agent/transport.js',import.meta.url),'utf8');
const ast=parse(code,{ecmaVersion:'latest'}),points=[];
function visit(node){
 if(!node||typeof node!=='object')return;
 if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'){
  const prop=node.callee.property.name,arg=node.arguments[0];
  if(prop==='postMessage'&&arg?.type==='CallExpression'&&arg.callee.type==='MemberExpression'&&arg.callee.object.name==='JSON'&&arg.callee.property.name==='parse'&&arg.arguments[0]?.type==='Identifier'){
   const name=arg.arguments[0].name;
   if(code.slice(Math.max(0,node.start-1000),node.start).includes('kind:"files.request"'))points.push({direction:'out',column:node.start,condition:`console.log('__R23_NATIVE_OUT__',${name})||false`});
  }
  if(prop==='addListener'&&node.callee.object.type==='MemberExpression'&&node.callee.object.property.name==='onMessage'&&arg?.type==='ArrowFunctionExpression'&&arg.body.type==='BlockStatement'&&code.slice(node.start,node.end).includes('kind')){
   const name=arg.params[0]?.name;
   if(name&&code.slice(Math.max(0,node.start-180),node.start).includes('connectNative'))points.push({direction:'in',column:arg.body.body[0].start,condition:`String(${name}?.kind).startsWith('files.')&&(console.log('__R23_NATIVE_IN__',JSON.stringify(${name})),false)`});
  }
 }
 for(const [key,value]of Object.entries(node))if(key!=='start'&&key!=='end'){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
}
visit(ast);if(points.length!==2)throw Error('Expected exact outbound and inbound sites '+JSON.stringify(points));
const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let n=0;const pending=new Map(),events=[];let writes=Promise.resolve();
ws.onmessage=({data})=>{
 const m=JSON.parse(data),p=pending.get(m.id);
 if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.j(Error(JSON.stringify(m.error))):p.r(m.result);return;}
 if(m.method==='Debugger.paused')throw Error('Observer must never pause execution');
 if(m.method==='Runtime.consoleAPICalled'){
  const args=m.params.args,tag=args[0]?.value;
  if(tag==='__R23_NATIVE_IN__'||tag==='__R23_NATIVE_OUT__'){
   const wire=JSON.parse(args[1].value),event={time:new Date().toISOString(),direction:tag.endsWith('IN__')?'in':'out',wire};events.push(event);
   writes=writes.then(()=>fs.appendFile(new URL('native-wire.jsonl',out),JSON.stringify(event)+'\n'));
  }
 }
};
const call=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j,timer:setTimeout(()=>j(Error('timeout '+method)),10000)});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const target=(await call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js');
const sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
await call('Runtime.enable',{},sessionId);await call('Debugger.enable',{},sessionId);
for(const point of points){point.installed=await call('Debugger.setBreakpointByUrl',{url:'chrome-extension://'+identity.extensionId+'/native-agent/transport.js',lineNumber:0,columnNumber:point.column,condition:point.condition},sessionId);}
await fs.writeFile(new URL('native-wire-observer.json',out),JSON.stringify({kind:'CDP conditional logpoint observation',pid:launch.pid,extensionId:identity.extensionId,packageHash:identity.packageHash,scriptSha256:createHash('sha256').update(code).digest('hex'),points,policy:'Only console logging of original Native wire; no DOM writes, synthetic events, native packet mutation, response replacement, or execution pauses'},null,2)+'\n');
console.log(JSON.stringify({status:'READY',points:points.map(p=>({direction:p.direction,locations:p.installed.locations}))}));
await new Promise(resolve=>{process.stdin.resume();process.stdin.once('data',resolve);});
for(const point of points)await call('Debugger.removeBreakpoint',{breakpointId:point.installed.breakpointId},sessionId);
await call('Debugger.disable',{},sessionId);await writes;await fs.writeFile(new URL('native-wire-summary.json',out),JSON.stringify({events:events.length,requests:events.filter(e=>e.direction==='out').length,responses:events.filter(e=>e.direction==='in').length},null,2)+'\n');ws.close();console.log(JSON.stringify({status:'STOPPED',events:events.length}));
