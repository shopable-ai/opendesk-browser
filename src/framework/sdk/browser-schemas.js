// Browser operation parameter/response descriptions, keyed by the one authoritative
// BROWSER_OPERATIONS registry. Metadata never grants permission or admits RPC calls.
import {fields,fail} from './registry.js';
const obj=(properties={},required=[])=>({type:'object',additionalProperties:false,properties,required});
const str=(maxLength=2048,pattern)=>({type:'string',maxLength,...(pattern?{pattern}:{})});
const ref=str(160,'^[A-Za-z0-9_-]{16,160}$');
const http=str(2048,'^https?://');
const num=(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const arr=(items,maxItems=100)=>({type:'array',items,maxItems});
const bool={type:'boolean'},nullableString={anyOf:[str(160),{type:'null'}]};
const empty=obj();
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
const cookieEvent=obj({seq:num(1),name:str(256),domain:str(253),path:str(512),
  removed:bool,cause:str(40),at:num()},['seq','name','domain','path','removed','cause','at']);
const ops=Object.freeze({
 'browser.capabilities.list':[empty,arr(obj({operation:str(120),implementation:str(40)},['operation','implementation']),64)],
 'browser.capabilities.getStatus':[obj({operation:str(120,'^browser\\.[A-Za-z.]+$'),url:http},['operation']),
   obj({operation:str(120),callableNow:bool,reasonCode:nullableString},['operation','callableNow'])],
 'browser.contextMenu.getStatus':[empty,obj({enabled:bool,approvedOrigins:arr(http,30),
   activeActions:arr(str(40),3),browserPermission:bool},['enabled','approvedOrigins','activeActions','browserPermission'])],
 'browser.contextMenu.register':[obj({actionIds:menuIds},['actionIds']),resultIds],
 'browser.contextMenu.unregister':[empty,resultIds],
 'browser.launch.consume':[empty,obj({ticketId:str(36),toolId:str(40),actionId:str(40),
   selection:str(16384),linkUrl:{anyOf:[http,{type:'null'}]},source:obj(),expiresAt:num()},
   ['ticketId','toolId','actionId','selection','source','expiresAt'])],
 'browser.page.getContext':[empty,obj({status:{enum:['available','unavailable']},
   title:str(512),url:str(4096),message:str(250)},['status'])],
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
 'browser.tabs.create':[obj({url:http},['url']),obj({tabRef:ref},['tabRef'])],
 'browser.tabs.activateOwned':[obj({tabRef:ref},['tabRef']),obj({focused:bool},['focused'])],
 'browser.tabs.getOwned':[obj({tabRef:ref},['tabRef']),
   obj({tabRef:ref,url:http,origin:http,expiresAt:num()},['tabRef','url','origin','expiresAt'])],
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
   obj({resourceRef:ref,downloadId:num(0,2147483647),bytes:num(0,524288),truncated:bool},['resourceRef','downloadId','bytes','truncated'])],
 'browser.events.read':[obj({sessionRef:ref,cursor:str(160),limit:num(1,100)},['sessionRef']),
   obj({events:arr(obj({seq:num(1),kind:{enum:['request','completed','failed']},
     timestamp:num(),origin:http,method:str(16),resourceType:str(24),
     statusCode:num(100,599),error:str(60)},['seq','kind','timestamp','origin','method','resourceType']),100),
     nextCursor:nullableString,droppedCount:num(),gapCount:num()},
   ['events','droppedCount','gapCount'])],
 'browser.events.close':[eid,obj({closed:bool},['closed'])],
 'browser.screenshot.captureVisible':[obj({tabRef:ref},['tabRef']),
   obj({resourceRef:ref,downloadId:num(0,2147483647),bytes:num(1,8388608),width:num(1,4096),height:num(1,4096)},['resourceRef','downloadId','bytes','width','height'])],
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
export function operationSchemas(operation){
  const pair=Object.hasOwn(ops,operation)?ops[operation]:null;
  return pair?{input:pair[0],output:pair[1]}:null;
}
export function assertBrowserSchemaCoverage(operations){
  if(JSON.stringify(Object.keys(operations).sort())!==JSON.stringify(Object.keys(ops).sort()))
    throw fail('E_CONTRACT','Browser operation schema drift');
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
       !/^[^/\\\x00-\x1f:?*"<>|]+\.(?:md|txt|json)$/i.test(value.filename)||value.filename.startsWith('.'))
      throw fail('E_SCHEMA','Expected a safe Markdown, TXT or JSON filename');
  }
  return value;
}
