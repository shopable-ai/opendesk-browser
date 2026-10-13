import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstalledPageTools} from '../../src/ui/installed-page-tools.js';

// DOM_COMPONENT_DOUBLE only: runs the real UI module with DOM/RPC/permission doubles.
// No Chrome, layout, native input, permission prompt or installation evidence.
// isTrusted below is a fixture value that exercises the guard, not a native event.
class ElementDouble {
  constructor(tagName,ownerDocument){
    this.tagName=tagName;this.ownerDocument=ownerDocument;
    this.children=[];this.parentNode=null;this.dataset={};this.attributes=new Map();
    this.listeners=new Map();this.textContent='';this.open=false;this.disabled=false;
    this.tabIndex=0;
  }
  append(...nodes){
    for(const node of nodes){
      if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);
      node.parentNode=this;this.children.push(node);
    }
  }
  contains(node){return !!node&&(node===this||this.children.some(child=>child.contains(node)));}
  replaceChildren(...nodes){
    // Removing the focused subtree drops focus, so restoration cannot pass
    // merely because this double kept an obsolete activeElement reference.
    if(this.children.some(child=>child.contains(this.ownerDocument.activeElement)))
      this.ownerDocument.activeElement=this.ownerDocument.body;
    for(const child of this.children)child.parentNode=null;
    this.children=[];this.append(...nodes);
  }
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  addEventListener(name,listener){
    const listeners=this.listeners.get(name)||new Set();listeners.add(listener);this.listeners.set(name,listeners);
  }
  focus(){this.ownerDocument.activeElement=this;}
  clickDouble(isTrusted=true){for(const listener of this.listeners.get('click')||[])listener({isTrusted});}
  set innerHTML(value){throw new Error('UI must render catalog text using textContent');}
}

