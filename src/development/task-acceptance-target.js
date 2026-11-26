import {PageError,decodeValue} from '../framework/control/value.js';
import {installPackagedPageSession,PAGE_SESSION_MESSAGE} from '../scripting/packaged/page-session.js';

const ORIGIN='https://www.baidu.com', TAB_ID=2147483647;
const ORIGINAL_QUERY='周末徒步'; // Same starting query as the My prototype.
const READS=new Set(['count','innerText','textContent','getAttribute','isVisible','waitFor']);
const AD_MARKERS='[data-tuiguang],[data-click*="tuiguang"],.ec-tuiguang,.c-icon-bear-p,.c-icon-bear-ad';
const ABSTRACT='.c-abstract,[class*="content-right_"],[class*="summary-gap_"],.c-span-last';

// A static document for the packaged Locator engine. It needs no DOMParser in
// the service worker, contains no live elements, and rejects unknown selectors.
function resultDocument(url) {
  function element(tagName,attrs={},children=[],text='') {
    const node={tagName,nodeType:1,isConnected:true,id:attrs.id||'',children,
      childNodes:text?[{nodeType:3,nodeValue:text}]:children,
      get textContent(){return text||children.map(child=>child.textContent).join(' ');},
      getAttribute:name=>Object.hasOwn(attrs,name)?attrs[name]:null,
      hasAttribute:name=>Object.hasOwn(attrs,name),
      getBoundingClientRect:()=>({width:100,height:20}),
      querySelectorAll:selectors(new Map())};
    for(const child of children)child.parentElement=node;
    return node;
  }
  function selectors(matches) {
    return selector=>{
      if(!matches.has(selector))throw new PageError('E_CAPABILITY','Selector outside offline result fixture');
      return matches.get(selector);
    };
  }
  const rows=['入门指南','常见问题','参考资料','延伸阅读'].map((title,index)=>{
    const id=String(index+1);
    const anchor=element('A',{href:'https://example.com/search-result/'+id},[],title);
    const heading=element('H3',{},[anchor]);
    const summary=element('DIV',{class:'c-abstract'},[],'离线结果示例：'+title);
    const row=element('DIV',{id,class:'result c-container',tpl:'se_com_default'},[heading,summary]);
    row.querySelectorAll=selectors(new Map([['h3 a',[anchor]],[ABSTRACT,[summary]],[AD_MARKERS,[]]]));
    return row;
  });
  const content=element('DIV',{id:'content_left'},rows),body=element('BODY',{},[content]);
  const descendants=node=>[node,...node.children.flatMap(descendants)];
  return {body,location:{href:url},querySelectorAll:selectors(new Map([
    ['body',[body]],['#content_left',[content]],['#content_left .result.c-container',rows],['*',descendants(body)]
  ]))};
}

function localEvent() {
  const listeners=new Set();
  return {api:Object.freeze({addListener:fn=>{if(typeof fn==='function')listeners.add(fn);},
    removeListener:fn=>listeners.delete(fn)}),
  emit:(...args)=>{for(const fn of [...listeners]){try{fn(...args);}catch{ /* Observers cannot alter the driver. */ }}},
  clear:()=>listeners.clear()};
}

