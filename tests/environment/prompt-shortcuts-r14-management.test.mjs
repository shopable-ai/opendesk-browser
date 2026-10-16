// Functional Sandbox UI exercise using the exact shipped classic JS (not Chrome acceptance).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

const tool='examples/sidebar-tools/prompt-shortcuts';
const tick=()=>new Promise(resolve=>setTimeout(resolve,8));
const settle=async()=>{for(let i=0;i<4;i++)await tick();};

class FakeNode{
  constructor(tag='div',id=''){
    this.tagName=tag.toUpperCase();this.id=id;this.className='';this.dataset={};
    this.hidden=false;this.disabled=false;this.checked=false;this.value='';
    this.children=[];this.textContent='';this.attributes={};this.handlers=new Map();
    // Keep dynamic class tokens consistent with the current production markup.
    this.classList={
      contains:token=>this.className.split(/\s+/).includes(token),
      add:(...tokens)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));
        for(const token of tokens)set.add(token);this.className=[...set].join(' ');},
      toggle:(token,force)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled=force===undefined?!set.has(token):Boolean(force);
        if(enabled)set.add(token);else set.delete(token);
        this.className=[...set].join(' ');return enabled;}
    };
  }
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  querySelectorAll(selector){
    if(selector!=='button')return [];
    const all=[];
    const visit=node=>{for(const child of node.children){if(child.tagName==='BUTTON')all.push(child);visit(child);}};
    visit(this);return all;
  }
  addEventListener(name,fn){const old=this.handlers.get(name)||[];this.handlers.set(name,[...old,fn]);}
  removeEventListener(name,fn){this.handlers.set(name,(this.handlers.get(name)||[]).filter(f=>f!==fn));}
  emit(name,event={}){for(const fn of this.handlers.get(name)||[])fn(event);}
  click(){if(!this.disabled)this.emit('click',{preventDefault(){}});}
  focus(){this.focused=true;}
  select(){this.selected=true;}
  setAttribute(name,value){this.attributes[name]=value;}
}
function allDescendants(node){
  const result=[];const visit=n=>{for(const child of n.children){result.push(child);visit(child);}};visit(node);
  return result;
}
function buttonByAction(root,action){
  const found=allDescendants(root).find(node=>node.tagName==='BUTTON'&&node.dataset.action===action);
  assert(found,'missing icon action '+action);return found;
}
function buttonByText(root,text){
  const button=allDescendants(root).find(node=>node.tagName==='BUTTON'&&node.textContent===text);
  assert(button,'missing clickable '+text);return button;
}
async function fixture({deferWrites=false,deferReadback=false,initial=null,initialStored=initial,menuSelection=null,storageFault=null}={}){
  const [html,main,modelSource]=await Promise.all([
    readFile(tool+'/src/index.html','utf8'),readFile(tool+'/src/main.js','utf8'),
    readFile(tool+'/trusted/model.js','utf8')
  ]);
  const nodes=Object.fromEntries([...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)]
    .map(([,tag,attrs,id])=>{const node=new FakeNode(tag,id);
      node.type=attrs.match(/\btype="([^"]+)"/)?.[1]||'';return [id,node];}));
  for(const id of ['ps-edit','ps-leave','ps-empty','ps-error','ps-body-error'])nodes[id].hidden=true;
  nodes['ps-body'].tagName='TEXTAREA';
  nodes['ps-label'].tagName='INPUT';nodes['ps-name'].tagName='INPUT';
  nodes['ps-enabled'].checked=true;nodes['ps-web'].checked=true;
  const copies=[];
  const root={
    ownerDocument:{createElement:tag=>new FakeNode(tag),createElementNS:(_ns,tag)=>new FakeNode(tag),
      execCommand:cmd=>{assert.equal(cmd,'copy');copies.push(nodes['ps-clipboard-buffer'].value);return true;},
      activeElement:null},
    querySelector(selector){
      if(selector.startsWith('#'))return nodes[selector.slice(1)]||null;
      if(selector.startsWith('.'))return allDescendants(nodes['ps-list'])
        .find(node=>node.classList.contains(selector.slice(1)))||null;
      return null;
    },
    addEventListener(){},
  };
  let stored=structuredClone(initialStored),version='a'.repeat(64),writes=0,reads=0;
  let siteStored=null,siteVersion='b'.repeat(64),siteWrites=0;
  const states=[],requests=[],pending=[],readbacks=[];
  const request=async(op,payload={})=>{
    requests.push({op,payload});
    if(op==='prompt.page.context')return {status:'available',origin:'https://example.org',path:'/compose'};
    if(op==='prompt.page.check')return {valid:true,containerMatches:1,editorMatches:1,editorType:'textarea'};
    if(op==='storage.get'&&payload.key==='sites')return {value:structuredClone(siteStored),etag:siteVersion};
    if(op==='storage.set'&&payload.key==='sites'){
      assert.equal(payload.ifMatch,siteVersion);
      siteStored=structuredClone(payload.value);siteWrites++;
      siteVersion=String(siteWrites).padStart(64,'b');
      return {saved:true,etag:siteVersion};
    }
    if(op==='storage.get'){
      assert.equal(payload.key,'library');
      assert.equal(payload.withEtag,true);
      reads++;
      if(reads>1&&storageFault==='unknown')throw Error('Authoritative readback unavailable');
      if(reads>1&&deferReadback){
        const result=await new Promise((resolve,reject)=>readbacks.push({resolve,reject}));
        if(result!==undefined)return result;
      }
      return {value:stored===null?null:structuredClone(stored),etag:version};
    }
    if(op==='storage.set'){
      assert.equal(payload.key,'library');assert.equal(payload.ifMatch,version);
      if(storageFault==='reject')throw Object.assign(Error('Chrome storage unavailable'),{code:'E_HOST_STORAGE_WRITE'});
      const outcome=deferWrites?await new Promise((resolve,reject)=>pending.push({resolve,reject})):null;
      stored=structuredClone(payload.value);writes++;
      version=String(writes).padStart(64,'0');
      if(storageFault==='unknown')throw Object.assign(Error('Acknowledgment not verified'),{code:'E_OUTCOME_UNKNOWN'});
      if(outcome?.failure)throw outcome.failure;
      return outcome&&Object.hasOwn(outcome,'ack')?outcome.ack:{saved:true,etag:version};
    }
    throw Error('unexpected operation: '+op);
  };
  const sandbox={
    Intl,TextEncoder,URL,crypto:{getRandomValues:array=>webcrypto.getRandomValues(array)},
    OpenDeskTool:{root,request,setState:row=>states.push({...row})},
    OpenDeskSDK:{browser:{contextMenu:{
      getStatus:async()=>({enabled:false,approvedOrigins:[],browserPermission:false}),
      register:async()=>({registered:true}),unregister:async()=>({registered:false})
    },launch:{consume:async()=>{if(menuSelection!==null)return {toolId:'prompt-shortcuts',actionId:'add-selection',selection:menuSelection};throw Error('ordinary opening without menu ticket')}}}}
  };
  runInNewContext(modelSource,sandbox,{filename:'trusted/model.js'});
  runInNewContext(main,sandbox,{filename:'src/main.js'});
  await settle();
  return {nodes,root,requests,states,pending,readbacks,copies:()=>copies.slice(),stored:()=>stored,writes:()=>writes,
    siteStored:()=>siteStored,siteWrites:()=>siteWrites};
}
test('R1.7 actual Sandbox UI: content-first create, inline confirm, draft guard and quota recovery',async()=>{
  const f=await fixture(),n=f.nodes;
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(n['ps-edit'].hidden,true);
  assert.equal(n['ps-count'].textContent,'0 个 · 0 个启用');
  n['ps-new'].emit('click');
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].focused,true);
  n['ps-body'].value=' 中文项目\n第二行';n['ps-form'].emit('input');
  assert.equal(f.states.at(-1).dirty,true);
  assert.deepEqual(n['ps-preview-glyph'].children.map(x=>x.textContent),['中','文']);
  assert.equal(n['ps-preview-name'].textContent,'中文');
  assert.match(n['ps-quota-value'].textContent,/^\d+ \/ 8192 B$/);
  assert.equal(n['ps-quota'].dataset.error,'false');
  n['ps-form'].emit('submit',{preventDefault(){}});
  await settle();
  assert.equal(f.writes(),1);
  const saved=f.stored();
  assert.equal(saved.items[0].body,' 中文项目\n第二行');
  assert.equal(saved.items[0].label,'中文');
  assert.equal(saved.items[0].name,'中文');
  assert.equal(saved.items[0].labelAuto,true);
  assert.equal(saved.items[0].enabled,true);
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(f.states.at(-1).dirty,false);

  // Reopen and edit the content, protect unsaved changes on Back.
  buttonByAction(n['ps-list'],'more').click();buttonByAction(n['ps-list'],'edit').emit('click');
  assert.equal(n['ps-label'].value,'','automatic label stays unset during editing');
  n['ps-body'].value='覆盖前的未保存正文';n['ps-form'].emit('input');
  n['ps-cancel'].emit('click');
  assert.equal(n['ps-leave'].hidden,false,'back is deferred to explicit review');
  n['ps-stay'].emit('click');
  assert.equal(n['ps-body'].value,'覆盖前的未保存正文');
  n['ps-cancel'].emit('click');n['ps-discard'].emit('click');
  assert.equal(n['ps-index'].hidden,false);
  assert.equal(f.stored().items[0].body,' 中文项目\n第二行','discard cannot modify saved content');

  // User switches web buttons off without losing any content.
  n['ps-web'].checked=false;n['ps-web'].emit('change');await settle();
  assert.equal(f.stored().settings.webButtons,false);
  assert.equal(f.stored().items.length,1);

  buttonByAction(n['ps-list'],'more').emit('click');
  buttonByAction(n['ps-list'],'toggle').emit('click');await settle();
  assert.equal(f.stored().items[0].enabled,false);

  // Oversized body cannot silently truncate or overwrite the earlier item.
  n['ps-new'].emit('click');
  n['ps-body'].value='多'.repeat(4000);n['ps-form'].emit('input');
  assert.equal(n['ps-quota'].dataset.error,'true','oversized complete JSON flagged before save');
  const earlier=f.writes();
  n['ps-form'].emit('submit',{preventDefault(){}});await settle();
  assert.equal(f.writes(),earlier);
  assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].value.length,4000);
  assert.match(n['ps-error'].textContent,/8 KiB/);
  n['ps-cancel'].emit('click');n['ps-discard'].emit('click');
  assert.equal(f.stored().items.length,1);

  if(!allDescendants(n['ps-list']).some(item=>item.dataset.action==='delete'))
    buttonByAction(n['ps-list'],'more').emit('click');
  buttonByAction(n['ps-list'],'delete').emit('click');
  const confirmation=allDescendants(n['ps-list']).find(node=>node.classList.contains('ps-confirm'));
  assert(confirmation,'delete confirmation must appear inside the prompt card');
  assert.match(confirmation.children[0].textContent,/确认删除/);
  const action=buttonByText(confirmation,'确认删除');
  assert.equal(action.disabled,false);
  action.emit('click');await settle();
  assert.equal(f.stored().items.length,0);
  assert.equal(n['ps-count'].textContent,'0 个 · 0 个启用');
  assert.equal(n['ps-empty'].hidden,false);
});

