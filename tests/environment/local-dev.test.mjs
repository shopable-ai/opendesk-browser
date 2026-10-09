import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {PassThrough} from 'node:stream';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {serveMcp,MCP_TOOLS} from '../../native-agent/local-dev/mcp.mjs';
import {sha256,snapshotFileSystem} from '../../native-agent/local-dev/snapshot.mjs';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {manifestLocation} from '../../native-agent/locations.mjs';
function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-local-dev-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pkg={name:'local-example',version:'1.0.0',type:'module',private:true,description:'Local source fixture',opendesk:{format:'opendesk.project.v1',id:'sample.local-dev',runtimeKind:'controller',sourceFormat:'esm',entry:'src/main.js',siteOrigins:['https://example.test'],permissions:['page.automation'],paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}}};
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
 const put=(file,text)=>fs.writeFileSync(path.join(root,file),text);
 put('src/main.js','import {value} from "./value.js"; export default async function(){ return {value}; }');
 put('src/value.js','export const value=1;');
 const resolver=new LocalDevResolver({allowedPaths:[root]});const binding=resolver.attach({path:root});
 return {root,put,resolver,binding,pkg};
}
const value=async source=>{const context=vm.createContext({page:{},params:{},axiosx:{},AppStorage:{},AppLocal:{},storage:{}});return vm.runInContext(source+'\nmain()',context);};
test('multi-file fresh source, dependency edits, graph edits, cache and zero handoff artifacts',async t=>{
 const p=project(t);const first=await p.resolver.resolve(p.binding.bindingId);
 assert.equal((await value(first.sourceUtf8)).value,1);assert.equal(first.sourceHash,sha256(first.sourceUtf8));assert.equal(first.cacheHit,false);
 assert.equal((await p.resolver.resolve(p.binding.bindingId)).cacheHit,true);
 p.put('src/value.js','export const value=2;');const second=await p.resolver.resolve(p.binding.bindingId);
 assert.equal((await value(second.sourceUtf8)).value,2);assert.notEqual(second.sourceHash,first.sourceHash);assert.notEqual(second.inputHash,first.inputHash);
 p.put('src/next.js','export const value=3;');p.put('src/main.js','import {value} from "./next.js"; export default async function(){return {value}}');
 const third=await p.resolver.resolve(p.binding.bindingId);assert.equal((await value(third.sourceUtf8)).value,3);
 assert.ok(third.files.some(x=>x.path==='src/next.js'));assert.ok(!third.files.some(x=>x.path==='src/value.js'));
 assert.deepEqual(fs.readdirSync(p.root).sort(),['package.json','src']);
 assert.equal((await value(first.sourceUtf8)).value,1,'prior frozen source never mutates');
});
test('invalid/missing source never silently reuses last good cache',async t=>{
 const p=project(t);await p.resolver.resolve(p.binding.bindingId);
 p.put('src/value.js','export const value=;');await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_PROJECT_SYNTAX'});
 fs.unlinkSync(path.join(p.root,'src/value.js'));await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_PROJECT_FILE'});
});
test('changes during resolution fail before execution, including same-length bytes',async t=>{
 const p=project(t);await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId,{beforeVerify:()=>p.put('src/value.js','export const value=2;')}),{code:'E_PROJECT_CHANGED'});
 assert.equal((await value((await p.resolver.resolve(p.binding.bindingId)).sourceUtf8)).value,2);
});
test('directory traversal, sensitive files and symlinks cannot enter the frozen graph',async t=>{
 const p=project(t);p.put('src/main.js','import "../../escape.js"; export default async function(){}');
 await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_PROJECT_PATH'});
 p.put('.env.js','export const key="secret";');p.put('src/main.js','import "../.env.js"; export default async function(){}');
 await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_DEV_SENSITIVE'});
 p.put('src/main.js','import "./link.js"; export default async function(){}');fs.symlinkSync(path.join(p.root,'src/value.js'),path.join(p.root,'src/link.js'));
 await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_DEV_SYMLINK'});
 assert.throws(()=>p.resolver.attach({path:os.tmpdir()}),{code:'E_DEV_AUTH'});
});
test('no shell/config execution and unsupported dynamic module paths fail explicitly',async t=>{
 const p=project(t);p.put('webpack.config.js','throw new Error("must never execute")');p.pkg.scripts={build:'touch SHOULD_NOT_EXIST'};p.put('package.json',JSON.stringify(p.pkg));
 await p.resolver.resolve(p.binding.bindingId);assert.equal(fs.existsSync(path.join(p.root,'SHOULD_NOT_EXIST')),false);
 p.put('src/main.js','export default async function(){return import("./value.js")}');await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_PROJECT_DYNAMIC_IMPORT'});
 p.put('src/main.js','export default async function(){return new URL("./secret.js",import.meta.url)}');await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_DEV_DYNAMIC_CODE'});
});
test('memory compiler cannot fetch an undeclared real filesystem file',async()=>{
 const vfs=snapshotFileSystem(new Map([['/project/src/main.js',Buffer.from('safe')]]));
 await new Promise(resolve=>vfs.readFile('/etc/passwd',error=>{assert.equal(error.code,'ENOENT');resolve();}));
});
test('single-file Controller uses byte-identical source without package.json',async t=>{
 const p=project(t),file=path.join(p.root,'single.js'),source='async function main(){return 7}\n';fs.writeFileSync(file,source);
 const r=new LocalDevResolver({allowedPaths:[file]});const b=r.attach({path:file,runtimeKind:'controller',siteOrigin:'https://example.test'});
 const out=await r.resolve(b.bindingId);assert.equal(out.sourceUtf8,source);assert.equal(out.sourceHash,sha256(source));assert.equal(out.sourceMapUtf8,null);
 r.detach(b.bindingId);await assert.rejects(()=>r.resolve(b.bindingId),{code:'E_DEV_DETACHED'});
});
function sessionFixture(p,{unknown=false,hashMismatch=false}={}){
 const calls=[];let executed,selected;
 const request=async(method,params,requestId)=>{
  calls.push({method,params,requestId});
  let result;
  if(method==='target.current')result={registrationId:'host-one',target:{origin:'https://example.test',url:'https://example.test/',documentId:'doc-one',windowId:1,tabId:2,frameId:0}};
  else if(method==='run.start'){
   executed=params.sourceHash;selected=params.target;
   if(unknown)return {requestId,error:{code:'E_EFFECT_UNKNOWN',message:'ACK lost',outcome:'OUTCOME_UNKNOWN'}};
   result={runId:'run-one',revision:{sourceHash:hashMismatch?'0'.repeat(64):executed},state:'running'};
  }else if(method==='run.get')result={run:{runId:'run-one',target:{...selected,allowedOrigin:selected.origin},revision:{sourceHash:executed},resultId:'result-one',retirementState:'released'},results:[{tag:'controller-result',runId:'run-one',resultId:'result-one',revision:{sourceHash:executed},outcome:{ok:true,valueWire:encodeValue({value:1})}}]};
  return {v:1,kind:'response',requestId,result};
 };
 return {calls,session:new LocalDevSession({resolver:p.resolver,request})};
}
test('Controller session forwards to original Native run.start and checks own durable result hash',async t=>{
 const p=project(t),{calls,session}=sessionFixture(p);const started=await session.run({bindingId:p.binding.bindingId,requestId:'intent-one'});
 assert.equal(started.runId,'run-one');assert.deepEqual(calls.map(x=>x.method),['target.current','run.start']);
 p.put('src/value.js','export const value=9;');const result=await session.result({runId:'run-one'});
 assert.equal(result.sourceHash,started.source.sourceHash);assert.equal(result.value.value,1);
 await assert.rejects(()=>session.run({bindingId:p.binding.bindingId,requestId:'intent-one'}),{code:'E_EFFECT_UNKNOWN'});
 assert.equal(calls.filter(x=>x.method==='run.start').length,1);
});
test('unknown effects, source hash mismatch and Native errors are never retried',async t=>{
 const p=project(t),{calls,session}=sessionFixture(p,{unknown:true});
 await assert.rejects(()=>session.run({bindingId:p.binding.bindingId,requestId:'unknown'}),{code:'E_EFFECT_UNKNOWN'});
 await assert.rejects(()=>session.run({bindingId:p.binding.bindingId,requestId:'unknown'}),{code:'E_EFFECT_UNKNOWN'});
 assert.equal(calls.filter(x=>x.method==='run.start').length,1);
 const wrong=sessionFixture(p,{hashMismatch:true});await assert.rejects(()=>wrong.session.run({bindingId:p.binding.bindingId,requestId:'wrong'}),{code:'E_DEV_HASH'});
});
test('MCP uses actual protocol negotiation, tools/list and standard tool errors on clean stdout',async t=>{
 const p=project(t),input=new PassThrough(),output=new PassThrough(),messages=[];let text='';
 output.on('data',chunk=>{text+=chunk;let index;while((index=text.indexOf('\n'))>=0){messages.push(JSON.parse(text.slice(0,index)));text=text.slice(index+1);}});
 const server=serveMcp({input,output,session:new LocalDevSession({resolver:p.resolver,request:async()=>{throw Object.assign(new Error('not connected'),{code:'E_NATIVE_NOT_READY'});}})});t.after(()=>server.close());
 const send=value=>input.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
 send({id:1,method:'initialize',params:{protocolVersion:'2026-07-28',clientInfo:{name:'test',version:'1'},capabilities:{}}});
 send({method:'notifications/initialized'});send({id:2,method:'tools/list'});
 send({id:3,method:'tools/call',params:{name:'opendesk.dev.run',arguments:{bindingId:p.binding.bindingId,requestId:'mcp-run'}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(messages.find(x=>x.id===1).result.protocolVersion,'2025-11-25');
 assert.equal(messages.find(x=>x.id===2).result.tools.length,7);assert.equal(MCP_TOOLS.length,7);
 const failed=messages.find(x=>x.id===3);assert.equal(failed.result.isError,true);assert.equal(failed.result.structuredContent.error.code,'E_NATIVE_NOT_READY');
 assert.deepEqual(JSON.parse(failed.result.content[0].text),failed.result.structuredContent);
});
test('native manifest location follows OS, browser variant and explicit isolated profile',()=>{
 assert.equal(manifestLocation('cft',null,{platform:'linux',home:'/home/test'}),'/home/test/.config/google-chrome-for-testing/NativeMessagingHosts/com.shopable.opendesk_browser.agent.json');
 assert.match(manifestLocation('cft','/isolated/profile',{platform:'darwin',home:'/Users/test'}),/^\/isolated\/profile\/NativeMessagingHosts/);
 assert.throws(()=>manifestLocation('chrome','relative',{platform:'linux'}),{code:'E_PROFILE_PATH'});
});

test('transport throw after admission remains OUTCOME_UNKNOWN with original request identity',async t=>{
 const p=project(t),base=sessionFixture(p);const request=base.session.request;
 base.session.request=async(method,params,id)=>{if(method==='run.start')throw Object.assign(new Error('lost ACK'),{code:'E_EFFECT_UNKNOWN'});return request(method,params,id);};
 await assert.rejects(()=>base.session.run({bindingId:p.binding.bindingId,requestId:'transport-unknown'}),error=>error.code==='E_EFFECT_UNKNOWN'&&error.outcome==='OUTCOME_UNKNOWN'&&error.requestId==='transport-unknown');
 assert.equal((await base.session.diagnostics({bindingId:p.binding.bindingId})).lastError.outcome,'OUTCOME_UNKNOWN');
});
test('legacy Controller await body is validated without changing its execution bytes',async t=>{
 const p=project(t),file=path.join(p.root,'legacy.js'),source='return {title: await page.title()};';fs.writeFileSync(file,source);
 const resolver=new LocalDevResolver({allowedPaths:[file]}),b=resolver.attach({path:file,runtimeKind:'controller',siteOrigin:'https://example.test'});
 assert.equal((await resolver.resolve(b.bindingId)).sourceUtf8,source);
});
test('repeat attach is idempotent during resolution; runtime identity change is explicit',async t=>{
 const p=project(t);await p.resolver.resolve(p.binding.bindingId,{beforeVerify:()=>p.resolver.attach({path:p.root})});
 p.pkg.opendesk.id='other.project';p.put('package.json',JSON.stringify(p.pkg));
 await assert.rejects(()=>p.resolver.resolve(p.binding.bindingId),{code:'E_DEV_CONFLICT'});
});
