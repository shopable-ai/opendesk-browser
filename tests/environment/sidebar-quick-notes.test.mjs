import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const script=readFileSync(new URL('../../examples/sidebar-tools/quick-notes/src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const etag=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class Element {
  constructor(){this.listeners=new Map();this.children=[];this.dataset={};this.hidden=false;this.value='';this.disabled=false;this.checked=false;this.textContent='';}
  addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
  emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  setAttribute(name,value){(this.attributes??=new Map()).set(name,value);}
  replaceChildren(){this.children=[];}
  append(item){this.children.push(item);}
  focus(){this.focused=true;}
}
function launch({stored={},shared,page={status:'unavailable',message:'受限网页'},writeError=false,
  failLegacyCleanup=false,getGate,setGate,confirm=()=>true}={}) {
  const data=shared||structuredClone(stored);
  const ids=['page-summary','page-url','refresh-page','note-count','note-list','note-text','add-note','delete-note','save-note',
    'attach-page','note-attachment','note-status','task-name','open-task'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const document={createElement:()=>new Element()};
  const root=new Element();root.ownerDocument=document;
  root.querySelector=selector=>nodes[selector.slice(1)];
  const calls=[];
  const request=async (op,payload={})=>{
    calls.push([op,payload]);
    if(op==='storage.get'){
      if(getGate&&payload.key==='notes')await getGate.promise;
      const value=data[payload.key]??null;
      return payload.withEtag?{value,etag:etag(value)}:{value};
    }
    if(op==='storage.set'){
      if(setGate&&payload.key==='notes')await setGate.promise;
      if(writeError||(failLegacyCleanup&&payload.key==='note'))throw new Error('磁盘不可用');
      if(payload.ifMatch!==undefined&&payload.ifMatch!==etag(data[payload.key]??null))
        throw new Error('工具数据已在其他窗口修改，请重新打开确认');
      data[payload.key]=structuredClone(payload.value);
      return {saved:true,etag:etag(payload.value)};
    }
    if(op==='currentPage.info')return page;
    if(op==='tasks.open')return {opened:true};
    throw new Error('invalid operation');
  };
  const sandbox={OpenDeskTool:{root,request},TextEncoder,Date,Math,confirm};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(script,sandbox,{filename:'quick-notes/src/main.js'});
  return {root,nodes,data,calls,request,async flush(){await tick();await tick();await tick();await tick();}};
}

test('offline mode restores R1 note, preserves content on upgrade, and supports multiple notes',async()=>{
  const app=launch({stored:{note:'旧版中文原文\n第二行'}});
  await app.flush();
  assert.match(app.nodes['page-summary'].textContent,/仍可使用离线笔记/);
  assert.equal(app.nodes['note-text'].value,'旧版中文原文\n第二行');
  assert.equal(app.nodes['note-list'].children.length,1);
  app.nodes['save-note'].emit('click');await app.flush();
  assert.equal(app.data.notes[0].text,'旧版中文原文\n第二行');
  app.nodes['add-note'].emit('click');
  app.nodes['note-text'].value='新的离线笔记';
  app.nodes['note-text'].emit('input');
  app.nodes['save-note'].emit('click');await app.flush();
  assert.equal(app.data.notes.length,2);
  assert.equal(app.data.notes[0].text,'新的离线笔记');
  assert.equal(app.nodes['note-count'].textContent,'2 条');
  const reopened=launch({stored:app.data});await reopened.flush();
  assert.equal(reopened.nodes['note-text'].value,'新的离线笔记');
  reopened.nodes['note-list'].children[1].emit('click');
  assert.equal(reopened.nodes['note-text'].value,'旧版中文原文\n第二行');
  reopened.nodes['delete-note'].emit('click');await reopened.flush();
  assert.equal(reopened.data.notes.length,1);
  assert.equal(reopened.data.notes[0].text,'新的离线笔记');
});

test('HTTP page metadata is opt-in and never requires network for offline save',async()=>{
  const app=launch({page:{status:'available',title:'演示表单',url:'http://127.0.0.1:43111/demo-form.html'}});
  await app.flush();
  assert.equal(app.nodes['page-summary'].textContent,'演示表单');
  assert.equal(app.nodes['page-url'].textContent,'http://127.0.0.1:43111/demo-form.html');
  app.nodes['attach-page'].checked=true;
  app.nodes['note-text'].value='测试';
  app.nodes['save-note'].emit('click');await app.flush();
  assert.equal(app.data.notes[0].pageUrl,'http://127.0.0.1:43111/demo-form.html');
  const unavailable=launch({stored:app.data});await unavailable.flush();
  assert.equal(unavailable.nodes['note-text'].value,'测试');
  assert.equal(unavailable.nodes['attach-page'].disabled,false,'older page association is removable offline');
});

test('empty note, storage failure and size limit are explicit and leave persisted state intact',async()=>{
  const app=launch({writeError:true});await app.flush();
  app.nodes['save-note'].emit('click');await app.flush();
  assert.match(app.nodes['note-status'].textContent,/请输入/);
  app.nodes['note-text'].value='不会落盘';app.nodes['save-note'].emit('click');await app.flush();
  assert.match(app.nodes['note-status'].textContent,/保存失败/);
  assert.equal(app.data.notes,undefined);
  const big=launch();await big.flush();
  big.nodes['note-text'].value='中'.repeat(3200);big.nodes['save-note'].emit('click');await big.flush();
  assert.match(big.nodes['note-status'].textContent,/8 KB/);
  assert.equal(big.data.notes,undefined);
});

test('deleting a recovered legacy note clears its original key',async()=>{
  const app=launch({stored:{note:'删除测试'}});await app.flush();
  app.nodes['delete-note'].emit('click');await app.flush();
  assert.deepEqual(Array.from(app.data.notes),[]);
  assert.equal(app.data.note,'');
});

test('R18.1 initial restore gates all mutations and preserves Chinese data',async()=>{
  const gate=deferred(),app=launch({stored:{notes:[{id:'prior',text:'最初内容',updatedAt:1}]},getGate:gate});
  assert.equal(app.nodes['save-note'].disabled,true);
  assert.equal(app.nodes['note-text'].disabled,true);
  app.nodes['add-note'].emit('click');
  app.nodes['save-note'].emit('click');
  assert.equal(app.calls.filter(([op])=>op==='storage.set').length,0);
  gate.resolve();await app.flush();
  assert.equal(app.nodes['note-text'].value,'最初内容');
  assert.equal(app.nodes['save-note'].disabled,false);
});

test('R18.1 two panels reject stale whole-array writes while keeping the losing draft',async()=>{
  const shared={notes:[{id:'same',text:'初始内容',updatedAt:1}],note:''};
  const a=launch({shared}),b=launch({shared});
  await a.flush();await b.flush();
  a.nodes['note-text'].value='窗口甲';a.nodes['note-text'].emit('input');
  a.nodes['save-note'].emit('click');await a.flush();
  b.nodes['note-text'].value='窗口乙';b.nodes['note-text'].emit('input');
  b.nodes['save-note'].emit('click');await b.flush();
  assert.equal(shared.notes[0].text,'窗口甲');
  assert.equal(b.nodes['note-text'].value,'窗口乙');
  assert.match(b.nodes['note-status'].textContent,/其他窗口/);
});

test('R18.1 failed legacy cleanup reports partial success and never resurrects deletion',async()=>{
  const app=launch({stored:{note:'待删除的旧版笔记'},failLegacyCleanup:true});
  await app.flush();app.nodes['delete-note'].emit('click');await app.flush();
  assert.deepEqual(Array.from(app.data.notes),[]);
  assert.equal(app.data.note,'待删除的旧版笔记');
  assert.match(app.nodes['note-status'].textContent,/已删除.*清理失败/);
  const reopened=launch({stored:app.data});await reopened.flush();
  assert.equal(reopened.nodes['note-count'].textContent,'0 条');
  reopened.nodes['note-text'].value='新笔记';reopened.nodes['save-note'].emit('click');
  await reopened.flush();
  assert.equal(reopened.data.notes[0].text,'新笔记');
  assert.equal(reopened.data.note,'');
});

test('R18.1 repeated save and unsafe actions are blocked until the write completes',async()=>{
  const gate=deferred(),app=launch({setGate:gate});
  await app.flush();
  app.nodes['note-text'].value='第一稿';app.nodes['save-note'].emit('click');
  app.nodes['save-note'].emit('click');
  app.nodes['add-note'].emit('click');
  app.nodes['delete-note'].emit('click');
  app.nodes['note-text'].value='保存中的新草稿';app.nodes['note-text'].emit('input');
  assert.equal(app.calls.filter(([op,p])=>op==='storage.set'&&p.key==='notes').length,1);
  gate.resolve();await app.flush();
  assert.equal(app.data.notes.length,1);
  assert.equal(app.data.notes[0].text,'第一稿');
  assert.equal(app.nodes['note-text'].value,'保存中的新草稿');
  assert.match(app.nodes['note-status'].textContent,/未保存/);
});

test('R18.1 page invalidation clears stale tab metadata without blocking offline notes',async()=>{
  const app=launch({page:{status:'available',title:'演示表单',url:'http://127.0.0.1:43111/demo-form.html'}});
  await app.flush();app.root.emit('opendesk-page-changed');
  assert.match(app.nodes['page-summary'].textContent,/网页已切换/);
  assert.equal(app.nodes['page-url'].hidden,true);
  app.nodes['note-text'].value='离线内容';app.nodes['save-note'].emit('click');await app.flush();
  assert.equal(app.data.notes[0].pageUrl,'');
  assert.equal(app.data.notes[0].text,'离线内容');
});
