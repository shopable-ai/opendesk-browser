import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTSite} from '../src/site.js';
import {createQueueEngine} from '../src/engine.js';

// Adapter contract tests only. These stubs do not prove ChatGPT selectors or
// React input acceptance; those require the live USER_SCRIPT run.
function fixture() {
  const state={users:[],clicks:0,write:text=>text,focus:()=>{},onInput:()=>{}};
  class Textarea {
    constructor(){this.current='';this.tagName='TEXTAREA';this.isConnected=true;}
    get value(){return this.current;}
    set value(text){this.current=state.write(text);}
    closest(selector){return selector==='form'?form:null;}
    getAttribute(){return null;}
    querySelector(){return null;}
    getClientRects(){return [{}];}
    focus(){state.focus();}
    dispatchEvent(event){state.onInput(this,event);}
  }
  const editor=new Textarea();
  let activeEditor=editor;
  const replaceEditor=(text='')=>{const next=new Textarea();next.current=text;activeEditor.isConnected=false;activeEditor=next;return next;};
  const send={isConnected:true,disabled:false,
    closest:()=>null,getClientRects:()=>[{}],
    getAttribute:name=>name==='data-testid'?'send-button':null,
    matches:()=>false,click:()=>{state.clicks++;state.onSend?.();}};
  const form={isConnected:true,hasAttribute:()=>!!state.occupied,
    querySelectorAll:()=>[send],querySelector:()=>null};
  const win={location:{origin:'https://chatgpt.com',pathname:'/c/12345678'},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:Textarea,InputEvent:class {}};
  win.top=win;
  const doc={querySelectorAll:selector=>selector.startsWith('#prompt-textarea')?[activeEditor]:
    selector.startsWith('[data-message-author-role="user"]')?state.users:[]};
  const site=createChatGPTSite({doc,win,isComposing:()=>!!state.composing});
  return {site,state,editor,replaceEditor,send};
}

test('prepare preserves whitespace-only native drafts without writing or clicking',()=>{
  const {site,editor,state}=fixture();
  editor.current=' \n';
  assert.equal(site.prepare('queued',site.inspect()).ok,false);
  assert.equal(editor.value,' \n');
  assert.equal(state.clicks,0);
});
test('a lossy editor insertion cannot be considered prepared',()=>{
  const {site,state}=fixture();
  state.write=text=>text.trim().replaceAll('\u00a0',' ');
  assert.equal(site.prepare('  queued\u00a0message\n',site.inspect()).ok,false);
  assert.equal(state.clicks,0);
});
test('commit rejects whitespace or nonbreaking-space changes after prepare',()=>{
  for(const changed of ['queued','queued message','queued\u00a0message ']){
    const {site,editor,state}=fixture();
    const prepared=site.prepare('queued\u00a0message',site.inspect());
    assert.equal(prepared.ok,true);
    editor.current=changed;
    assert.equal(site.commit(prepared.token).ok,false);
    assert.equal(state.clicks,0);
  }
});
test('confirmation requires exact new message text, including surrounding whitespace',()=>{
  const {site,state}=fixture();
  const before={route:site.inspect().route,users:[]};
  const message={parentElement:null,querySelector:()=>null,innerText:'queued message'};
  state.users=[message];
  assert.equal(site.confirm(before,' queued message ',site.inspect()),false);
  assert.equal(site.confirmationIssue(before,' queued message ',site.inspect()),'新增用户消息正文与队列不完全一致');
  assert.equal(site.confirm(before,'queued\u00a0message',site.inspect()),false);
  assert.equal(site.confirm(before,'queued message',site.inspect()),true);
  assert.equal(site.confirmationIssue(before,'queued message',site.inspect()),null);
});
test('reclaim keeps its queue authorization when the composer read-back is lossy',()=>{
  const {site,state}=fixture();
  state.write=text=>text.trim();
  const result=site.reclaimToComposer(' full text\n',site.inspect());
  assert.equal(result.ok,false);
  assert.equal(result.mayHaveWritten,true);
  assert.equal(state.clicks,0);
});
test('reading a contenteditable draft never silently drops its final newline',()=>{
  const {site,editor}=fixture();
  Object.defineProperty(editor,'value',{value:undefined});
  editor.isContentEditable=true;
  editor.innerText='queued\n';
  assert.equal(site.inspect().draft,'queued\n');
});