test('R1.8 Save click writes without requesting form submission in the restricted sandbox',async()=>{
  const f=await fixture(),n=f.nodes;
  assert.equal(n['ps-save'].tagName,'BUTTON');
  assert.equal(n['ps-save'].type,'button','allow-forms is absent: Save must not submit a form');
  let submits=0;n['ps-form'].addEventListener('submit',()=>submits++);
  n['ps-new'].click();n['ps-body'].value='你好';n['ps-form'].emit('input');
  n['ps-save'].click();await settle();
  assert.equal(submits,0,'the click fixture never synthesizes a submit to rescue the Save handler');
  assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1);
  assert.equal(f.stored().items[0].body,'你好');
  assert.equal(n['ps-index'].hidden,false);
});

test('R1.8 keyboard save prevents submission and preserves multiline and IME Enter',async()=>{
  const f=await fixture(),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='键盘保存\n第二行';n['ps-form'].emit('input');
  for(const event of [
    {target:n['ps-body']},
    {target:n['ps-label'],isComposing:true},
    {target:n['ps-name'],keyCode:229},
    {target:n['ps-name'],repeat:true}
  ]){
    let prevented=false;
    n['ps-form'].emit('keydown',{key:'Enter',preventDefault(){prevented=true;},...event});
    assert.equal(prevented,false);
  }
  assert.equal(f.writes(),0);
  let prevented=false;
  n['ps-form'].emit('keydown',{key:'Enter',target:n['ps-name'],preventDefault(){prevented=true;}});
  assert.equal(prevented,true);await settle();
  assert.equal(f.writes(),1);assert.equal(f.stored().items[0].body,'键盘保存\n第二行');
  // Any externally requested submit must still be canceled; hidden forms cannot write.
  let submitPrevented=false;
  n['ps-form'].emit('submit',{preventDefault(){submitPrevented=true;}});
  assert.equal(submitPrevented,true);await settle();assert.equal(f.writes(),1);
});

