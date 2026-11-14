import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';
import {managedUIBootstrapSource} from '../../src/scripting/user-scripts/managed-ui-lifecycle.js';

// Cross-project contract: both independently compiled owners use the same
// native reply footer. Geometry is a deterministic model, not native UI proof.
const projects=['ai-scroll-navigation','ai-reply-mindmap'];
const sources=new Map();
for(const project of projects){
  const built=await buildProgramProjectInMemory(fileURLToPath(new URL('../../projects/'+project,import.meta.url)));
  sources.set(project,built.sourceUtf8);
}

function fixture(){
  const dom=new JSDOM(`<!doctype html><html><body><main>
    <div id="transcript" style="overflow-y:auto">
      <div data-talvt-turn-state="complete">
        <div id="answer" data-content-search-unit-key="fixture:assistant">
          <div data-conversation-role="assistant"><div data-d-component="markdown">
            <h2>Fixture answer</h2><p>Public synthetic answer content.</p>
          </div></div>
        </div>
        <div class="turn-action-controls"><div id="native-actions">
          <button aria-label="复制">Copy</button><button aria-label="评价回复">Feedback</button>
          <button aria-label="更多操作">More</button>
        </div></div>
      </div>
    </div><form><textarea id="prompt-textarea">Retained fixture draft</textarea></form>
  </main></body></html>`,{url:'https://chatgpt.com/c/startup-fixture',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,timers=new Map(),worlds=new Map();
  let nextTimer=0,now=0,configResolve,frameRequests=0;
  const config=new Promise(resolve=>{configResolve=resolve;});
  win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  Object.defineProperties(win,{innerWidth:{value:1200},innerHeight:{value:600}});
  Object.defineProperties(win.HTMLElement.prototype,{
    clientHeight:{get(){return this.id==='transcript'?400:this.id==='answer'?800:40;}},
    scrollHeight:{get(){return this.id==='transcript'?2000:this.id==='answer'?800:40;}}
  });
  win.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.hidden||this.style.display==='none')return new win.DOMRect(0,0,0,0);
    return new win.DOMRect(20,this.id==='answer'?20:300,this.tagName==='BUTTON'?34:900,
      this.id==='answer'?800:this.id==='transcript'?400:40);
  };
  win.HTMLElement.prototype.getClientRects=function(){return [this.getBoundingClientRect()];};
  // Advance only startup reconciliation. The later CSS/layout probe is a
  // browser responsibility; JSDOM has no shadow stylesheet layout engine.
  win.setTimeout=(work,ms)=>{const id=++nextTimer;timers.set(id,{work,at:now+ms});return id;};
  win.clearTimeout=id=>timers.delete(id);
  win.setInterval=()=>++nextTimer;
  win.clearInterval=()=>{};
  win.requestAnimationFrame=work=>win.setTimeout(()=>work(now),16);
  win.cancelAnimationFrame=win.clearTimeout;
  async function advance(end){
    for(let count=0;count<100;count++){
      await Promise.resolve();await Promise.resolve();
      const due=[...timers].filter(([,row])=>row.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due){now=end;return;}
      const [id,row]=due;timers.delete(id);now=row.at;row.work();
    }
    assert.fail('startup observers did not converge within the bounded fixture');
  }
  for(const project of projects){
    const context=vm.createContext({window:win,document:doc,console,
      Event:win.Event,CustomEvent:win.CustomEvent,MutationObserver:win.MutationObserver,
      URL:win.URL,TextEncoder,TextDecoder,crypto:globalThis.crypto,
      setTimeout:win.setTimeout,clearTimeout:win.clearTimeout,
      __openDeskScrollConfig:{read:()=>config},
      __opendeskPageFramesV1:{create(){frameRequests++;throw Error('Startup must not create an XMind frame');}}});
    vm.runInContext(managedUIBootstrapSource(project),context);
    vm.runInContext(sources.get(project),context,{filename:project+'.js'});
    worlds.set(project,context);
  }
  return {doc,worlds,advance,frameRequests:()=>frameRequests,
    start:project=>vm.runInContext('main()',worlds.get(project)),
    releaseConfig:()=>configResolve({value:{version:1,sites:[]},etag:'fixture-etag'}),
    retire:project=>vm.runInContext('__opendeskManagedUIRegistryV1.retire("fixture-cleanup")',worlds.get(project)),
    close:()=>dom.window.close()};
}

for(const order of [projects,[...projects].reverse()])test('compiled reply owners coexist and retire independently: '+order.join(' then '),async()=>{
  const h=fixture();
  try{
    const native=[...h.doc.querySelectorAll('#native-actions > button')];
    const draft=h.doc.querySelector('textarea');
    const starts=order.map(project=>h.start(project));
    await Promise.all(starts);
    assert.equal(h.doc.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]').length,0,
      'navigation remains unavailable until its authenticated configuration read completes');
    h.releaseConfig();await h.advance(150);
    const footer=h.doc.querySelector('.turn-action-controls');
    const nav=footer.querySelector('[data-opendesk-ai-scroll-navigation="reply"]');
    const map=footer.querySelector('[data-opendesk-chatgpt-mindmap="button"]');
    assert.ok(nav);assert.ok(map);
    assert.equal(footer.querySelectorAll('[data-ai-answer-tools]').length,1);
    assert.equal(footer.querySelectorAll('[data-opendesk-ai-scroll-navigation="reply"]').length,1);
    assert.equal(footer.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]').length,1);
    assert.equal(nav.parentElement,map.parentElement);
    assert.equal(nav.nextElementSibling,map);
    assert.ok([...nav.shadowRoot.querySelectorAll('button')].every(button=>!button.disabled));
    assert.deepEqual([...h.doc.querySelectorAll('#native-actions > button')],native);
    assert.equal(draft.value,'Retained fixture draft');
    assert.equal(h.frameRequests(),0);
    const first=order[0],survivor=first==='ai-scroll-navigation'?map:nav;
    assert.equal((await h.retire(first)).ok,true);
    assert.ok(survivor.isConnected,'one world cleanup preserves its peer');
    assert.deepEqual([...h.doc.querySelectorAll('#native-actions > button')],native);
    assert.equal((await h.retire(order[1])).ok,true);
    assert.equal(footer.querySelector('[data-ai-answer-tools]'),null);
    assert.equal(draft.value,'Retained fixture draft');
  }finally{for(const project of projects)await h.retire(project);h.close();}
});
