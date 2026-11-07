import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatGPTFilesUI} from '../trusted/chatgpt-files-ui.js';

// Only trusted-page UI scheduling is exercised here; sender/Native authority
// is verified separately by the controller and actual browser tests.
function fixture({reply,externalApi={}}={}){
  const ids=['workspace','path','operation','task','consent','prepare','state','approve','inspect','reconcile','observe',
    'fill-prompt','fill-result','source','connection','prompt','result','request','proposal','proposal-path','sha',
    'before','after','result-status','delivery','observed','message','error','task-description','generate-task','task-prompt',
    'project-name','project-target','project-task','project-message','connect-project','revoke-project'];
  const element=()=>({value:'',checked:false,hidden:false,disabled:false,handlers:new Map(),
    setAttribute(){},replaceChildren(){},append(){},addEventListener(type,fn){this.handlers.set(type,fn);},
    emit(type){this.handlers.get(type)?.({isTrusted:true});}});
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  nodes.path.value='demo.txt';nodes.operation.value='read';nodes.error.hidden=true;
  const root={setAttribute(){},querySelectorAll(){return [...ids.slice(0,14),'task-description','generate-task'].map(id=>nodes[id]);}};
  const window=element(),doc={defaultView:window,createElement:element,
    getElementById:id=>id==='chatgpt-files-root'?root:nodes[id.replace('files-','')]};
  const queue=new Map();let counter=0,failPoll=false;
  const timers={setTimeout(fn){const id=++counter;queue.set(id,fn);return id;},clearTimeout(id){queue.delete(id);}};
  const calls=[];let snapshot={source:{url:'https://chatgpt.com/c/test'},connected:true,
    workspaces:[{workspaceId:'approved',name:'approved directory',access:'read-write'}]};
  const api={...externalApi,runtime:{...externalApi.runtime,async sendMessage(message){
    calls.push(message);
    if(reply)return reply(message);
    if(message.action==='prepare')snapshot={...snapshot,request:{requestId:'fresh'},prompt:'real rules',
      promptPacketId:'prompt-1',promptDelivery:'ready',automation:{active:true,phase:'watching'}};
    if(message.action==='pause')snapshot={...snapshot,automation:{active:false,phase:'paused'}};
    if(message.action==='poll'&&failPoll)return {ok:false,error:{code:'E_UNKNOWN',message:'unknown'}};
    return {ok:true,data:structuredClone(snapshot)};
  }}};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const prepare=async()=>{
    nodes.workspace.value='approved';nodes.workspace.emit('change');
    nodes.consent.checked=true;nodes.consent.emit('change');
    nodes.prepare.emit('click');await settle();
  };
  return {nodes,queue,calls,window,prepare,settle,respond:patch=>{snapshot={...snapshot,...patch};},fail:()=>{failPoll=true;},
    start:()=>initChatGPTFilesUI({api,document:doc,timers}),
    async openConnection(){this.start();nodes.state.emit('click');await settle();},
    async tick(){const [id,fn]=queue.entries().next().value;queue.delete(id);await fn();}};
}
test('automatic scheduling requires explicit prepare and never confirms a write',async()=>{
  const h=fixture();await h.openConnection();assert.equal(h.queue.size,0);
  await h.prepare();assert.equal(h.queue.size,1);await h.tick();await h.tick();
  assert.equal(h.calls.filter(call=>call.action==='poll').length,2);
  assert.equal(h.calls.some(call=>call.action==='approve'),false);
  h.nodes.path.value='other.txt';h.nodes.path.emit('input');await h.settle();
  assert.equal(h.queue.size,0);assert.equal(h.nodes.consent.checked,false);
  assert.equal(h.calls.at(-1).action,'pause');
});
test('uncertain responses stop automatic timers instead of retrying',async()=>{
  const h=fixture();await h.openConnection();await h.prepare();h.fail();await h.tick();
  assert.equal(h.queue.size,0);assert.equal(h.nodes.error.hidden,false);
  assert.equal(h.calls.filter(call=>call.action==='poll').length,1);
});
test('closing the trusted document ends automatic scheduling',async()=>{
  const h=fixture();await h.openConnection();await h.prepare();assert.equal(h.queue.size,1);
  h.window.emit('pagehide');assert.equal(h.queue.size,0);
});

