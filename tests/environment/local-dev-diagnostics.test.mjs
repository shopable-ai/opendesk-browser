import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {LocalDevSession} from '../../native-agent/local-dev/session.mjs';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';
import {controllerErrorLocation} from '../../native-agent/local-dev/error-location.mjs';

test('MCP diagnostics locate a real V8 failure in the admitted multi-file revision after disk edits', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'od-error-location-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'src'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'local-diagnostic',version:'1.0.0',private:true,type:'module',description:'Runtime error diagnostic fixture',opendesk:{format:'opendesk.project.v1',id:'sample.diagnostic',runtimeKind:'controller',sourceFormat:'esm',entry:'src/main.js',siteOrigins:['https://example.test'],permissions:['page.automation'],paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}}}));
  fs.writeFileSync(path.join(root,'src/main.js'),"import {fail} from './fail.js';\nexport default async function main(){return fail();}\n");
  fs.writeFileSync(path.join(root,'src/fail.js'),"export function fail(){\n  throw new Error('actual-local-failure');\n}\n");
  const resolver=new LocalDevResolver({allowedPaths:[root]}),binding=resolver.attach({path:root});
  const target={origin:'https://example.test',url:'https://example.test/',documentId:'doc-one',windowId:1,tabId:2,frameId:0};
  let frozen,error;
  const session=new LocalDevSession({resolver,request:async(method,params,requestId)=>{
    let result;
    if(method==='target.current')result={registrationId:'host-one',target};
    if(method==='run.start'){
      frozen=params.sourceHash;
      try{await new (Object.getPrototypeOf(async function(){}).constructor)('page','params','axiosx','AppStorage','AppLocal','storage',controllerProgramBody(params.source.sourceUtf8))({},{});}
      catch(cause){error={code:'E_CONTROL_EXECUTION',name:cause.name,message:cause.message,stack:cause.stack};}
      result={runId:'run-one',sourceKind:'draft',target,revision:{sourceHash:frozen},state:'running'};
    }
    if(method==='run.get')result={run:{runId:'run-one',target:{...target,allowedOrigin:target.origin},revision:{sourceHash:frozen},resultId:'result-one',state:'failed',retirementState:'released'},results:[{tag:'controller-result',runId:'run-one',resultId:'result-one',revision:{sourceHash:frozen},outcome:{ok:false,error}}]};
    return {v:1,kind:'response',requestId,result};
  }});
  await session.run({bindingId:binding.bindingId,requestId:'intent-error'});
  fs.writeFileSync(path.join(root,'src/fail.js'),"\n\n\nexport function fail(){return 'fixed';}\n");
  const result=await session.diagnostics({runId:'run-one'});
  assert.equal(result.error.message,'actual-local-failure');
  assert.deepEqual(result.results[0].outcome.error,error,'durable raw error remains intact');
  assert.equal(result.diagnostic.sourceHash,frozen);
  assert.match(result.diagnostic.location.file,/src\/fail.js$/);
  assert.equal(result.diagnostic.location.line,2);
  assert.ok(result.diagnostic.location.column>0);
});

test('single-file runtime coordinates use the original body and unrelated/missing stacks remain unmapped', async () => {
  const sourceUtf8="async function main(){\n  throw new Error('single-file');\n}\n";
  let error;
  try{await new (Object.getPrototypeOf(async function(){}).constructor)(controllerProgramBody(sourceUtf8))();}catch(cause){error=cause;}
  const resolved={sourceUtf8,sourceMapUtf8:null,entry:'single.js',sourceHash:'a'.repeat(64)};
  assert.deepEqual(controllerErrorLocation(error,resolved).location,{file:'single.js',line:2,column:9});
  for(const bad of [{message:'missing'},{stack:'Error\n at Worker (blob:null/x:4:9)'},{stack:'Error\n at main (eval at f (blob:null/x:1:2), <anonymous>:9999:1)'},{stack:'Error\n at main (eval at f (blob:null/x:1:2), <anonymous>:4:9999)'}])assert.equal(controllerErrorLocation(bad,resolved),null);
});
