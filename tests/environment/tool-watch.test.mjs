import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publishSidebarToolStatus,stageSidebarTool} from '../../scripts/stage-sidebar-tool.mjs';
import {watchSidebarTool} from '../../scripts/watch-sidebar-tool.mjs';
const statusPath=root=>join(root,'opendesk-tool-preview/watch-test/status.json');
const readStatus=async root=>JSON.parse(await readFile(statusPath(root),'utf8'));
const until=async (condition,ms=2500)=>{
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){if(await condition())return;await new Promise(r=>setTimeout(r,20));}
  assert.ok(await condition(),'watch event was not observed');
};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'opendesk-tool-watch-'));
  await mkdir(join(root,'src'));
  const files={html:'src/root.html',css:'src/style.css',js:'src/main.js'};
  await writeFile(join(root,'src/root.html'),'<main>ready</main>');
  await writeFile(join(root,'src/style.css'),'main{color:blue}');
  await writeFile(join(root,'src/main.js'),'void 0;');
  await writeFile(join(root,'tool.config.json'),JSON.stringify({id:'watch-test',
    version:'1.0.0',title:'Watch',description:'No execution',capabilities:[],files}));
  await writeFile(join(root,'watch-test.opendesk-tool.json'),'original formal package');
  await writeFile(join(root,'package.json'),JSON.stringify({scripts:{build:'exit 99',watch:'exit 99'}}));
  return {root,files};
}
test('explicit foreground watcher publishes immutable snapshots only after actual source change',async t=>{
  const f=await fixture(),controller=new AbortController(),events=[];
  let run;
  t.after(async()=>{controller.abort();await run;await rm(f.root,{recursive:true,force:true});});
  run=watchSidebarTool(f.root,{intervalMs:50,signal:controller.signal,onEvent:e=>events.push(e)});
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===1);
  const first=events.find(e=>e.sha256);
  await until(async()=>{try{return (await readStatus(f.root)).sha256===first.sha256;}catch{return false;}});
  const initial=await readStatus(f.root);
  assert.deepEqual(Object.keys(initial).sort(),['format','id','message','sha256','state','updatedAt']);
  assert.equal(initial.format,'opendesk.tool-preview-status.v1');
  assert.equal(initial.id,'watch-test');
  assert.equal(initial.state,'ready');
  assert.equal(initial.message,'');
  assert.ok(Number.isFinite(Date.parse(initial.updatedAt)));
  const pointerMtime=(await stat(join(f.root,first.nativeLatest))).mtimeMs;
  await until(async()=>Date.parse((await readStatus(f.root)).updatedAt)>Date.parse(initial.updatedAt));
  assert.equal((await stat(join(f.root,first.nativeLatest))).mtimeMs,pointerMtime,'heartbeat does not republish');
  await writeFile(join(f.root,f.files.js),'throw new Error("must never execute");');
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===2);
  const second=events.filter(e=>e.sha256)[1];
  assert.notEqual(first.sha256,second.sha256);
  assert.equal(first.nativeLatest,second.nativeLatest);
  assert.equal((await readFile(join(f.root,second.nativeLatest),'utf8')).includes(second.sha256),true);
  await new Promise(resolve=>setTimeout(resolve,130));
  assert.equal(events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length,2,'published files do not retrigger the watcher');
  controller.abort();
  assert.equal((await run).stopped,true);
  const stopped=await readStatus(f.root);
  assert.equal(stopped.state,'stopped');
  assert.equal(stopped.sha256,events.filter(e=>e.sha256).at(-1).sha256);
  assert.equal(await readFile(join(f.root,'watch-test.opendesk-tool.json'),'utf8'),'original formal package');
  assert.equal((await readdir(join(f.root,'opendesk-tool-preview/watch-test'))).some(name=>name.endsWith('.tmp')),false);
});
test('invalid edited source does not advance latest pointer and may recover',async t=>{
  const f=await fixture(),controller=new AbortController(),events=[];
  let run;
  t.after(async()=>{controller.abort();await run;await rm(f.root,{recursive:true,force:true});});
  run=watchSidebarTool(f.root,{intervalMs:50,signal:controller.signal,onEvent:e=>events.push(e)});
  await until(()=>events.some(e=>e.state==='STAGED_NOT_INSTALLED'));
  const first=events.find(e=>e.sha256),pointer=join(f.root,first.nativeLatest);
  const existing=await readFile(pointer,'utf8');
  await writeFile(join(f.root,f.files.js),'const broken = ;');
  await until(()=>events.some(e=>e.state==='BUILD_OR_PACKAGE_FAILED'));
  await until(async()=>(await readStatus(f.root)).state==='error');
  const failed=await readStatus(f.root);
  assert.equal(failed.sha256,first.sha256);
  assert.match(failed.message,/invalid JavaScript/);
  await until(async()=>Date.parse((await readStatus(f.root)).updatedAt)>Date.parse(failed.updatedAt));
  assert.equal((await readStatus(f.root)).state,'error');
  assert.equal(await readFile(pointer,'utf8'),existing);
  await writeFile(join(f.root,f.files.js),'void 2;');
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===2);
  const recovered=events.filter(e=>e.sha256)[1];
  assert.notEqual(first.sha256,recovered.sha256);
  await until(async()=>{const status=await readStatus(f.root);return status.state==='ready'&&status.sha256===recovered.sha256;});
  assert.equal((await readStatus(f.root)).message,'');
  controller.abort();
  assert.equal((await run).stopped,true);
  const stopped=await readStatus(f.root);
  assert.equal(stopped.state,'stopped');
  assert.equal(stopped.sha256,events.filter(e=>e.sha256).at(-1).sha256);
  assert.equal(await readFile(join(f.root,'watch-test.opendesk-tool.json'),'utf8'),'original formal package');
  assert.equal((await readdir(join(f.root,'opendesk-tool-preview/watch-test'))).some(name=>name.endsWith('.tmp')),false);
});

