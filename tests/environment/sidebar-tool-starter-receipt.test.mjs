import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {checkCompiledToolBuildReady} from '../../scripts/build-sidebar-tool.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t,kind){
  const root=await realpath(await mkdtemp(join(tmpdir(),'opendesk-starter-receipt-')));
  t.after(async()=>{
    try{assert.equal(await readFile(join(root,kind+'-notes-starter.opendesk-tool.json'),'utf8'),'original formal package');}
    finally{await rm(root,{recursive:true,force:true});}
  });
  await mkdir(join(root,'src'));await mkdir(join(root,'dist'));
  const entry=kind==='react'?'src/main.jsx':'src/App.vue';
  const original=kind==='react'?'throw Error("fixture source must never execute");\nconst app=<div/>;':
    '<script>throw Error("fixture source must never execute");</script><template><div/></template>';
  const config={id:kind+'-notes-starter',version:'1.0.0',title:'Fixture',description:'Receipt fixture',capabilities:[],
    files:{html:'src/root.html',css:'dist/tool.css',js:'dist/tool.js'}};
  const configText=await readFile(new URL('../../examples/sidebar-tools/'+kind+'-starter/vite.config.mjs',import.meta.url),'utf8');
  for(const [name,text] of Object.entries({[entry]:original,'src/root.html':'<main>fixture</main>',
    'src/style.css':'main{color:blue}','package.json':'{"type":"module"}',
    'package-lock.json':'{"lockfileVersion":3}','tool.config.json':JSON.stringify(config),
    'vite.config.mjs':configText,'dist/tool.js':'throw Error("compiled fixture must never execute");',
    'dist/tool.css':'main{color:blue}',[kind+'-notes-starter.opendesk-tool.json']:'original formal package'}))
    await writeFile(join(root,name),text);
  // Load the actual trusted plugin implementation. Replace only Vite wrappers
  // and the project root; no Vite build, npm hook, or fixture source is loaded.
  const moduleText=configText.replace("import {defineConfig} from 'vite';",'const defineConfig=value=>value;')
    .replace("import vue from '@vitejs/plugin-vue';","const vue=()=>({name:'fixture-vue-wrapper'});")
    .replace('const root=dirname(fileURLToPath(import.meta.url));','const root='+JSON.stringify(root)+';');
  const loaded=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
  const plugin=loaded.default.plugins.find(item=>item.name==='opendesk-tool-build-receipt'),watched=[];
  const context={addWatchFile:path=>watched.push(path)};
  const receipt=async()=>JSON.parse(await readFile(join(root,'dist/build-ready.json'),'utf8'));
  const start=()=>plugin.buildStart.call(context);
  const ready=async()=>{await start();await plugin.buildEnd();await plugin.writeBundle();return receipt();};
  const check=()=>checkCompiledToolBuildReady(root,config);
  return {root,entry,plugin,watched,start,ready,receipt,check};
}

for(const kind of ['react','vue']){
  test(`${kind} receipt binds both successful builds to current source and output bytes`,async t=>{
    const f=await fixture(t,kind),first=await f.ready();
    assert.equal(first.format,'opendesk.ui-build-ready.v1');assert.equal(first.state,'ready');
    assert.match(first.buildId,/^[a-f0-9-]{36}$/);
    for(const name of [f.entry,'src/style.css','src/root.html','vite.config.mjs','tool.config.json','package.json','package-lock.json']){
      const bytes=await readFile(join(f.root,name));
      assert.deepEqual(first.sources[name],{bytes:bytes.length,sha256:sha(bytes)});
      assert.ok(f.watched.includes(join(f.root,name)));
    }
    for(const name of ['dist/tool.js','dist/tool.css']){
      const bytes=await readFile(join(f.root,name));
      assert.deepEqual(first.files[name],{bytes:bytes.length,sha256:sha(bytes)});
    }
    assert.equal((await f.check()).buildId,first.buildId);
    await writeFile(join(f.root,'src/style.css'),'main{color:red}');
    await writeFile(join(f.root,'dist/tool.css'),'main{color:red}');
    const second=await f.ready();assert.notEqual(second.buildId,first.buildId);
    assert.notDeepEqual(second.sources,first.sources);assert.notDeepEqual(second.files,first.files);
    assert.equal((await f.check()).buildId,second.buildId);
    assert.deepEqual((await readdir(join(f.root,'dist'))).sort(),['build-ready.json','tool.css','tool.js']);
  });

  test(`${kind} building/error receipts invalidate retained old outputs even after source is restored`,async t=>{
    const f=await fixture(t,kind),first=await f.ready(),oldOutput=await readFile(join(f.root,'dist/tool.js'));
    const originalSource=await readFile(join(f.root,f.entry));
    await writeFile(join(f.root,f.entry),'const broken = ;');
    await f.start();const building=await f.receipt();
    assert.equal(building.state,'building');assert.notEqual(building.buildId,first.buildId);
    assert.deepEqual(building.files,{});await assert.rejects(f.check(),{code:'E_TOOL_BUILDING'});
    let syntaxError;try{new Script(await readFile(join(f.root,f.entry),'utf8'));}catch(error){syntaxError=error;}
    assert.ok(syntaxError instanceof SyntaxError);
    await f.plugin.buildEnd(syntaxError);const failed=await f.receipt();
    assert.equal(failed.state,'error');assert.equal(failed.buildId,building.buildId);
    assert.deepEqual(failed.files,{});assert.ok(failed.message.length<=500);
    assert.deepEqual(await readFile(join(f.root,'dist/tool.js')),oldOutput);
    await writeFile(join(f.root,f.entry),originalSource);
    await assert.rejects(f.check(),{code:'E_TOOL_BUILD_FAILED'});
    const recovered=await f.ready();assert.equal(recovered.state,'ready');
    assert.notEqual(recovered.buildId,failed.buildId);await f.check();
  });

  test(`${kind} stale successful receipt rejects changed authored input without executing it`,async t=>{
    const f=await fixture(t,kind);await f.ready();
    await writeFile(join(f.root,f.entry),'invalid new source; never execute this');
    await assert.rejects(f.check(),/source changed/);
  });

  test(`${kind} mid-build edits and newly added inputs cannot announce ready`,async t=>{
    for(const change of ['edit','add','remove']){
      const f=await fixture(t,kind);await f.ready();await f.start();
      if(change==='edit')await writeFile(join(f.root,'src/style.css'),'main{color:red}');
      if(change==='add')await writeFile(join(f.root,'src/new.js'),'throw Error("must not run")');
      if(change==='remove')await rm(join(f.root,'src/style.css'));
      await assert.rejects(f.plugin.writeBundle(),/inputs changed/);
      assert.equal((await f.receipt()).state,'error');await assert.rejects(f.check(),{code:'E_TOOL_BUILD_FAILED'});
    }
  });

  test(`${kind} input discovery, render and output failures all replace prior readiness`,async t=>{
    for(const failure of ['input','render','output']){
      const f=await fixture(t,kind);await f.ready();
      if(failure==='input'){
        await rm(join(f.root,'package.json'));await assert.rejects(f.start(),/ENOENT/);
      }else{
        await f.start();
        if(failure==='render')await f.plugin.renderError(Error('x'.repeat(800)));
        else{await rm(join(f.root,'dist/tool.css'));await assert.rejects(f.plugin.writeBundle(),/ENOENT/);}
      }
      const receipt=await f.receipt();assert.equal(receipt.state,'error');
      assert.deepEqual(receipt.files,{});assert.ok(receipt.message.length<=500);
      await assert.rejects(f.check(),{code:'E_TOOL_BUILD_FAILED'});
    }
  });
}
