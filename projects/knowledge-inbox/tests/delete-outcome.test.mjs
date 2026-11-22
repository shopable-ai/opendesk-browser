import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

const [html,source]=await Promise.all(['index.html','main.js'].map(name=>
  readFile(new URL('../src/'+name,import.meta.url),'utf8')));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const failure=(code,message=code)=>Object.assign(Error(message),{code});
const record={id:'target',revision:3,title:'Record to delete',kind:'draft',tags:[],note:'Keep note',
  draft:'Saved draft',markdown:'Original',mode:'manual',imageCount:0,updatedAt:'2026-11-22'};

async function mount(remove,get=()=>({record,markdown:record.markdown}),list=()=>[record]){
  const {document}=parseHTML('<html><body>'+html+'</body></html>');
  const root=document.body,q=id=>root.querySelector('#ki-'+id),calls=[];
  for(const select of root.querySelectorAll('select'))Object.defineProperty(select,'value',{
    writable:true,value:select.value??''
  });
  const request=async(operation,payload)=>{
    calls.push([operation,payload]);
    if(operation==='knowledge.list')return {records:list(),total:1,bytes:1};
    if(operation==='knowledge.get')return get(payload);
    if(operation==='knowledge.remove')return remove(payload);
  };
  runInNewContext(source,{OpenDeskTool:{root,request},TextEncoder,setTimeout:()=>0,clearTimeout:()=>{}});
  await flush();q('records').querySelector('button').click();await flush();
  assert.equal(q('detail').hidden,false);
  const confirmDelete=async()=>{q('delete').click();await flush();q('confirm-yes').click();await flush();};
  const ids=operation=>calls.filter(([name])=>name===operation).map(([,payload])=>payload.id);
  return {q,confirmDelete,ids};
}

test('lost delete receipt locks replay; only definitive absence of that record resolves it',async()=>{
  let checking=false,readOutcome='permission';
  const app=await mount(payload=>{
    assert.equal(payload.id,record.id);assert.equal(payload.ifRevision,3);
    checking=true;throw failure('E_TOOL_TIMEOUT');
  },({id})=>{
    assert.equal(id,record.id);
    if(checking&&readOutcome==='permission')throw failure('E_TOOL_DISABLED','无法读取：记录已不存在，请刷新');
    if(checking&&readOutcome==='missing')throw failure('E_KNOWLEDGE_NOT_FOUND');
    return {record,markdown:record.markdown};
  });
  await app.confirmDelete();
  assert.equal(app.q('delete').disabled,true);
  assert.equal(app.q('delete-check').hidden,false);
  assert.equal(app.q('content').value,'Saved draft');
  assert.match(app.q('status').textContent,/删除结果未知/);
  await app.confirmDelete();
  readOutcome='present';app.q('delete-check').click();await flush();
  assert.equal(app.q('detail').hidden,false);
  assert.equal(app.q('delete').disabled,true);
  assert.match(app.q('status').textContent,/仍存在/);
  readOutcome='missing';app.q('delete-check').click();await flush();
  assert.equal(app.q('list-view').hidden,false);
  assert.match(app.q('status').textContent,/已核对.*不存在/);
  assert.deepEqual(app.ids('knowledge.get'),['target','target','target','target']);
  assert.deepEqual(app.ids('knowledge.remove'),['target']);
});

test('a malformed success receipt cannot close the detail or clear the draft',async()=>{
  const app=await mount(()=>({saved:true}));
  await app.confirmDelete();
  assert.equal(app.q('detail').hidden,false);
  assert.equal(app.q('content').value,'Saved draft');
  assert.equal(app.q('delete').disabled,true);
});

test('returning to the same record does not reset the delete guard',async()=>{
  const app=await mount(()=>{throw failure('E_OUTCOME_UNKNOWN');});
  await app.confirmDelete();
  app.q('back').click();await flush();
  app.q('records').querySelector('button').click();await flush();
  assert.equal(app.q('delete').disabled,true);
  assert.equal(app.q('delete-check').hidden,false);
  await app.confirmDelete();
  assert.deepEqual(app.ids('knowledge.remove'),['target']);
});

test('known conflict remains a rejection and confirmed deletion survives a list read failure',async()=>{
  let deleted=false,attempts=0;
  const app=await mount(()=>{
    if(++attempts===1)throw failure('E_STORAGE_CONFLICT','记录已在其他窗口修改');
    deleted=true;return {saved:true,removed:true};
  },undefined,()=>{if(deleted)throw Error('list unavailable');return [record];});
  await app.confirmDelete();
  assert.equal(app.q('delete').disabled,false);
  assert.match(app.q('status').textContent,/其他窗口/);
  assert.deepEqual(app.ids('knowledge.get'),['target']);
  await app.confirmDelete();
  assert.equal(app.q('list-view').hidden,false);
  assert.match(app.q('status').textContent,/已删除.*列表刷新失败/);
  assert.deepEqual(app.ids('knowledge.remove'),['target','target']);
});
