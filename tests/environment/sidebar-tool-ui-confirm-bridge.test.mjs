import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {initSidebarToolSandbox,sidebarToolRequestTimeout,ADBLOCK_CONFIRM_OPERATIONS,sandboxToolMessages} from '../../src/sidebar-tools/bridge.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {browserOperation,normalizeBrowserOperation,BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {normalizeOwnPageTarget} from '../../src/ui/sidebar-tools/navigation.js';
import {normalizeToolNavigation} from '../../src/sidebar-tools/navigation-state.js';
import {SIDEBAR_TOOL_PROTOCOL} from '../../src/ui/sidebar-tools/package.js';
import {normalizeToolUiConfirmOptions,normalizeToolUiConfirmResult,TOOL_UI_CONFIRM_CLIENT_TIMEOUT_MS,TOOL_UI_CONFIRM_TIMEOUT_MS} from '../../src/sidebar-tools/ui-confirm.js';
const tool={id:'confirm-example',html:'',css:'',js:'void 0;'};
const copy='browser.clipboard.writeText';
const options={title:' Delete? ',message:'Cannot undo.\nKeep draft?',confirmLabel:'Delete',tone:'danger'};
const loaded={protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'frame-1',tool,uiConfirm:{version:1}};
const client=(b,signal)=>{const value=new b.realm.Object();value.signal=signal;return value;};
const make=(extra={})=>sandbox({loaded,...extra});
const answer=(b,result={action:'confirm'})=>b.respond({...b.port.sent.find(row=>row.operation==='ui.confirm'),kind:'response',ok:true,result});
class Port {
  closed=false;sent=[];onmessage=null;
  postMessage(message){
    if(this.failDelivery)throw Error('transport unavailable');
    if(this.closed)return;
    const data=structuredClone(message);this.sent.push(data);
    // Real port events may be trusted while every data field is hostile.
    queueMicrotask(()=>{if(!this.peer.closed)this.peer.onmessage?.({data,isTrusted:true});});
  }
  close(){this.closed=true;}
}
class Channel {
  constructor(){this.port1=new Port();this.port2=new Port();this.port1.peer=this.port2;this.port2.peer=this.port1;}
}
class Events {
  listeners=new Map();
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(row=>row!==fn));}
  emit(type,event,...args){for(const fn of this.listeners.get(type)||[]){fn(event,...args);if(event.stopped)break;}}
}

