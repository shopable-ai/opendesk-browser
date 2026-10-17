import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LocalDevResolver} from '../../native-agent/local-dev/resolver.mjs';
import {PAGE_FRAME_RESOURCES_LIMITS as limits,readPageFrameResources} from '../../src/scripting/user-scripts/page-frame-resources.js';

function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-local-frames-'));
  const pkg={name:'local-frames',version:'1.0.0',description:'Local frozen frame resources',private:true,type:'module',opendesk:{
    format:'opendesk.project.v1',id:'sample.local-frames',runtimeKind:'page-userscript',sourceFormat:'esm',entry:'main.js',
    pageRules:{matches:['https://example.test/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'},
    assets:[],pageFrames:[{resourceId:'renderer',path:'renderer.js'}]}};
  const write=(file,value)=>fs.writeFileSync(path.join(root,file),value);
  write('main.js','export default async function main(){return {version:1};}');
  const save=()=>write('package.json',JSON.stringify(pkg));save();
  const resolver=new LocalDevResolver({allowedPaths:[root]});
  const {bindingId}=resolver.attach({path:root});
  t.after(()=>{resolver.close();fs.rmSync(root,{recursive:true,force:true});});
  return {write,save,pkg,resolver,bindingId};
}
test('local Page resources use the existing wrapper, frozen identity and fresh bytes beyond the ordinary input budget',async t=>{
  const p=project(t),code='/*'+ '中'.repeat(1350000)+'*/';
  p.write('renderer.js',code);
  const first=await p.resolver.resolve(p.bindingId);
  assert.equal((await readPageFrameResources(first.sourceUtf8))[0].code,code);
  assert.equal(first.files.find(row=>row.path==='renderer.js').bytes,Buffer.byteLength(code));
  assert.equal((await p.resolver.resolve(p.bindingId)).cacheHit,true);
  p.write('renderer.js',code.replace('中','新'));
  await assert.rejects(p.resolver.validateFrozen(p.bindingId,first),{code:'E_PROJECT_CHANGED'});
  const second=await p.resolver.resolve(p.bindingId);
  assert.notEqual(second.sourceHash,first.sourceHash);assert.notEqual(second.inputHash,first.inputHash);
  assert.ok((await readPageFrameResources(second.sourceUtf8))[0].code.includes('新'));
});
test('local Page resources reject per-file and aggregate overflow',async t=>{
  const p=project(t);
  p.write('renderer.js','x'.repeat(limits.resourceBytes+1));
  await assert.rejects(p.resolver.resolve(p.bindingId),{code:'E_DEV_LIMIT'});
  p.write('renderer.js','x'.repeat(limits.totalBytes/2+1));
  p.write('second.js','x'.repeat(limits.totalBytes/2));
  p.pkg.opendesk.pageFrames.push({resourceId:'second',path:'second.js'});p.save();
  await assert.rejects(p.resolver.resolve(p.bindingId),{code:'E_DEV_LIMIT'});
});