test('R1.8 deferred create acknowledgement binds the new ID before saving newer input',async()=>{
  const f=await fixture({deferWrites:true}),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='第一版';n['ps-form'].emit('input');
  n['ps-form'].emit('submit',{preventDefault(){}});
  assert.equal(f.pending.length,1);
  const first=f.requests.find(row=>row.op==='storage.set');
  n['ps-body'].value='保存期间的新输入';n['ps-form'].emit('input');
  n['ps-save'].click();assert.equal(f.pending.length,1,'busy click cannot submit a second write');
  f.pending.shift().resolve();await settle();
  assert.equal(n['ps-edit'].hidden,false);assert.equal(n['ps-body'].value,'保存期间的新输入');
  assert.equal(f.states.at(-1).dirty,true);
  // Keep this state-machine regression independent from the separate click wiring regression.
  n['ps-form'].emit('submit',{preventDefault(){}});
  const writes=f.requests.filter(row=>row.op==='storage.set');
  assert.equal(writes.length,2);
  assert.equal(writes[1].payload.value.items.length,1,'second save edits the acknowledged item');
  assert.equal(writes[1].payload.value.items[0].id,first.payload.value.items[0].id);
  assert.equal(writes[1].payload.ifMatch,'1'.padStart(64,'0'));
  f.pending.shift().resolve();await settle();
  assert.equal(f.stored().items.length,1);assert.equal(f.stored().items[0].body,'保存期间的新输入');
  assert.equal(n['ps-index'].hidden,false);assert.equal(f.states.at(-1).dirty,false);
});