// Node cannot manufacture Chromium trusted clicks. This double models the
// unforgeable WebIDL getters and dispatch lifetime; native Chrome is NOT_TESTED.
function sandbox({loaded={protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:'frame-1',tool},port=new Port(),send=()=>{},timers={setTimeout,clearTimeout},clock={now:()=>performance.now()},draftRoot,autoLoad=false,focusDocument={},frames=()=>0}={}){
  if(!port.peer){port.peer=new Port();port.peer.peer=port;}
  const states=new WeakMap();let eventSequence=0;
  class NativeEvent {
    constructor(type){states.set(this,{type,trusted:false,currentTarget:null,timeStamp:++eventSequence});
      Object.defineProperty(this,'isTrusted',{get(){return states.get(this).trusted;}});}
    get currentTarget(){return states.get(this).currentTarget;}
    get target(){return states.get(this).target;}
    get timeStamp(){return states.get(this).timeStamp;}
    stopImmediatePropagation(){this.stopped=true;}
  }
  class NativeKeyboardEvent extends NativeEvent {
    constructor(type,options={}){super(type);Object.assign(states.get(this),{key:'Enter',shiftKey:false,isComposing:false,repeat:false,ctrlKey:false,altKey:false,metaKey:false,...options});}
    get key(){return states.get(this).key;}
    get repeat(){return states.get(this).repeat;}
    get ctrlKey(){return states.get(this).ctrlKey;}
    get altKey(){return states.get(this).altKey;}
    get metaKey(){return states.get(this).metaKey;}
    get shiftKey(){return states.get(this).shiftKey;}
    get isComposing(){return states.get(this).isComposing;}
  }
  class NativeElement {closest(){return this.dialog||null;}}
  class NativeDialog extends NativeElement {get open(){return true;}}
  const win=new Events(),root=new Events(),status={dataset:{}},publicMessages=[];
  Object.assign(root,{replaceChildren(){},querySelectorAll:selector=>draftRoot?.querySelectorAll(selector)||[],dispatchEvent(event){this.emit(event.type,event);},getBoundingClientRect:()=>({top:0,bottom:100})});
  const parent={postMessage(message){publicMessages.push(message);send(message);}};
  const blobs=[];
  const node=()=>({listeners:{},append(child){if(autoLoad)queueMicrotask(()=>child.listeners?.load?.());},
    addEventListener(type,fn){this.listeners[type]=fn;}});
  // Run the real timeout lookup in the tool's realm: passing an outer-realm
  // function would hide mutations to Object.hasOwn used by browserOperation.
  const realm=runInNewContext(`const browserOperation=(${browserOperation.toString()});
    const sidebarToolRequestTimeout=(${sidebarToolRequestTimeout.toString()});
    (${initSidebarToolSandbox.toString()})(); ({Reflect,Function,Promise,Object,Map,Set,Number,globalThis})`,{
    SIDEBAR_TOOL_PROTOCOL,createBrowserSdk,BROWSER_OPERATIONS,ADBLOCK_CONFIRM_OPERATIONS,normalizeBrowserOperation,normalizeOwnPageTarget,sandboxToolMessages,normalizeToolNavigation,normalizeToolUiConfirmOptions,normalizeToolUiConfirmResult,TOOL_UI_CONFIRM_CLIENT_TIMEOUT_MS,AbortSignal,EventTarget,performance:clock,crypto:globalThis.crypto,
    window:win,parent,Event:NativeEvent,KeyboardEvent:NativeKeyboardEvent,MessagePort:Port,HTMLDialogElement:NativeDialog,Element:NativeElement,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    document:{...focusDocument,getElementById:id=>id==='tool-root'?root:status,documentElement:{},head:node(),body:node(),createElement:node},
    Blob,TextEncoder,structuredClone,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:export-fixture';},revokeObjectURL(){}},...timers,requestAnimationFrame:frames
  });
  let leaked=false;
  win.addEventListener('message',event=>{if(event.ports?.length)leaked=true;});
  const event=new NativeEvent('message');Object.assign(event,{source:parent,data:loaded,ports:loaded.withoutPort?[]:[port]});
  win.emit('message',event);
  const pending=[];
  // Use an outer-realm observer so deliberate sandbox .then tampering cannot
  // intercept the test observer or hide a Bridge rejection.
  const track=promise=>{
    const observed=new Promise((resolve,reject)=>Reflect.apply(Promise.prototype.then,promise,[resolve,reject]));
    pending.push(observed.catch(()=>{}));return observed;
  };
  const request=(operation=copy,payload={text:'text'})=>{
    const promise=win.OpenDeskTool.request(operation,payload);pending.push(promise.catch(()=>{}));return promise;
  };
  const dispatch=(event,run)=>{
    const state=states.get(event);state.currentTarget=win;
    try{win.emit(state.type,event);return run(event);}finally{state.currentTarget=null;}
  };
  return {win,port,publicMessages,request,NativeEvent,NativeElement,NativeDialog,realm,blobs,root,get leaked(){return leaked;},
    prepare:factory=>track(win.OpenDeskSDK.browser.downloads.prepareText(factory)),
    prepareAI:factory=>track(win.OpenDeskTool.prepareAI(factory)),
    click(run,timeStamp){const event=new NativeEvent('click');states.get(event).trusted=true;
      if(timeStamp!==undefined)states.get(event).timeStamp=timeStamp;return dispatch(event,run);},
    key(run,options={},trusted=true){const event=new NativeKeyboardEvent('keydown',options);states.get(event).trusted=trusted;return dispatch(event,run);},
    trustedCancel(run,dialog=new NativeDialog(),trusted=true){const event=new NativeEvent('cancel');Object.assign(states.get(event),{trusted,target:dialog});return dispatch(event,run);},
    cancel(run,real=true){
      const dialog=new NativeDialog(),target=new NativeElement();target.dialog=dialog;
      const key=new NativeKeyboardEvent('keydown',{key:'Escape',target});states.get(key).trusted=real;
      dispatch(key,()=>{});
      const event=new NativeEvent('cancel');Object.assign(states.get(event),{trusted:real,target:dialog});return dispatch(event,run);
    },
    async dispatchMicrotask(run){
      const event=new NativeEvent('click'),state=states.get(event);state.trusted=true;state.currentTarget=win;
      try{win.emit('click',event);await Promise.resolve().then(run);}finally{state.currentTarget=null;}
    },
    synthetic(run,event=new NativeEvent('click')){states.get(event).trusted=false;return dispatch(event,run);},
    respond(message){win.emit('message',{source:parent,data:message});},
    async dispose(){win.emit('pagehide',{});await Promise.all(pending);}
  };
}