// Dev acceptance only: the supplied runtime contributes packaged URL metadata,
// and all tab/frame observations and optional foreground receipts are synthetic.
export function createTaskAcceptanceTarget({runtime,checkPermission,windowId,onEvent=()=>{}}) {
  if(typeof runtime?.id!=='string'||!runtime.id||typeof runtime.getURL!=='function'||
    typeof checkPermission!=='function'||!Number.isSafeInteger(windowId)||windowId<0)
    throw new PageError('E_ARGUMENT_TYPE','Offline target requires runtime, permission checker and window ID');
  const runtimeId=runtime.id, committed=localEvent(), removed=localEvent();
  let page, closed=false, eventId=0, lastPermission;
  const report=(type,details={})=>{
    try{onEvent(Object.freeze({eventId:++eventId,type,...details}));}catch{ /* Audit consumers are observers. */ }
  };
  function deny(call,code='E_CAPABILITY') {
    report('blocked',{call,code});
    throw new PageError(code,'Call outside the offline Baidu result target');
  }
  const exact=(value,expected)=>value!==null&&typeof value==='object'&&
    Object.keys(value).length===Object.keys(expected).length&&
    Object.entries(expected).every(([key,entry])=>Object.hasOwn(value,key)&&value[key]===entry);
  const needPage=call=>page||deny(call,'E_DOCUMENT_REPLACED');
  const needTab=(id,call)=>id===TAB_ID?needPage(call):deny(call,'E_TARGET');
  const tab=({url})=>({id:TAB_ID,windowId,url,active:true,incognito:false,status:'complete'});
  const frame=({documentId,url})=>({frameId:0,parentFrameId:-1,documentId,url,documentLifecycle:'active',errorOccurred:false});
  const snapshot=()=>page?.snapshot??Object.freeze({status:'unavailable',windowId,reason:'closed'});
  const answer=(value,callback)=>typeof callback==='function'?callback(value):Promise.resolve(value);

  function selectQuery(query) {
    if(closed)deny('selectQuery','E_DOCUMENT_REPLACED');
    if(typeof query!=='string'||!query.trim()||query.length>120)deny('selectQuery','E_TASK_PARAMS');
    let url;
    try{url=ORIGIN+'/s?wd='+encodeURIComponent(query);}catch{deny('selectQuery','E_TASK_PARAMS');}
    if(page?.url===url)return snapshot();
    const documentId=crypto.randomUUID(),document=resultDocument(url);
    let listener;
    const session=installPackagedPageSession({document,window:{location:document.location,getComputedStyle:()=>({}),
      addEventListener(){},removeEventListener(){}},packageURLs:[],api:{runtime:{id:runtimeId,onMessage:{
        addListener(fn){listener=fn;},removeListener(){listener=null;}
      }}}});
    const previous=page;
    previous?.dispose();
    page={documentId,url,snapshot:Object.freeze({status:'available',tabId:TAB_ID,windowId,documentId,url,title:'百度搜索 · 离线验收'}),
      dispatch:(message,reply)=>listener(message,{id:runtimeId},reply),dispose:session.dispose};
    report('target-selected',{tabId:TAB_ID,windowId,documentId});
    if(previous)committed.emit({tabId:TAB_ID,...frame(page)});
    return snapshot();
  }

  function sendMessage(id,message,options,callback) {
    const call='tabs.sendMessage',current=needTab(id,call);
    if(!exact(options,{documentId:current.documentId,frameId:0})||message?.type!==PAGE_SESSION_MESSAGE)
      deny(call,'E_TARGET');
    const assertTarget=target=>{
      if(target?.tabId!==TAB_ID||target.frameId!==0||target.documentId!==current.documentId||
        target.url!==current.url||target.allowedOrigin!==ORIGIN||target.mode!=='borrowed'||
        (target.windowId!==undefined&&target.windowId!==windowId))deny(call,'E_TARGET');
    };
    const action=message.action;
    if(action==='execute') {
      const {target,identity,requestId,operation}=message.envelope||{};
      assertTarget(target);
      assertTarget(identity?.target);
      const method=operation?.method;
      if(operation?.kind!=='packaged'||!['url','locatorRead','locatorObserve'].includes(method))deny(call);
      const args=decodeValue(operation.args,{maxBytes:65536});
      if(!Array.isArray(args)||args.length!==({url:0,locatorRead:2,locatorObserve:1})[method]||
        method==='locatorRead'&&!READS.has(args[1]?.action))deny(call);
      report('page-call',{call,action,method,runId:identity.runId,ownerEpoch:identity.ownerEpoch,requestId,documentId:current.documentId});
    } else if(action==='cancel') {
      assertTarget(message.run?.target);
      report('page-call',{call,action,runId:message.run.runId,ownerEpoch:message.run.ownerEpoch,documentId:current.documentId});
    } else if(action==='ping')report('page-call',{call,action,documentId:current.documentId});
    else deny(call);
    if(page!==current)deny(call,'E_DOCUMENT_REPLACED');
    if(typeof callback==='function'){current.dispatch(message,callback);return;}
    return new Promise(resolve=>current.dispatch(message,resolve));
  }

  const api=Object.freeze({
    runtime:Object.freeze({id:runtimeId,getURL(path){
      if(typeof path!=='string'||!/^(?:[\w.-]+\/)*[\w.-]*(?:\?[\w.=%&-]+)?$/.test(path)||path.split(/[/?]/).some(part=>part==='.'||part==='..'))
        deny('runtime.getURL');
      const url=runtime.getURL(path);
      if(url!=='chrome-extension://'+runtimeId+'/'+path)deny('runtime.getURL');
      return url;
    },...(typeof runtime.getManifest==='function'?{getManifest:()=>structuredClone(runtime.getManifest())}:{})}),
    permissions:Object.freeze({async contains(value){
      if(closed||!exact(value,{origins:value?.origins})||!Array.isArray(value.origins)||
        value.origins.length!==1||value.origins[0]!==ORIGIN+'/*')return false;
      const allowed=await checkPermission({origins:[ORIGIN+'/*']})===true&&!closed;
      if(allowed!==lastPermission){
        lastPermission=allowed;
        report('permission-check',{call:'permissions.contains',allowed});
      }
      return allowed&&!closed;
    }}),
    tabs:Object.freeze({
      async query(value){
        if(!exact(value,{active:true,windowId}))deny('tabs.query');
        report('target-call',{call:'tabs.query',tabId:TAB_ID,windowId});
        return page?[tab(page)]:[];
      },
      get(id,callback){return answer(tab(needTab(id,'tabs.get')),callback);},
      update(id,changes,callback){
        const current=needTab(id,'tabs.update');
        if(!exact(changes,{active:true}))deny('tabs.update');
        report('synthetic-foreground',{call:'tabs.update',tabId:id,windowId});
        return answer(tab(current),callback);
      },
      sendMessage,onRemoved:removed.api
    }),
    windows:Object.freeze({
      update(id,changes,callback){
        needPage('windows.update');
        if(id!==windowId||!exact(changes,{focused:true}))deny('windows.update');
        report('synthetic-foreground',{call:'windows.update',windowId});
        return answer({id,focused:true,incognito:false},callback);
      },
      get(id,callback){
        needPage('windows.get');
        if(id!==windowId)deny('windows.get','E_TARGET');
        return answer({id,focused:true,incognito:false},callback);
      }
    }),
    webNavigation:Object.freeze({
      getAllFrames(value,callback){
        if(!exact(value,{tabId:TAB_ID}))deny('webNavigation.getAllFrames','E_TARGET');
        return answer([frame(needPage('webNavigation.getAllFrames'))],callback);
      },
      onCommitted:committed.api
    })
  });
  selectQuery(ORIGINAL_QUERY);
  return Object.freeze({api,selectQuery,get snapshot(){return snapshot();},close(){
    if(closed)return;
    closed=true;
    const {documentId}=page;
    page.dispose(); page=null;
    removed.emit(TAB_ID,{windowId,isWindowClosing:false});
    committed.clear(); removed.clear();
    report('target-closed',{tabId:TAB_ID,windowId,documentId});
  }});
}