test('focusing cannot overwrite a restored website draft or clear a changed draft',()=>{
  for(const operation of ['prepare','reclaim','clear','restore']){
    const {site,state,editor}=fixture();
    if(operation==='clear')editor.current='queue this';
    state.focus=()=>{editor.current='website restored draft';};
    const snapshot=site.inspect();
    const result=operation==='prepare'?site.prepare('queued',snapshot):
      operation==='reclaim'?site.reclaimToComposer('queued',snapshot):
      operation==='clear'?site.clearForQueue(snapshot):site.restore('queued','');
    assert.equal(typeof result==='boolean'?result:result.ok,false,operation);
    assert.equal(editor.value,'website restored draft',operation);
    assert.equal(state.clicks,0);
  }
});

test('focusing cannot write into a replaced composer',()=>{
  const {site,state,editor}=fixture();
  const snapshot=site.inspect();
  // Removing the editor at focus simulates the SPA swapping the composer.
  state.focus=()=>{editor.isConnected=false;};
  assert.equal(site.prepare('queued',snapshot).ok,false);
  assert.equal(editor.value,'');
});

test('confirmation rejects replaced historical user nodes',()=>{
  const {site,state}=fixture();
  const old={parentElement:null},replacement={parentElement:null};
  const before={route:site.inspect().route,users:[old]};
  state.users=[replacement,{parentElement:null,querySelector:()=>null,innerText:'queued'}];
  assert.equal(site.confirm(before,'queued',site.inspect()),false);
  assert.equal(site.confirmationIssue(before,'queued',site.inspect()),'历史用户消息节点已变化');
  state.users.shift();
  assert.equal(site.confirmationIssue(before,'queued',site.inspect()),'用户消息数量与发送前记录不符');
});

test('reply completion is tied to the confirmed user and one subsequent assistant',()=>{
  const {site}=fixture();
  const oldUser={},oldAssistant={},assistant={};
  const user={compareDocumentPosition:node=>node===assistant?4:1};
  const before={route:'c/12345678',users:[oldUser],assistants:[oldAssistant]};
  const snapshot={ok:true,route:before.route,users:[oldUser,user],
    assistants:[oldAssistant,assistant],busy:false,idle:true,answerComplete:true};
  assert.equal(site.replyComplete(before,user,snapshot),true);
  for(const patch of [
    {users:[{},user]}, {users:[oldUser,user,{}]}, {assistants:[{},assistant]},
    {assistants:[oldAssistant,{},assistant]}, {answerComplete:false}, {busy:true},
    {route:'c/87654321'}, {assistants:[oldAssistant,{}]}
  ])assert.equal(site.replyComplete(before,user,{...snapshot,...patch}),false);
  user.compareDocumentPosition=()=>5;
  assert.equal(site.replyComplete(before,user,snapshot),false,'disconnected nodes are not ordered evidence');
});

test('a bridge composer claim vetoes enqueuing, restoring and committing its draft',()=>{
  const {site,state,editor}=fixture();
  const prepared=site.prepare('bridge result',site.inspect());
  state.occupied=true;
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  assert.equal(site.restore('replacement','bridge result'),false);
  assert.equal(site.commit(prepared.token).ok,false);
  assert.equal(editor.value,'bridge result');
  assert.equal(state.clicks,0);
});

test('active composition cannot be cleared, overwritten or submitted',()=>{
  const {site,state,editor}=fixture();
  state.composing=true;
  assert.equal(site.prepare('queued',site.inspect()).ok,false);
  editor.current='未完成';
  assert.equal(site.clearForQueue(site.inspect()).ok,false);
  assert.equal(editor.value,'未完成');
  state.composing=false;editor.current='';
  const prepared=site.prepare('queued',site.inspect());
  state.composing=true;
  assert.equal(site.commit(prepared.token).ok,false);
  assert.equal(state.clicks,0);
});