test('R1.8 pending save blocks Cancel and an already-open discard confirmation',async()=>{
  const f=await fixture({deferWrites:true}),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='等待确认的正文';n['ps-form'].emit('input');
  n['ps-cancel'].click();assert.equal(n['ps-leave'].hidden,false);
  n['ps-form'].emit('submit',{preventDefault(){}});
  assert.equal(f.states.at(-1).busy,true);
  assert.equal(n['ps-form'].attributes['aria-busy'],'true');
  assert.equal(n['ps-status'].hidden,false);assert.match(n['ps-status'].textContent,/保存中/);
  for(const id of ['ps-cancel','ps-discard']){
    assert.equal(n[id].disabled,true,id+' must be disabled while saving');
    n[id].emit('click'); // Exercise the JS guard too, even if an event was already queued.
    assert.equal(n['ps-edit'].hidden,false);assert.equal(n['ps-body'].value,'等待确认的正文');
  }
  f.pending.shift().resolve();await settle();
  assert.equal(f.states.at(-1).busy,false);assert.equal(n['ps-form'].attributes['aria-busy'],'false');
  assert.equal(n['ps-cancel'].disabled,false);assert.equal(n['ps-discard'].disabled,false);
  assert.equal(f.stored().items[0].body,'等待确认的正文');assert.equal(n['ps-index'].hidden,false);
});

for(const [label,failure] of [
  ['conflict',Object.assign(Error('其他窗口已更新'),{code:'E_STORAGE_CONFLICT'})],
  ['unknown timeout',Error('工具请求超时')],
  ['explicit unknown',Object.assign(Error('回执丢失'),{code:'E_OUTCOME_UNKNOWN'})]
])test('R1.8 deferred '+label+' preserves newer input without replaying a write',async()=>{
  const f=await fixture({deferWrites:true}),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='待保存版本';n['ps-form'].emit('input');
  n['ps-form'].emit('submit',{preventDefault(){}});
  n['ps-body'].value='不能丢失的新草稿';n['ps-form'].emit('input');
  f.pending.shift().reject(failure);await settle();
  assert.equal(n['ps-body'].value,'不能丢失的新草稿');assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-error'].hidden,false);assert.match(n['ps-error'].textContent,/草稿保留/);
  assert.equal(f.states.at(-1).dirty,true);assert.equal(f.states.at(-1).busy,false);
  assert.equal(f.stored(),null);assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1);
  if(label!=='conflict'){
    assert.equal(n['ps-save'].disabled,true,'unconfirmed result requires checking saved state before writing again');
    n['ps-save'].emit('click',{preventDefault(){}});
    n['ps-form'].emit('submit',{preventDefault(){}});await settle();
    assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1,'no write replay after unknown outcome');
  }
});

