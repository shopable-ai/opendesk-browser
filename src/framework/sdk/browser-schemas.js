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
const empty=obj(),state=obj({state:str(40)},['state']),ok=obj({ok:bool},['ok']);
const sid=obj({observationId:ref},['observationId']),rid=obj({recordingId:ref},['recordingId']);
const oid=obj({operationId:ref},['operationId']),eid=obj({sessionRef:ref},['sessionRef']);
const title=str(120),text=str(150000);
const menuIds={type:'array',minItems:1,maxItems:3,uniqueItems:true,items:str(40,'^[a-z][a-z0-9-]{0,39}$')};
const resultIds=obj({registered:bool,actionIds:arr(str(40),3)},['registered','actionIds']);
const counter=obj({state:str(40),observedCount:num(),droppedCount:num(),gapCount:num(),expiresAt:num()},
  ['state','observedCount','droppedCount','gapCount','expiresAt']);
const ops=Object.freeze({
 'browser.capabilities.list':[empty,arr(obj({operation:str(120),implementation:str(40)},['operation','implementation']),64)],
 'browser.capabilities.getStatus':[obj({operation:str(120,'^browser\\.[A-Za-z.]+$')},['operation']),
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
   obj({downloadId:num(0,2147483647)},['downloadId'])],
 'browser.tabs.open':[obj({url:http},['url']),obj({tabRef:ref},['tabRef'])],
 'browser.tabs.focus':[obj({tabRef:ref},['tabRef']),obj({focused:bool},['focused'])],
 'browser.sidePanel.openSelf':[empty,obj({opened:bool},['opened'])],
 'browser.network.request':[obj({method:{enum:['GET','POST','PUT','DELETE']},url:http,
   data:{},config:obj({timeout:num(1,60000),responseType:{enum:['json','text']}})},['method','url']),
   obj({status:num(100,599),data:{}},['status'])],
 'browser.network.observe.start':[obj({tabRef:ref,origins:arr(http,8),durationMs:num(1,30000),
   maxEvents:num(1,500),maxBufferedBytes:num(1024,524288)},['tabRef','origins']),
   obj({observationId:ref,expiresAt:num(),status:str(40)},['observationId','expiresAt','status'])],
 'browser.network.observe.getStatus':[sid,counter],
 'browser.network.observe.stop':[sid,obj({state:str(40),stoppedAt:num()},['state','stoppedAt'])],
 'browser.network.observe.export':[obj({observationId:ref,format:{enum:['json']}},['observationId','format']),
   obj({resourceRef:ref,bytes:num(0,524288),truncated:bool},['resourceRef','bytes','truncated'])],
 'browser.events.read':[obj({sessionRef:ref,cursor:str(160),limit:num(1,100)},['sessionRef']),
   obj({events:arr(obj(),100),nextCursor:nullableString,droppedCount:num(),gapCount:num()},
   ['events','droppedCount','gapCount'])],
 'browser.events.close':[eid,obj({closed:bool},['closed'])],
 'browser.screenshot.captureVisible':[obj({tabRef:ref},['tabRef']),
   obj({resourceRef:ref,bytes:num(0,16777216)},['resourceRef','bytes'])],
 'browser.media.recording.prepare':[obj({source:{enum:['tab','window','desktop']},durationMs:num(1,300000)},['source']),
   obj({recordingId:ref,state:str(40)},['recordingId','state'])],
 'browser.media.recording.getStatus':[rid,state],
 'browser.media.recording.stop':[rid,state],
 'browser.media.recording.discard':[rid,ok],
 'browser.speech.transcribe':[obj({audioRef:ref},['audioRef']),obj({text:str(8192)},['text'])],
 'browser.speech.speak':[obj({text:str(8192),voiceRef:ref},['text']),obj({sessionRef:ref},['sessionRef'])],
 'browser.speech.stop':[eid,ok],
 'browser.notifications.create':[obj({title,message:str(500)},['title','message']),obj({notificationRef:ref},['notificationRef'])],
 'browser.notifications.clear':[obj({notificationRef:ref},['notificationRef']),ok],
 'browser.operations.getStatus':[oid,obj({state:{enum:['running','completed','failed','cancelled','unknown']}},['state'])],
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
       !/^[^/\\\x00-\x1f:?*"<>|]+\.md$/i.test(value.filename)||value.filename.startsWith('.'))
      throw fail('E_SCHEMA','Expected a safe Markdown filename');
  }
  return value;
}
