import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdblockPermissionControls} from '../../examples/sidebar-tools/adblock/trusted/host-controls.js';
import {ADBLOCK_ID,ADBLOCK_CAPABILITY,ADBLOCK_PERMISSION,ADBLOCK_STORE}
  from '../../examples/sidebar-tools/adblock/trusted/policy.js';

class Node{
  constructor(){this.children=[];this.listeners={};this.attributes={};this.hidden=false;
    this.disabled=false;this.textContent='';this.isConnected=true;this.ownerDocument=null;}
  append(...nodes){this.children.push(...nodes);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this.attributes[name]=value;}
  focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
function event(){
  const listeners=new Set();
  return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
    emit(...args){for(const fn of [...listeners])fn(...args);}};
}
const tool={id:ADBLOCK_ID,version:'1.3.0',capabilities:[ADBLOCK_CAPABILITY]};
const status=(enabled=true)=>({enabled,exceptions:[],currentHost:'news.example.com',
  permissions:{dnr:true},rules:{verified:true}});
const tick=()=>new Promise(done=>setImmediate(done));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};}
function fixture(){
  const storage=event(),added=event(),removed=event();
  const api={storage:{onChanged:storage},permissions:{onAdded:added,onRemoved:removed,
    request:()=>Promise.resolve(true)}};
  const doc={body:new Node(),activeElement:null,createElement(){
    const node=new Node();node.ownerDocument=doc;return node;
  }};
  doc.activeElement=doc.body;
  function mount(runOperation){
    const container=new Node(),notices=[];
    const settingsControl=doc.createElement('button');
    settingsControl.setAttribute('aria-label','打开 AdBlock 产品设置');
    const controls=createAdblockPermissionControls({api,doc,container,settingsControl,
      notice:(...args)=>notices.push(args),runOperation});
    const section=container.children[0];
    const walk=node=>[node,...node.children.flatMap(walk)];
    const find=check=>walk(section).find(check);
    return {controls,container,notices,settingsControl,
      global:find(node=>node.attributes['aria-label']==='全局广告拦截'),
      site:find(node=>node.attributes.role==='switch'&&node.attributes['aria-label']!=='全局广告拦截'),
      info:find(node=>node.attributes.role==='status'),
      action:label=>find(node=>node.attributes['aria-label']===label),
      find};
  }
  return {api,doc,storage,added,removed,mount,
    change:()=>storage.emit({[ADBLOCK_STORE]:{newValue:{}}},'local')};
}
function switches(panel,on){
  assert.equal(panel.global.attributes['aria-checked'],String(on));
  assert.equal(panel.site.attributes['aria-checked'],String(on));
  assert.equal(panel.global.textContent,on?'开启':'关闭');
  assert.equal(panel.site.textContent,on?'开启':'关闭');
}
function unknown(panel){
  assert.equal(panel.global.textContent,'状态未确认');
  assert.equal(panel.global.disabled,true);
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.equal(panel.site.attributes['aria-checked'],'false');
  assert.equal(panel.site.disabled,true);
}

test('two visible AdBlock panels synchronize both switches and aria after one disables',async()=>{
  const f=fixture();let current=status();
  const run=async op=>{
    if(op==='adblock.disable'){current=status(false);f.change();}
    return structuredClone(current);
  };
  const a=f.mount(run),b=f.mount(run);
  a.controls.render(tool,false,true);b.controls.render(tool,false,true);await tick();
  switches(a,true);switches(b,true);
  a.global.listeners.click({isTrusted:true});
  unknown(b);
  await tick();switches(a,false);switches(b,false);
});

test('site guidance follows unavailable, globally paused, excepted and protected states',async()=>{
  const f=fixture();let current={...status(),currentHost:null};
  const panel=f.mount(async()=>structuredClone(current));
  panel.controls.render(tool,false,true);await tick();
  const text=klass=>panel.find(node=>node.className===klass)?.textContent;
  assert.equal(panel.site.disabled,true);
  assert.match(text('adblock-native-help'),/切换到普通 HTTP\(S\) 网站/);
  assert.equal(panel.find(node=>node.textContent==='当前页面不支持过滤')?.textContent,'当前页面不支持过滤');
  current=status(false);f.change();await tick();
  assert.match(text('adblock-native-help'),/开启全局保护后/);
  current={...status(),exceptions:['news.example.com']};f.change();await tick();
  assert.match(text('adblock-native-help'),/当前网站已停用过滤/);
  current=status();f.change();await tick();
  assert.match(text('adblock-native-help'),/网页显示异常时/);
});