const initialLibrary={schema:1,settings:{webButtons:true},items:['第一条','第二条'].map((body,order)=>({
  id:'prompt-'+order,body,label:body.slice(0,2),name:body.slice(0,2),labelAuto:true,nameAuto:true,
  shape:'square',enabled:true,order
}))};
function manage(f,operation){
  const n=f.nodes;
  if(operation==='settings'){
    n['ps-web'].checked=false;n['ps-web'].emit('change');return;
  }
  buttonByAction(n['ps-list'],'more').click();
  if(operation==='delete'){
    buttonByAction(n['ps-list'],'delete').click();buttonByText(n['ps-list'],'确认删除').click();
  }else buttonByAction(n['ps-list'],operation==='toggle'?'toggle':'down').click();
}
for(const operation of ['toggle','move','delete','settings'])for(const outcome of [
  {failure:Error('写入后连接中断')},{ack:{saved:true,etag:'invalid'}}
])test('R1.8 '+operation+' waits for authoritative readback after '+(outcome.failure?'transport loss':'invalid ack'),async()=>{
  const f=await fixture({deferWrites:true,deferReadback:true,initial:initialLibrary}),n=f.nodes;
  manage(f,operation);f.pending.shift().resolve(outcome);await settle();
  assert.equal(f.writes(),1,'the host persisted before losing its acknowledgement');
  assert.equal(f.states.at(-1).busy,true,'readback must finish before releasing the write guard');
  assert.equal(f.readbacks.length,1,'unknown writes require an ETag readback');
  assert.equal(n['ps-web'].disabled,true);assert.equal(n['ps-new'].disabled,true);
  n['ps-web'].emit('change');await settle();
  assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1,'no queued write during readback');
  assert.doesNotMatch(n['ps-status'].textContent,/没有更新原数据/);
  // Chrome can return the same stored value with object keys in a different order.
  const stored=structuredClone(f.stored());
  f.readbacks.shift().resolve({value:{settings:stored.settings,
    items:stored.items.map(row=>Object.fromEntries(Object.entries(row).reverse())),schema:stored.schema},
    etag:'1'.padStart(64,'0')});await settle();
  assert.equal(f.states.at(-1).busy,false);assert.equal(n['ps-web'].disabled,false);
  assert.equal(n['ps-count'].textContent,operation==='delete'?'1 个 · 1 个启用':
    operation==='toggle'?'2 个 · 1 个启用':'2 个 · 2 个启用');
  assert.match(n['ps-status'].textContent,/已/);
  n['ps-web'].checked=!f.stored().settings.webButtons;n['ps-web'].emit('change');
  const writes=f.requests.filter(row=>row.op==='storage.set');
  assert.equal(writes.length,2);assert.equal(writes[1].payload.ifMatch,'1'.padStart(64,'0'));
  f.pending.shift().resolve();await settle();
});

for(const readback of ['transport loss','invalid ETag','invalid data','different value'])
test('R1.8 unreadable or inconclusive '+readback+' keeps every library write blocked',async()=>{
  const f=await fixture({deferWrites:true,deferReadback:true,initial:initialLibrary}),n=f.nodes;
  buttonByAction(n['ps-list'],'more').click();
  const toggle=buttonByAction(n['ps-list'],'toggle'),move=buttonByAction(n['ps-list'],'down');
  buttonByAction(n['ps-list'],'delete').click();const remove=buttonByText(n['ps-list'],'确认删除');
  remove.click();f.pending.shift().resolve({failure:Error('删除回执丢失')});await settle();
  assert.equal(f.readbacks.length,1);
  if(readback==='transport loss')f.readbacks.shift().reject(Error('读回超时'));
  else f.readbacks.shift().resolve({value:readback==='invalid data'?{schema:99}:
    readback==='different value'?initialLibrary:f.stored(),etag:readback==='invalid ETag'?'bad':'b'.repeat(64)});
  await settle();
  assert.equal(f.states.at(-1).busy,false);
  assert.equal(n['ps-new'].disabled,true);assert.equal(n['ps-save'].disabled,true);
  assert.equal(n['ps-web'].disabled,true);
  assert.match(n['ps-status'].textContent,/未确认/);assert.doesNotMatch(n['ps-status'].textContent,/没有更新原数据/);
  assert(allDescendants(n['ps-list']).some(node=>node.classList.contains('ps-confirm')),
    'the pending delete identity and confirmation stay available for review');
  for(const node of [toggle,move,remove])node.emit('click');
  n['ps-web'].emit('change');n['ps-save'].emit('click',{preventDefault(){}});await settle();
  assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1,'unknown outcomes cannot be replayed');
});

test('R1.8 missing readback value cannot confirm deletion of the final prompt',async()=>{
  const f=await fixture({deferWrites:true,deferReadback:true,
    initial:{...initialLibrary,items:initialLibrary.items.slice(0,1)}}),n=f.nodes;
  manage(f,'delete');f.pending.shift().resolve({ack:null});await settle();
  f.readbacks.shift().resolve({etag:'b'.repeat(64)});await settle();
  assert.equal(n['ps-new'].disabled,true,'an omitted value is not an authoritative empty library');
  assert.match(n['ps-status'].textContent,/未确认/);assert.equal(n['ps-count'].textContent,'1 个 · 1 个启用');
});