test('confirm schema rejects unknown, accessor, symbol, prototype, controls and length violations',()=>{
  assert.equal(normalizeToolUiConfirmOptions(options).title,'Delete?');
  for(const value of [{...options,toolId:'other'},{...options,[Symbol()]:1},Object.assign(Object.create({}),options),
    {...options,title:'x'.repeat(81)},{...options,message:'x'.repeat(1201)},{...options,confirmLabel:'x'.repeat(33)},
    {...options,cancelLabel:''},{...options,tone:'warning'},{...options,title:'a\nb'},
    {...options,message:'a\tb'},{...options,message:'a\u202eb'},{...options,title:'a\u0000b'},
    {...options,get title(){throw Error('must not execute');}}])assert.equal(normalizeToolUiConfirmOptions(value),null);
  assert.equal(normalizeToolUiConfirmResult({action:'confirm',approvalRef:'x'}),null);
  assert.equal(normalizeToolUiConfirmResult({action:'cancel',reason:'timeout'}),null);
});
test('old host, wrong declaration and missing private channel reject unavailable with zero sends',async()=>{
  for(const variation of [{uiConfirm:undefined},{uiConfirm:{version:2}},{withoutPort:true}]){
    const b=make({loaded:{...loaded,...variation}});
    try{await assert.rejects(b.click(()=>b.win.OpenDeskTool.ui.confirm(options)),{code:'E_UI_CONFIRM_UNAVAILABLE'});
      assert.equal(b.port.sent.length,0);assert.equal(b.publicMessages.some(m=>m.operation==='ui.confirm'),false);
    }finally{await b.dispose();}
  }
});
test('preabort is local, malformed input rejects without sending',async()=>{
  const b=make(),controller=new AbortController();controller.abort();
  try{
    assert.deepEqual({...await b.win.OpenDeskTool.ui.confirm(options,client(b,controller.signal))},{action:'cancel',reason:'aborted'});
    await assert.rejects(b.click(()=>b.win.OpenDeskTool.ui.confirm({...options,callback(){}})),{code:'E_UI_CONFIRM_INPUT'});
    await assert.rejects(b.click(()=>b.win.OpenDeskTool.ui.confirm(options,{signal:{aborted:true}})),{code:'E_UI_CONFIRM_INPUT'});
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
});
test('native click, Enter, Space and native dialog cancel send once on private port',async()=>{
  for(const gesture of ['click','enter','space','cancel']){
    const b=make();try{
      const call=()=>b.win.OpenDeskTool.ui.confirm(options);
      const result=gesture==='enter'?b.key(call):gesture==='space'?b.key(call,{key:' '}):b[gesture](call);
      assert.equal(b.port.sent.length,1);assert.equal(b.port.sent[0].operation,'ui.confirm');
      assert.deepEqual(b.port.sent[0].payload,normalizeToolUiConfirmOptions(options));
      assert.equal(b.port.sent[0].navigation,undefined);assert.equal(b.port.sent[0].signal,undefined);
      answer(b);assert.deepEqual(await result,{action:'confirm'});
    }finally{await b.dispose();}
  }
});
test('background, synthetic, repeated, modified, composing and delayed events cannot open confirmation',async()=>{
  const b=make();try{
    const call=()=>b.win.OpenDeskTool.ui.confirm(options);
    await assert.rejects(call(),{code:'E_USER_GESTURE_REQUIRED'});
    await assert.rejects(b.synthetic(call),{code:'E_USER_GESTURE_REQUIRED'});
    await assert.rejects(b.cancel(call,false),{code:'E_USER_GESTURE_REQUIRED'});
    for(const variation of [{repeat:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true},{isComposing:true},{key:'Escape'}])
      await assert.rejects(b.key(call,variation),{code:'E_USER_GESTURE_REQUIRED'});
    await assert.rejects(b.click(()=>Promise.resolve().then(call)),{code:'E_USER_GESTURE_REQUIRED'});
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
});
test('pending owner survives busy rejection and invalid response fails closed',async()=>{
  const b=make();try{
    const first=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));
    await assert.rejects(b.click(()=>b.win.OpenDeskTool.ui.confirm(options)),{code:'E_UI_CONFIRM_BUSY'});
    answer(b,{action:'confirm',authority:true});await assert.rejects(first,{code:'E_UI_CONFIRM_PROTOCOL'});
    assert.equal(b.publicMessages.filter(m=>m.kind==='ui-confirm-cancel').length,1);
  }finally{await b.dispose();}
});
test('abort wins over late confirm; confirm already received wins over abort',async()=>{
  for(const abortFirst of [true,false]){
    const b=make(),controller=new AbortController();try{
      const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options,client(b,controller.signal)));
      if(abortFirst){controller.abort();answer(b);}else{answer(b);controller.abort();}
      assert.deepEqual({...await result},abortFirst?{action:'cancel',reason:'aborted'}:{action:'confirm'});
      assert.equal(b.publicMessages.filter(m=>m.kind==='ui-confirm-cancel').length,abortFirst?1:0);
    }finally{await b.dispose();}
  }
});
test('client timeout is distinct from host limit, cancels and consumes late response; disposal rejects promptly',async()=>{
  const tasks=new Map();let id=0;
  const b=make({timers:{setTimeout(fn,ms){tasks.set(++id,{fn,ms});return id;},clearTimeout(key){tasks.delete(key);}}});
  try{
    assert.equal(TOOL_UI_CONFIRM_TIMEOUT_MS,120000);
    assert.equal(sidebarToolRequestTimeout('ui.confirm',tool.id),125000);
    assert.equal(sidebarToolRequestTimeout('storage.get',tool.id),8000);
    const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));
    const [{fn,ms}]=tasks.values();assert.equal(ms,125000);fn();
    answer(b);assert.deepEqual({...await result},{action:'cancel',reason:'expired'});assert.equal(tasks.size,0);
    assert.deepEqual(Object.keys(b.publicMessages.find(m=>m.kind==='ui-confirm-cancel')).sort(),['instance','kind','protocol','requestId','toolId']);
    const pending=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));
    const checked=assert.rejects(pending,{code:'E_TOOL_DISPOSED'});await b.dispose();await checked;
    assert.equal(tasks.size,0);assert.equal(b.publicMessages.filter(m=>m.kind==='ui-confirm-cancel').length,2);
  }finally{await b.dispose();}
});
test('host rejection never falls back or resends; transport failure cleans pending state',async()=>{
  const b=make();try{
    const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));
    b.respond({...b.port.sent[0],kind:'response',ok:false,error:{code:'E_UI_CONFIRM_BUSY',message:'busy'}});
    await assert.rejects(result,{code:'E_UI_CONFIRM_BUSY'});assert.equal(b.port.sent.length,1);
    b.port.failDelivery=true;
    await assert.rejects(b.click(()=>b.win.OpenDeskTool.ui.confirm(options)),{code:'E_UI_CONFIRM_TRANSPORT'});
  }finally{await b.dispose();}
});
test('private navigation association is synchronous, snapshot-bound and consumed only once',async()=>{
  const b=make({loaded:{...loaded,navigationAllowed:true}});
  try{
    assert.equal(b.win.OpenDeskTool.setNavigation({page:'edit',title:'Edit',canBack:true}),true);
    const nav={protocol:SIDEBAR_TOOL_PROTOCOL,kind:'navigation-action',instance:'frame-1',toolId:tool.id,page:'edit',revision:1,action:'back'};
    let first,second,delayed;
    b.root.addEventListener('opendesk-tool-navigation',()=>{
      first=b.win.OpenDeskTool.ui.confirm(options);first.catch(()=>{});
      second=b.win.OpenDeskTool.ui.confirm(options);second.catch(()=>{});
      delayed=Promise.resolve().then(()=>b.win.OpenDeskTool.ui.confirm(options));delayed.catch(()=>{});
    });
    b.port.onmessage({data:{...nav,revision:0}});assert.equal(first,undefined);
    b.port.onmessage({data:nav});
    assert.deepEqual(b.port.sent[0].navigation,{page:'edit',revision:1,action:'back'});
    answer(b);
    await assert.rejects(second,{code:'E_UI_CONFIRM_BUSY'});assert.deepEqual(await first,{action:'confirm'});
    await assert.rejects(delayed,{code:'E_USER_GESTURE_REQUIRED'});
    b.respond(nav);await assert.rejects(first,{code:'E_USER_GESTURE_REQUIRED'});
    assert.equal(b.port.sent.length,1);
  }finally{await b.dispose();}
});
test('confirmation shares the single gesture gate but its result grants no later browser activation',async()=>{
  const b=make();try{
    let browser;
    const result=b.click(()=>{
      const confirming=b.win.OpenDeskTool.ui.confirm(options);
      browser=b.win.OpenDeskTool.openAISettings();return confirming;
    });
    assert.equal(browser,false);
    b.respond({...b.port.sent[0],instance:'wrong',kind:'response',ok:true,result:{action:'confirm'}});
    assert.equal(b.port.sent.length,1);
    answer(b);await result;
    assert.equal(b.win.OpenDeskTool.openAISettings(),false);
    assert.equal(b.port.sent.length,1);
  }finally{await b.dispose();}
});
test('all documented Host cancellation reasons settle normally without replay',async()=>{
  for(const reason of ['user','escape','aborted','invalidated','expired']){
    const b=make();try{
      const result=b.click(()=>b.win.OpenDeskTool.request('ui.confirm',options));
      answer(b,{action:'cancel',reason});assert.deepEqual(await result,{action:'cancel',reason});
      assert.equal(b.port.sent.length,1);
      assert.equal(b.publicMessages.some(m=>m.kind==='ui-confirm-cancel'),false);
    }finally{await b.dispose();}
  }
});

