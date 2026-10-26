import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const source=await readFile(new URL('src/main.js',root),'utf8');
const ID='opendesk.ai-send-queue';
const legacySelector='[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-send-queue.lifecycle"]';

// Execute the actual entry with inert collaborators; no website or messages.
function harness({legacy=false,origin='https://chatgpt.com',frame=false}={}){
  const calls={owners:0,sites:0,engines:0,views:0,ticks:0,destroy:0,inspect:0};
  const legacyHost={queue:['private legacy queue'],destroy(){throw Error('must not touch legacy');}};
  let active=true,interval,actions,disposer;
  const owner={host:{style:{setProperty(){}}},on(){},active:()=>active,
    setInterval(fn){interval=fn;},onDispose(fn){disposer=fn;},
    destroy(){if(active){active=false;calls.destroy++;disposer?.();}}};
  const site={inspect(){calls.inspect++;return {ok:false};}};
  const doc={querySelector(selector){assert.equal(selector,legacySelector);return legacy?legacyHost:null;}};
  const win={location:{origin}};win.top=frame?{}:win;
  const context=vm.createContext({window:win,document:doc,
    createPageUI(options){calls.owners++;assert.equal(options.id,ID+'.lifecycle');return owner;},
    createChatGPTSite(){calls.sites++;return site;},
    createQueueEngine(){calls.engines++;return {tick(){calls.ticks++;}};},
    createQueueView(options){calls.views++;actions=options.actions;
      return {place(){},render(){},hide(){}};}});
  vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default async function main','async function main'),context);
  return {calls,legacyHost,run:()=>context.main(),setLegacy(value){legacy=value;},
    poll(){interval();},get actions(){return actions;}};
}

test('source manifest uses independent catalog identity without widening Page rules',async()=>{
  const pkg=JSON.parse(await readFile(new URL('package.json',root)));
  const catalog=JSON.parse(await readFile(new URL('../../../../official-pages/sources.json',import.meta.url)));
  // The catalog is read-only; locate its entry independently of list container name.
  const entries=Object.values(catalog).find(value=>Array.isArray(value)&&value.some(x=>x.programId===ID));
  const entry=entries.find(x=>x.programId===ID);
  assert.equal(pkg.opendesk.id,entry.programId);
  assert.equal(pkg.version,'0.1.2');assert.equal(entry.revision,1);
  assert.deepEqual(pkg.opendesk.pageRules,{matches:['https://chatgpt.com/*'],excludeMatches:[],
    runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'});
});

test('old active lifecycle blocks new owner, queue and site before any work',async()=>{
  const h=harness({legacy:true}),result=await h.run();
  assert.equal(result.programId,ID);assert.equal(result.status,'skipped');
  assert.equal(result.reason,'legacy-active');
  assert.deepEqual(h.calls,{owners:0,sites:0,engines:0,views:0,ticks:0,destroy:0,inspect:0});
  assert.deepEqual(h.legacyHost.queue,['private legacy queue']);
});

test('new identity starts alone; late legacy lifecycle retires it before inspection or tick',async()=>{
  const h=harness(),result=await h.run();
  assert.equal(result.programId,ID);assert.equal(result.status,'active');
  h.poll();assert.equal(h.calls.ticks,1);
  const inspections=h.calls.inspect;
  h.setLegacy(true);h.poll();h.poll();
  assert.equal(h.calls.destroy,1);assert.equal(h.calls.ticks,1);
  assert.equal(h.calls.inspect,inspections);
  assert.deepEqual(h.legacyHost.queue,['private legacy queue']);
});

test('every user action yields to late legacy lifecycle and remains inert after retirement',async()=>{
  for(const name of ['enqueue','edit','remove','sendNow','togglePause']){
    const h=harness();await h.run();const inspections=h.calls.inspect;
    h.setLegacy(true);h.actions[name]('unused');h.setLegacy(false);h.actions[name]('unused');
    assert.equal(h.calls.destroy,1,name);assert.equal(h.calls.inspect,inspections,name);
    assert.equal(h.calls.ticks,0,name);assert.deepEqual(h.legacyHost.queue,['private legacy queue']);
  }
});

test('wrong origin and child frames stay inert',async()=>{
  for(const options of [{origin:'https://example.com'},{frame:true}]){
    const h=harness(options);assert.equal((await h.run()).status,'skipped');
    assert.equal(h.calls.owners,0);assert.equal(h.calls.sites,0);
  }
});