test('R1.8 readback of an uncertain create preserves newer draft and its persisted ID',async()=>{
  const f=await fixture({deferWrites:true,deferReadback:true}),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='最初正文';n['ps-form'].emit('input');n['ps-save'].click();
  const first=f.requests.find(row=>row.op==='storage.set');
  n['ps-body'].value='等待期间的新正文';n['ps-form'].emit('input');
  f.pending.shift().resolve({ack:{saved:false}});await settle();
  assert.equal(f.readbacks.length,1);assert.equal(f.states.at(-1).busy,true);
  n['ps-cancel'].emit('click');n['ps-save'].emit('click',{preventDefault(){}});
  assert.equal(n['ps-edit'].hidden,false);assert.equal(n['ps-body'].value,'等待期间的新正文');
  f.readbacks.shift().resolve();await settle();
  assert.equal(f.states.at(-1).dirty,true);assert.equal(n['ps-edit'].hidden,false);
  assert.equal(n['ps-body'].value,'等待期间的新正文');assert.equal(n['ps-save'].disabled,false);
  n['ps-save'].click();const writes=f.requests.filter(row=>row.op==='storage.set');
  assert.equal(writes.length,2);assert.equal(writes[1].payload.value.items.length,1);
  assert.equal(writes[1].payload.value.items[0].id,first.payload.value.items[0].id);
  assert.equal(writes[1].payload.ifMatch,'1'.padStart(64,'0'));
  f.pending.shift().resolve();await settle();assert.equal(f.stored().items[0].body,'等待期间的新正文');
});

test('R1.8 failed readback preserves the entire pending form without assigning a new identity',async()=>{
  const f=await fixture({deferWrites:true,deferReadback:true}),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value='原正文';n['ps-save'].click();
  n['ps-body'].value='新正文\n保留空行\n\n🧑‍💻';n['ps-label'].value='新';n['ps-name'].value='手动名称';
  n['ps-enabled'].checked=false;n['ps-form'].emit('input');
  f.pending.shift().resolve({failure:Error('保存回执丢失')});await settle();
  assert.equal(f.readbacks.length,1);f.readbacks.shift().reject(Error('读回失败'));await settle();
  assert.equal(n['ps-body'].value,'新正文\n保留空行\n\n🧑‍💻');assert.equal(n['ps-label'].value,'新');
  assert.equal(n['ps-name'].value,'手动名称');assert.equal(f.stored().items[0].shape,'square');
  assert.equal(n['ps-enabled'].checked,false);assert.equal(f.states.at(-1).dirty,true);
  assert.equal(n['ps-edit'].hidden,false);assert.equal(n['ps-save'].disabled,true);
  n['ps-save'].emit('click',{preventDefault(){}});await settle();
  assert.equal(f.requests.filter(row=>row.op==='storage.set').length,1);assert.equal(f.stored().items.length,1);
});

test('R1.8 approved management details focus empty body and retain muted actions and left confirmation',async()=>{
  const f=await fixture(),n=f.nodes;
  n['ps-new'].click();n['ps-body'].value=' \n ';n['ps-body'].focused=false;
  n['ps-name'].focus();n['ps-save'].click();await settle();
  assert.equal(n['ps-body'].focused,true);assert.match(n['ps-body-error'].textContent,/唯一必填/);
  assert.equal(f.writes(),0);
  const css=await readFile(tool+'/src/style.css','utf8');
  const source=await readFile(tool+'/src/main.js','utf8');
  assert.doesNotMatch(source,/start\(item.id\),'quiet'/);
  assert.doesNotMatch(css,/od-button[^}]*background:/);
  assert.match(css,/\.ps-confirm \.ps-actions\s*\{[^}]*justify-content:flex-start/);
});


test('R1.8 native menu prefill is an unsaved draft until explicitly saved or discarded',async()=>{
  const selection='选区第一行🧑‍💻\n\n第三行';
  const f=await fixture({menuSelection:selection}),n=f.nodes;
  assert.equal(n['ps-body'].value,selection);assert.equal(f.writes(),0);
  assert.equal(f.states.at(-1).dirty,true);
  n['ps-cancel'].click();assert.equal(n['ps-leave'].hidden,false);
  n['ps-stay'].click();assert.equal(n['ps-body'].value,selection);
  n['ps-body'].value+='修改';n['ps-form'].emit('input');
  n['ps-body'].value=selection;n['ps-form'].emit('input');
  assert.equal(f.states.at(-1).dirty,true,'returning to the received selection cannot pretend it was saved');
  n['ps-save'].click();await settle();assert.equal(f.stored().items[0].body,selection);
  assert.equal(f.states.at(-1).dirty,false);
  const discard=await fixture({menuSelection:selection});
  discard.nodes['ps-cancel'].click();assert.equal(discard.nodes['ps-leave'].hidden,false);
  discard.nodes['ps-discard'].click();assert.equal(discard.nodes['ps-index'].hidden,false);
  assert.equal(discard.writes(),0);
});

