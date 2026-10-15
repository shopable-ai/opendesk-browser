import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExtensionCenter} from '../../src/ui/extension-center.js';
import {SIDEBAR_TOOL_FORMAT,SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(predicate){
  for(let i=0;i<80;i++){if(predicate())return;await tick();}
  assert.ok(predicate(),'R4.7 DOM state failed to settle');
}

// Real Extension Center module, DOM/RPC doubles only. Synthetic isTrusted values
// exercise guards and MUST NOT be reported as actual Chrome trusted input.
class ElementDouble {
  constructor(tag,doc){
    this.tagName=tag;this.ownerDocument=doc;this.children=[];this.parentNode=null;
    this.listeners=new Map();this.dataset={};this.style={};this.attributes=new Map();
    this._text='';this.className='';this.hidden=false;this.disabled=false;this.scrollTop=0;
    this.classList={add:name=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),name])].join(' ');}};
  }
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentNode?.isConnected);}
  get childElementCount(){return this.children.length;}
  get offsetWidth(){return this.tagName==='div'&&this.attributes.get('role')==='menu'?192:34;}
  get offsetHeight(){return this.attributes.get('role')==='menu'?Math.max(40,this.children.length*38+10):35;}
  getBoundingClientRect(){return {left:214,right:246,top:488,bottom:524,width:32,height:36};}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  getAttribute(k){return this.attributes.get(k)??null;}
  addEventListener(k,fn){const list=this.listeners.get(k)||[];list.push(fn);this.listeners.set(k,list);}
  removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==fn));}
  dispatch(type,extra={}){
    const event={type,isTrusted:true,target:this,currentTarget:this,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},...extra};
    if(type==='click'&&this.disabled)return event;
    for(const fn of this.listeners.get(type)||[])fn(event);
    return event;
  }
  append(...children){
    for(const child of children){
      if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);
      child.parentNode=this;this.children.push(child);
    }
  }
  replaceChildren(...children){
    if(this.children.some(node=>node.contains(this.ownerDocument.activeElement)))
      this.ownerDocument.activeElement=this.ownerDocument.body;
    for(const node of this.children)node.parentNode=null;
    this.children=[];this._text='';this.append(...children);
  }
  contains(node){return Boolean(node)&&(node===this||this.children.some(child=>child.contains(node)));}
  matches(selector){
    const tag=selector.match(/^(button|div|span|li)(?=\[|$)/)?.[1];
    if(tag&&this.tagName!==tag)return false;
    const attrs=[...selector.matchAll(/\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/g)];
    if(!attrs.length)return selector===this.tagName;
    return attrs.every(([,name,val])=>{
      const key=name.slice(5).replace(/-([a-z])/g,(_,char)=>char.toUpperCase());
      const got=name.startsWith('data-')?this.dataset[key]:this.getAttribute(name);
      return val===undefined?got!==undefined:String(got)===val;
    });
  }
  querySelectorAll(selector){
    const nodes=[];
    const walk=node=>{for(const child of node.children){if(child.matches(selector))nodes.push(child);walk(child);}};
    walk(this);return nodes;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  focus(){this.ownerDocument.activeElement=this;}
  scrollTo({top}){this.scrollTop=top;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
}

const app={format:SIDEBAR_TOOL_FORMAT,id:'quick-notes',title:'快速笔记',description:'记录内容',version:'1.0.0',
  capabilities:['storage.local'],html:'<main>Notes</main>',css:'',js:'void 0;'};
const page=()=>({programId:'reader',manifestHash:'a'.repeat(64),installed:{
  title:'阅读增强',revision:1,manifestHash:'a'.repeat(64),enabled:true,nativeState:'registered',
  sourceHash:'b'.repeat(64),authorization:{status:'granted',generation:5},
  pageRules:{matches:['https://example.com/*']}
}});

function fixture(t,{disabled=false,readError=false}={}){
  const doc={listeners:new Map(),defaultView:{innerWidth:360,innerHeight:640},
    documentElement:{clientWidth:360,clientHeight:640}};
  doc.createElement=tag=>new ElementDouble(tag,doc);
  doc.body=doc.createElement('body');doc.activeElement=doc.body;
  doc.addEventListener=(type,fn)=>{const arr=doc.listeners.get(type)||[];arr.push(fn);doc.listeners.set(type,arr);};
  doc.removeEventListener=(type,fn)=>doc.listeners.set(type,(doc.listeners.get(type)||[]).filter(x=>x!==fn));
  doc.dispatch=(type,event={})=>{
    const e={type,key:'',target:doc.body,preventDefault(){this.prevented=true;},...event};
    for(const fn of doc.listeners.get(type)||[])fn(e);return e;
  };
  const ids=['extension-center-list','extension-center-search','extension-center-list-view',
    'extension-center-detail','extension-center-more','extension-center-menu',
    'extension-center-status','workspace-content','extension-center-empty',
    'extension-center-empty-text','extension-center-count','extension-center-back',
    'extension-center-detail-body','extension-center-reset','extension-center-import',
    'extension-center-reload','extension-center-market','extension-center-menu-wrap',
    'sidebar-tool-file'];
  const nodes=Object.fromEntries(ids.map(id=>{const node=doc.createElement('div');node.id=id;return [id,node];}));
  doc.getElementById=id=>nodes[id]??null;
  nodes['extension-center-list-view'].append(nodes['extension-center-search'],nodes['extension-center-list'],
    nodes['extension-center-empty'],nodes['extension-center-empty-text'],nodes['extension-center-count']);
  nodes['extension-center-menu-wrap'].append(nodes['extension-center-more'],nodes['extension-center-menu']);
  nodes['extension-center-detail'].hidden=true;
  nodes['extension-center-menu'].hidden=true;
  nodes['extension-center-detail'].append(nodes['extension-center-back'],nodes['extension-center-detail-body']);
  doc.body.append(nodes['extension-center-list-view'],nodes['extension-center-detail'],
    nodes['extension-center-status'],nodes['extension-center-menu-wrap'],nodes['workspace-content']);
  const store=new Map([[SIDEBAR_TOOL_STORE,[app]],[SIDEBAR_TOOL_ENABLE_STORE,{[app.id]:!disabled}]]);
  let corrupt=readError,programs=[page()],failPages=false,allowed=true;
  const writes=[],invocations=[],changes=new Set();
  const api={
    runtime:{getURL:path=>'chrome-extension://fixture/'+path},
    permissions:{async contains(){return allowed;},async request(){throw Error('no implicit Chrome grant');}},
    tabs:{async create(opts){invocations.push(['market',opts]);}},
    storage:{
      onChanged:{addListener:cb=>changes.add(cb),removeListener:cb=>changes.delete(cb)},
      local:{async get(keys){
        if(corrupt)throw Error('storage unavailable');
        return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(store.get(k))]));
      }}
    }
  };
  const client={async request(name,args){
    if(name==='listPagePrograms'){
      if(failPages)throw Error('Page authority disconnected');
      return {catalog:programs};
    }
    assert.equal(name,'setInstalledPageEnabled');
    writes.push(structuredClone(args));
    const program=programs.find(row=>row.programId===args.programId);
    assert.equal(args.manifestHash,program.manifestHash);
    assert.equal(args.expectedGeneration,program.installed.authorization.generation);
    program.installed.enabled=args.enabled;
    program.installed.authorization.generation++;
    return {enabled:args.enabled};
  }};
  const sidebarTools={
    openTool(id){invocations.push(['open',id]);return true;},
    openSettings(id){invocations.push(['settings',id]);return true;},
    async toggleEnabled(id,event){
      assert.equal(event.isTrusted,true);invocations.push(['toggle',id]);
      store.set(SIDEBAR_TOOL_ENABLE_STORE,{[id]:!store.get(SIDEBAR_TOOL_ENABLE_STORE)[id]});
      return true;
    },
    openOfficialReview(id){invocations.push(['review',id]);return false;},
    openImport(){invocations.push(['import']);return true;}
  };
  const taskWorkbench={navigate(tab){invocations.push(['navigate',tab]);return true;}};
  const ui=createExtensionCenter({api,client,doc,sidebarTools,taskWorkbench});
  t.after(()=>ui.dispose());
  const list=nodes['extension-center-list'];
  const buttons=key=>list.querySelectorAll('button[data-extension-key]').filter(node=>node.dataset.extensionKey===key);
  const button=(key,action)=>buttons(key).find(node=>node.dataset.extensionAction===action);
  const rowMenu=()=>doc.body.children.find(node=>node.id==='extension-center-row-menu');
  const menuItem=text=>rowMenu()?.children.find(node=>node.textContent.includes(text));
  return {doc,nodes,ui,store,sidebarTools,invocations,writes,list,button,buttons,rowMenu,menuItem,programs,
    setCorrupt:value=>{corrupt=value;},setFailPages:value=>{failPages=value;},
    setAllowed:value=>{allowed=value;},emitStorage:()=>{
      for(const cb of changes)cb({[SIDEBAR_TOOL_ENABLE_STORE]:{oldValue:null,newValue:{}}},'local');
    }};
}

