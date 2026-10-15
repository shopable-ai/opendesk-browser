// Browser operation parameter/response descriptions, keyed by the one authoritative
// BROWSER_OPERATIONS registry. Metadata never grants permission or admits RPC calls.
import {fields,fail,jsonValue} from './registry.js';
import {APPROVED_BROWSER_DIRECT_BINDINGS} from './browser-direct.generated.js';
import {APPROVED_BROWSER_SCOPED_BINDINGS} from './browser-services.generated.js';
const obj=(properties={},required=[])=>({type:'object',additionalProperties:false,properties,required});
const str=(maxLength=2048,pattern)=>({type:'string',maxLength,...(pattern?{pattern}:{})});
const ref=str(160,'^[A-Za-z0-9_-]{16,160}$');
const http=str(2048,'^https?://');
const num=(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const arr=(items,maxItems=100)=>({type:'array',items,maxItems});
const bool={type:'boolean'},nullableString={anyOf:[str(160),{type:'null'}]};
const empty=obj();
const storageKey=str(128,'^[A-Za-z][A-Za-z0-9._-]{0,127}$'),storageKeys=arr(storageKey,100);
const sid=obj({observationId:ref},['observationId']);
const oid=obj({operationId:ref},['operationId']),eid=obj({sessionRef:ref},['sessionRef']);
const text=str(150000);
const menuIds={type:'array',minItems:1,maxItems:3,uniqueItems:true,items:str(40,'^[a-z][a-z0-9-]{0,39}$')};
const resultIds=obj({registered:bool,actionIds:arr(str(40),3)},['registered','actionIds']);
const counter=obj({state:str(40),observedCount:num(),droppedCount:num(),gapCount:num(),expiresAt:num()},
  ['state','observedCount','droppedCount','gapCount','expiresAt']);
const cookiePartition=obj({topLevelSite:str(256,'^https?://'),hasCrossSiteAncestor:bool},['topLevelSite']);
const cookieRecord=obj({name:str(256),domain:str(253),path:str(512),hostOnly:bool,
  secure:bool,httpOnly:bool,sameSite:{enum:['unspecified','lax','strict','no_restriction']},
  session:bool,expirationDate:{type:'number'},storeId:str(128),partitionKey:cookiePartition,
  valueRedacted:bool,value:str(4096)},['name','domain','path','valueRedacted']);
const nullableCookie={anyOf:[cookieRecord,{type:'null'}]};
const capabilityListRow=obj({operation:str(120),implementation:str(40),riskLevel:str(40),
  requiredCapabilities:arr(str(80),12),requiredChromePermissions:arr(str(80),12),
  status:obj({callableNow:bool,reasonCode:nullableString,exposure:str(40)},
    ['callableNow','reasonCode','exposure'])},
  ['operation','implementation','riskLevel','requiredCapabilities','requiredChromePermissions','status']);
const capabilityStatus=obj({operation:str(120),apiVersion:str(32),
  implementation:str(40),exposure:str(40),platform:str(40),
  authorization:obj({tool:str(40),browser:str(40),site:str(40)},['tool','browser','site']),
  callableNow:bool,requiresUserGesture:bool,reasonCode:nullableString,nextAction:nullableString},
  ['operation','callableNow','reasonCode']);
const bookmarkId=str(128,'^.{1,128}$');
const maybeId={anyOf:[bookmarkId,{type:'null'}]};
const maybeIndex={anyOf:[num(0,1000000),{type:'null'}]};
const maybeUrl={anyOf:[str(4096),{type:'null'}]};
const maybeName={anyOf:[str(80),{type:'null'}]};
const bookmarkNode=obj({id:bookmarkId,parentId:maybeId,index:maybeIndex,
  title:str(256),url:str(4096),unmodifiable:str(80),folderType:str(80),
  dateAdded:{type:'number'},dateGroupModified:{type:'number'},syncing:bool},['id','title','parentId','index']);
const expectedBookmark=obj({id:bookmarkId,parentId:maybeId,index:maybeIndex,
  title:str(256),url:maybeUrl,unmodifiable:maybeName,folderType:maybeName},
  ['id','parentId','index','title','url','unmodifiable','folderType']);
const bookmarkPage=obj({snapshotRef:ref,nodes:arr(bookmarkNode,200),nextCursor:str(512)},
  ['snapshotRef','nodes']);
const bookmarkEvent=obj({seq:num(1),kind:{enum:['created','removed','changed','moved','childrenReordered','importBegan','importEnded']},
  timestamp:num(),id:bookmarkId,details:{type:'object',additionalProperties:true}},['seq','kind','timestamp']);
const cookieEvent=obj({seq:num(1),name:str(256),domain:str(253),path:str(512),
  removed:bool,cause:str(40),at:num()},['seq','name','domain','path','removed','cause','at']);
const managedProxyEndpoint=obj({scheme:{enum:['https','socks5']},
  host:str(253,'^[a-z0-9.-]+
 'browser.capabilities.list':[empty,arr(capabilityListRow,96)],
 'browser.capabilities.getStatus':[obj({operation:str(120,'^browser\\.[A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z][A-Za-z0-9]*)*$'),url:http},['operation']),
   capabilityStatus],
 'browser.contextMenu.getStatus':[empty,obj({enabled:bool,approvedOrigins:arr(http,30),
   activeActions:arr(str(40),3),browserPermission:bool},['enabled','approvedOrigins','activeActions','browserPermission'])],
 'browser.contextMenu.register':[obj({actionIds:menuIds},['actionIds']),resultIds],
 'browser.contextMenu.unregister':[empty,resultIds],
 'browser.launch.consume':[empty,obj({ticketId:str(36),toolId:str(40),actionId:str(40),
   selection:str(16384),linkUrl:{anyOf:[http,{type:'null'}]},source:obj(),expiresAt:num()},
   ['ticketId','toolId','actionId','selection','source','expiresAt'])],
 'browser.page.getContext':[empty,obj({status:{enum:['available','unavailable']},
   title:str(512),url:str(4096),message:str(250),tabRef:ref,documentRef:ref},['status'])],
 'browser.page.getSelection':[empty,obj({ticketId:str(36),selection:str(16384)},['ticketId','selection'])],
 'browser.clipboard.writeText':[obj({text},['text']),obj({copied:bool},['copied'])],
 'browser.downloads.text':[obj({text,filename:str(90)},['text','filename']),
   obj({started:bool},['started'])],
 'browser.downloads.download':[obj({url:http,filename:str(150),saveAs:bool},['url']),
   obj({downloadRef:ref,status:{const:'started'}},['downloadRef','status'])],
 'browser.downloads.getOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']},
     bytesReceived:num(),totalBytes:num()},['downloadRef','state','bytesReceived'])],
 'browser.downloads.listOwned':[obj({cursor:ref,limit:num(1,50)}),
   obj({items:arr(obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']}},
     ['downloadRef','state']),50),nextCursor:ref},['items'])],
 'browser.downloads.cancelOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({cancelled:bool},['cancelled'])],
 'browser.bookmarks.createOwned':[obj({url:http,title:str(256),parentRef:ref},['url']),
   obj({bookmarkRef:ref},['bookmarkRef'])],
 'browser.bookmarks.removeOwned':[obj({bookmarkRef:ref},['bookmarkRef']),
   obj({removed:bool},['removed'])],
 'browser.bookmarks.getTree':[obj({cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.get':[obj({id:bookmarkId},['id']),arr(bookmarkNode,16)],
 'browser.bookmarks.search':[obj({query:{anyOf:[str(512),obj({query:str(512),title:str(256),url:http})]},
   cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.create':[obj({title:str(256),url:http,parentId:bookmarkId,index:num(0,1000000),
   sourcePage:obj({url:http,tabRef:ref,documentRef:ref},['url','tabRef','documentRef'])},['title']),bookmarkNode],
 'browser.bookmarks.update':[obj({id:bookmarkId,changes:obj({title:str(256),url:http}),
   expected:expectedBookmark},['id','changes','expected']),bookmarkNode],
 'browser.bookmarks.move':[obj({id:bookmarkId,destination:obj({parentId:bookmarkId,index:num(0,1000000)},['parentId']),
   expected:expectedBookmark},['id','destination','expected']),bookmarkNode],
 'browser.bookmarks.remove':[obj({id:bookmarkId,expected:expectedBookmark},['id','expected']),obj({removed:bool},['removed'])],
 'browser.bookmarks.prepareRemoveTree':[obj({id:bookmarkId,snapshotRef:ref,expected:expectedBookmark,
   descendantCount:num(1,20000)},['id','snapshotRef','expected','descendantCount']),
   obj({ticket:ref,targetId:bookmarkId,descendantCount:num(1,20000),expiresAt:num()},['ticket','targetId','descendantCount','expiresAt'])],
 'browser.bookmarks.removeTree':[obj({id:bookmarkId,ticket:ref},['id','ticket']),obj({removed:bool},['removed'])],
 'browser.bookmarks.observe.start':[obj({maxEvents:num(1,100),durationMs:num(1000,30000)}),
   obj({sessionRef:ref,cursor:str(12),expiresAt:num()},['sessionRef','cursor','expiresAt'])],
 'browser.bookmarks.observe.read':[obj({sessionRef:ref,cursor:str(12),limit:num(1,50)},['sessionRef']),
   obj({events:arr(bookmarkEvent,50),nextCursor:str(12),expiresAt:num(),
     gapCount:num(),droppedCount:num()},['events','nextCursor','expiresAt','gapCount','droppedCount'])],
 'browser.bookmarks.observe.stop':[obj({sessionRef:ref},['sessionRef']),obj({stopped:bool},['stopped'])],
 'browser.scheduler.create':[obj({taskId:str(128),revision:str(128,'^[1-9][0-9]{0,15}$'),
   schedule:obj({kind:str(128),expression:str(256)},['kind','expression'])},['taskId','revision','schedule']),
   obj({scheduleRef:ref,status:{enum:['active','pending']}},['scheduleRef','status'])],
 'browser.scheduler.listOwn':[empty,obj({schedules:arr(obj({scheduleRef:ref,taskId:str(256),status:str(256)},
   ['scheduleRef','taskId','status']),100)},['schedules'])],
 'browser.scheduler.cancelOwn':[obj({scheduleRef:ref},['scheduleRef']),obj({cancelled:bool},['cancelled'])],
 'browser.storage.local.get':[obj({keys:storageKeys}),obj({items:{type:'object',additionalProperties:true}},['items'])],
  'browser.storage.local.getQuota':[empty,obj({usedBytes:num(),maxBytes:num(),keyCount:num(),
    maxKeys:num(),maxItemBytes:num()},['usedBytes','maxBytes','keyCount','maxKeys','maxItemBytes'])],
 'browser.storage.local.set':[obj({items:{type:'object',maxProperties:100,additionalProperties:true}},['items']),
   obj({written:num()},['written'])],
 'browser.storage.local.remove':[obj({keys:storageKeys},['keys']),obj({removed:num()},['removed'])],
 'browser.storage.local.clear':[obj({confirm:{const:true}},['confirm']),obj({removed:num()},['removed'])],
 'browser.tabs.activateOwned':[obj({tabRef:ref},['tabRef']),obj({focused:bool},['focused'])],
 'browser.tabs.listOwned':[empty,obj({tabs:arr(obj({tabRef:ref,origin:http},['tabRef','origin']),8)},['tabs'])],
 'browser.tabs.pinOwned':[obj({tabRef:ref,pinned:bool},['tabRef','pinned']),obj({pinned:bool},['pinned'])],
 'browser.tabs.reloadOwned':[obj({tabRef:ref},['tabRef']),
   obj({reloadRequested:bool,tabRefRevoked:bool},['reloadRequested','tabRefRevoked'])],
 'browser.tabs.navigateOwned':[obj({tabRef:ref,url:http},['tabRef','url']),
   obj({navigationRequested:bool,tabRefRevoked:bool},['navigationRequested','tabRefRevoked'])],
 'browser.tabs.removeOwned':[obj({tabRef:ref},['tabRef']),obj({closed:bool},['closed'])],
 'browser.sidePanel.openSelf':[empty,obj({opened:bool},['opened'])],
 'browser.proxy.managed.getStatus':[empty,managedProxyStatus],
 'browser.proxy.managed.requestEnable':[obj({config:managedProxyConfig},['config']),managedProxyStatus],
 'browser.proxy.managed.requestDisable':[empty,managedProxyStatus],
 'browser.network.request':[obj({method:{enum:['GET','POST','PUT','DELETE']},url:http,
   data:{},config:obj({timeout:num(1,60000),responseType:{enum:['json','text']}})},['method','url']),
   obj({status:num(100,599),data:{}},['status'])],
 'browser.network.observe.start':[obj({tabRef:ref,origins:arr(http,8),durationMs:num(1,30000),
   maxEvents:num(1,500),maxBufferedBytes:num(1024,524288)},['tabRef','origins']),
   obj({observationId:ref,operationId:ref,expiresAt:num(),status:str(40)},['observationId','operationId','expiresAt','status'])],
 'browser.network.observe.getStatus':[sid,counter],
 'browser.network.observe.stop':[sid,obj({state:str(40),stoppedAt:num()},['state','stoppedAt'])],
 'browser.network.observe.export':[obj({observationId:ref,format:{enum:['json']}},['observationId','format']),
   obj({status:{const:'started'},bytes:num(0,524288),truncated:bool},['status','bytes','truncated'])],
 'browser.events.read':[obj({sessionRef:ref,cursor:str(160),limit:num(1,100)},['sessionRef']),
   obj({events:arr(obj({seq:num(1),kind:{enum:['request','completed','failed']},
     timestamp:num(),origin:http,method:str(16),resourceType:str(24),
     statusCode:num(100,599),error:str(60)},['seq','kind','timestamp','origin','method','resourceType']),100),
     nextCursor:nullableString,droppedCount:num(),gapCount:num()},
   ['events','droppedCount','gapCount'])],
 'browser.events.close':[eid,obj({closed:bool},['closed'])],
 'browser.screenshot.captureVisible':[obj({tabRef:ref},['tabRef']),
   obj({status:{const:'started'},bytes:num(1,8388608),width:num(1,4096),height:num(1,4096)},['status','bytes','width','height'])],
 'browser.operations.getStatus':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']}},['state'])],

 'browser.cookies.get':[obj({url:http,name:str(256),domain:str(253),path:str(512),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url','name']),
   obj({cookie:nullableCookie,scope:str(64)},['cookie','scope'])],
 'browser.cookies.getAll':[obj({url:http,name:str(256),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url']),
   arr(cookieRecord,50)],
 'browser.cookies.set':[obj({url:http,name:str(256),value:str(4096),domain:str(256),path:str(512),secure:bool,httpOnly:bool,sameSite:str(32),
    expirationDate:{type:'number'},storeId:str(128),partitionKey:cookiePartition},['url','name','value']),
   obj({saved:bool,verified:bool,cookie:cookieRecord},['saved','verified'])],
 'browser.cookies.remove':[obj({url:http,name:str(256),domain:str(256),path:str(512),storeId:str(128),partitionKey:cookiePartition},['url','name','domain','path']),
   obj({removed:bool,verified:bool},['removed','verified'])],
 'browser.cookies.clearSite':[obj({url:http,storeId:str(128),partitionKey:cookiePartition,preview:bool,previewRef:str(36),expectedCount:num(0,50),maxCookies:num(1,50)},['url']),
   obj({matched:num(0,50),removed:num(0,50),remaining:num(0,50),preview:bool,previewRef:str(36),scope:str(80)},['matched','removed','remaining','preview','scope'])],
 'browser.cookies.getCurrentStore':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({storeId:str(128)},['storeId'])],
 'browser.cookies.getPartitionKey':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({partitionKey:cookiePartition},['partitionKey'])],
 'browser.cookies.observe.start':[obj({url:http,durationMs:num(1000,30000),maxEvents:num(1,50)},['url']),
   obj({sessionRef:str(36),expiresAt:num(),status:str(30)},['sessionRef','expiresAt','status'])],
 'browser.cookies.observe.getStatus':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({sessionRef:str(36),status:str(30),bufferedCount:num(0,50),droppedCount:num(),expiresAt:num()},['sessionRef','status','bufferedCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.read':[obj({url:http,sessionRef:str(36),cursor:str(12),limit:num(1,50)},['url','sessionRef']),
   obj({sessionRef:str(36),events:arr(cookieEvent,50),nextCursor:str(12),gapCount:num(),droppedCount:num(),expiresAt:num()},
     ['sessionRef','events','nextCursor','gapCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.stop':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({stopped:bool},['stopped'])],
 'browser.operations.cancel':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']},cancelRequested:bool},['state'])]
});
// Compiled DIRECT and selected TRUSTED_SERVICE methods use approved matrix
// schemas; other scoped/custom schemas retain explicit audited implementations.
export function deriveBrowserDirectSchemas(rows=APPROVED_BROWSER_DIRECT_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation))throw fail('E_CONTRACT','Duplicate DIRECT Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const directOps=deriveBrowserDirectSchemas();
export function deriveBrowserScopedSchemas(rows=APPROVED_BROWSER_SCOPED_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation)||directOps.has(row.operation)||
       row.mode!=='TRUSTED_SERVICE')
      throw fail('E_CONTRACT','Duplicate or invalid compiled service Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const scopedOps=deriveBrowserScopedSchemas();
export function operationSchemas(operation){
  const pair=Object.hasOwn(ops,operation)?ops[operation]:
    directOps.get(operation)??scopedOps.get(operation);
  return pair?{input:pair[0],output:pair[1]}:null;
}
export function assertBrowserSchemaCoverage(operations){
  const declared=[...Object.keys(ops),...directOps.keys(),...scopedOps.keys()].sort();
  if(JSON.stringify(Object.keys(operations).sort())!==JSON.stringify(declared))
    throw fail('E_CONTRACT','Browser operation schema drift');
}
// Generic argument validation is used ONLY for build-approved DIRECT calls.
// SCOPED/CUSTOM operations retain their audited, operation-specific normalizers.
export function normalizeDirectBrowserArguments(operation,value){
  const schema=operationSchemas(operation)?.input;
  if(schema?.type!=='object'||schema.additionalProperties!==false)
    throw fail('E_CONTRACT','A bounded direct-call object schema is required');
  return validateDirectBrowserValue(value,schema);
}
// Shared input/output validation for approved DIRECT contracts only.
export function validateDirectBrowserValue(value,schema){
  jsonValue(value);
  const validate=(item,rule,depth=0)=>{
    if(depth>12||!rule||typeof rule!=='object')
      throw fail('E_CONTRACT','Unsupported direct-call input schema');
    if(Array.isArray(rule.anyOf)){
      const matches=rule.anyOf.some(choice=>{try{validate(item,choice,depth+1);return true}catch{return false}});
      if(!matches)throw fail('E_SCHEMA','Direct Chrome API argument type mismatch');
      return;
    }
    if(Object.hasOwn(rule,'const')&&item!==rule.const||
       Array.isArray(rule.enum)&&!rule.enum.includes(item))
      throw fail('E_SCHEMA','Direct Chrome API argument value mismatch');
    if(rule.type===undefined&&(Array.isArray(rule.enum)||Object.hasOwn(rule,'const')))return;
    switch(rule.type){
      case 'object':{
        fields(item,Object.keys(rule.properties??{}),rule.required??[]);
        if(rule.additionalProperties!==false)
          throw fail('E_CONTRACT','DIRECT schema must reject undeclared fields');
        if(rule.maxProperties!==undefined&&Object.keys(item).length>rule.maxProperties)
          throw fail('E_SCHEMA','Too many direct-call fields');
        for(const [key,part] of Object.entries(item))
          validate(part,rule.properties[key],depth+1);
        return;
      }
      case 'array':
        if(!Array.isArray(item)||rule.maxItems!==undefined&&item.length>rule.maxItems||
           rule.minItems!==undefined&&item.length<rule.minItems)
          throw fail('E_SCHEMA','Invalid direct-call array');
        if(rule.uniqueItems&&new Set(item.map(x=>JSON.stringify(x))).size!==item.length)
          throw fail('E_SCHEMA','Duplicate direct-call array entries');
        for(const part of item)validate(part,rule.items,depth+1);
        return;
      case 'string':
        if(typeof item!=='string'||rule.minLength!==undefined&&item.length<rule.minLength||
           rule.maxLength!==undefined&&item.length>rule.maxLength||
           rule.pattern!==undefined&&!new RegExp(rule.pattern).test(item))
          throw fail('E_SCHEMA','Invalid direct-call string');
        return;
      case 'integer':
      case 'number':
        if(typeof item!=='number'||!Number.isFinite(item)||
           rule.type==='integer'&&!Number.isSafeInteger(item)||
           rule.minimum!==undefined&&item<rule.minimum||
           rule.maximum!==undefined&&item>rule.maximum)
          throw fail('E_SCHEMA','Invalid direct-call number');
        return;
      case 'boolean':
        if(typeof item!=='boolean')throw fail('E_SCHEMA','Invalid direct-call boolean');
        return;
      case 'null':
        if(item!==null)throw fail('E_SCHEMA','Invalid direct-call null');
        return;
      default:throw fail('E_CONTRACT','Unsupported direct-call schema type');
    }
  };
  validate(value,schema);
  return value;
}

export function validateExportArguments(operation,value){
  if(operation==='browser.clipboard.writeText')fields(value,['text'],['text']);
  else if(operation==='browser.downloads.text')fields(value,['text','filename'],['text','filename']);
  else throw fail('E_SERVICE_UNSUPPORTED');
  if(typeof value.text!=='string'||!value.text||
     new TextEncoder().encode(value.text).byteLength>150000)
    throw fail('E_LIMIT','Export text must be 1–150000 UTF-8 bytes');
  if(operation==='browser.downloads.text'){
    if(typeof value.filename!=='string'||value.filename.length>90||
       !/^[^/\\\x00-\x1f:?*"<>|]+\.(?:md|txt|json|csv)$/i.test(value.filename)||value.filename.startsWith('.'))
      throw fail('E_SCHEMA','Expected a safe Markdown, TXT, JSON or CSV filename');
  }
  return value;
}

// Existing Browser SDK text export, not general Blob/URL download authority.
// Revalidate the entire payload after the Host's one-shot user approval.
export function browserTextDownloadUrl(input) {
  validateExportArguments('browser.downloads.text', input);
  const mime=/\.csv$/i.test(input.filename)?'text/csv':
    /\.json$/i.test(input.filename)?'application/json':
    /\.txt$/i.test(input.filename)?'text/plain':'text/markdown';
  return 'data:'+mime+';charset=utf-8,'+encodeURIComponent(input.text);
}
),port:num(1,65535)},['scheme','host','port']);
const managedProxyConfig=obj({endpoint:managedProxyEndpoint,domains:{
  type:'array',minItems:1,maxItems:16,uniqueItems:true,items:str(253,'^[a-z0-9.-]+
 'browser.capabilities.list':[empty,arr(capabilityListRow,96)],
 'browser.capabilities.getStatus':[obj({operation:str(120,'^browser\\.[A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z][A-Za-z0-9]*)*$'),url:http},['operation']),
   capabilityStatus],
 'browser.contextMenu.getStatus':[empty,obj({enabled:bool,approvedOrigins:arr(http,30),
   activeActions:arr(str(40),3),browserPermission:bool},['enabled','approvedOrigins','activeActions','browserPermission'])],
 'browser.contextMenu.register':[obj({actionIds:menuIds},['actionIds']),resultIds],
 'browser.contextMenu.unregister':[empty,resultIds],
 'browser.launch.consume':[empty,obj({ticketId:str(36),toolId:str(40),actionId:str(40),
   selection:str(16384),linkUrl:{anyOf:[http,{type:'null'}]},source:obj(),expiresAt:num()},
   ['ticketId','toolId','actionId','selection','source','expiresAt'])],
 'browser.page.getContext':[empty,obj({status:{enum:['available','unavailable']},
   title:str(512),url:str(4096),message:str(250),tabRef:ref,documentRef:ref},['status'])],
 'browser.page.getSelection':[empty,obj({ticketId:str(36),selection:str(16384)},['ticketId','selection'])],
 'browser.clipboard.writeText':[obj({text},['text']),obj({copied:bool},['copied'])],
 'browser.downloads.text':[obj({text,filename:str(90)},['text','filename']),
   obj({started:bool},['started'])],
 'browser.downloads.download':[obj({url:http,filename:str(150),saveAs:bool},['url']),
   obj({downloadRef:ref,status:{const:'started'}},['downloadRef','status'])],
 'browser.downloads.getOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']},
     bytesReceived:num(),totalBytes:num()},['downloadRef','state','bytesReceived'])],
 'browser.downloads.listOwned':[obj({cursor:ref,limit:num(1,50)}),
   obj({items:arr(obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']}},
     ['downloadRef','state']),50),nextCursor:ref},['items'])],
 'browser.downloads.cancelOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({cancelled:bool},['cancelled'])],
 'browser.bookmarks.createOwned':[obj({url:http,title:str(256),parentRef:ref},['url']),
   obj({bookmarkRef:ref},['bookmarkRef'])],
 'browser.bookmarks.removeOwned':[obj({bookmarkRef:ref},['bookmarkRef']),
   obj({removed:bool},['removed'])],
 'browser.bookmarks.getTree':[obj({cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.get':[obj({id:bookmarkId},['id']),arr(bookmarkNode,16)],
 'browser.bookmarks.search':[obj({query:{anyOf:[str(512),obj({query:str(512),title:str(256),url:http})]},
   cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.create':[obj({title:str(256),url:http,parentId:bookmarkId,index:num(0,1000000),
   sourcePage:obj({url:http,tabRef:ref,documentRef:ref},['url','tabRef','documentRef'])},['title']),bookmarkNode],
 'browser.bookmarks.update':[obj({id:bookmarkId,changes:obj({title:str(256),url:http}),
   expected:expectedBookmark},['id','changes','expected']),bookmarkNode],
 'browser.bookmarks.move':[obj({id:bookmarkId,destination:obj({parentId:bookmarkId,index:num(0,1000000)},['parentId']),
   expected:expectedBookmark},['id','destination','expected']),bookmarkNode],
 'browser.bookmarks.remove':[obj({id:bookmarkId,expected:expectedBookmark},['id','expected']),obj({removed:bool},['removed'])],
 'browser.bookmarks.prepareRemoveTree':[obj({id:bookmarkId,snapshotRef:ref,expected:expectedBookmark,
   descendantCount:num(1,20000)},['id','snapshotRef','expected','descendantCount']),
   obj({ticket:ref,targetId:bookmarkId,descendantCount:num(1,20000),expiresAt:num()},['ticket','targetId','descendantCount','expiresAt'])],
 'browser.bookmarks.removeTree':[obj({id:bookmarkId,ticket:ref},['id','ticket']),obj({removed:bool},['removed'])],
 'browser.bookmarks.observe.start':[obj({maxEvents:num(1,100),durationMs:num(1000,30000)}),
   obj({sessionRef:ref,cursor:str(12),expiresAt:num()},['sessionRef','cursor','expiresAt'])],
 'browser.bookmarks.observe.read':[obj({sessionRef:ref,cursor:str(12),limit:num(1,50)},['sessionRef']),
   obj({events:arr(bookmarkEvent,50),nextCursor:str(12),expiresAt:num(),
     gapCount:num(),droppedCount:num()},['events','nextCursor','expiresAt','gapCount','droppedCount'])],
 'browser.bookmarks.observe.stop':[obj({sessionRef:ref},['sessionRef']),obj({stopped:bool},['stopped'])],
 'browser.scheduler.create':[obj({taskId:str(128),revision:str(128,'^[1-9][0-9]{0,15}$'),
   schedule:obj({kind:str(128),expression:str(256)},['kind','expression'])},['taskId','revision','schedule']),
   obj({scheduleRef:ref,status:{enum:['active','pending']}},['scheduleRef','status'])],
 'browser.scheduler.listOwn':[empty,obj({schedules:arr(obj({scheduleRef:ref,taskId:str(256),status:str(256)},
   ['scheduleRef','taskId','status']),100)},['schedules'])],
 'browser.scheduler.cancelOwn':[obj({scheduleRef:ref},['scheduleRef']),obj({cancelled:bool},['cancelled'])],
 'browser.storage.local.get':[obj({keys:storageKeys}),obj({items:{type:'object',additionalProperties:true}},['items'])],
  'browser.storage.local.getQuota':[empty,obj({usedBytes:num(),maxBytes:num(),keyCount:num(),
    maxKeys:num(),maxItemBytes:num()},['usedBytes','maxBytes','keyCount','maxKeys','maxItemBytes'])],
 'browser.storage.local.set':[obj({items:{type:'object',maxProperties:100,additionalProperties:true}},['items']),
   obj({written:num()},['written'])],
 'browser.storage.local.remove':[obj({keys:storageKeys},['keys']),obj({removed:num()},['removed'])],
 'browser.storage.local.clear':[obj({confirm:{const:true}},['confirm']),obj({removed:num()},['removed'])],
 'browser.tabs.activateOwned':[obj({tabRef:ref},['tabRef']),obj({focused:bool},['focused'])],
 'browser.tabs.listOwned':[empty,obj({tabs:arr(obj({tabRef:ref,origin:http},['tabRef','origin']),8)},['tabs'])],
 'browser.tabs.pinOwned':[obj({tabRef:ref,pinned:bool},['tabRef','pinned']),obj({pinned:bool},['pinned'])],
 'browser.tabs.reloadOwned':[obj({tabRef:ref},['tabRef']),
   obj({reloadRequested:bool,tabRefRevoked:bool},['reloadRequested','tabRefRevoked'])],
 'browser.tabs.navigateOwned':[obj({tabRef:ref,url:http},['tabRef','url']),
   obj({navigationRequested:bool,tabRefRevoked:bool},['navigationRequested','tabRefRevoked'])],
 'browser.tabs.removeOwned':[obj({tabRef:ref},['tabRef']),obj({closed:bool},['closed'])],
 'browser.sidePanel.openSelf':[empty,obj({opened:bool},['opened'])],
 'browser.network.request':[obj({method:{enum:['GET','POST','PUT','DELETE']},url:http,
   data:{},config:obj({timeout:num(1,60000),responseType:{enum:['json','text']}})},['method','url']),
   obj({status:num(100,599),data:{}},['status'])],
 'browser.network.observe.start':[obj({tabRef:ref,origins:arr(http,8),durationMs:num(1,30000),
   maxEvents:num(1,500),maxBufferedBytes:num(1024,524288)},['tabRef','origins']),
   obj({observationId:ref,operationId:ref,expiresAt:num(),status:str(40)},['observationId','operationId','expiresAt','status'])],
 'browser.network.observe.getStatus':[sid,counter],
 'browser.network.observe.stop':[sid,obj({state:str(40),stoppedAt:num()},['state','stoppedAt'])],
 'browser.network.observe.export':[obj({observationId:ref,format:{enum:['json']}},['observationId','format']),
   obj({status:{const:'started'},bytes:num(0,524288),truncated:bool},['status','bytes','truncated'])],
 'browser.events.read':[obj({sessionRef:ref,cursor:str(160),limit:num(1,100)},['sessionRef']),
   obj({events:arr(obj({seq:num(1),kind:{enum:['request','completed','failed']},
     timestamp:num(),origin:http,method:str(16),resourceType:str(24),
     statusCode:num(100,599),error:str(60)},['seq','kind','timestamp','origin','method','resourceType']),100),
     nextCursor:nullableString,droppedCount:num(),gapCount:num()},
   ['events','droppedCount','gapCount'])],
 'browser.events.close':[eid,obj({closed:bool},['closed'])],
 'browser.screenshot.captureVisible':[obj({tabRef:ref},['tabRef']),
   obj({status:{const:'started'},bytes:num(1,8388608),width:num(1,4096),height:num(1,4096)},['status','bytes','width','height'])],
 'browser.operations.getStatus':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']}},['state'])],

 'browser.cookies.get':[obj({url:http,name:str(256),domain:str(253),path:str(512),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url','name']),
   obj({cookie:nullableCookie,scope:str(64)},['cookie','scope'])],
 'browser.cookies.getAll':[obj({url:http,name:str(256),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url']),
   arr(cookieRecord,50)],
 'browser.cookies.set':[obj({url:http,name:str(256),value:str(4096),domain:str(256),path:str(512),secure:bool,httpOnly:bool,sameSite:str(32),
    expirationDate:{type:'number'},storeId:str(128),partitionKey:cookiePartition},['url','name','value']),
   obj({saved:bool,verified:bool,cookie:cookieRecord},['saved','verified'])],
 'browser.cookies.remove':[obj({url:http,name:str(256),domain:str(256),path:str(512),storeId:str(128),partitionKey:cookiePartition},['url','name','domain','path']),
   obj({removed:bool,verified:bool},['removed','verified'])],
 'browser.cookies.clearSite':[obj({url:http,storeId:str(128),partitionKey:cookiePartition,preview:bool,previewRef:str(36),expectedCount:num(0,50),maxCookies:num(1,50)},['url']),
   obj({matched:num(0,50),removed:num(0,50),remaining:num(0,50),preview:bool,previewRef:str(36),scope:str(80)},['matched','removed','remaining','preview','scope'])],
 'browser.cookies.getCurrentStore':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({storeId:str(128)},['storeId'])],
 'browser.cookies.getPartitionKey':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({partitionKey:cookiePartition},['partitionKey'])],
 'browser.cookies.observe.start':[obj({url:http,durationMs:num(1000,30000),maxEvents:num(1,50)},['url']),
   obj({sessionRef:str(36),expiresAt:num(),status:str(30)},['sessionRef','expiresAt','status'])],
 'browser.cookies.observe.getStatus':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({sessionRef:str(36),status:str(30),bufferedCount:num(0,50),droppedCount:num(),expiresAt:num()},['sessionRef','status','bufferedCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.read':[obj({url:http,sessionRef:str(36),cursor:str(12),limit:num(1,50)},['url','sessionRef']),
   obj({sessionRef:str(36),events:arr(cookieEvent,50),nextCursor:str(12),gapCount:num(),droppedCount:num(),expiresAt:num()},
     ['sessionRef','events','nextCursor','gapCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.stop':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({stopped:bool},['stopped'])],
 'browser.operations.cancel':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']},cancelRequested:bool},['state'])]
});
// Compiled DIRECT and selected TRUSTED_SERVICE methods use approved matrix
// schemas; other scoped/custom schemas retain explicit audited implementations.
export function deriveBrowserDirectSchemas(rows=APPROVED_BROWSER_DIRECT_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation))throw fail('E_CONTRACT','Duplicate DIRECT Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const directOps=deriveBrowserDirectSchemas();
export function deriveBrowserScopedSchemas(rows=APPROVED_BROWSER_SCOPED_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation)||directOps.has(row.operation)||
       row.mode!=='TRUSTED_SERVICE')
      throw fail('E_CONTRACT','Duplicate or invalid compiled service Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const scopedOps=deriveBrowserScopedSchemas();
export function operationSchemas(operation){
  const pair=Object.hasOwn(ops,operation)?ops[operation]:
    directOps.get(operation)??scopedOps.get(operation);
  return pair?{input:pair[0],output:pair[1]}:null;
}
export function assertBrowserSchemaCoverage(operations){
  const declared=[...Object.keys(ops),...directOps.keys(),...scopedOps.keys()].sort();
  if(JSON.stringify(Object.keys(operations).sort())!==JSON.stringify(declared))
    throw fail('E_CONTRACT','Browser operation schema drift');
}
// Generic argument validation is used ONLY for build-approved DIRECT calls.
// SCOPED/CUSTOM operations retain their audited, operation-specific normalizers.
export function normalizeDirectBrowserArguments(operation,value){
  const schema=operationSchemas(operation)?.input;
  if(schema?.type!=='object'||schema.additionalProperties!==false)
    throw fail('E_CONTRACT','A bounded direct-call object schema is required');
  return validateDirectBrowserValue(value,schema);
}
// Shared input/output validation for approved DIRECT contracts only.
export function validateDirectBrowserValue(value,schema){
  jsonValue(value);
  const validate=(item,rule,depth=0)=>{
    if(depth>12||!rule||typeof rule!=='object')
      throw fail('E_CONTRACT','Unsupported direct-call input schema');
    if(Array.isArray(rule.anyOf)){
      const matches=rule.anyOf.some(choice=>{try{validate(item,choice,depth+1);return true}catch{return false}});
      if(!matches)throw fail('E_SCHEMA','Direct Chrome API argument type mismatch');
      return;
    }
    if(Object.hasOwn(rule,'const')&&item!==rule.const||
       Array.isArray(rule.enum)&&!rule.enum.includes(item))
      throw fail('E_SCHEMA','Direct Chrome API argument value mismatch');
    if(rule.type===undefined&&(Array.isArray(rule.enum)||Object.hasOwn(rule,'const')))return;
    switch(rule.type){
      case 'object':{
        fields(item,Object.keys(rule.properties??{}),rule.required??[]);
        if(rule.additionalProperties!==false)
          throw fail('E_CONTRACT','DIRECT schema must reject undeclared fields');
        if(rule.maxProperties!==undefined&&Object.keys(item).length>rule.maxProperties)
          throw fail('E_SCHEMA','Too many direct-call fields');
        for(const [key,part] of Object.entries(item))
          validate(part,rule.properties[key],depth+1);
        return;
      }
      case 'array':
        if(!Array.isArray(item)||rule.maxItems!==undefined&&item.length>rule.maxItems||
           rule.minItems!==undefined&&item.length<rule.minItems)
          throw fail('E_SCHEMA','Invalid direct-call array');
        if(rule.uniqueItems&&new Set(item.map(x=>JSON.stringify(x))).size!==item.length)
          throw fail('E_SCHEMA','Duplicate direct-call array entries');
        for(const part of item)validate(part,rule.items,depth+1);
        return;
      case 'string':
        if(typeof item!=='string'||rule.minLength!==undefined&&item.length<rule.minLength||
           rule.maxLength!==undefined&&item.length>rule.maxLength||
           rule.pattern!==undefined&&!new RegExp(rule.pattern).test(item))
          throw fail('E_SCHEMA','Invalid direct-call string');
        return;
      case 'integer':
      case 'number':
        if(typeof item!=='number'||!Number.isFinite(item)||
           rule.type==='integer'&&!Number.isSafeInteger(item)||
           rule.minimum!==undefined&&item<rule.minimum||
           rule.maximum!==undefined&&item>rule.maximum)
          throw fail('E_SCHEMA','Invalid direct-call number');
        return;
      case 'boolean':
        if(typeof item!=='boolean')throw fail('E_SCHEMA','Invalid direct-call boolean');
        return;
      case 'null':
        if(item!==null)throw fail('E_SCHEMA','Invalid direct-call null');
        return;
      default:throw fail('E_CONTRACT','Unsupported direct-call schema type');
    }
  };
  validate(value,schema);
  return value;
}

export function validateExportArguments(operation,value){
  if(operation==='browser.clipboard.writeText')fields(value,['text'],['text']);
  else if(operation==='browser.downloads.text')fields(value,['text','filename'],['text','filename']);
  else throw fail('E_SERVICE_UNSUPPORTED');
  if(typeof value.text!=='string'||!value.text||
     new TextEncoder().encode(value.text).byteLength>150000)
    throw fail('E_LIMIT','Export text must be 1–150000 UTF-8 bytes');
  if(operation==='browser.downloads.text'){
    if(typeof value.filename!=='string'||value.filename.length>90||
       !/^[^/\\\x00-\x1f:?*"<>|]+\.(?:md|txt|json|csv)$/i.test(value.filename)||value.filename.startsWith('.'))
      throw fail('E_SCHEMA','Expected a safe Markdown, TXT, JSON or CSV filename');
  }
  return value;
}

// Existing Browser SDK text export, not general Blob/URL download authority.
// Revalidate the entire payload after the Host's one-shot user approval.
export function browserTextDownloadUrl(input) {
  validateExportArguments('browser.downloads.text', input);
  const mime=/\.csv$/i.test(input.filename)?'text/csv':
    /\.json$/i.test(input.filename)?'application/json':
    /\.txt$/i.test(input.filename)?'text/plain':'text/markdown';
  return 'data:'+mime+';charset=utf-8,'+encodeURIComponent(input.text);
}
)}},
  ['endpoint','domains']);
const managedProxyStatus=obj({
  state:{enum:['enabled','disabled','unavailable','conflict']},
  control:{enum:['not_controllable','controlled_by_other_extensions',
    'controllable_by_this_extension','controlled_by_this_extension','unknown']},
  permission:bool,canStop:bool,reason:nullableString
},['state','control','permission','canStop','reason']);
const ops=Object.freeze({
 'browser.capabilities.list':[empty,arr(capabilityListRow,96)],
 'browser.capabilities.getStatus':[obj({operation:str(120,'^browser\\.[A-Za-z][A-Za-z0-9]*(?:\\.[A-Za-z][A-Za-z0-9]*)*$'),url:http},['operation']),
   capabilityStatus],
 'browser.contextMenu.getStatus':[empty,obj({enabled:bool,approvedOrigins:arr(http,30),
   activeActions:arr(str(40),3),browserPermission:bool},['enabled','approvedOrigins','activeActions','browserPermission'])],
 'browser.contextMenu.register':[obj({actionIds:menuIds},['actionIds']),resultIds],
 'browser.contextMenu.unregister':[empty,resultIds],
 'browser.launch.consume':[empty,obj({ticketId:str(36),toolId:str(40),actionId:str(40),
   selection:str(16384),linkUrl:{anyOf:[http,{type:'null'}]},source:obj(),expiresAt:num()},
   ['ticketId','toolId','actionId','selection','source','expiresAt'])],
 'browser.page.getContext':[empty,obj({status:{enum:['available','unavailable']},
   title:str(512),url:str(4096),message:str(250),tabRef:ref,documentRef:ref},['status'])],
 'browser.page.getSelection':[empty,obj({ticketId:str(36),selection:str(16384)},['ticketId','selection'])],
 'browser.clipboard.writeText':[obj({text},['text']),obj({copied:bool},['copied'])],
 'browser.downloads.text':[obj({text,filename:str(90)},['text','filename']),
   obj({started:bool},['started'])],
 'browser.downloads.download':[obj({url:http,filename:str(150),saveAs:bool},['url']),
   obj({downloadRef:ref,status:{const:'started'}},['downloadRef','status'])],
 'browser.downloads.getOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']},
     bytesReceived:num(),totalBytes:num()},['downloadRef','state','bytesReceived'])],
 'browser.downloads.listOwned':[obj({cursor:ref,limit:num(1,50)}),
   obj({items:arr(obj({downloadRef:ref,state:{enum:['in_progress','complete','interrupted']}},
     ['downloadRef','state']),50),nextCursor:ref},['items'])],
 'browser.downloads.cancelOwned':[obj({downloadRef:ref},['downloadRef']),
   obj({cancelled:bool},['cancelled'])],
 'browser.bookmarks.createOwned':[obj({url:http,title:str(256),parentRef:ref},['url']),
   obj({bookmarkRef:ref},['bookmarkRef'])],
 'browser.bookmarks.removeOwned':[obj({bookmarkRef:ref},['bookmarkRef']),
   obj({removed:bool},['removed'])],
 'browser.bookmarks.getTree':[obj({cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.get':[obj({id:bookmarkId},['id']),arr(bookmarkNode,16)],
 'browser.bookmarks.search':[obj({query:{anyOf:[str(512),obj({query:str(512),title:str(256),url:http})]},
   cursor:str(512),limit:num(1,100)}),bookmarkPage],
 'browser.bookmarks.create':[obj({title:str(256),url:http,parentId:bookmarkId,index:num(0,1000000),
   sourcePage:obj({url:http,tabRef:ref,documentRef:ref},['url','tabRef','documentRef'])},['title']),bookmarkNode],
 'browser.bookmarks.update':[obj({id:bookmarkId,changes:obj({title:str(256),url:http}),
   expected:expectedBookmark},['id','changes','expected']),bookmarkNode],
 'browser.bookmarks.move':[obj({id:bookmarkId,destination:obj({parentId:bookmarkId,index:num(0,1000000)},['parentId']),
   expected:expectedBookmark},['id','destination','expected']),bookmarkNode],
 'browser.bookmarks.remove':[obj({id:bookmarkId,expected:expectedBookmark},['id','expected']),obj({removed:bool},['removed'])],
 'browser.bookmarks.prepareRemoveTree':[obj({id:bookmarkId,snapshotRef:ref,expected:expectedBookmark,
   descendantCount:num(1,20000)},['id','snapshotRef','expected','descendantCount']),
   obj({ticket:ref,targetId:bookmarkId,descendantCount:num(1,20000),expiresAt:num()},['ticket','targetId','descendantCount','expiresAt'])],
 'browser.bookmarks.removeTree':[obj({id:bookmarkId,ticket:ref},['id','ticket']),obj({removed:bool},['removed'])],
 'browser.bookmarks.observe.start':[obj({maxEvents:num(1,100),durationMs:num(1000,30000)}),
   obj({sessionRef:ref,cursor:str(12),expiresAt:num()},['sessionRef','cursor','expiresAt'])],
 'browser.bookmarks.observe.read':[obj({sessionRef:ref,cursor:str(12),limit:num(1,50)},['sessionRef']),
   obj({events:arr(bookmarkEvent,50),nextCursor:str(12),expiresAt:num(),
     gapCount:num(),droppedCount:num()},['events','nextCursor','expiresAt','gapCount','droppedCount'])],
 'browser.bookmarks.observe.stop':[obj({sessionRef:ref},['sessionRef']),obj({stopped:bool},['stopped'])],
 'browser.scheduler.create':[obj({taskId:str(128),revision:str(128,'^[1-9][0-9]{0,15}$'),
   schedule:obj({kind:str(128),expression:str(256)},['kind','expression'])},['taskId','revision','schedule']),
   obj({scheduleRef:ref,status:{enum:['active','pending']}},['scheduleRef','status'])],
 'browser.scheduler.listOwn':[empty,obj({schedules:arr(obj({scheduleRef:ref,taskId:str(256),status:str(256)},
   ['scheduleRef','taskId','status']),100)},['schedules'])],
 'browser.scheduler.cancelOwn':[obj({scheduleRef:ref},['scheduleRef']),obj({cancelled:bool},['cancelled'])],
 'browser.storage.local.get':[obj({keys:storageKeys}),obj({items:{type:'object',additionalProperties:true}},['items'])],
  'browser.storage.local.getQuota':[empty,obj({usedBytes:num(),maxBytes:num(),keyCount:num(),
    maxKeys:num(),maxItemBytes:num()},['usedBytes','maxBytes','keyCount','maxKeys','maxItemBytes'])],
 'browser.storage.local.set':[obj({items:{type:'object',maxProperties:100,additionalProperties:true}},['items']),
   obj({written:num()},['written'])],
 'browser.storage.local.remove':[obj({keys:storageKeys},['keys']),obj({removed:num()},['removed'])],
 'browser.storage.local.clear':[obj({confirm:{const:true}},['confirm']),obj({removed:num()},['removed'])],
 'browser.tabs.activateOwned':[obj({tabRef:ref},['tabRef']),obj({focused:bool},['focused'])],
 'browser.tabs.listOwned':[empty,obj({tabs:arr(obj({tabRef:ref,origin:http},['tabRef','origin']),8)},['tabs'])],
 'browser.tabs.pinOwned':[obj({tabRef:ref,pinned:bool},['tabRef','pinned']),obj({pinned:bool},['pinned'])],
 'browser.tabs.reloadOwned':[obj({tabRef:ref},['tabRef']),
   obj({reloadRequested:bool,tabRefRevoked:bool},['reloadRequested','tabRefRevoked'])],
 'browser.tabs.navigateOwned':[obj({tabRef:ref,url:http},['tabRef','url']),
   obj({navigationRequested:bool,tabRefRevoked:bool},['navigationRequested','tabRefRevoked'])],
 'browser.tabs.removeOwned':[obj({tabRef:ref},['tabRef']),obj({closed:bool},['closed'])],
 'browser.sidePanel.openSelf':[empty,obj({opened:bool},['opened'])],
 'browser.network.request':[obj({method:{enum:['GET','POST','PUT','DELETE']},url:http,
   data:{},config:obj({timeout:num(1,60000),responseType:{enum:['json','text']}})},['method','url']),
   obj({status:num(100,599),data:{}},['status'])],
 'browser.network.observe.start':[obj({tabRef:ref,origins:arr(http,8),durationMs:num(1,30000),
   maxEvents:num(1,500),maxBufferedBytes:num(1024,524288)},['tabRef','origins']),
   obj({observationId:ref,operationId:ref,expiresAt:num(),status:str(40)},['observationId','operationId','expiresAt','status'])],
 'browser.network.observe.getStatus':[sid,counter],
 'browser.network.observe.stop':[sid,obj({state:str(40),stoppedAt:num()},['state','stoppedAt'])],
 'browser.network.observe.export':[obj({observationId:ref,format:{enum:['json']}},['observationId','format']),
   obj({status:{const:'started'},bytes:num(0,524288),truncated:bool},['status','bytes','truncated'])],
 'browser.events.read':[obj({sessionRef:ref,cursor:str(160),limit:num(1,100)},['sessionRef']),
   obj({events:arr(obj({seq:num(1),kind:{enum:['request','completed','failed']},
     timestamp:num(),origin:http,method:str(16),resourceType:str(24),
     statusCode:num(100,599),error:str(60)},['seq','kind','timestamp','origin','method','resourceType']),100),
     nextCursor:nullableString,droppedCount:num(),gapCount:num()},
   ['events','droppedCount','gapCount'])],
 'browser.events.close':[eid,obj({closed:bool},['closed'])],
 'browser.screenshot.captureVisible':[obj({tabRef:ref},['tabRef']),
   obj({status:{const:'started'},bytes:num(1,8388608),width:num(1,4096),height:num(1,4096)},['status','bytes','width','height'])],
 'browser.operations.getStatus':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']}},['state'])],

 'browser.cookies.get':[obj({url:http,name:str(256),domain:str(253),path:str(512),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url','name']),
   obj({cookie:nullableCookie,scope:str(64)},['cookie','scope'])],
 'browser.cookies.getAll':[obj({url:http,name:str(256),storeId:str(128),partitionKey:cookiePartition,includeValues:bool},['url']),
   arr(cookieRecord,50)],
 'browser.cookies.set':[obj({url:http,name:str(256),value:str(4096),domain:str(256),path:str(512),secure:bool,httpOnly:bool,sameSite:str(32),
    expirationDate:{type:'number'},storeId:str(128),partitionKey:cookiePartition},['url','name','value']),
   obj({saved:bool,verified:bool,cookie:cookieRecord},['saved','verified'])],
 'browser.cookies.remove':[obj({url:http,name:str(256),domain:str(256),path:str(512),storeId:str(128),partitionKey:cookiePartition},['url','name','domain','path']),
   obj({removed:bool,verified:bool},['removed','verified'])],
 'browser.cookies.clearSite':[obj({url:http,storeId:str(128),partitionKey:cookiePartition,preview:bool,previewRef:str(36),expectedCount:num(0,50),maxCookies:num(1,50)},['url']),
   obj({matched:num(0,50),removed:num(0,50),remaining:num(0,50),preview:bool,previewRef:str(36),scope:str(80)},['matched','removed','remaining','preview','scope'])],
 'browser.cookies.getCurrentStore':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({storeId:str(128)},['storeId'])],
 'browser.cookies.getPartitionKey':[obj({url:http,storeId:str(128),partitionKey:cookiePartition},['url']),obj({partitionKey:cookiePartition},['partitionKey'])],
 'browser.cookies.observe.start':[obj({url:http,durationMs:num(1000,30000),maxEvents:num(1,50)},['url']),
   obj({sessionRef:str(36),expiresAt:num(),status:str(30)},['sessionRef','expiresAt','status'])],
 'browser.cookies.observe.getStatus':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({sessionRef:str(36),status:str(30),bufferedCount:num(0,50),droppedCount:num(),expiresAt:num()},['sessionRef','status','bufferedCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.read':[obj({url:http,sessionRef:str(36),cursor:str(12),limit:num(1,50)},['url','sessionRef']),
   obj({sessionRef:str(36),events:arr(cookieEvent,50),nextCursor:str(12),gapCount:num(),droppedCount:num(),expiresAt:num()},
     ['sessionRef','events','nextCursor','gapCount','droppedCount','expiresAt'])],
 'browser.cookies.observe.stop':[obj({url:http,sessionRef:str(36)},['url','sessionRef']),
   obj({stopped:bool},['stopped'])],
 'browser.operations.cancel':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']},cancelRequested:bool},['state'])]
});
// Compiled DIRECT and selected TRUSTED_SERVICE methods use approved matrix
// schemas; other scoped/custom schemas retain explicit audited implementations.
export function deriveBrowserDirectSchemas(rows=APPROVED_BROWSER_DIRECT_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation))throw fail('E_CONTRACT','Duplicate DIRECT Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const directOps=deriveBrowserDirectSchemas();
export function deriveBrowserScopedSchemas(rows=APPROVED_BROWSER_SCOPED_BINDINGS){
  return new Map(rows.map(row=>{
    if(Object.hasOwn(ops,row.operation)||directOps.has(row.operation)||
       row.mode!=='TRUSTED_SERVICE')
      throw fail('E_CONTRACT','Duplicate or invalid compiled service Browser schema');
    return [row.operation,[row.inputSchema,row.outputSchema]];
  }));
}
const scopedOps=deriveBrowserScopedSchemas();
export function operationSchemas(operation){
  const pair=Object.hasOwn(ops,operation)?ops[operation]:
    directOps.get(operation)??scopedOps.get(operation);
  return pair?{input:pair[0],output:pair[1]}:null;
}
export function assertBrowserSchemaCoverage(operations){
  const declared=[...Object.keys(ops),...directOps.keys(),...scopedOps.keys()].sort();
  if(JSON.stringify(Object.keys(operations).sort())!==JSON.stringify(declared))
    throw fail('E_CONTRACT','Browser operation schema drift');
}
// Generic argument validation is used ONLY for build-approved DIRECT calls.
// SCOPED/CUSTOM operations retain their audited, operation-specific normalizers.
export function normalizeDirectBrowserArguments(operation,value){
  const schema=operationSchemas(operation)?.input;
  if(schema?.type!=='object'||schema.additionalProperties!==false)
    throw fail('E_CONTRACT','A bounded direct-call object schema is required');
  return validateDirectBrowserValue(value,schema);
}
// Shared input/output validation for approved DIRECT contracts only.
export function validateDirectBrowserValue(value,schema){
  jsonValue(value);
  const validate=(item,rule,depth=0)=>{
    if(depth>12||!rule||typeof rule!=='object')
      throw fail('E_CONTRACT','Unsupported direct-call input schema');
    if(Array.isArray(rule.anyOf)){
      const matches=rule.anyOf.some(choice=>{try{validate(item,choice,depth+1);return true}catch{return false}});
      if(!matches)throw fail('E_SCHEMA','Direct Chrome API argument type mismatch');
      return;
    }
    if(Object.hasOwn(rule,'const')&&item!==rule.const||
       Array.isArray(rule.enum)&&!rule.enum.includes(item))
      throw fail('E_SCHEMA','Direct Chrome API argument value mismatch');
    if(rule.type===undefined&&(Array.isArray(rule.enum)||Object.hasOwn(rule,'const')))return;
    switch(rule.type){
      case 'object':{
        fields(item,Object.keys(rule.properties??{}),rule.required??[]);
        if(rule.additionalProperties!==false)
          throw fail('E_CONTRACT','DIRECT schema must reject undeclared fields');
        if(rule.maxProperties!==undefined&&Object.keys(item).length>rule.maxProperties)
          throw fail('E_SCHEMA','Too many direct-call fields');
        for(const [key,part] of Object.entries(item))
          validate(part,rule.properties[key],depth+1);
        return;
      }
      case 'array':
        if(!Array.isArray(item)||rule.maxItems!==undefined&&item.length>rule.maxItems||
           rule.minItems!==undefined&&item.length<rule.minItems)
          throw fail('E_SCHEMA','Invalid direct-call array');
        if(rule.uniqueItems&&new Set(item.map(x=>JSON.stringify(x))).size!==item.length)
          throw fail('E_SCHEMA','Duplicate direct-call array entries');
        for(const part of item)validate(part,rule.items,depth+1);
        return;
      case 'string':
        if(typeof item!=='string'||rule.minLength!==undefined&&item.length<rule.minLength||
           rule.maxLength!==undefined&&item.length>rule.maxLength||
           rule.pattern!==undefined&&!new RegExp(rule.pattern).test(item))
          throw fail('E_SCHEMA','Invalid direct-call string');
        return;
      case 'integer':
      case 'number':
        if(typeof item!=='number'||!Number.isFinite(item)||
           rule.type==='integer'&&!Number.isSafeInteger(item)||
           rule.minimum!==undefined&&item<rule.minimum||
           rule.maximum!==undefined&&item>rule.maximum)
          throw fail('E_SCHEMA','Invalid direct-call number');
        return;
      case 'boolean':
        if(typeof item!=='boolean')throw fail('E_SCHEMA','Invalid direct-call boolean');
        return;
      case 'null':
        if(item!==null)throw fail('E_SCHEMA','Invalid direct-call null');
        return;
      default:throw fail('E_CONTRACT','Unsupported direct-call schema type');
    }
  };
  validate(value,schema);
  return value;
}

export function validateExportArguments(operation,value){
  if(operation==='browser.clipboard.writeText')fields(value,['text'],['text']);
  else if(operation==='browser.downloads.text')fields(value,['text','filename'],['text','filename']);
  else throw fail('E_SERVICE_UNSUPPORTED');
  if(typeof value.text!=='string'||!value.text||
     new TextEncoder().encode(value.text).byteLength>150000)
    throw fail('E_LIMIT','Export text must be 1–150000 UTF-8 bytes');
  if(operation==='browser.downloads.text'){
    if(typeof value.filename!=='string'||value.filename.length>90||
       !/^[^/\\\x00-\x1f:?*"<>|]+\.(?:md|txt|json|csv)$/i.test(value.filename)||value.filename.startsWith('.'))
      throw fail('E_SCHEMA','Expected a safe Markdown, TXT, JSON or CSV filename');
  }
  return value;
}

// Existing Browser SDK text export, not general Blob/URL download authority.
// Revalidate the entire payload after the Host's one-shot user approval.
export function browserTextDownloadUrl(input) {
  validateExportArguments('browser.downloads.text', input);
  const mime=/\.csv$/i.test(input.filename)?'text/csv':
    /\.json$/i.test(input.filename)?'application/json':
    /\.txt$/i.test(input.filename)?'text/plain':'text/markdown';
  return 'data:'+mime+';charset=utf-8,'+encodeURIComponent(input.text);
}
