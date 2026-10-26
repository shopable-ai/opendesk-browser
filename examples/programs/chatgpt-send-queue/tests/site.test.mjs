import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTSite} from '../src/site.js';
import {createQueueEngine} from '../src/engine.js';

// Adapter contract tests only. These stubs do not prove ChatGPT selectors or
// React input acceptance; those require the live USER_SCRIPT run.
function fixture() {
  const state={users:[],assistants:[],clicks:0,write:text=>text,focus:()=>{},onInput:()=>{}};
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
    selector.includes('user')&&selector.includes('assistant')?(state.history||[...state.users,...state.assistants]):
    selector.startsWith('[data-message-author-role="user"]')?state.users:state.assistants};
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
test('a disabled native send button reports readiness without clicking',()=>{
  const {site,send,state}=fixture();
  const prepared=site.prepare('queued',site.inspect());
  send.disabled=true;
  assert.deepEqual(site.commit(prepared.token),{ok:false,retry:true,reason:'原生发送按钮尚未启用'});
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
  const before={route:site.inspect().route,users:[],history:[]};
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
  const before={route:site.inspect().route,users:[old],history:[old]};
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
  const before={route:'c/12345678',users:[oldUser],assistants:[oldAssistant],history:[oldUser,oldAssistant]};
  const snapshot={ok:true,route:before.route,users:[oldUser,user],
    assistants:[oldAssistant,assistant],history:[oldUser,oldAssistant,user,assistant],busy:false,idle:true,answerComplete:true};
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
    step(1500);step(2700);step(2800);
    t.diagnostic(JSON.stringify({failure,prepareResults,phaseAfterPrepare,
      prepares,commits,stops,clicks:f.state.clicks,submissions:f.state.users.map(node=>node.innerText)}));
    assert.equal(prepareResults[0].ok,false);
    assert.equal(prepareResults[0].mayHaveWritten,true);
    assert.equal(engine.view().phase,'unknown');
    assert.equal(engine.view().items[0].text,text);
    const reason=engine.view().reason;
    for(const id of ['q1','q2']) {
      assert.equal(engine.requestNow(id).ok,false);
      assert.equal(engine.confirmForceStop(id),false);
    }
    engine.wait('external snapshot notification');
    step(20000);step(22000);
    assert.equal(engine.view().reason,reason);
    assert.deepEqual([prepares,commits,stops,f.state.clicks],[1,0,0,1]);
    assert.equal(engine.remove('q1'),true,'manual website check precedes deletion');
    step(24000);step(26000);
    assert.ok(engine.view().answerGate,'the acknowledged manual send still waits for its own reply');
    assert.deepEqual(engine.view().items.map(item=>item.text),['B']);
    assert.deepEqual([prepares,commits,stops,f.state.clicks],[1,0,0,1]);
  });
}

test('real prepare preflight failure waits and automatically retries after the claim clears',()=>{
  const f=fixture();
  let now=0;
  f.state.occupied=false;
  let claim=true;
  const site={...f.site,prepare:(...args)=>{
    f.state.occupied=claim; // A website claim appears between poll and preflight.
    return f.site.prepare(...args);
  }};
  const engine=createQueueEngine({site,clock:()=>now});
  engine.enqueue(' A\u00a0\n',site.inspect().route);
  engine.tick();now=1200;engine.tick();
  assert.equal(engine.view().phase,'waiting');
  assert.equal(engine.view().inFlight,null);
  assert.equal(f.editor.value,'');
  assert.equal(f.state.clicks,0);
  claim=false;f.state.occupied=false;
  now=1300;engine.tick();now=2500;engine.tick();
  assert.equal(engine.view().inFlight.phase,'await-native-ready');
  assert.equal(f.state.clicks,0);
});

