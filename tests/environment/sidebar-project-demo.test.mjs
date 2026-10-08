import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {validateProgramProject} from '../../scripts/validate-program-project.mjs';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';
import {validateProgramDraft} from '../../src/ui/program-source.js';

const root='examples/programs/';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const temporary=()=>mkdtemp(join(tmpdir(),'opendesk-sidebar-demo-'));

test('three project folders: genuine ESM graphs and fixed CSS/JSON/PNG byte hashes',async()=>{
  const page=await validateProgramProject(root+'sidebar-page-demo');
  const controller=await validateProgramProject(root+'sidebar-controller-demo');
  const asset=await validateProgramProject(root+'sidebar-assets-contract');
  assert.equal(page.status,'AUTHORING_VALID_NOT_PACKAGED');
  assert.equal(page.runtimeKind,'page-userscript');
  assert.deepEqual(page.sources.map(row=>row.path),['src/fixture.js','src/main.js','src/proof.js']);
  assert.equal(page.installable,false);
  assert.equal(controller.runtimeKind,'controller');
  assert.deepEqual(controller.sources.map(row=>row.path),['src/main.js','src/params.js','src/search.js']);
  assert.equal(asset.installable,false);
  assert.deepEqual(asset.assets.map(row=>row.kind),['css','json','image']);
  for(const row of asset.assets){
    const bytes=await readFile(join(root,'sidebar-assets-contract',row.path));
    assert.equal(row.sha256,sha(bytes));
    assert.equal(row.bytes,bytes.length);
  }
  const png=await readFile(join(root,'sidebar-assets-contract/assets/mark.png'));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});

test('Page ESM bundles into USER_SCRIPT and repeated execution creates only one visible marker',async t=>{
  const out=await temporary();t.after(()=>rm(out,{recursive:true,force:true}));
  const built=await buildProgramProject(root+'sidebar-page-demo',{outputDirectory:out});
  assert.equal(built.status,'BUILT_UNVERIFIED');
  assert.equal(built.installable,false);
  const code=await readFile(join(out,'program.js'),'utf8');
  assert.equal(sha(code),built.sourceHash);
  const draft=await validateProgramDraft(JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8')));
  assert.equal(draft.build.sourceHash,built.sourceHash);
  assert.equal(draft.sourceUtf8,code);
  assert.equal(draft.authoring.files.length,3);
  const compiled=await compileLockedPageSource({sourceUtf8:code,entryFormat:'async-main',entries:[]});
  assert.equal(compiled.world,'USER_SCRIPT');
  assert.equal(compiled.js.length,1);
  const mounted=new Map();let appendCount=0;
  const host={appendChild(node){appendCount++;mounted.set(node.id,node);}};
  const doc={
    location:{protocol:'http:',hostname:'127.0.0.1',port:'43111',pathname:'/demo-form.html'},
    querySelector(selector){
      if(selector==='#lab-text')return host;
      if(selector==='#sample-title')return {textContent:'  周末阅读清单  '};
      return null;
    },
    getElementById(id){return mounted.get(id)||null;},
    createElement(tag){return {tag,id:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;}};}
  };
  const run=()=>vm.runInNewContext(compiled.js[0].code,{document:doc});
  const first=await run();
  assert.deepEqual(JSON.parse(JSON.stringify(first)),{
    status:'PAGE_DEMO_OK',heading:'周末阅读清单',
    message:'多文件 Page 程序已运行 · 周末阅读清单'
  });
  assert.equal(mounted.get('opendesk-multifile-page-proof').textContent,first.message);
  await run();
  assert.equal(appendCount,1,'second preview must not append a duplicate');
  doc.location.pathname='/other-page.html';
  const skipped=await run();
  assert.equal(skipped.status,'SKIPPED_OUT_OF_SCOPE');
  assert.equal(appendCount,1);
});

test('Controller ESM emits a Task v1 Candidate and invokes only approved Locator methods',async t=>{
  const out=await temporary();t.after(()=>rm(out,{recursive:true,force:true}));
  const built=await buildProgramProject(root+'sidebar-controller-demo',{outputDirectory:out});
  assert.equal(built.status,'BUILT_UNVERIFIED');
  assert.equal(built.installable,false);
  assert.equal(built.candidateFile,'program.opendesk-task.json');
  const source=await readFile(join(out,'program.js'),'utf8');
  assert.equal(sha(source),built.sourceHash);
  const draft=await validateProgramDraft(JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8')));
  assert.equal(draft.runtimeKind,'controller');
  assert.equal(draft.sourceUtf8,source);
  assert.equal(draft.authoring.files.length,3);
  const task=await verifyTaskPackage(JSON.parse(await readFile(join(out,built.candidateFile),'utf8')));
  assert.equal(task.manifest.taskId,'sample.sidebar-controller-demo');
  assert.deepEqual(task.manifest.siteOrigins,['http://127.0.0.1:43111']);
  assert.equal(task.manifest.program.sourceHash,built.sourceHash);
  const calls=[];
  const page={
    getByLabel(label,options){
      assert.equal(label,'搜索关键词');assert.equal(options.exact,true);
      return {async fill(value){calls.push('fill:'+value);}};
    },
    getByRole(role,options){
      assert.equal(role,'button');assert.equal(options.name,'搜索');assert.equal(options.exact,true);
      return {async click(){calls.push('click');}};
    },
    getByText(value,options){
      assert.equal(value,'搜索完成');assert.equal(options.exact,true);
      return {async waitFor(opts){assert.equal(opts.state,'visible');calls.push('wait');}};
    },
    locator(selector){
      assert.ok(['#results','#search-count'].includes(selector));
      return {async textContent(){return selector==='#results'?'结果：OpenDesk':'提交次数：1';}};
    }
  };
  const AsyncBody=Object.getPrototypeOf(async function(){}).constructor;
  const execute=new AsyncBody('page','params','axiosx','AppStorage','AppLocal','storage',controllerProgramBody(source));
  const result=await execute(page,{keyword:'  OpenDesk  '},null,null,null,null);
  assert.deepEqual(result,{status:'CONTROLLER_DEMO_OK',keyword:'OpenDesk',result:'结果：OpenDesk',counter:'提交次数：1'});
  assert.deepEqual(calls,['fill:OpenDesk','click','wait']);
});

test('declared CSS/JSON/PNG are frozen into Page USER_SCRIPT without becoming installed',async t=>{
  const out=await temporary();t.after(()=>rm(out,{recursive:true,force:true}));
  const built=await buildProgramProject(root+'sidebar-assets-contract',{outputDirectory:out});
  assert.equal(built.status,'BUILT_UNVERIFIED');
  assert.equal(built.runtimeKind,'page-userscript');
  assert.equal(built.installable,false);
  assert.deepEqual(built.assets.map(row=>row.kind),['css','json','image']);
  const code=await readFile(join(out,'program.js'),'utf8');
  assert.equal(sha(code),built.sourceHash);
  assert.match(code,/data:image\/png;base64,/);
  const draft=await validateProgramDraft(
    JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8')));
  assert.equal(draft.sourceUtf8,code);
  assert.equal(draft.build.sourceHash,built.sourceHash);
  // Original import format and Task v1 are not extended by these authoring assets.
  assert.deepEqual(Object.keys(draft).sort(),
    ['authoring','build','format','project','runtimeKind','sourceUtf8']);
});