test('only AdBlock local storage and permission changes invalidate visible controls',async()=>{
  const f=fixture();let current=status(),reads=0;
  const panel=f.mount(async()=>{reads++;return structuredClone(current);});
  panel.controls.render(tool,false,true);await tick();
  f.storage.emit({other:{}},'local');f.storage.emit({[ADBLOCK_STORE]:{}},'sync');
  assert.equal(reads,1);switches(panel,true);
  current={...status(false),permissions:{dnr:false}};
  f.removed.emit({permissions:[ADBLOCK_PERMISSION]});unknown(panel);
  await tick();switches(panel,false);
  current=status();f.added.emit({permissions:[ADBLOCK_PERMISSION]});unknown(panel);
  await tick();switches(panel,true);assert.equal(reads,3);
});
test('revocation restart warning never claims permission approval or completed cleanup',async()=>{
  const f=fixture();
  const panel=f.mount(async()=>({...status(false),permissions:{dnr:false},
    rules:{verified:false},restartRequired:true}));
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.global.disabled,true);
  assert.equal(panel.global.textContent,'需重启 Chrome');
  const texts=panel.find(node=>node.className==='adblock-native-status is-off');
  assert.match(panel.info.textContent,/权限已撤销.*停止过滤尚未确认.*完整.*重启/);
  assert.ok(texts.children.some(node=>/权限已撤销.*重启/.test(node.textContent)));
  assert.doesNotMatch(panel.info.textContent,/权限已批准|已停止过滤/);
});

test('in-flight reads coalesce invalidations and never paint an older response',async()=>{
  const f=fixture(),first=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(()=>++reads===1?first.promise:latest.promise);
  panel.controls.render(tool,false,true);
  f.change();f.change();f.removed.emit({permissions:[ADBLOCK_PERMISSION]});
  first.resolve(status());await tick();
  assert.equal(reads,2,'one final read must follow all in-flight invalidations');unknown(panel);
  latest.reject(Error('native read unavailable'));await tick();
  unknown(panel);assert.match(panel.info.textContent,/状态读取失败.*native read unavailable/);
  assert.equal(reads,2,'a failed read must remain unknown without a retry loop');
});

test('changes while a trusted operation is busy require a final authoritative read',async()=>{
  const f=fixture(),operation=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?
    (++reads===1?Promise.resolve(status()):latest.promise):operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});
  f.change();f.added.emit({permissions:[ADBLOCK_PERMISSION]});f.change();unknown(panel);
  operation.resolve(status(false));await tick();
  assert.equal(reads,2);unknown(panel);
  latest.resolve({...status(),exceptions:['news.example.com']});await tick();
  assert.equal(panel.global.attributes['aria-checked'],'true');
  assert.equal(panel.site.attributes['aria-checked'],'false');
  assert.equal(panel.site.textContent,'关闭');
});

test('a failed final read after busy drift cannot retain a successful mutation snapshot',async()=>{
  const f=fixture(),operation=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?++reads===1?Promise.resolve(status()):
    Promise.reject(Error('final read failed')):operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});f.change();
  operation.resolve(status(false));await tick();
  unknown(panel);assert.match(panel.info.textContent,/final read failed/);assert.equal(reads,2);
});