test('canonical empty contenteditable paragraphs are empty without trimming real whitespace',()=>{
  const {site,editor}=fixture();
  Object.defineProperty(editor,'value',{value:undefined});
  editor.isContentEditable=true;editor.textContent='';editor.innerText='\n';
  const br={nodeType:1,nodeName:'BR',childNodes:[]};
  const p={nodeType:1,nodeName:'P',childNodes:[br]};
  editor.childNodes=[p];
  assert.equal(site.inspect().draft,'');
  editor.childNodes=[p,p];
  assert.equal(site.inspect().draft,'\n','multiple blank paragraphs remain a native draft');
  editor.childNodes=[p];editor.textContent=' ';editor.innerText=' ';
  assert.equal(site.inspect().draft,' ');
  editor.textContent='text';editor.innerText='text\n';
  assert.equal(site.inspect().draft,'text\n');
});

test('normal clear verifies the currently active editor',()=>{
  const {site,editor}=fixture();editor.current='keep exact\n';
  const cleared=site.clearForQueue(site.inspect());
  assert.equal(cleared.ok,true);assert.equal(cleared.text,'keep exact\n');
  assert.equal(editor.value,'');
});
for(const nextText of ['', 'original still present']) {
  test('clear cannot succeed if input dispatch replaces the composer '+JSON.stringify(nextText),()=>{
    const {site,state,editor,replaceEditor}=fixture();editor.current='original still present';
    state.onInput=()=>replaceEditor(nextText);
    const result=site.clearForQueue(site.inspect());
    assert.equal(result.ok,false);assert.equal(result.needsRecovery,true);
    assert.equal(result.text,'original still present');
    assert.equal(site.inspect().draft,nextText);assert.equal(state.clicks,0);
  });
}
test('partial clear retains exact recovery text',()=>{
  const {site,editor,state}=fixture();editor.current='complete payload';
  state.write=text=>text===''?'partial payload':text;
  const result=site.clearForQueue(site.inspect());
  assert.equal(result.ok,false);assert.equal(result.needsRecovery,true);
  assert.equal(result.text,'complete payload');assert.equal(editor.value,'partial payload');
  assert.equal(state.clicks,0);
});
test('input event restoring a draft after clear is detected',()=>{
  const {site,editor,state}=fixture();editor.current='original payload';
  state.onInput=()=>{editor.current='website restored';};
  const result=site.clearForQueue(site.inspect());
  assert.equal(result.ok,false);assert.equal(result.text,'original payload');
  assert.equal(editor.value,'website restored');
});
test('input event throw after native clear preserves recovery text',()=>{
  const {site,editor,state}=fixture();editor.current='original payload';
  state.onInput=()=>{throw Error('website listener threw');};
  const result=site.clearForQueue(site.inspect());
  assert.equal(result.ok,false);assert.equal(result.needsRecovery,true);
  assert.equal(result.text,'original payload');
});

for(const failure of ['replacement','lossy write','input exception']) {
  test(`prepare reports possible writes after setDraft (${failure})`,()=>{
    const {site,state,replaceEditor}=fixture();
    const text=' A\u00a0\n';
    if(failure==='replacement')state.onInput=editor=>replaceEditor(editor.value);
    if(failure==='lossy write')state.write=value=>value.trim();
    if(failure==='input exception')state.onInput=()=>{throw new Error('input handler failed after write');};
    const result=site.prepare(text,site.inspect());
    assert.equal(result.ok,false);
    assert.equal(result.mayHaveWritten,true);
    assert.equal(state.clicks,0);
    if(failure!=='lossy write')assert.equal(site.inspect().draft,text);
  });
}

test('prepare preflight rejection explicitly proves that no write was attempted',()=>{
  const {site,state,editor}=fixture();
  const snapshot=site.inspect();
  editor.current='website restored draft';
  let writes=0;
  state.write=value=>{writes++;return value;};
  const result=site.prepare(' A\u00a0\n',snapshot);
  assert.equal(result.ok,false);
  assert.equal(result.mayHaveWritten,false);
  assert.equal(writes,0);
  assert.equal(editor.value,'website restored draft');
  assert.equal(state.clicks,0);
});

