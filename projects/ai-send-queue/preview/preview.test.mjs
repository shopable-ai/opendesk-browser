import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createQueueEngine} from '../src/page/engine.js';
import {createSendQueueRemote} from '../src/page/remote.js';
import {createPreviewModel} from './model.js';
import {prepare} from './prepare.mjs';
const make=()=>createPreviewModel({createQueueEngine,createSendQueueRemote});
test('one official Page owner handles all simulated page and Sidebar commands',async()=>{
 const model=make();model.sample();assert.equal(model.snapshot().items.length,3);
 const write=async(command,id,index)=>{const {instance,revision}=model.snapshot();return model.request('sendQueue.command',{command,id,index,instance,revision});};
 assert.equal((await write('pause','q1')).effect,'applied');assert.equal(model.engine.view().items[0].state,'paused');
 assert.equal(model.command('resume','q1').effect,'applied');
 assert.equal((await write('move','q3',0)).effect,'applied');assert.equal(model.engine.view().items[0].id,'q3');
 model.setDraft('已有草稿');assert.equal((await write('edit','q3')).effect,'rejected');assert.equal(model.snapshot().items.length,3);
 model.setDraft('');assert.equal((await write('edit','q3')).effect,'applied');assert.match(model.getDraft(),/模拟：编辑/);
 model.setDraft(model.getDraft()+'（已编辑）');assert.equal(model.enqueue(),true);assert.equal(model.snapshot().items.at(-1).id,'q4');
 assert.equal((await write('remove','q2')).effect,'applied');assert.deepEqual(model.snapshot().items.map(x=>x.id),['q1','q4']);
 assert.equal((await write('now','q4')).effect,'applied');assert.deepEqual(model.snapshot().items.map(x=>x.id),['q1']);assert.equal(model.site.inspect().busy,true);
 model.finish();assert.equal(model.snapshot().items.length,0);assert.equal(model.site.inspect().users.length,2);
});
test('unknown blocks replay and remote mutation; reset creates a different owner',async()=>{
 const model=make();model.sample();assert.equal(model.unknown(),true);
 const before=model.snapshot();model.finish();model.pump();assert.equal(model.snapshot().phase,'unknown');
 assert.equal(model.site.inspect().users.length,0);assert.equal(model.command('now','q1').effect,'rejected');
 assert.equal(model.command('remove','q1').effect,'rejected');
 const reset=make();assert.notEqual(reset.snapshot().instance,before.instance);
 const stale=await reset.request('sendQueue.command',{command:'pause',id:'q1',instance:before.instance,revision:before.revision});
 assert.equal(stale.status,'stale');
});
test('preview pins existing official build and runtime without invoking a compiler',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sq-preview-test-'));
 try{
  const manifest=await prepare({out:join(dir,'source.json')});
  assert.equal(manifest.simulation,true);
  for(const name of ['dist/tool.js','dist/tool.css','src/sidebar/App.jsx','src/page/engine.js','src/page/remote.js','runtime/sidebar-shared-ui.js'])assert.match(manifest.inputs[name].sha256,/^[a-f0-9]{64}$/);
  const boot=await readFile(new URL('./boot.js',import.meta.url),'utf8');
  assert.doesNotMatch(boot,/createRoot\(|function App\(|chrome\./);
  assert.match(boot,/SHA-256/);assert.match(boot,/await checked/);
  assert.match(boot,/SOURCE_PARITY_NOT_VERIFIED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