test('read-only and read-edit choices bind trusted intent while keeping the read protocol',async()=>{
  for(const mode of ['read','read-edit']){
    const h=fixture();await h.openConnection();h.nodes.operation.value=mode;await h.prepare();
    const sent=h.calls.find(call=>call.action==='prepare');
    assert.equal(sent.operation,'read');assert.equal(sent.allowEdit,mode==='read-edit');
  }
});
test('completion empties the timer queue and a fresh prepare starts a new round',async()=>{
  const h=fixture();await h.openConnection();await h.prepare();
  h.respond({automation:{active:false,phase:'completed'},message:'本轮只读已完成。',delivery:'filled'});
  await h.tick();assert.equal(h.queue.size,0);assert.match(h.nodes.message.textContent,/已完成/);
  assert.match(h.nodes.delivery.textContent,/无需再发送/);assert.doesNotMatch(h.nodes.delivery.textContent,/仍需用户点击发送/);
  assert.doesNotMatch(h.nodes.message.textContent,/自动等待/);assert.equal(h.nodes.inspect.disabled,true);
  h.nodes.prepare.emit('click');await h.settle();
  assert.equal(h.queue.size,1);assert.equal(h.calls.filter(call=>call.action==='prepare').length,2);
});

test('read-only, list and edit review describe their actual next action',async()=>{
  for(const mode of ['read','list','read-edit']){
    const h=fixture();await h.openConnection();h.nodes.operation.value=mode;await h.prepare();
    assert.doesNotMatch(h.nodes.delivery.textContent,/需在原对话发送读取结果/);
    h.respond({resultText:'actual local result',delivery:'filled',
      automation:{active:mode==='read-edit',phase:mode==='read-edit'?'watching':'completed'}});
    await h.tick();
    assert.match(h.nodes.delivery.textContent,mode==='read-edit'?/发送真实读取结果/:/无需再发送/);
    if(mode==='read-edit'){
      h.respond({proposal:{reviewId:'review-shown'},automation:{active:false,phase:'review'}});
      await h.tick();assert.match(h.nodes.delivery.textContent,/审阅.*确认/);
      assert.doesNotMatch(h.nodes.delivery.textContent,/发送读取结果/);
    }
  }
});

test('trusted clicks carry the exact displayed proposal and composer packet identities',async()=>{
  const h=fixture();await h.openConnection();await h.prepare();
  h.nodes['fill-prompt'].emit('click');await h.settle();
  assert.equal(h.calls.at(-1).packetId,'prompt-1');
  h.respond({proposal:{reviewId:'review-shown',path:'demo.txt',content:'new',before:'old',baseSha256:'baseline',requestId:'stable-write'},
    automation:{active:false,phase:'review'}});
  await h.tick();assert.equal(h.nodes.approve.disabled,false);
  h.nodes.approve.emit('click');await h.settle();
  assert.equal(h.calls.at(-1).action,'approve');assert.equal(h.calls.at(-1).reviewId,'review-shown');
});

function watchExternalCalls(t){
  const counts={native:0,file:0,storage:0,network:0};
  const api={runtime:{connectNative(){counts.native++;},sendNativeMessage(){counts.native++;}},
    storage:new Proxy({}, {get(){counts.storage++;return ()=>{};}}),
    fileSystem:new Proxy({}, {get(){counts.file++;return ()=>{};}})};
  for(const [name,kind] of Object.entries({fetch:'network',XMLHttpRequest:'network',WebSocket:'network',
    localStorage:'storage',sessionStorage:'storage',indexedDB:'storage',
    showOpenFilePicker:'file',showSaveFilePicker:'file',showDirectoryPicker:'file'})){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,get(){counts[kind]++;return ()=>{};}});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
  }
  return {api,counts};
}