test('hide and tool changes release listeners and reject old reads across reopening',async()=>{
  const f=fixture(),first=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(()=>++reads===1?first.promise:latest.promise);
  panel.controls.render(null);assert.equal(f.storage.listeners.size,0);
  panel.controls.render(tool,false,true);panel.controls.render(tool,false,true);
  assert.equal(f.storage.listeners.size,1);assert.equal(f.added.listeners.size,1);
  panel.controls.render(null);
  assert.equal(f.storage.listeners.size,0);assert.equal(f.added.listeners.size,0);
  assert.equal(f.removed.listeners.size,0);assert.equal(panel.container.hidden,true);
  f.change();assert.equal(reads,1);
  panel.controls.render(tool,false,true);first.resolve(status());await tick();unknown(panel);
  assert.equal(reads,2);latest.resolve(status(false));await tick();switches(panel,false);
  panel.controls.render({...tool,version:'1.3.1'},false,true);await tick();
  assert.equal(f.storage.listeners.size,1);
  panel.controls.render({id:'other',version:'1.0.0',capabilities:[]},false,true);
  assert.equal(f.storage.listeners.size,0);assert.equal(f.removed.listeners.size,0);
});

test('a pending mutation cannot revive state in a new tool generation',async()=>{
  const f=fixture(),operation=deferred(),latest=deferred();let reads=0;
  const panel=f.mount(op=>op==='adblock.status'?++reads===1?Promise.resolve(status()):
    latest.promise:operation.promise);
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});panel.controls.render(null);
  panel.controls.render(tool,false,true);operation.resolve(status(false));await tick();
  unknown(panel);assert.equal(reads,2);
  latest.resolve(status());await tick();switches(panel,true);
});

test('reuses already-granted DNR authorization with no repeat prompt',async()=>{
  const f=fixture();let requests=0,current=status(false);const calls=[];
  f.api.permissions.request=()=>{requests++;throw Error('redundant request');};
  const panel=f.mount(async op=>{
    calls.push(op);
    if(op==='adblock.enable')current=status();
    return structuredClone(current);
  });
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true,currentTarget:panel.global});await tick();
  assert.equal(requests,0);
  assert.deepEqual(calls,['adblock.status','adblock.enable']);
  switches(panel,true);
});
test('unknown permission status never requests or claims enabled',async()=>{
  const f=fixture();let requests=0;const calls=[];
  f.api.permissions.request=()=>{requests++;return Promise.resolve(true);};
  const panel=f.mount(async op=>{
    calls.push(op);return {...status(false),permissions:{dnr:null},rules:{verified:false}};
  });
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.global.disabled,true);
  panel.global.listeners.click({isTrusted:true});await tick();
  assert.equal(requests,0);
  assert.deepEqual(calls,['adblock.status']);
  assert.equal(panel.global.attributes['aria-checked'],'false');
});
test('permission requests stay synchronous and stale grants cannot enable another generation',async()=>{
  const f=fixture(),grant=deferred();let requests=0;const operations=[];
  f.api.permissions.request=()=>{requests++;f.added.emit({permissions:[ADBLOCK_PERMISSION]});
    return grant.promise;};
  const panel=f.mount(async op=>{operations.push(op);return {...status(false),permissions:{dnr:false},rules:{verified:false}};});
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:false});assert.equal(requests,0);
  panel.global.listeners.click({isTrusted:true});assert.equal(requests,1);
  panel.controls.render(null);panel.controls.render(tool,false,true);
  grant.resolve(true);await tick();
  assert.equal(operations.includes('adblock.enable'),false);switches(panel,false);
});

test('a permission event inside request still ends with a fresh read after enable',async()=>{
  const f=fixture(),grant=deferred();let current={...status(false),permissions:{dnr:false},rules:{verified:false}},requests=0,reads=0;
  f.api.permissions.request=()=>{requests++;f.added.emit({permissions:[ADBLOCK_PERMISSION]});
    return grant.promise;};
  const panel=f.mount(async op=>{
    if(op==='adblock.enable')current=status();else reads++;
    return structuredClone(current);
  });
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});assert.equal(requests,1);unknown(panel);
  assert.equal(reads,1,'the permission event must wait for the busy action');
  grant.resolve(true);await tick();switches(panel,true);assert.equal(reads,2);
});