test('initial syntax failure reports null SHA and abort promptly publishes stopped',async t=>{
  const f=await fixture(),controller=new AbortController(),events=[];
  await writeFile(join(f.root,f.files.js),'function broken( {');
  let run;
  t.after(async()=>{controller.abort();await run;await rm(f.root,{recursive:true,force:true});});
  run=watchSidebarTool(f.root,{intervalMs:60000,signal:controller.signal,onEvent:e=>events.push(e)});
  await until(async()=>{try{return (await readStatus(f.root)).state==='error';}catch{return false;}});
  assert.equal((await readStatus(f.root)).sha256,null);
  await assert.rejects(readFile(join(f.root,'opendesk-tool-preview/watch-test/latest.json')),{code:'ENOENT'});
  const start=Date.now();
  controller.abort();await run;
  assert.ok(Date.now()-start<1000,'abort interrupts polling sleep');
  assert.equal((await readStatus(f.root)).state,'stopped');
  assert.equal((await readStatus(f.root)).sha256,null);
  assert.equal(events.some(e=>e.state==='STAGED_NOT_INSTALLED'),false);
});

test('status messages are bounded and a pre-aborted watch does not stage',async t=>{
  const f=await fixture();t.after(()=>rm(f.root,{recursive:true,force:true}));
  await publishSidebarToolStatus(f.root,{id:'watch-test',state:'error',message:'错'.repeat(1000)});
  const failed=await readStatus(f.root);
  assert.equal(failed.message.length,500);
  assert.equal(failed.sha256,null);
  assert.ok((await stat(statusPath(f.root))).size<32768);
  const controller=new AbortController();controller.abort();
  await watchSidebarTool(f.root,{signal:controller.signal});
  assert.equal((await readStatus(f.root)).state,'stopped');
  await assert.rejects(readFile(join(f.root,'opendesk-tool-preview/watch-test/latest.json')),{code:'ENOENT'});
});

test('a restarted watcher retains the previous successful SHA on build failure',async t=>{
  const f=await fixture(),controller=new AbortController();
  let run;
  t.after(async()=>{controller.abort();await run;await rm(f.root,{recursive:true,force:true});});
  const first=await stageSidebarTool(f.root);
  const pointer=await readFile(join(f.root,first.nativeLatest),'utf8');
  await writeFile(join(f.root,f.files.js),'const broken = ;');
  run=watchSidebarTool(f.root,{intervalMs:50,signal:controller.signal});
  await until(async()=>{try{return (await readStatus(f.root)).state==='error';}catch{return false;}});
  assert.equal((await readStatus(f.root)).sha256,first.sha256);
  controller.abort();await run;
  assert.equal((await readStatus(f.root)).sha256,first.sha256);
  assert.equal((await readStatus(f.root)).state,'stopped');
  assert.equal(await readFile(join(f.root,first.nativeLatest),'utf8'),pointer);
});