test('local task generation works while claim is pending and after it fails without external calls',async t=>{
  const {api,counts}=watchExternalCalls(t);
  let rejectClaim;
  const h=fixture({externalApi:api,reply:()=>new Promise((resolve,reject)=>{rejectClaim=reject;})});
  h.start();h.nodes.state.emit('click');
  assert.equal(h.calls.length,1);
  for(const phase of ['pending','failed']){
    if(phase==='failed'){rejectClaim({code:'E_CLAIM',message:'No source conversation'});await h.settle();}
    assert.equal(h.nodes['task-description'].disabled,false);
    assert.equal(h.nodes['generate-task'].disabled,false);
    h.nodes['task-description'].value=`请修复项目的搜索功能（${phase}）`;
    h.nodes['task-description'].emit('input');
    h.nodes['generate-task'].emit('click');await h.settle();
    assert.match(h.nodes['task-prompt'].value,new RegExp(`请修复项目的搜索功能（${phase}）`));
    assert.doesNotMatch(h.nodes['task-prompt'].value,/opendesk[.-]|bindingId|requestId|workspaceId/);
    assert.equal(h.calls.length,1,'generation must not claim, refresh, pause or prepare');
    assert.deepEqual(counts,{native:0,file:0,storage:0,network:0});
    assert.equal(h.queue.size,0);
    assert.equal(h.nodes.prepare.disabled,true);
  }
});

test('local generation needs no Native connection, workspace or consent and survives refresh',async t=>{
  const {api,counts}=watchExternalCalls(t);
  const h=fixture({externalApi:api});h.respond({connected:false,workspaces:[]});await h.openConnection();
  const baseline=h.calls.length;
  h.nodes['task-description'].value='为现有项目增加导出功能';
  h.nodes['generate-task'].emit('click');await h.settle();
  const prompt=h.nodes['task-prompt'].value;
  assert.match(prompt,/为现有项目增加导出功能/);
  assert.equal(h.calls.length,baseline);
  assert.equal(h.nodes.consent.checked,false);
  assert.equal(h.nodes.workspace.value,'');
  assert.equal(h.nodes.prepare.disabled,true);
  assert.deepEqual(counts,{native:0,file:0,storage:0,network:0});
  h.nodes.state.emit('click');await h.settle();
  assert.equal(h.nodes['task-prompt'].value,prompt);
  h.nodes['task-description'].value='  ';
  h.nodes['generate-task'].emit('click');await h.settle();
  assert.equal(h.nodes['task-prompt'].value,'');
  assert.equal(h.calls.length,baseline+1);
});

test('opening and generating locally makes zero runtime, Native, storage or network calls',async t=>{
  const {api,counts}=watchExternalCalls(t);
  const h=fixture({externalApi:api});await h.start();
  h.nodes['task-description'].value='整理当前项目的文档';
  h.nodes['generate-task'].emit('click');await h.settle();
  assert.match(h.nodes['task-prompt'].value,/整理当前项目的文档/);
  assert.equal(h.calls.length,0);
  assert.deepEqual(counts,{native:0,file:0,storage:0,network:0});
  assert.equal(h.queue.size,0);
  assert.equal(h.nodes['connect-project'].disabled,true);
});

