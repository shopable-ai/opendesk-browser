import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../../examples/sidebar-tools/quick-notes/src/main.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
  constructor(){this.listeners=new Map();this.children=[];this.dataset={};this.hidden=false;this.value='';this.disabled=false;this.checked=false;this.textContent='';}
  addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
  emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event);}
  setAttribute(name,value){(this.attributes??=new Map()).set(name,value);}
  replaceChildren(){this.children=[];}
  append(item){this.children.push(item);}
  focus(){this.focused=true;}
}
function launch({stored={},page={status:'unavailable',message:'受限网页'},writeError=false}={}) {
  const data=structuredClone(stored);
  const ids=['page-summary','page-url','refresh-page','note-count','note-list','note-text','add-note','delete-note','save-note',
    'attach-page','note-attachment','note-status','task-name','open-task'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const document={createElement:()=>new Element()};
  const root={ownerDocument:document,querySelector:selector=>nodes[selector.slice(1)]};
  const calls=[];
  const request=async (op,payload={})=>{
    calls.push([op,payload]);
    if(op==='storage.get')return {value:data[payload.key]??null};
    if(op==='storage.set'){
      if(writeError)throw new Error('磁盘不可用');
      data[payload.key]=structuredClone(payload.value);return {saved:true};
    }
    if(op==='currentPage.info')return page;
    if(op==='tasks.open')return {opened:true};
    throw new Error('invalid operation');
  };
  const sandbox={OpenDeskTool:{root,request},TextEncoder,Date,Math,confirm:()=>true};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(script,sandbox,{filename:'quick-notes/src/main.js'});
  return {nodes,data,calls,request,async flush(){await tick();await tick();await tick();}};
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