const row=(programId='page-a',overrides={})=>({
  programId,title:'Candidate title must not win',manifestHash:'a'.repeat(64),
  installed:{title:'已安装的原始名称',revision:3,manifestHash:'a'.repeat(64),
    sourceHash:'b'.repeat(64),pageRules:{matches:['https://example.com/*']},
    enabled:true,nativeState:'registered',authorization:{status:'granted',generation:7},...overrides}
});
const deferred=()=>{
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
async function settle(predicate){
  for(let attempt=0;attempt<50&&!predicate();attempt++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(predicate(),'component operation did not settle');
}
function fixture(t,catalog=[row()]){
  const doc={activeElement:null,createElement(tag){return new ElementDouble(tag,this);}};
  doc.body=doc.createElement('body');doc.activeElement=doc.body;
  const list=doc.createElement('div'),status=doc.createElement('p'),external=doc.createElement('button');
  doc.body.append(list,status,external);
  doc.getElementById=id=>({'installed-page-tools-list':list,'installed-page-tools-status':status}[id]||null);
  const requests=[],permissionChecks=[],permissionRequests=[],listResponses=[];
  let allowed=true,writeHandler=async()=>({});
  const client={async request(name,args){
    requests.push({name,args:structuredClone(args)});
    if(name==='listPagePrograms')return listResponses.length?await listResponses.shift():{catalog:structuredClone(catalog)};
    assert.equal(name,'setInstalledPageEnabled','only existing list/toggle authorities are allowed');
    const result=await writeHandler(args);
    if(!result.error){
      const current=catalog.find(item=>item.programId===args.programId);
      current.installed.enabled=args.enabled;
    }
    return result;
  }};
  const api={permissions:{
    async contains(request){permissionChecks.push(structuredClone(request));return allowed;},
    async request(request){permissionRequests.push(structuredClone(request));throw new Error('unexpected permission prompt');}
  }};
  const ui=createInstalledPageTools({client,api,doc});t.after(()=>ui.dispose());
  const card=id=>list.children.find(node=>node.children.some(child=>child.dataset.pageToolId===id));
  const action=(id,kind)=>{
    const current=card(id);
    if(kind==='technical')return current.children.find(node=>node.tagName==='details').children[0];
    return current.children.find(node=>node.dataset.pageToolAction===kind);
  };
  return {ui,doc,list,status,external,requests,permissionChecks,permissionRequests,card,action,
    technical:id=>card(id).children.find(node=>node.tagName==='details'),
    setCatalog:rows=>{catalog=rows;},setAllowed:value=>{allowed=value;},
    setWriteHandler:fn=>{writeHandler=fn;},enqueueList:promise=>{listResponses.push(promise);},
    writes:()=>requests.filter(request=>request.name==='setInstalledPageEnabled')};
}

test('R25.1 DOM double renders installed title and filters out nonmatching authority records',async t=>{
  const fallback=row('page-b',{title:''});
  const f=fixture(t,[row(),fallback,{...row('draft'),installed:null},
    {...row('mismatch'),manifestHash:'c'.repeat(64)}]);
  await f.ui.refresh();
  assert.equal(f.list.children.length,2);
  assert.equal(f.card('page-a').children[0].textContent,'已安装的原始名称 · r3');
  assert.equal(f.card('page-b').children[0].textContent,'page-b · r3');
  assert.equal(f.action('page-a','toggle').getAttribute('aria-label'),'停用自动运行：已安装的原始名称');
  assert.equal(f.action('page-b','toggle').getAttribute('aria-label'),'停用自动运行：page-b');
  assert.equal(f.technical('page-a').children[1].textContent,'源码 SHA-256：'+'b'.repeat(64));
  assert.deepEqual(f.requests.map(request=>request.name),['listPagePrograms']);
});

test('R25.1 DOM double keeps long installed title and site rules as complete literal text',async t=>{
  const title='<img onerror=alert(1)>很长名称'+ '无空格'.repeat(100);
  const matches=['https://example.com/'+'a'.repeat(200)+'/*','https://second.example/*'];
  const f=fixture(t,[row('page-long',{title,pageRules:{matches}})]);await f.ui.refresh();
  assert.equal(f.card('page-long').children[0].textContent,title+' · r3');
  assert.equal(f.card('page-long').children[0].children.length,0);
  assert.ok(f.card('page-long').children[1].textContent.includes(matches.join('、')));
  assert.equal(f.action('page-long','toggle').getAttribute('aria-label'),'停用自动运行：'+title);
});

test('R25.1 DOM double distinguishes disabled, suspended, registered and pending installation states',async t=>{
  const f=fixture(t,[row('disabled',{enabled:false}),
    row('suspended',{authorization:{status:'suspended',generation:7}}),row('registered'),
    row('pending',{nativeState:'pending'})]);await f.ui.refresh();
  for(const [id,label] of [['disabled','已停用'],['suspended','访问受限'],
    ['registered','已安装 · 自动运行'],['pending','注册待核对']])
    assert.ok(f.card(id).children[1].textContent.endsWith('\n'+label),id);
  assert.equal(f.action('disabled','toggle').textContent,'启用自动运行');
});

test('R25.1 DOM double restores toggle focus and per-program details state after reordered refresh',async t=>{
  const f=fixture(t,[row('page-a'),row('page-b')]);await f.ui.refresh();
  const previous=f.action('page-a','toggle');previous.focus();f.technical('page-a').open=true;
  f.setCatalog([row('page-b'),row('page-a')]);await f.ui.refresh();
  assert.notEqual(f.action('page-a','toggle'),previous);
  assert.equal(f.doc.activeElement,f.action('page-a','toggle'));
  assert.equal(f.technical('page-a').open,true);
  assert.equal(f.technical('page-b').open,false);
  f.technical('page-a').open=false;await f.ui.refresh();
  assert.equal(f.technical('page-a').open,false,'closed details must not reopen from an old snapshot');
});

test('R25.1 DOM double restores technical summary focus and its expanded details',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const previous=f.action('page-a','technical');f.technical('page-a').open=true;previous.focus();
  await f.ui.refresh();
  assert.notEqual(f.doc.activeElement,previous);
  assert.equal(f.doc.activeElement,f.action('page-a','technical'));
  assert.equal(f.technical('page-a').open,true);
});

test('R25.1 DOM double refresh leaves focus outside the Page list untouched',async t=>{
  const f=fixture(t);await f.ui.refresh();f.external.focus();await f.ui.refresh();
  assert.equal(f.doc.activeElement,f.external);
});

test('R25.1 DOM double moves focus to status when the focused program disappears',async t=>{
  const f=fixture(t);await f.ui.refresh();f.action('page-a','toggle').focus();
  f.setCatalog([]);await f.ui.refresh();
  assert.equal(f.list.children.length,0);assert.equal(f.doc.activeElement,f.status);
  assert.equal(f.status.tabIndex,-1);assert.equal(f.status.dataset.state,'info');
  assert.equal(f.status.textContent,'暂无已安装网页工具。可从「开发」中安装网页脚本。');
  assert.equal(f.writes().length,0);
});

test('R25.1 DOM double trusted disable dispatches once and retains success feedback, focus and expansion',async t=>{
  const f=fixture(t);await f.ui.refresh();
  const toggle=f.action('page-a','toggle'),pending=deferred();
  toggle.focus();f.technical('page-a').open=true;f.setWriteHandler(()=>pending.promise);
  toggle.clickDouble(false);assert.equal(f.writes().length,0);
  toggle.clickDouble();toggle.clickDouble();
  assert.equal(toggle.disabled,true);assert.equal(f.writes().length,1);
  pending.resolve({});
  await settle(()=>f.action('page-a','toggle')!==toggle);
  assert.deepEqual(f.writes()[0].args,{programId:'page-a',manifestHash:'a'.repeat(64),
    enabled:false,expectedGeneration:7});
  assert.equal(f.action('page-a','toggle').textContent,'启用自动运行');
  assert.equal(f.action('page-a','toggle').disabled,false);
  assert.equal(f.doc.activeElement,f.action('page-a','toggle'));
  assert.equal(f.technical('page-a').open,true);
  assert.equal(f.status.dataset.state,'success');
  assert.equal(f.status.textContent,'已确认停用固定网页脚本；不会重新运行当前网页。');
  await f.ui.refresh();assert.equal(f.status.dataset.state,'success');
  assert.equal(f.status.textContent,'已确认停用固定网页脚本；不会重新运行当前网页。');
  assert.deepEqual(f.permissionChecks,[]);assert.deepEqual(f.permissionRequests,[]);
  assert.deepEqual(f.requests.map(request=>request.name),
    ['listPagePrograms','setInstalledPageEnabled','listPagePrograms','listPagePrograms']);
});

test('R25.1 DOM double enable checks granted origins and never requests a new permission prompt',async t=>{
  const f=fixture(t,[row('page-a',{enabled:false})]);await f.ui.refresh();
  const toggle=f.action('page-a','toggle');toggle.focus();toggle.clickDouble();
  await settle(()=>f.action('page-a','toggle')!==toggle);
  assert.deepEqual(f.permissionChecks,[{origins:['https://example.com/*']}]);
  assert.deepEqual(f.permissionRequests,[]);assert.equal(f.writes()[0].args.enabled,true);
  assert.equal(f.status.dataset.state,'success');
  assert.equal(f.status.textContent,'已确认启用固定网页脚本；不会重新运行当前网页。');
  assert.equal(f.doc.activeElement,f.action('page-a','toggle'));
});

test('R25.1 DOM double denied enable has zero writes and preserves semantic error through refresh',async t=>{
  const f=fixture(t,[row('page-a',{enabled:false})]);await f.ui.refresh();f.setAllowed(false);
  const toggle=f.action('page-a','toggle');toggle.focus();toggle.clickDouble();
  await settle(()=>f.action('page-a','toggle')!==toggle);
  assert.equal(f.writes().length,0);assert.deepEqual(f.permissionRequests,[]);
  assert.equal(f.status.dataset.state,'error');assert.match(f.status.textContent,/E_PERMISSION/);
  const feedback=f.status.textContent;await f.ui.refresh();
  assert.equal(f.status.textContent,feedback);assert.equal(f.status.dataset.state,'error');
  assert.equal(f.action('page-a','toggle').textContent,'启用自动运行');
  assert.equal(f.action('page-a','toggle').disabled,false);
});

test('R25.1 DOM double failed toggle preserves authority and error without automatic retry',async t=>{
  const f=fixture(t);await f.ui.refresh();
  f.setWriteHandler(async()=>({error:{code:'E_GENERATION',message:'安装身份已变化'}}));
  const toggle=f.action('page-a','toggle');toggle.clickDouble();
  await settle(()=>f.action('page-a','toggle')!==toggle);
  assert.equal(f.writes().length,1);assert.equal(f.status.dataset.state,'error');
  assert.equal(f.status.textContent,'E_GENERATION：安装身份已变化');
  assert.equal(f.action('page-a','toggle').textContent,'停用自动运行');
  await f.ui.refresh();assert.equal(f.writes().length,1);
  assert.equal(f.status.textContent,'E_GENERATION：安装身份已变化');
});

test('R25.1 DOM double failed catalog read keeps existing cards and renders semantic error',async t=>{
  const f=fixture(t);await f.ui.refresh();const previous=f.card('page-a');
  f.enqueueList(Promise.reject(Object.assign(new Error('offline'),{code:'E_OFFLINE'})));
  await f.ui.refresh();assert.equal(f.card('page-a'),previous);
  assert.equal(f.status.dataset.state,'error');
  assert.equal(f.status.textContent,'E_OFFLINE：无法读取已安装网页脚本；不会影响原安装');
  assert.equal(f.writes().length,0);
  await f.ui.refresh();
  assert.equal(f.status.textContent,'');assert.equal(f.status.dataset.state,'info');
});
test('R25.1 DOM double pending refresh does not steal focus moved outside the list',async t=>{
  const f=fixture(t);await f.ui.refresh();f.action('page-a','toggle').focus();
  const response=deferred();f.enqueueList(response.promise);const refreshing=f.ui.refresh();
  f.external.focus();response.resolve({catalog:[row()]});await refreshing;
  assert.equal(f.doc.activeElement,f.external);
});
test('R25.1 DOM double stale read failure cannot replace newer successful list status',async t=>{
  const f=fixture(t);const response=deferred();f.enqueueList(response.promise);
  const older=f.ui.refresh();await f.ui.refresh();
  response.reject(Object.assign(new Error('old read'),{code:'E_OFFLINE'}));await older;
  assert.ok(f.card('page-a'));assert.notEqual(f.status.dataset.state,'error');
});

test('R25.1 DOM double late older catalog success cannot replace a newer refresh',async t=>{
  const f=fixture(t),pending=deferred();f.enqueueList(pending.promise);
  const older=f.ui.refresh();f.setCatalog([row('new')]);await f.ui.refresh();
  pending.resolve({catalog:[row('old')]});await older;
  assert.deepEqual(f.list.children.map(card=>card.children[2].dataset.pageToolId),['new']);
});

test('R25.1 DOM double disposal prevents late render and further list/toggle effects',async t=>{
  const f=fixture(t);await f.ui.refresh();const toggle=f.action('page-a','toggle');
  const pending=deferred();f.enqueueList(pending.promise);const refreshing=f.ui.refresh();
  f.ui.dispose();pending.resolve({catalog:[row('replacement')]});await refreshing;
  assert.equal(f.action('page-a','toggle'),toggle);
  const requestCount=f.requests.length;await f.ui.refresh();toggle.clickDouble();
  assert.equal(f.requests.length,requestCount);assert.equal(f.writes().length,0);
});