test('project connection uses only the service-located workspace and revokes the displayed grant',async()=>{
  const h=fixture();h.respond({projectConnection:{task:'修复搜索',name:'Search Project',workspaceId:'exact-project',needsConnection:true,message:'仅用于当前对话'}});
  await h.openConnection();
  assert.equal(h.nodes['project-name'].textContent,'Search Project');
  assert.equal(h.nodes['project-task'].textContent,'修复搜索');
  assert.equal(h.nodes['connect-project'].disabled,false);
  h.nodes.workspace.value='different-legacy-directory';
  h.respond({projectConnection:{task:'修复搜索',name:'Search Project',workspaceId:'exact-project',needsConnection:false,grantId:'project-grant'}});
  h.nodes['connect-project'].emit('click');await h.settle();
  assert.deepEqual(h.calls.at(-1),{protocol:'opendesk.chatgpt.files.v1',action:'connect-project',workspaceId:'exact-project'});
  assert.equal(h.nodes['connect-project'].disabled,true);
  const count=h.calls.length;
  h.nodes['connect-project'].emit('click');await h.settle();assert.equal(h.calls.length,count);
  h.nodes['revoke-project'].emit('click');await h.settle();
  assert.deepEqual(h.calls.at(-1),{protocol:'opendesk.chatgpt.files.v1',action:'revoke-project',grantId:'project-grant'});
  assert.equal(h.calls.some(call=>['prepare','approve'].includes(call.action)),false);
});

test('project connection requires an explicit service request with a located workspace',async()=>{
  for(const projectConnection of [undefined,{workspaceId:'located'},
    {workspaceId:'located',needsConnection:false},{workspaceId:'located',needsConnection:'true'},
    {needsConnection:true}]){
    const h=fixture();h.respond({projectConnection});await h.openConnection();
    assert.equal(h.nodes['connect-project'].disabled,true);
    assert.equal(h.nodes['revoke-project'].disabled,true);
    const count=h.calls.length;
    h.nodes['connect-project'].emit('click');h.nodes['revoke-project'].emit('click');await h.settle();
    assert.equal(h.calls.length,count);
  }
});

test('failed state inspection leaves local generation available and a successful retry clears the error',async()=>{
  let failState=true;
  const h=fixture({reply:message=>message.action==='state'&&failState
    ?{ok:false,error:{code:'E_NATIVE_DISCONNECTED',message:'Native disconnected'}}
    :{ok:true,data:{connected:false,workspaces:[]}}});
  await h.openConnection();assert.equal(h.nodes.error.hidden,false);
  const count=h.calls.length;
  h.nodes['task-description'].value='修复项目启动问题';
  h.nodes['generate-task'].emit('click');await h.settle();
  assert.match(h.nodes['task-prompt'].value,/修复项目启动问题/);
  assert.equal(h.calls.length,count);
  failState=false;h.nodes.state.emit('click');await h.settle();
  assert.equal(h.nodes.error.hidden,true);
});


test('local generation remains independent during a bound state or prepare request',async t=>{
  for(const action of ['state','prepare'])await t.test(action,async t=>{
    const {api,counts}=watchExternalCalls(t);
    const snapshot={connected:true,workspaces:[{workspaceId:'approved',name:'project',access:'read-write'}]};
    let release,pending=false;
    const h=fixture({externalApi:api,reply:message=>pending&&message.action===action
      ?new Promise(resolve=>{release=()=>resolve({ok:true,data:snapshot});})
      :{ok:true,data:snapshot}});
    await h.openConnection();pending=true;
    if(action==='state')h.nodes.state.emit('click');else await h.prepare();
    assert.equal(typeof release,'function','the actual bound operation must be pending');
    assert.equal(h.nodes.state.disabled,true);
    const before=structuredClone(h.calls);
    try{
      h.nodes['task-description'].value='在请求等待期间整理项目文档';
      assert.equal(h.nodes['task-description'].disabled,false);
      assert.equal(h.nodes['generate-task'].disabled,false);
      h.nodes['generate-task'].emit('click');await h.settle();
      const prompt=h.nodes['task-prompt'].value;
      assert.match(prompt,/在请求等待期间整理项目文档/);
      assert.doesNotMatch(prompt,/opendesk[.-]|bindingId|requestId|workspaceId/);
      assert.deepEqual(h.calls,before,'local generation cannot dispatch any additional request');
      assert.deepEqual(counts,{native:0,file:0,storage:0,network:0});
      assert.equal(h.queue.size,0);
      release();await h.settle();
      assert.equal(h.nodes['task-prompt'].value,prompt,'the late reply must preserve the local draft');
    }finally{release();await h.settle();h.window.emit('pagehide');}
  });
});
