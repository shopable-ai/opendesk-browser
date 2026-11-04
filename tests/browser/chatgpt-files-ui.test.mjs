import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatGPTFilesUI} from '../../src/native-agent/chatgpt-files-ui.js';

// Only trusted-page UI scheduling is exercised here; sender/Native authority
// is verified separately by the controller and actual browser tests.
function fixture(){
  const ids=['workspace','path','operation','task','consent','prepare','state','approve','inspect','reconcile','observe',
    'fill-prompt','fill-result','source','connection','prompt','result','request','proposal','proposal-path','sha',
    'before','after','result-status','delivery','observed','message','error'];
  const element=()=>({value:'',checked:false,hidden:false,disabled:false,handlers:new Map(),
    setAttribute(){},replaceChildren(){},append(){},addEventListener(type,fn){this.handlers.set(type,fn);},
    emit(type){this.handlers.get(type)?.({isTrusted:true});}});
  const nodes=Object.fromEntries(ids.map(id=>[id,element()]));
  nodes.path.value='demo.txt';nodes.operation.value='read';nodes.error.hidden=true;
  const root={setAttribute(){},querySelectorAll(){return ids.slice(0,14).map(id=>nodes[id]);}};
  const window=element(),doc={defaultView:window,createElement:element,
    getElementById:id=>id==='chatgpt-files-root'?root:nodes[id.replace('files-','')]};
  const queue=new Map();let counter=0,failPoll=false;
  const timers={setTimeout(fn){const id=++counter;queue.set(id,fn);return id;},clearTimeout(id){queue.delete(id);}};
  const calls=[];let snapshot={source:{url:'https://chatgpt.com/c/test'},connected:true,
    workspaces:[{workspaceId:'approved',name:'approved directory',access:'read-write'}]};
  const api={runtime:{async sendMessage(message){
    calls.push(message);
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
    start:()=>initChatGPTFilesUI({api,document:doc,timers}),async tick(){const [id,fn]=queue.entries().next().value;queue.delete(id);await fn();}};
}
test('automatic scheduling requires explicit prepare and never confirms a write',async()=>{
  const h=fixture();await h.start();assert.equal(h.queue.size,0);
  await h.prepare();assert.equal(h.queue.size,1);await h.tick();await h.tick();
  assert.equal(h.calls.filter(call=>call.action==='poll').length,2);
  assert.equal(h.calls.some(call=>call.action==='approve'),false);
  h.nodes.path.value='other.txt';h.nodes.path.emit('input');await h.settle();
  assert.equal(h.queue.size,0);assert.equal(h.nodes.consent.checked,false);
  assert.equal(h.calls.at(-1).action,'pause');
});
test('uncertain responses stop automatic timers instead of retrying',async()=>{
  const h=fixture();await h.start();await h.prepare();h.fail();await h.tick();
  assert.equal(h.queue.size,0);assert.equal(h.nodes.error.hidden,false);
  assert.equal(h.calls.filter(call=>call.action==='poll').length,1);
});
test('closing the trusted document ends automatic scheduling',async()=>{
  const h=fixture();await h.start();await h.prepare();assert.equal(h.queue.size,1);
  h.window.emit('pagehide');assert.equal(h.queue.size,0);
});

test('trusted clicks carry the exact displayed proposal and composer packet identities',async()=>{
  const h=fixture();await h.start();await h.prepare();
  h.nodes['fill-prompt'].emit('click');await h.settle();
  assert.equal(h.calls.at(-1).packetId,'prompt-1');
  h.respond({proposal:{reviewId:'review-shown',path:'demo.txt',content:'new',before:'old',baseSha256:'baseline',requestId:'stable-write'},
    automation:{active:false,phase:'review'}});
  await h.tick();assert.equal(h.nodes.approve.disabled,false);
  h.nodes.approve.emit('click');await h.settle();
  assert.equal(h.calls.at(-1).action,'approve');assert.equal(h.calls.at(-1).reviewId,'review-shown');
});
