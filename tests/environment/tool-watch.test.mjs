import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {watchSidebarTool} from '../../scripts/watch-sidebar-tool.mjs';
const until=async (condition,ms=2500)=>{
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){if(condition())return;await new Promise(r=>setTimeout(r,20));}
  assert.ok(condition(),'watch event was not observed');
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
  return {root,files};
}
test('explicit foreground watcher publishes immutable snapshots only after actual source change',async t=>{
  const f=await fixture(),controller=new AbortController(),events=[];
  t.after(async()=>{controller.abort();await rm(f.root,{recursive:true,force:true});});
  const run=watchSidebarTool(f.root,{intervalMs:50,signal:controller.signal,onEvent:e=>events.push(e)});
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===1);
  const first=events.find(e=>e.sha256);
  await writeFile(join(f.root,f.files.js),'void 1;');
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===2);
  const second=events.filter(e=>e.sha256)[1];
  assert.notEqual(first.sha256,second.sha256);
  assert.equal(first.nativeLatest,second.nativeLatest);
  assert.equal((await readFile(join(f.root,second.nativeLatest),'utf8')).includes(second.sha256),true);
  await new Promise(resolve=>setTimeout(resolve,130));
  assert.equal(events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length,2,'published files do not retrigger the watcher');
  controller.abort();await run;
});
test('invalid edited source does not advance latest pointer and may recover',async t=>{
  const f=await fixture(),controller=new AbortController(),events=[];
  t.after(async()=>{controller.abort();await rm(f.root,{recursive:true,force:true});});
  const run=watchSidebarTool(f.root,{intervalMs:50,signal:controller.signal,onEvent:e=>events.push(e)});
  await until(()=>events.some(e=>e.state==='STAGED_NOT_INSTALLED'));
  const first=events.find(e=>e.sha256),pointer=join(f.root,first.nativeLatest);
  const existing=await readFile(pointer,'utf8');
  await writeFile(join(f.root,f.files.js),'x'.repeat(220001));
  await until(()=>events.some(e=>e.state==='BUILD_OR_PACKAGE_FAILED'));
  assert.equal(await readFile(pointer,'utf8'),existing);
  await writeFile(join(f.root,f.files.js),'void 2;');
  await until(()=>events.filter(e=>e.state==='STAGED_NOT_INSTALLED').length===2);
  assert.notEqual(first.sha256,events.filter(e=>e.sha256)[1].sha256);
  controller.abort();await run;
});