test('preview and dispose release only their own listeners and suppress stale read errors',async()=>{
  const f=fixture(),pending=deferred();let reads=0;
  const a=f.mount(()=>pending.promise),b=f.mount(async()=>{reads++;return status();});
  a.controls.render(tool,false,true);b.controls.render(tool,false,true);await tick();
  assert.equal(f.storage.listeners.size,2);
  a.controls.render(tool,true,true);
  assert.equal(f.storage.listeners.size,1);assert.equal(f.added.listeners.size,1);
  pending.reject(Error('obsolete read'));await tick();assert.equal(a.notices.length,0);
  f.change();await tick();assert.equal(reads,2);switches(b,true);
  b.controls.dispose();
  assert.equal(f.storage.listeners.size,0);assert.equal(f.added.listeners.size,0);
  assert.equal(f.removed.listeners.size,0);assert.equal(b.container.hidden,true);
});


test('first optional DNR grant explains Chrome restart without presenting active filtering',async()=>{
  const f=fixture();let requests=0;
  f.api.permissions.request=()=>{requests++;return Promise.resolve(true);};
  const panel=f.mount(async()=>({...status(false),restartRequired:true,rules:{verified:false}}));
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.equal(panel.global.textContent,'需重启 Chrome');
  assert.equal(panel.global.disabled,true);assert.equal(panel.site.disabled,true);
  assert.match(panel.global.textContent,/重启 Chrome/);
  assert.match(panel.info.textContent,/尚未开启/);
  panel.global.listeners.click({isTrusted:false});assert.equal(requests,0);
});

test('first grant restart guidance does not leave a technical error across product pages',async()=>{
  const f=fixture();let granted=false;
  const panel=f.mount(async op=>{
    if(op==='adblock.status')return granted?
      {...status(false),restartRequired:true,rules:{verified:false}}:
      {...status(false),permissions:{dnr:false},rules:{verified:false}};
    granted=true;
    throw Object.assign(Error('Chrome 首次批准 DNR 后需完整退出并重启浏览器，然后手动开启过滤'),
      {code:'E_ADBLOCK_RESTART_REQUIRED'});
  });
  panel.controls.render(tool,false,true);await tick();
  panel.global.listeners.click({isTrusted:true});await tick();await tick();
  assert.equal(panel.global.disabled,true);
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.match(panel.info.textContent,/权限已批准.*尚未开启.*完整退出.*重新打开/);
  assert.doesNotMatch(panel.info.textContent,/E_ADBLOCK/);
  assert.deepEqual(panel.notices,[],'expected restart guidance must stay in its authoritative product status');
  assert.equal(panel.find(node=>node.textContent.includes('DNR')),undefined);
  assert.equal(panel.find(node=>node.textContent.includes('可信宿主')),undefined);
  assert.ok(panel.find(node=>node.textContent.includes('返回概览，在“当前网站”中开启过滤')));
  panel.controls.toggleProductSettings();
  assert.equal(panel.controls.view(),'settings');
  assert.ok(panel.container.children[0].children.includes(panel.info),
    'unresolved global protection status stays outside the page-specific content');
  assert.match(panel.info.textContent,/全局保护.*尚未开启.*完整退出.*重新打开/);
  assert.deepEqual(panel.notices,[],'navigating to settings must not retain a stale global error');
});

test('R1.9 trusted product cards and host-owned three-view navigation',async()=>{
  const f=fixture();let reads=0;
  const panel=f.mount(async()=>{reads++;return status();});
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.controls.view(),'overview');
  assert.equal(panel.find(node=>node.className==='adblock-native-logo'),undefined,
    'the tool shell already owns product identity; no duplicate logo inside controls');
  assert.equal(panel.find(node=>node.className==='adblock-native-title'),undefined);
  assert.equal(panel.action('打开 AdBlock 产品设置'),undefined,
    'the product must not duplicate the shared toolbar settings control');
  panel.controls.toggleProductSettings();
  assert.equal(panel.controls.view(),'settings');
  panel.action('从 AdBlock 设置返回概览').listeners.click({});
  assert.equal(panel.controls.view(),'overview');
  assert.equal(f.doc.activeElement,panel.settingsControl,
    'return focus belongs to the single shared settings button');
  assert.ok(panel.find(node=>node.className==='adblock-native-card adblock-native-global'));
  assert.ok(panel.find(node=>node.className==='adblock-native-card adblock-native-site'));
  assert.ok(panel.find(node=>node.textContent==='暂无可核实统计'));
  assert.equal(panel.find(node=>node.className==='adblock-native-count').textContent,'—');
  panel.action('管理已停用的网站').listeners.click({});
  assert.equal(panel.controls.view(),'exceptions');
  panel.action('从已停用的网站返回概览').listeners.click({});
  assert.equal(panel.controls.view(),'overview');
  panel.controls.toggleProductSettings();
  assert.equal(panel.controls.view(),'settings');
  panel.action('从设置查看已停用的网站').listeners.click({});
  assert.equal(panel.controls.view(),'exceptions');
  assert.equal(reads,1,'navigation must neither remount nor reread');
});