function focusFixture(){
  const frames=[],focuses=[],ranges=[],focusDocument={activeElement:null};
  const b=make({focusDocument,frames:callback=>{frames.push(callback);return frames.length;}});
  const trigger={inRoot:true,isConnected:true,disabled:false,getClientRects:()=>[{}],
    selectionStart:2,selectionEnd:5,selectionDirection:'backward',
    focus(options){focuses.push({target:'trigger',...options});},
    setSelectionRange(...args){ranges.push(args);}};
  b.root.contains=node=>node===b.root||node.inRoot===true;
  Object.assign(b.root,{isConnected:true,getClientRects:()=>[{}],hasAttribute:()=>false,setAttribute(){},
    focus(options){focuses.push({target:'root',...options});}});
  // The fixture's document copies this getter; let the test model inert
  // replacing the focused input with body while the Host owns focus.
  Object.defineProperty(b.realm.globalThis.document,'activeElement',{get:()=>focusDocument.activeElement});
  focusDocument.activeElement=trigger;
  return {b,trigger,frames,focuses,ranges,focusDocument,flush(){while(frames.length)frames.shift()();}};
}
for(const terminal of ['confirm','cancel','abort','reject'])
test(`ui.confirm focus restores internal trigger and text selection after ${terminal} on the next frame`,async()=>{
  const f=focusFixture(),{b}=f,controller=new AbortController();
  try{
    const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options,client(b,controller.signal)));
    f.focusDocument.activeElement={tagName:'BODY'};
    if(terminal==='confirm')answer(b);
    if(terminal==='cancel')answer(b,{action:'cancel',reason:'escape'});
    if(terminal==='abort')controller.abort();
    if(terminal==='reject'){
      const checked=assert.rejects(result,{code:'E_UI_CONFIRM_BUSY'});
      b.respond({...b.port.sent[0],kind:'response',ok:false,error:{code:'E_UI_CONFIRM_BUSY'}});await checked;
    }else await result;
    assert.equal(f.focuses.length,0);assert.equal(f.frames.length,1);
    f.flush();assert.deepEqual(f.focuses,[{target:'trigger',preventScroll:true}]);
    assert.deepEqual(f.ranges,[[2,5,'backward']]);
  }finally{await b.dispose();}
});
for(const invalid of ['detached','disabled','hidden'])
test(`ui.confirm focus uses safe root if trigger becomes ${invalid}`,async()=>{
  const f=focusFixture(),{b}=f;
  try{
    const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));answer(b);await result;
    if(invalid==='detached')f.trigger.isConnected=false;
    if(invalid==='disabled')f.trigger.disabled=true;
    if(invalid==='hidden')f.trigger.getClientRects=()=>[];
    f.flush();assert.deepEqual(f.focuses,[{target:'root',preventScroll:true}]);assert.equal(f.ranges.length,0);
  }finally{await b.dispose();}
});
for(const superseded of ['disposed','pending','settled-new-request'])
test(`ui.confirm focus skips old restoration after ${superseded}`,async()=>{
  const f=focusFixture(),{b}=f;
  try{
    const result=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));answer(b);await result;
    if(superseded==='disposed')await b.dispose();
    else{
      const next=b.click(()=>b.win.OpenDeskTool.ui.confirm(options));next.catch(()=>{});
      if(superseded==='settled-new-request'){
        b.respond({...b.port.sent[1],kind:'response',ok:true,result:{action:'cancel',reason:'user'}});await next;
      }
    }
    f.frames.shift()();assert.equal(f.focuses.length,0);
  }finally{await b.dispose();}
});