test('R4.7 actual row buttons are 0-or-1 and full-row/visible action share the same launch',async t=>{
  const f=fixture(t);
  await f.ui.refresh();
  const appButtons=f.buttons('app:quick-notes');
  assert.deepEqual(appButtons.map(n=>n.dataset.extensionAction),['main','primary','more']);
  f.button('app:quick-notes','main').dispatch('click');
  f.button('app:quick-notes','primary').dispatch('click');
  assert.deepEqual(f.invocations.filter(x=>x[0]==='open'),[['open','quick-notes'],['open','quick-notes']]);
  const pageButtons=f.buttons('page:reader');
  assert.deepEqual(pageButtons.map(n=>n.dataset.extensionAction),['main','more']);
  assert.equal(f.button('page:reader','primary'),undefined);
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false,'Page row opens detail, not code');
  assert.equal(f.invocations.some(x=>x[0]==='navigate'),false);
  f.nodes['extension-center-back'].dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.equal(f.doc.activeElement.dataset.extensionAction,'main','Back restores the origin row');
});

test('R4.7 stopped app has no fake Settings main; overflow enable uses the sole trusted host route',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  assert.deepEqual(f.buttons('app:quick-notes').map(n=>n.dataset.extensionAction),['main','more']);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.children[0].textContent,/已停用/);
  f.button('app:quick-notes','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false,'disabled row only navigates');
  assert.equal(f.invocations.length,0,'row must neither enable nor open settings implicitly');
  f.nodes['extension-center-back'].dispatch('click');
  f.button('app:quick-notes','more').dispatch('click');
  assert.equal(f.rowMenu().hidden,false);
  assert.ok(f.menuItem('启用应用'));
  f.menuItem('启用应用').dispatch('click');
  await settle(()=>f.store.get(SIDEBAR_TOOL_ENABLE_STORE)[app.id]===true);
  await settle(()=>f.button('app:quick-notes','primary')!==undefined);
  assert.deepEqual(f.invocations.filter(x=>x[0]==='toggle'),[['toggle','quick-notes']]);
  assert.equal(f.invocations.some(x=>x[0]==='open'),false,'enabling must never execute');
});