// The live page unmounts only the oldest turns as a conversation grows.
// Detached prefixes may disappear; the retained tail still uses exact nodes.
test('confirmation accepts detached oldest turns while retaining the exact history tail',()=>{
  const {site,state}=fixture();
  const evicted={isConnected:false},anchor={isConnected:true,parentElement:null};
  const message={isConnected:true,parentElement:null,querySelector:()=>null,innerText:'queued'};
  const before={route:site.inspect().route,users:[evicted,anchor],history:[evicted,anchor]};
  state.users=[anchor,message];
  assert.equal(site.confirm(before,'queued',site.inspect()),true);
  assert.equal(site.confirm(before,' queued',site.inspect()),false,'body stays exact');
  evicted.isConnected=true;
  assert.equal(site.confirm(before,'queued',site.inspect()),false,'a still-mounted omission is not eviction');
  evicted.isConnected=false;
  state.users=[message];
  assert.equal(site.confirm(before,'queued',site.inspect()),false,'losing every anchor stays unknown');
  state.users=[{...anchor},message];
  assert.equal(site.confirm(before,'queued',site.inspect()),false,'replacement is not the original tail');
  state.users=[anchor,{...message},message];
  assert.equal(site.confirm(before,'queued',site.inspect()),false,'two new turns stay unknown');
});

test('commit accepts only a detached history prefix and still clicks at most once',()=>{
  const {site,state}=fixture();
  const evicted={isConnected:true,parentElement:null},anchor={isConnected:true,parentElement:null};
  state.users=[evicted,anchor];
  const token=site.prepare('queued',site.inspect()).token;
  evicted.isConnected=false;state.users=[anchor];
  assert.equal(site.commit(token).ok,true);
  assert.equal(state.clicks,1);
  state.users=[anchor,{parentElement:null}];
  assert.equal(site.commit(token).ok,false,'a new turn forbids another click');
  assert.equal(state.clicks,1);
});

test('commit refuses a newly appended completed assistant before any click',()=>{
  const {site,state}=fixture();
  const anchor={isConnected:true,parentElement:null};
  state.users=[anchor];state.history=[anchor];
  const token=site.prepare('queued',site.inspect()).token;
  const assistant={isConnected:true,parentElement:null,closest:()=>null,
    getAttribute:()=> 'complete',hasAttribute:()=>true,matches:()=>false,querySelector:()=>null};
  state.assistants=[assistant];state.history=[anchor,assistant];
  assert.equal(site.inspect().idle,true);
  assert.equal(site.commit(token).stage,'before-click');
  assert.equal(state.clicks,0);
});

test('confirmation refuses one exact user accompanied by two new assistants',()=>{
  const {site}=fixture();
  const anchor={isConnected:true},user={querySelector:()=>null,innerText:'queued'},a1={},a2={};
  const before={route:'c/12345678',users:[anchor],history:[anchor]};
  const snapshot={ok:true,route:before.route,users:[anchor,user],assistants:[a1,a2],
    history:[anchor,user,a1,a2]};
  assert.equal(site.confirm(before,'queued',snapshot),false);
  assert.equal(site.confirm(before,'queued',{...snapshot,assistants:[a1],history:[anchor,user,a1]}),true);
});

test('reply completion follows exact user and assistant tails after prefix eviction',()=>{
  const {site}=fixture();
  const goneUser={isConnected:false},oldUser={},goneAssistant={isConnected:false},oldAssistant={},assistant={};
  const user={compareDocumentPosition:node=>node===assistant?4:1};
  const before={route:'c/12345678',users:[goneUser,oldUser],assistants:[goneAssistant,oldAssistant],
    history:[goneUser,goneAssistant,oldUser,oldAssistant]};
  const snapshot={ok:true,route:before.route,users:[oldUser,user],assistants:[oldAssistant,assistant],
    history:[oldUser,oldAssistant,user,assistant],busy:false,idle:true,answerComplete:true};
  assert.equal(site.replyComplete(before,user,snapshot),true);
  for(const patch of [
    {users:[user]}, {users:[{},user]}, {users:[oldUser,{},user]},
    {assistants:[assistant]}, {assistants:[{},assistant]}, {assistants:[oldAssistant,{},assistant]},
    {busy:true}, {answerComplete:false}, {route:'c/87654321'}
  ])assert.equal(site.replyComplete(before,user,{...snapshot,...patch}),false);
  goneAssistant.isConnected=true;
  assert.equal(site.replyComplete(before,user,snapshot),false);
});