test('ui.confirm rejects script-generated trusted native cancel without Escape',async()=>{
  const b=make();try{
    await assert.rejects(b.trustedCancel(()=>b.win.OpenDeskTool.ui.confirm(options)),{code:'E_USER_GESTURE_REQUIRED'});
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
});
test('ui.confirm Escape cancel association expires before timer requestClose and matches one original dialog',async()=>{
  const tasks=new Map();let id=0;
  const b=make({timers:{setTimeout(fn){tasks.set(++id,fn);return id;},clearTimeout(key){tasks.delete(key);}}});
  try{
    const dialog=new b.NativeDialog(),target=new b.NativeElement();target.dialog=dialog;
    const escape=()=>b.key(()=>{},{key:'Escape',target});
    const call=()=>b.win.OpenDeskTool.ui.confirm(options);
    escape();
    for(const [key,fn] of [...tasks]){tasks.delete(key);fn();}
    await assert.rejects(b.trustedCancel(call,dialog),{code:'E_USER_GESTURE_REQUIRED'});
    escape();
    await assert.rejects(b.trustedCancel(call,new b.NativeDialog()),{code:'E_USER_GESTURE_REQUIRED'});
    await assert.rejects(b.trustedCancel(call,dialog),{code:'E_USER_GESTURE_REQUIRED'});
    escape();
    const result=b.trustedCancel(call,dialog);answer(b);await result;
    await assert.rejects(b.trustedCancel(call,dialog),{code:'E_USER_GESTURE_REQUIRED'});
    assert.equal(b.port.sent.length,1);
  }finally{await b.dispose();}
});
for(const variation of [{repeat:true},{isComposing:true},{ctrlKey:true},{altKey:true},{metaKey:true},{shiftKey:true}])
test(`ui.confirm native cancel rejects ineligible Escape ${Object.keys(variation)[0]}`,async()=>{
  const b=make();try{
    const dialog=new b.NativeDialog(),target=new b.NativeElement();target.dialog=dialog;
    b.key(()=>{},{key:'Escape',target,...variation});
    await assert.rejects(b.trustedCancel(()=>b.win.OpenDeskTool.ui.confirm(options),dialog),{code:'E_USER_GESTURE_REQUIRED'});
    assert.equal(b.port.sent.length,0);
  }finally{await b.dispose();}
});