test('R1.9 missing DNR readback never paints an active native toggle',async()=>{
  const f=fixture();
  const panel=f.mount(async()=>({...status(true),rules:{verified:false}}));
  panel.controls.render(tool,false,true);await tick();
  assert.equal(panel.global.attributes['aria-checked'],'false');
  assert.equal(panel.site.attributes['aria-checked'],'false');
  assert.equal(panel.site.disabled,true);
  assert.match(panel.find(node=>node.className==='adblock-native-status-copy').textContent,/尚未通过/);
});

test('trusted Space restores the same actionable global switch after native blur and authoritative readback',async()=>{
  const f=fixture();let current=status();const disabling=deferred(),finalRead=deferred();
  let reads=0,focusCalls=0;
  const panel=f.mount(op=>{
    if(op==='adblock.status')return ++reads===1?Promise.resolve(structuredClone(current)):
      finalRead.promise;
    if(op==='adblock.disable')return disabling.promise;
    if(op==='adblock.enable'){current=status();return Promise.resolve(structuredClone(current));}
    throw Error('unexpected operation '+op);
  });
  const originalFocus=panel.global.focus.bind(panel.global);
  panel.global.focus=()=>{focusCalls++;originalFocus();};
  panel.controls.render(tool,false,true);await tick();
  f.doc.activeElement=panel.global;
  panel.global.listeners.click({isTrusted:true,currentTarget:panel.global});
  f.change(); // Native storage event before the operation's final read.
  f.doc.activeElement=f.doc.body; // Chrome blurs a button on disabled=true.
  current=status(false);disabling.resolve(structuredClone(current));await tick();
  assert.equal(reads,2);assert.equal(panel.global.disabled,true);
  assert.equal(f.doc.activeElement,f.doc.body,'cannot refocus during an unverified read');
  finalRead.resolve(structuredClone(current));await tick();
  switches(panel,false);assert.equal(f.doc.activeElement,panel.global);
  assert.equal(focusCalls,1,'refocus only after final authoritative readback');
  panel.global.listeners.click({isTrusted:true,currentTarget:panel.global});
  f.doc.activeElement=f.doc.body;
  await tick();switches(panel,true);
  assert.equal(f.doc.activeElement,panel.global,'Space ON retains actionable focus');
  assert.equal(focusCalls,2);
});

test('native pending operation never steals focus from a different user control or new generation',async()=>{
  const f=fixture(),pending=deferred();
  const panel=f.mount(op=>op==='adblock.status'?Promise.resolve(status()):pending.promise);
  panel.controls.render(tool,false,true);await tick();
  f.doc.activeElement=panel.global;
  panel.global.listeners.click({isTrusted:true,currentTarget:panel.global});
  const another=f.doc.createElement('button');
  f.doc.activeElement=another;
  pending.resolve(status(false));await tick();
  assert.equal(f.doc.activeElement,another);
  assert.equal(panel.global.attributes['aria-checked'],'false');
  const second=deferred(),q=f.mount(op=>op==='adblock.status'?
    Promise.resolve(status()):second.promise);
  q.controls.render(tool,false,true);await tick();
  f.doc.activeElement=q.global;
  q.global.listeners.click({isTrusted:true,currentTarget:q.global});
  f.doc.activeElement=f.doc.body;
  q.controls.render(null);q.controls.render(tool,false,true);
  second.resolve(status(false));await tick();
  assert.equal(f.doc.activeElement,f.doc.body,'old pending operation cannot restore focus');
  switches(q,true);
});