test('R4.7 installed Page menu is keyboard usable, invokes original generation-bound authority and returns focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('page:reader','more');more.dispatch('click');
  assert.equal(more.getAttribute('aria-expanded'),'true');
  assert.equal(f.rowMenu().hidden,false);
  assert.ok(f.menuItem('停用自动运行'));
  f.doc.dispatch('keydown',{key:'End'});
  assert.match(f.doc.activeElement.textContent,/查看详情/);
  f.doc.dispatch('keydown',{key:'Home'});
  assert.match(f.doc.activeElement.textContent,/停用自动运行/);
  const esc=f.doc.dispatch('keydown',{key:'Escape'});
  assert.equal(esc.prevented,true);
  assert.equal(f.rowMenu().hidden,true);
  assert.equal(f.doc.activeElement,more);
  more.dispatch('click');
  f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.writes.length===1);
  assert.deepEqual(f.writes[0],{programId:'reader',manifestHash:'a'.repeat(64),
    enabled:false,expectedGeneration:5});
  await settle(()=>f.menuItem('停用自动运行')===undefined);
  assert.equal(f.programs[0].installed.enabled,false);
});

test('R4.7 missing Page grant forbids enable; unreadable app status never fabricates primary or toggle',async t=>{
  const f=fixture(t);await f.ui.refresh();
  // First turn Page off through its installed authority.
  f.button('page:reader','more').dispatch('click');f.menuItem('停用自动运行').dispatch('click');
  await settle(()=>f.programs[0].installed.enabled===false);
  await settle(()=>f.button('page:reader','more')?.disabled===false);
  await f.ui.refresh();f.setAllowed(false);
  const pageMore=f.button('page:reader','more');
  assert.ok(pageMore,'Page menu trigger must survive authority refresh');
  pageMore.dispatch('click');
  const enable=f.menuItem('启用自动运行');
  assert.ok(enable,'Page re-enable menu missing: '+JSON.stringify({
    disabled:pageMore.disabled,expanded:pageMore.getAttribute('aria-expanded'),
    menuHidden:f.rowMenu().hidden,menuLabels:f.rowMenu().children.map(x=>x.textContent),
    pageEnabled:f.programs[0].installed.enabled,
    rowText:f.list.children.find(x=>x.dataset.extensionId==='page:reader')?.textContent
  }));
  enable.dispatch('click');
  await settle(()=>f.nodes['extension-center-status'].textContent.includes('E_PERMISSION'));
  assert.equal(f.writes.length,1,'missing Chrome grant prevents second authority mutation');
  f.setCorrupt(true);await f.ui.refresh();
  assert.equal(f.button('app:quick-notes','primary'),undefined);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.children[0].textContent,/状态待核对/);
  f.button('app:quick-notes','more').dispatch('click');
  assert.equal(f.menuItem('停用应用'),undefined);
  assert.equal(f.menuItem('启用应用'),undefined);
  assert.ok(f.menuItem('设置、权限与卸载'));
  assert.equal(f.invocations.some(x=>x[0]==='toggle'),false);
});

