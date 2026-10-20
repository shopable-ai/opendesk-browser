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
async function fixture({deferWrites=false,deferReadback=false,deferSiteWrites=false,siteReadbackFault=false,deferLaunch=false,initial=null,initialStored=initial,initialSites=null,pickRequest=null,menuSelection=null,storageFault=null,pageContext={status:'available',origin:'https://example.org',path:'/compose'},checkRequest=null}={}){
  const [html,main,modelSource]=await Promise.all([
    readFile(tool+'/src/index.html','utf8'),readFile(tool+'/src/main.js','utf8'),
    readFile(tool+'/trusted/model.js','utf8')
  ]);
  const nodes=Object.fromEntries([...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)]
    .map(([,tag,attrs,id])=>{const node=new FakeNode(tag,id);
      node.type=attrs.match(/\btype="([^"]+)"/)?.[1]||'';return [id,node];}));
  for(const id of ['ps-edit','ps-leave','ps-empty','ps-error','ps-body-error',
    'ps-transfer-menu','ps-import-panel','ps-import-warning','ps-import-file'])nodes[id].hidden=true;
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
  let siteStored=structuredClone(initialSites),siteVersion='b'.repeat(64),siteWrites=0;
  const states=[],requests=[],pending=[],readbacks=[],sitePending=[],launches=[],downloads=[];
  const timers=new Map();let timerId=0;
  const request=async(op,payload={})=>{
    requests.push({op,payload});
    if(op==='browser.downloads.text'){
      downloads.push(payload);return {started:true};
    }
    if(op==='prompt.page.context')return pageContext;
    if(op==='prompt.page.check')return checkRequest?checkRequest(payload.rule):
      {valid:true,containerMatches:1,editorMatches:1,editorType:'textarea'};
    if(op.startsWith('prompt.page.pick.')&&pickRequest)return pickRequest(op,payload);
    if(op==='storage.get'&&payload.key==='sites'){
      if(siteReadbackFault&&siteWrites>0)throw Error('Website rules readback unavailable');
      return {value:structuredClone(siteStored),etag:siteVersion};
    }
    if(op==='storage.set'&&payload.key==='sites'){
      assert.equal(payload.ifMatch,siteVersion);
      const outcome=deferSiteWrites?await new Promise(resolve=>sitePending.push(resolve)):null;
      if(outcome?.failure?.code==='E_STORAGE_CONFLICT')throw outcome.failure;
      siteStored=structuredClone(payload.value);siteWrites++;
      siteVersion=String(siteWrites).padStart(64,'b');
      if(outcome?.failure)throw outcome.failure;
      return outcome?.ack??{saved:true,etag:siteVersion};
    }
    if(op==='storage.get'){
      assert.equal(payload.key,'library');
      assert.equal(payload.withEtag,true);
      reads++;
      if(reads>1&&(storageFault==='unknown'||(storageFault==='unknown-after-write'&&writes>0)))
        throw Error('Authoritative readback unavailable');
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
      if(['unknown','unknown-after-write'].includes(storageFault))
        throw Object.assign(Error('Acknowledgment not verified'),{code:'E_OUTCOME_UNKNOWN'});
      if(outcome?.failure)throw outcome.failure;
      return outcome&&Object.hasOwn(outcome,'ack')?outcome.ack:{saved:true,etag:version};
    }
    throw Error('unexpected operation: '+op);
  };
  const sandbox={
    Intl,TextEncoder,URL,crypto:{getRandomValues:array=>webcrypto.getRandomValues(array)},
    setTimeout:callback=>{const id=++timerId;timers.set(id,callback);return id;},
    clearTimeout:id=>timers.delete(id),
    OpenDeskTool:{root,request,setState:row=>states.push({...row})},
    OpenDeskSDK:{browser:{contextMenu:{
      getStatus:async()=>({enabled:false,approvedOrigins:[],browserPermission:false}),
      register:async()=>({registered:true}),unregister:async()=>({registered:false})
    },launch:{consume:async()=>{if(deferLaunch)return new Promise(resolve=>launches.push(resolve));if(menuSelection!==null)return {toolId:'prompt-shortcuts',actionId:'add-selection',selection:menuSelection};throw Error('ordinary opening without menu ticket')}}}}
  };
  runInNewContext(modelSource,sandbox,{filename:'trusted/model.js'});
  runInNewContext(main,sandbox,{filename:'src/main.js'});
  await settle();
  return {nodes,root,requests,states,pending,readbacks,sitePending,launches,downloads,
    copies:()=>copies.slice(),stored:()=>stored,writes:()=>writes,
    externalWrite:value=>{stored=structuredClone(value);version='c'.repeat(64);},
    siteStored:()=>siteStored,siteWrites:()=>siteWrites,timers};
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

async function startVerifiedSite(f){
  const n=f.nodes;
  n['ps-sites-open'].click();await settle();
  n['ps-site-current'].click();await settle();
  n['ps-site-container'].value='main';n['ps-site-container'].emit('input');
  n['ps-site-editor'].value='textarea';n['ps-site-editor'].emit('input');
  n['ps-site-test'].click();await settle();
  assert.match(n['ps-site-verified'].textContent,/验证成功/);
}
test('R1.18 site save retains edits typed during pending acknowledgement and updates the same rule',async()=>{
  const f=await fixture({deferSiteWrites:true}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-site-save'].click();await settle();
  assert.equal(f.sitePending.length,1);
  assert.equal(n['ps-site-cancel'].disabled,true);
  assert.equal(n['ps-site-form'].attributes['aria-busy'],'true');
  n['ps-site-editor'].value='[role="textbox"]';n['ps-site-editor'].emit('input');
  n['ps-site-cancel'].emit('click');n['ps-sites-open'].emit('click');
  assert.equal(n['ps-site-form'].hidden,false,'pending write must not discard form');
  f.sitePending.shift()({});await settle();
  assert.equal(f.siteStored().rules[0].editorSelector,'textarea');
  assert.equal(n['ps-site-editor'].value,'[role="textbox"]');
  assert.equal(n['ps-site-form'].hidden,false);
  assert.equal(f.states.at(-1).dirty,true);
  assert.match(n['ps-site-status'].textContent,/尚未保存/);
  n['ps-site-test'].click();await settle();
  n['ps-site-save'].click();await settle();
  assert.equal(f.sitePending.length,1);
  const write=f.requests.filter(x=>x.op==='storage.set'&&x.payload.key==='sites').at(-1);
  assert.equal(write.payload.value.rules.length,1,'follow-up must edit same rule');
  f.sitePending.shift()({});await settle();
  assert.equal(f.siteStored().rules[0].editorSelector,'[role="textbox"]');
  assert.equal(n['ps-site-form'].hidden,true);
});
test('R1.18 unreadable site readback after lost ack forbids replay',async()=>{
  const f=await fixture({deferSiteWrites:true,siteReadbackFault:true}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-site-save'].click();await settle();
  f.sitePending.shift()({failure:Error('Host transport timeout')});await settle();
  assert.equal(f.siteWrites(),1);
  assert.equal(n['ps-site-form'].hidden,false);
  assert.equal(n['ps-site-save'].disabled,true);
  assert.equal(n['ps-site-cancel'].disabled,true);
  assert.match(n['ps-site-status'].textContent,/E_OUTCOME_UNKNOWN/);
  n['ps-site-save'].emit('click');n['ps-site-cancel'].emit('click');await settle();
  assert.equal(f.siteWrites(),1);
  assert.equal(n['ps-site-form'].hidden,false);
});
test('R1.18 recognized site ETag conflict retains draft without claiming success',async()=>{
  const f=await fixture({deferSiteWrites:true}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-site-save'].click();await settle();
  f.sitePending.shift()({failure:Object.assign(Error('ETag changed'),{code:'E_STORAGE_CONFLICT'})});
  await settle();
  assert.equal(f.siteWrites(),0);
  assert.equal(n['ps-site-form'].hidden,false);
  assert.equal(n['ps-site-save'].disabled,false);
  assert.match(n['ps-site-status'].textContent,/E_STORAGE_CONFLICT/);
});
test('R1.18 delayed native selection cannot overwrite an active user draft',async()=>{
  const f=await fixture({deferLaunch:true}),n=f.nodes;
  assert.equal(f.launches.length,1);
  n['ps-new'].click();n['ps-body'].value='刚刚输入的本地草稿';n['ps-form'].emit('input');
  f.launches.shift()({toolId:'prompt-shortcuts',actionId:'add-selection',selection:'旧菜单选区'});
  await settle();
  assert.equal(n['ps-body'].value,'刚刚输入的本地草稿');
  assert.equal(n['ps-edit'].hidden,false);assert.equal(f.writes(),0);
});

for(const target of [0,1])test('R2.4 site draft survives '+(target?'switching rules':'editing the same rule again'),async()=>{
  const initialSites={schema:1,rules:[
    {origin:'https://example.org',pathScope:'/',containerSelector:'main',editorSelector:'textarea',placement:'left-center',editorType:'auto',enabled:true},
    {origin:'https://other.example',pathScope:'/',containerSelector:'article',editorSelector:'input',placement:'left-center',editorType:'auto',enabled:true}
  ]};
  const f=await fixture({initialSites}),n=f.nodes;
  n['ps-sites-open'].click();await settle();
  const rows=n['ps-sites-list'].children.filter(node=>node.className==='ps-site-row');
  buttonByText(rows[0],'编辑').click();
  n['ps-site-container'].value='section[data-draft]';n['ps-site-container'].emit('input');
  n['ps-site-editor'].value='[contenteditable="true"]';n['ps-site-editor'].emit('input');
  n['ps-site-path'].value='/draft';n['ps-site-path'].emit('input');
  n['ps-site-enabled'].checked=false;n['ps-site-enabled'].emit('change');
  const snapshot=()=>[n['ps-site-origin'].textContent,n['ps-site-form-title'].textContent,
    n['ps-site-container'].value,n['ps-site-editor'].value,n['ps-site-path'].value,n['ps-site-enabled'].checked];
  const draft=snapshot();
  for(let attempt=0;attempt<2;attempt++){
    buttonByText(rows[target],'编辑').click();await settle();
    assert.deepEqual(snapshot(),draft,'list edit must not replace any unsaved field');
    assert.equal(f.states.at(-1).dirty,true);
    assert.match(n['ps-site-status'].textContent,/未保存/);
  }
  n['ps-site-current'].click();n['ps-sites-open'].click();await settle();
  assert.deepEqual(snapshot(),draft,'current-site and panel guards preserve the same draft');
  n['ps-site-cancel'].click();await settle();
  assert.equal(n['ps-site-form'].hidden,false,'first discard confirmation keeps the draft');
  assert.deepEqual(snapshot(),draft);
  n['ps-site-editor'].emit('input');
  buttonByText(rows[target],'编辑').click();await settle();
  assert.deepEqual(snapshot(),draft,'continuing to edit must not confirm discard');
  n['ps-site-test'].click();await settle();n['ps-site-save'].click();await settle();
  assert.equal(f.siteWrites(),1);
  assert.equal(f.siteStored().rules[0].origin,'https://example.org');
  assert.equal(f.siteStored().rules[0].pathScope,'/draft');
  assert.equal(f.siteStored().rules[0].editorSelector,'[contenteditable="true"]');
  assert.equal(f.siteStored().rules[0].enabled,false);
  assert.deepEqual(f.siteStored().rules[1],initialSites.rules[1]);
});

for(const phase of ['pending','active'])test('R2.4 cancelling '+phase+' picker retains the complete dirty site draft',async()=>{
  let resolveStart;
  const session='a'.repeat(32),f=await fixture({pickRequest:async op=>{
    if(op==='prompt.page.pick.start')return new Promise(resolve=>{resolveStart=resolve;});
    if(op==='prompt.page.pick.cancel')return {state:'cancelled'};
    throw Error('unexpected picker operation '+op);
  }}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-site-path'].value='/draft';n['ps-site-path'].emit('input');
  n['ps-site-enabled'].checked=false;n['ps-site-enabled'].emit('change');
  const snapshot=()=>[n['ps-site-origin'].textContent,n['ps-site-container'].value,
    n['ps-site-editor'].value,n['ps-site-path'].value,n['ps-site-enabled'].checked];
  const draft=snapshot();
  n['ps-pick-container'].click();await settle();
  if(phase==='active'){resolveStart({state:'selecting',session});await settle();}
  n['ps-site-cancel'].click();await settle();
  if(phase==='pending'){resolveStart({state:'selecting',session});await settle();}
  assert.deepEqual(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').map(row=>row.payload.session),[session]);
  assert.equal(n['ps-site-form'].hidden,false);
  assert.deepEqual(snapshot(),draft);
  assert.equal(f.states.at(-1).dirty,true);
  assert.equal(f.siteWrites(),0);
  assert.equal(f.timers.size,0,'cancelled picker must not leave a poll scheduled');
  assert.match(n['ps-site-status'].textContent,/取消/);
  assert.equal(n['ps-site-status'].dataset.error,'false');
  n['ps-site-test'].click();await settle();n['ps-site-save'].click();await settle();
  assert.equal(f.siteStored().rules[0].pathScope,'/draft');
  assert.equal(f.siteStored().rules[0].enabled,false);
});

for(const sharedSession of [false,true])test('R2.4 late picker receipt preserves the newer '+(sharedSession?'same':'distinct')+' session',async()=>{
  const starts=[],oldSession='a'.repeat(32),newSession=sharedSession?oldSession:'b'.repeat(32);
  const f=await fixture({pickRequest:async(op,payload)=>{
    if(op==='prompt.page.pick.start')return new Promise(resolve=>starts.push(resolve));
    if(op==='prompt.page.pick.cancel')return {state:'cancelled'};
    if(op==='prompt.page.pick.status'){
      assert.equal(payload.session,newSession);return {state:'selected',selector:'textarea#new'};
    }
    throw Error('unexpected picker operation '+op);
  }}),n=f.nodes;
  n['ps-sites-open'].click();await settle();n['ps-site-current'].click();await settle();
  n['ps-pick-container'].click();await settle();
  n['ps-site-cancel'].click();await settle();
  assert.equal(n['ps-site-form'].hidden,false,'cancel selection keeps even a clean form open');
  n['ps-pick-editor'].click();await settle();
  starts[1]({state:'selecting',session:newSession});await settle();
  const currentMessage=n['ps-site-status'].textContent;
  starts[0]({state:'selecting',session:oldSession});await settle();
  assert.deepEqual(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').map(row=>row.payload.session),sharedSession?[]:[oldSession]);
  assert.equal(n['ps-site-status'].textContent,currentMessage,'stale cleanup cannot replace the active picker message');
  assert.equal(f.timers.size,1);
  const [id,poll]=f.timers.entries().next().value;f.timers.delete(id);poll();await settle();
  assert.equal(n['ps-site-editor'].value,'textarea#new');
  assert.equal(n['ps-site-container'].value,'');
  assert.equal(f.states.at(-1).dirty,true);
});

for(const outcome of ['reject','bad-ack'])test('R2.4 late picker cleanup '+outcome+' stays unconfirmed without replay',async()=>{
  let resolveStart;
  const f=await fixture({pickRequest:async op=>{
    if(op==='prompt.page.pick.start')return new Promise(resolve=>{resolveStart=resolve;});
    if(op==='prompt.page.pick.cancel'){
      if(outcome==='reject')throw Object.assign(Error('transport unavailable'),{code:'E_TRANSPORT'});
      return {state:'selecting'};
    }
    throw Error('unexpected picker operation '+op);
  }}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-pick-container'].click();await settle();n['ps-site-cancel'].click();await settle();
  resolveStart({state:'selecting',session:'c'.repeat(32)});await settle();
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').length,1,'cleanup cannot be replayed blindly');
  assert.match(n['ps-site-status'].textContent,/取消.*未确认/);
  assert.doesNotMatch(n['ps-site-status'].textContent,/已取消|清理成功/);
  assert.equal(n['ps-site-status'].dataset.error,'true');
  assert.equal(n['ps-site-form'].hidden,false);
  assert.equal(n['ps-site-container'].value,'main');assert.equal(n['ps-site-editor'].value,'textarea');
  assert.equal(f.states.at(-1).dirty,true);
  assert.equal(f.siteWrites(),0);assert.equal(f.timers.size,0);
});

for(const outcome of ['cancelled','reject'])test('R2.4 stale cleanup '+outcome+' cannot overwrite a newer completed pick',async()=>{
  const starts=[];let finishCancel;
  const oldSession='a'.repeat(32),newSession='b'.repeat(32);
  const f=await fixture({pickRequest:async(op,payload)=>{
    if(op==='prompt.page.pick.start')return new Promise(resolve=>starts.push(resolve));
    if(op==='prompt.page.pick.cancel'){
      assert.equal(payload.session,oldSession);
      return new Promise((resolve,reject)=>{finishCancel=()=>outcome==='reject'?
        reject(Error('old cleanup unavailable')):resolve({state:'cancelled'});});
    }
    assert.equal(op,'prompt.page.pick.status');assert.equal(payload.session,newSession);
    return {state:'selected',selector:'textarea#new'};
  }}),n=f.nodes;
  n['ps-sites-open'].click();await settle();n['ps-site-current'].click();await settle();
  n['ps-pick-container'].click();await settle();n['ps-site-cancel'].click();await settle();
  n['ps-pick-editor'].click();await settle();starts[1]({state:'selecting',session:newSession});await settle();
  if(outcome==='reject'){starts[0]({state:'selecting',session:oldSession});await settle();}
  const [id,poll]=f.timers.entries().next().value;f.timers.delete(id);poll();await settle();
  const message=n['ps-site-status'].textContent;
  assert.equal(n['ps-site-editor'].value,'textarea#new');
  if(outcome==='cancelled'){starts[0]({state:'selecting',session:oldSession});await settle();}
  finishCancel();await settle();
  assert.equal(n['ps-site-status'].textContent,message);
  assert.equal(n['ps-site-status'].dataset.error,'false');
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').length,1);
  assert.equal(f.timers.size,0);
});

test('R2.4 malformed late picker receipts cannot issue a cancellation',async()=>{
  for(const receipt of [{state:'selecting',session:''},{state:'selecting',session:'invalid'},
    {state:'selecting',session:42},{state:'selected',session:'d'.repeat(32)}]){
    let resolveStart;
    const f=await fixture({pickRequest:async op=>{
      assert.equal(op,'prompt.page.pick.start');return new Promise(resolve=>{resolveStart=resolve;});
    }}),n=f.nodes;
    await startVerifiedSite(f);
    n['ps-pick-container'].click();await settle();n['ps-site-cancel'].click();await settle();
    resolveStart(receipt);await settle();
    assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').length,0);
    assert.equal(f.timers.size,0);
    assert.equal(n['ps-site-form'].hidden,false);assert.equal(f.states.at(-1).dirty,true);
    assert.doesNotMatch(n['ps-site-status'].textContent,/已取消|清理成功/);
  }
});

test('R2.4 cancelled picker start rejection reports an unconfirmed cancellation without replay',async()=>{
  let rejectStart;
  const f=await fixture({pickRequest:async op=>{
    assert.equal(op,'prompt.page.pick.start');
    return new Promise((_resolve,reject)=>{rejectStart=reject;});
  }}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-site-path'].value='/draft';n['ps-site-path'].emit('input');
  n['ps-site-enabled'].checked=false;n['ps-site-enabled'].emit('change');
  const snapshot=()=>[n['ps-site-origin'].textContent,n['ps-site-container'].value,
    n['ps-site-editor'].value,n['ps-site-path'].value,n['ps-site-enabled'].checked];
  const draft=snapshot();
  n['ps-pick-container'].click();await settle();n['ps-site-cancel'].click();await settle();
  assert.match(n['ps-site-status'].textContent,/正在取消/);
  rejectStart(Object.assign(Error('start acknowledgement unavailable'),{code:'E_TRANSPORT'}));await settle();
  assert.match(n['ps-site-status'].textContent,/取消.*未确认/);
  assert.match(n['ps-site-status'].textContent,/E_TRANSPORT/);
  assert.match(n['ps-site-status'].textContent,/Esc/);
  assert.doesNotMatch(n['ps-site-status'].textContent,/正在取消|已取消|清理成功/);
  assert.equal(n['ps-site-status'].dataset.error,'true');
  assert.equal(n['ps-site-form'].hidden,false);assert.deepEqual(snapshot(),draft);
  assert.equal(f.states.at(-1).dirty,true);assert.equal(f.siteWrites(),0);
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.start').length,1);
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').length,0);
  assert.equal(f.timers.size,0);
});

test('R2.4 cancelled picker start rejection cannot overwrite or cancel a newer session',async()=>{
  const starts=[],session='e'.repeat(32);
  const f=await fixture({pickRequest:async(op,payload)=>{
    if(op==='prompt.page.pick.start')return new Promise((resolve,reject)=>starts.push({resolve,reject}));
    assert.equal(op,'prompt.page.pick.status');assert.equal(payload.session,session);
    return {state:'selected',selector:'textarea#new'};
  }}),n=f.nodes;
  await startVerifiedSite(f);
  n['ps-pick-container'].click();await settle();n['ps-site-cancel'].click();await settle();
  n['ps-pick-editor'].click();await settle();starts[1].resolve({state:'selecting',session});await settle();
  const message=n['ps-site-status'].textContent;
  starts[0].reject(Object.assign(Error('old start acknowledgement unavailable'),{code:'E_TRANSPORT'}));await settle();
  assert.equal(n['ps-site-status'].textContent,message);
  assert.equal(n['ps-site-status'].dataset.error,'false');
  assert.equal(n['ps-site-form'].hidden,false);assert.equal(f.states.at(-1).dirty,true);
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.start').length,2);
  assert.equal(f.requests.filter(row=>row.op==='prompt.page.pick.cancel').length,0);
  assert.equal(f.timers.size,1);
  const [id,poll]=f.timers.entries().next().value;f.timers.delete(id);poll();await settle();
  assert.equal(n['ps-site-editor'].value,'textarea#new');
  assert.equal(n['ps-site-container'].value,'main');
  assert.equal(f.siteWrites(),0);assert.equal(f.timers.size,0);
});


// R2.7 real classic Sandbox-source tests; mocked Host, not OS download / Chrome installation.
const R27_SEED={schema:1,settings:{webButtons:true},items:[{
  id:'prompt-seed-r27',body:' 已有正文\r\n第二行 ',label:'已有',name:'已存在',
  labelAuto:false,nameAuto:false,shape:'square',enabled:true,order:0
}]};
const R27_BACKUP=items=>JSON.stringify({format:'opendesk.prompt-shortcuts',version:1,
  exportedAt:'2026-10-17T00:00:00.000Z',items});
async function r27Select(f,content,filename='prompt.json'){
  const input=f.nodes['ps-import-file'];
  input.files=[{name:filename,size:Buffer.byteLength(content),text:async()=>content}];
  input.emit('change');await settle();
}
test('R2.7 export reads authoritative ETag library and requests Host JSON download only',async()=>{
  const f=await fixture({initial:R27_SEED}),n=f.nodes;
  n['ps-export'].click();await settle();
  assert.equal(f.downloads.length,1);
  const payload=f.downloads[0],backup=JSON.parse(payload.text);
  assert.match(payload.filename,/^opendesk-prompt-shortcuts-\d{4}-\d\d-\d\d\.json$/);
  assert.equal(backup.format,'opendesk.prompt-shortcuts');
  assert.equal(backup.version,2);
  assert.equal(backup.imageSize,'large','legacy data must export with the default image size');
  assert.deepEqual(backup.items.map(row=>row.body),R27_SEED.items.map(row=>row.body));
  assert.deepEqual(backup.items.map(row=>row.id),R27_SEED.items.map(row=>row.id));
  assert.equal(Object.hasOwn(backup,'sites'),false);
  assert.equal(f.writes(),0,'export does not write the library or site configuration');
  assert.equal(f.siteWrites(),0);
  assert.match(n['ps-status'].textContent,/Chrome 已受理|下载记录/);
});
test('R2.7 import preview + append dedupes normalized body and verifies readback',async()=>{
  const f=await fixture({initial:R27_SEED}),n=f.nodes;
  const file=R27_BACKUP([
    {body:'已有正文\n第二行',label:'已有',name:'重复',enabled:true},
    {id:'prompt-seed-r27',body:'另一个🧑‍💻\n提示词',labelAuto:true,nameAuto:true,enabled:false,shape:'round'}
  ]);
  await r27Select(f,file);
  assert.equal(n['ps-import-panel'].hidden,false);
  assert.match(n['ps-import-stats'].textContent,/可追加 1 条/);
  assert.equal(f.writes(),0,'preview never writes');
  assert.equal(n['ps-new'].disabled,true,'editing is frozen during import confirmation');
  n['ps-import-append'].click();await settle();
  assert.equal(f.writes(),1);
  assert.equal(f.stored().items.length,2);
  assert.equal(f.stored().items[0].body,R27_SEED.items[0].body);
  assert.equal(f.stored().items[1].enabled,false);
  assert.equal(f.stored().items[1].shape,'round');
  assert.notEqual(f.stored().items[1].id,'prompt-seed-r27','backup IDs are never trusted');
  assert.equal(f.siteWrites(),0);
  assert.equal(n['ps-import-panel'].hidden,true);
  assert.match(n['ps-status'].textContent,/已核实保存/);
  assert.equal(f.requests.filter(req=>req.op==='storage.get'&&req.payload.key==='library').length>=3,true);
});
test('R2.7 import replace requires two clicks and retains original settings',async()=>{
  const f=await fixture({initial:{...R27_SEED,settings:{webButtons:false}}}),n=f.nodes;
  await r27Select(f,R27_BACKUP([{body:'新正文',label:'新正',enabled:true}]));
  n['ps-import-replace'].click();await settle();
  assert.equal(f.writes(),0,'first click arms but never writes');
  assert.equal(n['ps-import-warning'].hidden,false);
  assert.equal(n['ps-import-replace'].textContent,'确认替换');
  n['ps-import-replace'].click();await settle();
  assert.equal(f.writes(),1,'all entries replaced atomically');
  assert.equal(f.stored().items.length,1);
  assert.equal(f.stored().items[0].body,'新正文');
  assert.equal(f.stored().settings.webButtons,false,'import must preserve global web preference');
  assert.equal(f.siteWrites(),0);
});
test('R2.7 import cancellation, invalid JSON, invalid fields and oversized files fail closed',async()=>{
  const f=await fixture({initial:R27_SEED}),n=f.nodes;
  n['ps-import-file'].files=[];n['ps-import-file'].emit('change');await settle();
  assert.equal(f.writes(),0);
  for(const payload of ['{',R27_BACKUP([{body:'',label:'xx'}]),
    JSON.stringify({format:'opendesk.prompt-shortcuts',version:99,items:[{body:'x'}]}),
    R27_BACKUP([{body:'合法正文',label:'超过三字'}]),'x'.repeat(262145)]){
    await r27Select(f,payload);
    assert.equal(f.writes(),0,'invalid import cannot save');
    assert.equal(n['ps-import-panel'].hidden,true);
    assert.match(n['ps-status'].textContent,/预检查失败/);
  }
  await r27Select(f,R27_BACKUP([{body:'取消预览'}]));
  assert.equal(n['ps-import-panel'].hidden,false);
  n['ps-import-cancel'].click();await settle();
  assert.equal(n['ps-import-panel'].hidden,true);
  assert.equal(f.writes(),0);
  assert.equal(f.stored().items.length,1);
});
test('R2.7 ETag stale preview is recomputed without overwriting other window',async()=>{
  const f=await fixture({initial:R27_SEED}),n=f.nodes;
  await r27Select(f,R27_BACKUP([{body:'新增正文'}]));
  const other={...R27_SEED,items:[...R27_SEED.items,
    {id:'prompt-other-r27',body:'其他窗口新增',label:'其他',name:'其他窗口',
      labelAuto:false,nameAuto:false,shape:'square',enabled:true,order:1}]};
  f.externalWrite(other);
  n['ps-import-append'].click();await settle();
  assert.equal(f.writes(),0,'must not overwrite changed ETag');
  assert.equal(n['ps-import-panel'].hidden,false);
  assert.match(n['ps-status'].textContent,/已经变化/);
  assert.equal(f.stored().items.length,2);
});
test('R2.7 unknown write receipt keeps pending staged import and blocks replay',async()=>{
  const f=await fixture({initial:R27_SEED,storageFault:'unknown-after-write'}),n=f.nodes;
  await r27Select(f,R27_BACKUP([{body:'未确认的新正文'}]));
  n['ps-import-append'].click();await settle();
  assert.equal(f.writes(),1,'one Host write may have been persisted');
  assert.equal(n['ps-import-panel'].hidden,false,'do not drop source backup');
  assert.equal(n['ps-import-append'].disabled,true,'unknown write locks resubmission');
  n['ps-import-append'].click();await settle();
  assert.equal(f.writes(),1,'unknown result must never auto retry');
  assert.match(n['ps-status'].textContent,/导入未完成/);
});
test('R2.7 export/import roundtrip preserves normalized model fields',async()=>{
  const f=await fixture({initial:R27_SEED}),n=f.nodes;
  n['ps-export'].click();await settle();
  const json=f.downloads[0].text;
  // Replace content with the same payload, verifying that a valid exported record
  // can be safely imported under newly issued ID with all appearance flags intact.
  await r27Select(f,json);
  n['ps-import-replace'].click();await settle();
  n['ps-import-replace'].click();await settle();
  assert.equal(f.writes(),1);
  const before=R27_SEED.items[0],after=f.stored().items[0];
  for(const field of ['body','label','name','labelAuto','nameAuto','shape','enabled'])
    assert.equal(after[field],before[field],field);
  assert.notEqual(after.id,before.id);
});


test('R2.8 website configuration comes before long preset list in the actual tool UI',async()=>{
  const html=await readFile(tool+'/src/index.html','utf8');
  const ids=['ps-sites-open','ps-site-current','ps-site-form','ps-site-status','ps-sites-list'];
  const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
  for(let i=0;i<positions.length;i++){
    assert(positions[i]>=0,ids[i]+' must exist in shipped HTML');
    if(i)assert(positions[i]>positions[i-1],ids[i]+' must follow '+ids[i-1]);
  }
});

test('R2.8 Claude proposals require real Host check and explicit website save',async()=>{
  const target='[data-testid="chat-input"][contenteditable="true"]';
  const f=await fixture({
    pageContext:{status:'available',origin:'https://claude.ai',path:'/new'},
    checkRequest:rule=>{
      if(rule.containerSelector==='main'&&rule.editorSelector===target)
        return {valid:true,origin:'https://claude.ai',containerMatches:1,editorMatches:1,editorType:'richtext'};
      throw Error('No unique visible composer');
    }
  }),n=f.nodes;
  n['ps-sites-open'].click();await settle();n['ps-site-current'].click();await settle();
  assert.equal(n['ps-site-auto'].hidden,false);
  assert.equal(n['ps-site-container'].value,'main');
  assert.equal(n['ps-site-editor'].value,target);
  assert.match(n['ps-site-verified'].textContent,/本页定位通过.*未做实际插入测试/);
  assert.equal(f.siteWrites(),0,'auto-detection must never grant or persist permission');
  n['ps-site-save'].click();await settle();
  assert.equal(f.siteWrites(),1);
  assert.equal(f.siteStored().rules[0].editorSelector,target);
});

test('R2.8 Grok candidate miss leaves user picker available and cannot save',async()=>{
  const f=await fixture({
    pageContext:{status:'available',origin:'https://grok.com',path:'/'},
    checkRequest:()=>{throw Error('No unique visible editor');}
  }),n=f.nodes;
  n['ps-sites-open'].click();await settle();n['ps-site-current'].click();await settle();
  assert.equal(n['ps-site-container'].value,'');
  assert.equal(n['ps-site-editor'].value,'');
  assert.match(n['ps-site-verified'].textContent,/手动点选/);
  assert(f.requests.some(row=>row.op==='prompt.page.check'));
  n['ps-site-save'].click();await settle();
  assert.equal(f.siteWrites(),0,'a failed probe is never a verified rule');
});

test('R2.8 late auto-locate check cannot overwrite a manually changed input',async()=>{
  let finish;
  const f=await fixture({
    pageContext:{status:'available',origin:'https://claude.ai',path:'/new'},
    checkRequest:()=>new Promise(resolve=>{finish=resolve;})
  }),n=f.nodes;
  n['ps-sites-open'].click();await settle();n['ps-site-current'].click();await settle();
  assert.equal(n['ps-site-auto'].disabled,true);
  n['ps-site-editor'].value='textarea#my-draft';n['ps-site-editor'].emit('input');
  finish({valid:true,origin:'https://claude.ai',containerMatches:1,editorMatches:1,editorType:'richtext'});
  await settle();
  assert.equal(n['ps-site-editor'].value,'textarea#my-draft');
  assert.doesNotMatch(n['ps-site-verified'].textContent,/本页定位通过/);
  assert.equal(n['ps-site-auto'].disabled,false);
  assert.equal(f.siteWrites(),0);
});