test('detached role prefixes cannot conceal an interior removal in the combined conversation',()=>{
  const {site}=fixture();
  const u0={isConnected:false},a0={isConnected:false},u1={},a1={isConnected:false},u2={},a2={},a3={};
  const u3={compareDocumentPosition:node=>node===a3?4:1};
  const before={route:'c/12345678',users:[u0,u1,u2],assistants:[a0,a1,a2],history:[u0,a0,u1,a1,u2,a2]};
  const snapshot={ok:true,route:before.route,users:[u1,u2,u3],assistants:[a2,a3],
    history:[u1,u2,a2,u3,a3],busy:false,idle:true,answerComplete:true};
  assert.equal(site.replyComplete(before,u3,snapshot),false);
  const message={parentElement:null,querySelector:()=>null,innerText:'queued'};
  assert.equal(site.confirm(before,'queued',{ok:true,route:before.route,
    users:[u1,u2,message],history:[u1,u2,a2,message]}),false);
});

test('history eviction rejects missing evidence, interior loss, reordering, prepend and recycled nodes',()=>{
  const {site,state}=fixture();
  const a={isConnected:false,parentElement:null},b={isConnected:true,parentElement:null},c={isConnected:true,parentElement:null};
  const added={parentElement:null,querySelector:()=>null,innerText:'queued'};
  const before={route:site.inspect().route,users:[a,b,c],history:[a,b,c]};
  for(const users of [[a,c,added],[b,added],[c,b,added],[{},a,b,c,added],[b,c,a]]){
    state.users=users;assert.equal(site.confirm(before,'queued',site.inspect()),false);
  }
  state.users=[b,c,added];
  delete a.isConnected;
  assert.equal(site.confirm(before,'queued',site.inspect()),false);
  a.isConnected=false;
  assert.equal(site.confirm({...before,history:undefined},'queued',site.inspect()),false);
  assert.equal(site.confirm(before,'queued',site.inspect()),true);
});

test('real adapter and engine advance once after prefix eviction and never retry a changed-history send',()=>{
  const f=fixture(),{site,state,editor}=f;
  let now=0;
  function node(text,complete=true){
    return {isConnected:true,parentElement:null,innerText:text,complete,
      querySelector:()=>null,closest:()=>null,matches:()=>false,
      hasAttribute:name=>name==='data-talvt-turn-state',
      getAttribute(name){return name==='data-talvt-turn-state'?(this.complete?'complete':'streaming'):null;},
      compareDocumentPosition(other){const a=state.history.indexOf(this),b=state.history.indexOf(other);return a<0||b<0?1:a<b?4:2;}};
  }
  const u0=node('old0'),a0=node('answer0'),u1=node('old1'),a1=node('answer1');
  state.users=[u0,u1];state.assistants=[a0,a1];state.history=[u0,a0,u1,a1];
  let newAssistant;
  state.onSend=()=>{
    const user=node(editor.value);newAssistant=node('new answer',false);
    editor.current='';
    u0.isConnected=false;a0.isConnected=false;
    state.users=[u1,user];state.assistants=[a1,newAssistant];state.history=[u1,a1,user,newAssistant];
  };
  const engine=createQueueEngine({site,clock:()=>now});
  const step=t=>{now=t;engine.tick();};
  engine.enqueue('A',site.inspect().route);engine.enqueue('B',site.inspect().route);
  step(0);step(1200);step(1300);step(1400);
  assert.equal(state.clicks,1);assert.deepEqual(engine.view().items.map(x=>x.text),['B']);
  step(3000);assert.equal(state.clicks,1,'the corresponding reply is still streaming');
  newAssistant.complete=true;
  step(3100);step(4300);step(5500);
  assert.equal(engine.view().inFlight.phase,'await-native-ready');
  const manual=node('manual different message');state.users.push(manual);state.history.push(manual);
  step(5600);
  assert.equal(engine.view().phase,'unknown');
  step(20000);step(30000);
  assert.equal(state.clicks,1,'unknown never replays the queued or prior message');
  assert.deepEqual(engine.view().items.map(x=>x.text),['B']);
});
