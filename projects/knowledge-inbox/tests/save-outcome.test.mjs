import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function mount(create){
  const {document,Event}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.body,q=id=>root.querySelector('#ki-'+id);
  // linkedom implements select.value as getter-only; emulate browser writes.
  for(const select of root.querySelectorAll('select'))Object.defineProperty(select,'value',{
    writable:true,value:select.value??''
  });
  const calls=[],states=[];
  const request=async(operation,payload)=>{
    calls.push([operation,payload]);
    if(operation==='knowledge.list')return {records:[],total:0,bytes:0};
    if(operation==='knowledge.create')return create(payload);
    if(operation==='knowledge.get')throw Error('read unavailable');
    return {};
  };
  runInNewContext(source,{OpenDeskTool:{root,request,setState:state=>states.push({...state})},
    TextEncoder,setTimeout:()=>0,clearTimeout:()=>{}});
  return {q,calls,states,fill(id,value){q(id).value=value;q(id).dispatchEvent(new Event('input'));},
    shortcut(){const event=new Event('keydown');Object.assign(event,{ctrlKey:true,key:'s'});root.dispatchEvent(event);}};
}

test('a lost create receipt keeps the draft and stops click and keyboard replay',async()=>{
  let persisted;
  const app=mount(payload=>{persisted=payload;throw Object.assign(Error('lost receipt'),{code:'E_TOOL_TIMEOUT'});});
  await flush();app.q('new').click();await flush();
  app.fill('create-title','New record');app.fill('create-body','Original draft');
  app.q('create-save').click();await flush();
  assert.equal(persisted.markdown,'Original draft');
  assert.equal(app.q('create-body').value,'Original draft');
  assert.equal(app.q('create-save').disabled,true);
  assert.match(app.q('status').textContent,/保存结果未知/);
  assert.deepEqual(app.states.at(-1),{dirty:true,busy:false});
  app.q('create-save').click();app.shortcut();await flush();
  assert.equal(app.calls.filter(([operation])=>operation==='knowledge.create').length,1);
});

test('a confirmed create with a failed detail read returns to the list without writing twice',async()=>{
  const app=mount(()=>({saved:true,record:{id:'saved'}}));
  await flush();app.q('new').click();await flush();
  app.fill('create-title','New record');app.fill('create-body','Original draft');
  app.q('create-save').click();await flush();
  assert.equal(app.q('list-view').hidden,false);
  assert.equal(app.q('create-view').hidden,true);
  assert.match(app.q('status').textContent,/已保存/);
  assert.deepEqual(app.states.at(-1),{dirty:false,busy:false});
  app.shortcut();await flush();
  assert.equal(app.calls.filter(([operation])=>operation==='knowledge.create').length,1);
});