test('R4.7 context menu closes on outside click/scroll and never stays outside viewport',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('app:quick-notes','more');
  more.dispatch('click');
  assert.ok(Number.parseInt(f.rowMenu().style.left,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)>=8);
  assert.ok(Number.parseInt(f.rowMenu().style.top,10)<640);
  f.doc.dispatch('click',{target:f.nodes['extension-center-search']});
  assert.equal(f.rowMenu().hidden,true);
  more.dispatch('click');assert.equal(f.rowMenu().hidden,false);
  f.doc.dispatch('scroll');
  assert.equal(f.rowMenu().hidden,true);
  assert.equal(more.getAttribute('aria-expanded'),'false');
});


test('R4.7 async app toggle is single-flight and exposes processing without a second action',async t=>{
  const f=fixture(t,{disabled:true});await f.ui.refresh();
  let release,requested=0;
  const gate=new Promise(resolve=>{release=resolve;});
  f.sidebarTools.toggleEnabled=(_id,event)=>{
    assert.equal(event.isTrusted,true);requested++;return gate;
  };
  f.button('app:quick-notes','more').dispatch('click');
  const oldAction=f.menuItem('启用应用');
  oldAction.dispatch('click');
  assert.equal(requested,1);
  const row=f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes');
  assert.match(row.textContent,/处理中/);
  assert.equal(row.getAttribute('aria-busy'),'true');
  assert.equal(f.button('app:quick-notes','main').disabled,true);
  assert.equal(f.button('app:quick-notes','more').disabled,true);
  assert.equal(f.button('page:reader','main').disabled,true,
    'unrelated row must not appear clickable when the host blocks all actions');
  assert.equal(f.button('page:reader','more').disabled,true);
  assert.equal(f.list.getAttribute('aria-busy'),'true');
  oldAction.dispatch('click');
  assert.equal(requested,1,'stale menu click cannot start concurrent action');
  f.store.set(SIDEBAR_TOOL_ENABLE_STORE,{[app.id]:true});
  release(true);
  await settle(()=>f.button('app:quick-notes','primary')!==undefined);
  assert.equal(f.button('app:quick-notes','more').disabled,false);
  assert.equal(f.button('page:reader','more').disabled,false);
  assert.equal(f.list.getAttribute('aria-busy'),'false');
  assert.equal(f.list.children.find(node=>node.dataset.extensionId==='app:quick-notes')
    .textContent.includes('处理中'),false);
});