for(const failure of ['replacement','input exception']) {
  test(`real prepare ${failure} followed by manual send cannot duplicate the message`,t=>{
    const f=fixture(),text=' A\u00a0\n';
    let now=0,prepares=0,commits=0,stops=0;
    const prepareResults=[];
    f.state.onInput=editor=>{
      // Simulate the website's synchronous input handler after native write.
      // Only the first attempt changes the editor, so an unsafe resume would
      // allow an otherwise normal second prepare/commit to submit a duplicate.
      f.state.onInput=()=>{};
      if(failure==='replacement')f.replaceEditor(editor.value);
      else throw new Error('input handler failed after write');
    };
    f.state.onSend=()=>{
      const editor=f.site.inspect().editor;
      f.state.users.push({parentElement:null,querySelector:()=>null,innerText:editor.value});
      editor.current='';
    };
    const site={...f.site,
      prepare:(...args)=>{
        prepares++;
        try {
          const result=f.site.prepare(...args);
          prepareResults.push({ok:result.ok,mayHaveWritten:result.mayHaveWritten,reason:result.reason});
          return result;
        } catch(error) {prepareResults.push({threw:true});throw error;}
      },
      commit:(...args)=>{commits++;return f.site.commit(...args);},
      stop:(...args)=>{stops++;return f.site.stop(...args);}};
    const engine=createQueueEngine({site,clock:()=>now});
    const step=value=>{now=value;engine.tick();};
    engine.enqueue(text,site.inspect().route);
    engine.enqueue('B',site.inspect().route);
    step(100);step(1400);
    assert.equal(site.inspect().draft,text);
    assert.equal(f.state.clicks,0);
    const phaseAfterPrepare=engine.view().phase;
    f.send.click(); // Offline user action after the real prepare returned.
    assert.equal(f.state.users[0].innerText,text);
    const resumed=engine.resume();
    step(1500);step(2700);step(2800);
    t.diagnostic(JSON.stringify({failure,prepareResults,phaseAfterPrepare,resumed,
      prepares,commits,stops,clicks:f.state.clicks,submissions:f.state.users.map(node=>node.innerText)}));
    assert.equal(resumed,false);
    assert.equal(prepareResults[0].ok,false);
    assert.equal(prepareResults[0].mayHaveWritten,true);
    assert.equal(engine.view().phase,'unknown');
    assert.equal(engine.view().items[0].text,text);
    const reason=engine.view().reason;
    for(const id of ['q1','q2']) {
      assert.equal(engine.requestNow(id).ok,false);
      assert.equal(engine.confirmForceStop(id),false);
    }
    engine.pause('external snapshot notification');
    step(20000);step(22000);
    assert.equal(engine.view().reason,reason);
    assert.deepEqual([prepares,commits,stops,f.state.clicks],[1,0,0,1]);
    assert.equal(engine.remove('q1'),true,'manual website check precedes deletion');
    step(24000);step(26000);
    assert.equal(engine.view().paused,true);
    assert.deepEqual(engine.view().items.map(item=>item.text),['B']);
    assert.deepEqual([prepares,commits,stops,f.state.clicks],[1,0,0,1]);
  });
}

test('real prepare preflight failure keeps the engine failed and explicitly recoverable',()=>{
  const f=fixture();
  let now=0;
  f.state.occupied=false;
  const site={...f.site,prepare:(...args)=>{
    f.state.occupied=true; // A website claim appears between poll and preflight.
    return f.site.prepare(...args);
  }};
  const engine=createQueueEngine({site,clock:()=>now});
  engine.enqueue(' A\u00a0\n',site.inspect().route);
  engine.tick();now=1200;engine.tick();
  assert.equal(engine.view().phase,'failed');
  assert.equal(engine.view().inFlight,null);
  assert.equal(f.editor.value,'');
  assert.equal(f.state.clicks,0);
  f.state.occupied=false;
  assert.equal(engine.resume(),true);
});