test('R1.13 management is content-first, one-click copy and no redundant grant widgets',async()=>{
  const [html,preview,host]=await Promise.all([
    readFile(tool+'/src/index.html','utf8'),
    readFile(tool+'/preview/index.html','utf8'),
    readFile('src/ui/sidebar-tools.js','utf8')
  ]);
  assert.doesNotMatch(html,/ps-grant|ps-permission-strip|id="ps-menu"|ps-shapes/);
  assert.doesNotMatch(preview,/permissionView|mockRevoke|openPermissions/);
  assert.match(preview,/id="settingsView"/);
  assert.match(host,/promptNativeAction/);
  assert.match(host,/siteCapability\(active\)&&!promptSettings/);
  const f=await fixture(),n=f.nodes;
  n['ps-new'].emit('click');n['ps-body'].value='第一行\n\n第二行';
  n['ps-form'].emit('input');
  n['ps-form'].emit('submit',{preventDefault(){}});await settle();
  const first=allDescendants(n['ps-list']).find(v=>v.classList.contains('ps-card-use'));
  assert(first,'first visual tier must be a clickable full-body button');
  assert.equal(first.children[0]?.textContent,'第一行\n\n第二行');
  first.emit('click');await settle();
  assert.deepEqual(f.copies(),['第一行\n\n第二行']);
  assert.equal(n['ps-status'].textContent,'已复制完整正文。');
});


test('R1.13 P0: text-only 你好 persists across actual tool script reinitialization without randomUUID',async()=>{
  const f=await fixture(),n=f.nodes;
  n['ps-new'].emit('click');
  assert.equal(n['ps-setting-fields'].hidden,false,'settings start expanded');
  n['ps-toggle-settings'].emit('click');
  assert.equal(n['ps-setting-fields'].hidden,true);
  n['ps-body'].value='你好';n['ps-form'].emit('input');
  assert.equal(n['ps-setting-fields'].hidden,true,'typing does not reopen settings');
  n['ps-form'].emit('submit',{preventDefault(){}});
  await settle();
  assert.equal(f.writes(),1);
  assert.equal(f.stored().items.length,1);
  assert.equal(f.stored().items[0].body,'你好');
  assert.match(f.stored().items[0].id,/^[a-zA-Z0-9_-]{8,64}$/);
  assert.equal(n['ps-index'].hidden,false);
  const reopened=await fixture({initialStored:f.stored()});
  assert.equal(reopened.nodes['ps-count'].textContent,'1 个 · 1 个启用');
  assert.equal(reopened.stored().items[0].body,'你好');
  assert.equal(reopened.writes(),0,'reopening cannot duplicate a saved entry');
});

test('R1.13 old round shape remains unchanged during content edit',async()=>{
  const library={schema:1,items:[{id:'legacy-round-123',body:'原内容',label:'原内',name:'手动标题',
    shape:'round',enabled:true,order:0}],settings:{webButtons:true}};
  const f=await fixture({initialStored:library});
  buttonByAction(f.nodes['ps-list'],'more').click();
  buttonByAction(f.nodes['ps-list'],'edit').emit('click');
  f.nodes['ps-body'].value='修改正文';f.nodes['ps-form'].emit('input');
  f.nodes['ps-form'].emit('submit',{preventDefault(){}});
  await settle();
  assert.equal(f.stored().items[0].body,'修改正文');
  assert.equal(f.stored().items[0].shape,'round','editing must not silently change old round shape');
});

test('R1.13 write rejection and outcome unknown protect the draft and never auto-retry',async()=>{
  for(const storageFault of ['reject','unknown']){
    const f=await fixture({storageFault}),n=f.nodes;
    n['ps-new'].emit('click');n['ps-body'].value='你好';n['ps-form'].emit('input');
    n['ps-form'].emit('submit',{preventDefault(){}});
    await settle();
    assert.equal(n['ps-edit'].hidden,false,'do not close failed or uncertain edit');
    assert.equal(n['ps-body'].value,'你好');
    assert.equal(f.writes(),storageFault==='reject'?0:1);
    assert.match(n['ps-error'].textContent,storageFault==='unknown'?/E_OUTCOME_UNKNOWN/:/E_HOST_STORAGE_WRITE/);
    if(storageFault==='unknown'){
      const restarted=await fixture({initialStored:f.stored()});
      assert.equal(restarted.stored().items.length,1,'outcome unknown may have committed exactly once');
    }
  }
});