test('R4.7 menu detail Back restores the menu origin independent of pointer focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('page:reader','more');
  more.dispatch('click');
  const detail=f.menuItem('查看详情');
  f.doc.activeElement=f.nodes['extension-center-search'];
  detail.dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.nodes['extension-center-back'].dispatch('click');
  assert.equal(f.doc.activeElement.dataset.extensionKey,'page:reader');
  assert.equal(f.doc.activeElement.dataset.extensionAction,'more');
});


test('R4.8 app detail matches the R4.7 preview: no duplicate Open and visible stopped status',async t=>{
  const enabled=fixture(t);await enabled.ui.refresh();
  enabled.button('app:quick-notes','more').dispatch('click');
  enabled.menuItem('查看详情').dispatch('click');
  assert.equal(enabled.nodes['extension-center-detail'].hidden,false);
  const enabledActions=enabled.nodes['extension-center-detail-body'].querySelectorAll('button')
    .map(button=>button.textContent);
  assert.deepEqual(enabledActions,['设置与权限'],
    'the verified primary Open belongs on the list, not duplicated inside Details');
  assert.equal(enabled.nodes['extension-center-detail-body'].textContent.includes('已停用'),false);

  const disabled=fixture(t,{disabled:true});await disabled.ui.refresh();
  disabled.button('app:quick-notes','main').dispatch('click');
  assert.equal(disabled.nodes['extension-center-detail'].hidden,false);
  assert.match(disabled.nodes['extension-center-detail-body'].textContent,/已停用 · 记录内容/,
    'detail introduction preserves the same stopped-state message as the list and preview');
  assert.deepEqual(disabled.nodes['extension-center-detail-body'].querySelectorAll('button')
    .map(button=>button.textContent),['设置与权限']);
});

test('R4.8 first paint reports loading instead of a misleading empty or install state',async t=>{
  const f=fixture(t);
  assert.match(f.nodes['extension-center-status'].textContent,/正在读取已安装扩展/);
  assert.equal(f.nodes['extension-center-status'].dataset.state,'loading');
  assert.equal(f.nodes['extension-center-empty'].hidden,true);
  assert.equal(f.nodes['extension-center-count'].textContent,'正在读取扩展…');
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-count'].textContent.endsWith('个扩展'),true);
});

test('R4.8 background refresh restores row-menu keyboard focus',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const more=f.button('app:quick-notes','more');more.dispatch('click');
  assert.equal(f.rowMenu().hidden,false);
  assert.equal(f.doc.activeElement.tagName,'button');
  await f.ui.refresh();
  assert.equal(f.rowMenu().hidden,true);
  assert.equal(f.doc.activeElement.dataset.extensionKey,'app:quick-notes');
  assert.equal(f.doc.activeElement.dataset.extensionAction,'more');
});

test('R4.8 removed Page during detail falls back to search, not hidden Back',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  assert.equal(f.nodes['extension-center-detail'].hidden,false);
  f.programs.splice(0);
  await f.ui.refresh();
  assert.equal(f.nodes['extension-center-detail'].hidden,true);
  assert.equal(f.doc.activeElement,f.nodes['extension-center-search']);
});

test('R4.8 detail actions use the official secondary button without a duplicate Open',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.button('page:reader','main').dispatch('click');
  const buttons=f.nodes['extension-center-detail-body'].querySelectorAll('button');
  assert.ok(buttons.every(x=>x.className.includes('od-button--secondary')));
  assert.ok(buttons.every(x=>!x.textContent.includes('打开应用')));
  const css=await readFile('src/ui/extension-center.css','utf8');
  assert.doesNotMatch(css,/\.ec-detail-actions button\{[^}]*background:/);
  assert.match(css,/\.ec-detail-actions \.od-button\{font-size:12px\}/);
});
