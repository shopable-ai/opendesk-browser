// Unit-only fake Page harness. Does NOT prove official website acceptance or native authority.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
  '../../examples/tasks/chatgpt-relay-calculator-r1.js'),'utf8');
const KEY='opendesk.chatgpt-relay-calculator.r1.active';
const id='123e4567-e89b-12d3-a456-426614174000';
function fixture(input={}, {previous=null,wrongA=false}={}){
  let state='initial';
  const sent=[],storage=new Map();
  if(previous)storage.set(KEY,JSON.stringify(previous));
  const initial={url:'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    path:'/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    origin:'https://chatgpt.com',users:1,assistants:1,
    editorCount:1,draft:'',rich:false,busy:false,occupied:false,shortHistory:true,
    lastUser:'seed',lastAnswer:'seed',done:true,lastOrder:true};
  const left=input.left??17,right=input.right??25,factor=input.factor??3;
  function observe(){
    if(state==='initial')return {...initial};
    if(state==='A')return {...initial,users:2,assistants:2,lastUser:sent[0],
      lastAnswer:JSON.stringify({runId:id,step:'A',result:left+right+(wrongA?1:0)})};
    if(state==='new')return {...initial,url:'https://chatgpt.com/',path:'/',users:0,assistants:0,
      lastUser:'',lastAnswer:'',lastOrder:false,done:false};
    if(state==='B')return {...initial,url:'https://chatgpt.com/c/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      path:'/c/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',users:1,assistants:1,
      lastUser:sent[1],lastAnswer:JSON.stringify({runId:id,step:'B',result:(left+right)*factor})};
    throw new Error('invalid fake state');
  }
  const page={
    evaluate:async(fn,...args)=>{
      if(fn.name==='relayObservePage')return observe();
      if(fn.name==='relaySubmitOnce'){
        assert.equal(args[1].url,observe().url);
        sent.push(args[0]);state=state==='initial'?'A':'B';
        return {clicked:true};
      }
      return undefined;
    },
    getByRole:(role,{name})=>({
      count:async()=>role==='link'&&name==='New chat'?1:0,
      click:async()=>{assert.equal(state,'A');state='new';}
    })
  };
  const context=vm.createContext({page,params:input,crypto:{randomUUID:()=>id},
    AppStorage:{getItem:async k=>storage.get(k)||null,
      setItem:async(k,v)=>{storage.set(k,v);}},
    URL,Date,JSON,Object,Number,RegExp,Error,String,
    setTimeout:cb=>{cb();return 0;}});
  vm.runInContext(source,context,{filename:'chatgpt-relay-calculator-r1.js'});
  return {run:()=>context.main(),sent,storage};
}
test('17+25=42 -> distinct new chat 42*3=126, one startup',async()=>{
  const t=fixture(),out=await t.run();
  assert.equal(out.A.value,42);
  assert.equal(out.B.inputFromA,42);
  assert.equal(out.B.value,126);
  assert.notEqual(out.A.url,out.B.url);
  assert.equal(t.sent.length,2);
  assert.match(t.sent[1],/真实读回的结果是 42/);
  const saved=JSON.parse(t.storage.get(KEY));
  assert.equal(saved.state,'completed');
  assert.equal(saved.resultA,42);
  assert.equal(saved.resultB,126);
});
test('19+25=44 -> B=132, no hardcoded 42 handoff',async()=>{
  const t=fixture({left:19,right:25,factor:3}),out=await t.run();
  assert.equal(out.A.value,44);
  assert.equal(out.B.value,132);
  assert.match(t.sent[1],/真实读回的结果是 44/);
});
test('incorrect A answer stops before B',async()=>{
  const t=fixture({}, {wrongA:true});
  await assert.rejects(t.run(),e=>e.code==='E_RELAY_RESPONSE');
  assert.equal(t.sent.length,1);
  assert.equal(JSON.parse(t.storage.get(KEY)).state,'A_may_have_sent');
});
test('unknown previous send cannot silently start a new run',async()=>{
  const t=fixture({}, {previous:{state:'B_may_have_sent'}});
  await assert.rejects(t.run(),e=>e.code==='E_RELAY_RECONCILE');
  assert.equal(t.sent.length,0);
});
test('invalid parameter types cannot initiate page effects',async()=>{
  const t=fixture({left:'17'});
  await assert.rejects(t.run(),e=>e.code==='E_RELAY_PARAMS');
  assert.equal(t.sent.length,0);
});