test('R1.13 empty body focuses the textarea with local validation',async()=>{
  const f=await fixture(),n=f.nodes;n['ps-new'].emit('click');n['ps-body'].value='\n  ';
  n['ps-form'].emit('submit',{preventDefault(){}});
  await settle();
  assert.equal(f.writes(),0);
  assert.equal(n['ps-body'].focused,true);
  assert.match(n['ps-body-error'].textContent,/唯一必填/);
});


test('R2 Sandbox website manager saves an independent verified two-selector rule with ETag',async()=>{
  const f=await fixture(),n=f.nodes;
  n['ps-sites-open'].click();await settle();
  assert.equal(n['ps-sites-panel'].hidden,false);
  n['ps-site-current'].click();await settle();
  assert.equal(n['ps-site-origin'].textContent,'https://example.org');
  assert.equal(n['ps-site-form'].hidden,false);
  n['ps-site-container'].value='main';n['ps-site-container'].emit('input');
  n['ps-site-editor'].value='textarea';n['ps-site-editor'].emit('input');
  n['ps-site-test'].click();await settle();
  assert.match(n['ps-site-verified'].textContent,/验证成功/);
  n['ps-site-save'].click();await settle();
  assert.equal(f.siteWrites(),1);
  assert.equal(f.siteStored().rules[0].origin,'https://example.org');
  assert.equal(f.siteStored().rules[0].containerSelector,'main');
  assert.equal(f.siteStored().rules[0].editorSelector,'textarea');
  assert.equal(f.writes(),0,'website configuration must not rewrite the saved prompt library');
  const saved=f.siteStored().rules[0];
  assert.equal(saved.enabled,true);
  buttonByText(n['ps-sites-list'],'停用').click();await settle();
  assert.equal(f.siteStored().rules[0].enabled,false,'site toggle persists independently');
  assert.equal(f.writes(),0);
});

test('R1.17 per-item controls are SVG-only, keyboard-labelled and still use guarded Host storage',async()=>{
  const f=await fixture({initialStored:initialLibrary}),n=f.nodes;
  const actions=()=>allDescendants(n['ps-list']).filter(node=>node.tagName==='BUTTON'&&node.dataset.action);
  assert.deepEqual(actions().map(node=>node.dataset.action),['more','more']);
  assert.equal(actions()[0].textContent,'');
  buttonByAction(n['ps-list'],'more').click();
  const commandNames=actions().map(node=>node.dataset.action);
  assert.deepEqual(commandNames,['more','edit','toggle','up','down','copy','delete','more']);
  for(const node of actions()){
    assert.equal(node.textContent,'','icon-only controls must not render text');
    assert.match(node.attributes['aria-label'],/\S/);
    assert.equal(node.children[0].tagName,'SVG');
  }
  assert.equal(buttonByAction(n['ps-list'],'up').disabled,true);
  buttonByAction(n['ps-list'],'down').click();await settle();
  assert.deepEqual(f.stored().items.map(row=>row.body),['第二条','第一条']);
  assert.equal(buttonByAction(n['ps-list'],'down').focused,true,'focus follows the reordered item');
  buttonByAction(n['ps-list'],'copy').click();await settle();
  assert.equal(f.copies().at(-1),'第一条');
});
test('R1.17 Save and Continue must acknowledge each Host write before resetting the draft',async()=>{
  const f=await fixture(),n=f.nodes;
  n['ps-new'].click();assert.equal(n['ps-save-next'].hidden,false);
  n['ps-body'].value='第一条';n['ps-form'].emit('input');
  n['ps-save-next'].click();await settle();
  assert.equal(f.writes(),1);assert.equal(n['ps-body'].value,'');
  assert.equal(n['ps-edit'].hidden,false);assert.equal(n['ps-body'].focused,true);
  n['ps-body'].value='第二条';n['ps-form'].emit('input');
  n['ps-save-next'].click();await settle();
  assert.equal(f.writes(),2);
  assert.deepEqual(f.stored().items.map(row=>row.body),['第一条','第二条']);
  assert.notEqual(f.stored().items[0].id,f.stored().items[1].id);
  const fail=await fixture({storageFault:'reject'}),x=fail.nodes;
  x['ps-new'].click();x['ps-body'].value='不可丢失的草稿';x['ps-form'].emit('input');
  x['ps-save-next'].click();await settle();
  assert.equal(x['ps-body'].value,'不可丢失的草稿');
  assert.equal(x['ps-edit'].hidden,false);assert.equal(fail.writes(),0);
});
