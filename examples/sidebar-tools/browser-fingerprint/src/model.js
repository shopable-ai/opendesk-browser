// R1.5 A-only: no guessed/privileged fingerprint values.
export const SNAPSHOT_SCHEMA='opendesk.browser-fingerprint.snapshot.a.v1';
export const HISTORY_SCHEMA='opendesk.browser-fingerprint.history.a.v1';
export const HISTORY_KEY='fingerprint.a.history.v1';
export const HISTORY_LIMIT=5;
export const HISTORY_ITEM_BYTES=7900;
export const FIELD_DEFINITIONS=Object.freeze([
  ['origin','网页来源','page'],['host','网站主机','page'],['title','网页标题','page'],
  ['userAgent','网页 User-Agent','environment'],
  ['languages','网页语言列表','environment'],
  ['timeZone','网页时区','environment'],
  ['viewport','网页视口尺寸','environment'],
  ['screen','网页屏幕尺寸','environment'],
  ['devicePixelRatio','网页设备像素比','environment'],
  ['uaClientHints','UA-CH 高熵字段','environment'],
  ['acceptLanguage','HTTP Accept-Language','environment'],
  ['ip','出口 IP','environment'],
  ['geolocation','地理位置','environment']
].map(([key,label,kind])=>Object.freeze({key,label,kind})));
const fail=(code,message)=>Object.assign(new Error(message),{code});
export function safeContext(raw){
  if(raw?.status!=='available')throw fail('E_NO_TARGET',
    String(raw?.message||'当前没有可检查的普通网页').slice(0,180));
  let url;
  try{url=new URL(raw.url);}catch{throw fail('E_CONTEXT_INVALID','可信网页 URL 缺失或无效');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)
    throw fail('E_UNSUPPORTED_URL','仅支持普通 HTTP(S) 网页');
  return {origin:url.origin,host:url.hostname,
    title:typeof raw.title==='string'?raw.title.slice(0,160):'',
    // Opaque refs and full URLs are volatile and never leave RAM in a report.
    volatile:{url:raw.url,tabRef:typeof raw.tabRef==='string'?raw.tabRef:null,
      documentRef:typeof raw.documentRef==='string'?raw.documentRef:null}};
}
export function makeReading(raw,{id,at,preview=false}){
  if(typeof id!=='string'||!id||id.length>90||
     typeof at!=='string'||!Number.isFinite(Date.parse(at)))throw Error('E_READING_ID_OR_TIME');
  const p=safeContext(raw);
  const fields=FIELD_DEFINITIONS.map(def=>{
    if(def.kind==='environment')return {key:def.key,status:'not_exposed',value:null,
      source:'page-js',reason:'E_SDK'};
    const value=def.key==='origin'?p.origin:def.key==='host'?p.host:p.title;
    return {key:def.key,status:value?'available':'unavailable',value:value||null,
      source:'host',reason:value?null:'EMPTY_PAGE_TITLE'};
  });
  return {schema:SNAPSHOT_SCHEMA,id,capturedAt:at,mode:preview?'PREVIEW':'LIVE',
    completeness:'partial',target:{origin:p.origin,host:p.host,
      identityLevel:p.volatile.documentRef?'document-ref-observed':'url-only'},
    fields,volatile:p.volatile};
}
export function sameRuntimeTarget(reading,raw){
  if(!reading?.volatile?.documentRef)return false;
  try{
    const now=safeContext(raw),before=reading.volatile;
    return !!now.volatile.documentRef&&now.volatile.documentRef===before.documentRef&&
      now.volatile.url===before.url&&
      (!before.tabRef||now.volatile.tabRef===before.tabRef)&&now.origin===reading.target.origin;
  }catch{return false;}
}
export function assertSnapshot(s){
  if(!s||s.schema!==SNAPSHOT_SCHEMA||typeof s.id!=='string'||!s.id||s.id.length>90||
    !Number.isFinite(Date.parse(s.capturedAt))||!['LIVE','PREVIEW'].includes(s.mode)||
    s.completeness!=='partial'||typeof s.target?.origin!=='string'||
    typeof s.target?.host!=='string'||!['url-only','document-ref-observed'].includes(s.target.identityLevel)||
    Object.hasOwn(s,'volatile')||!Array.isArray(s.fields)||s.fields.length!==FIELD_DEFINITIONS.length)
    throw fail('E_HISTORY_SCHEMA','快照格式不符，拒绝覆盖历史');
  s.fields.forEach((field,index)=>{
    const def=FIELD_DEFINITIONS[index];
    if(field?.key!==def.key||typeof field.source!=='string'||
      !['available','not_exposed','unavailable'].includes(field.status)||
      (field.status!=='available'&&field.value!==null)||
      (def.kind==='environment'&&field.status==='available'))
      throw fail('E_HISTORY_SCHEMA','存在非法或未经授权的环境值');
  });
  return s;
}
export function snapshotFromReading(reading){
  const {volatile,...rest}=reading||{};
  const s=JSON.parse(JSON.stringify(rest));return assertSnapshot(s);
}
export function compareSnapshots(a,b){
  assertSnapshot(a);assertSnapshot(b);
  return FIELD_DEFINITIONS.map((def,i)=>{
    const left=a.fields[i],right=b.fields[i];
    const state=left.status!=='available'||right.status!=='available'?'unverifiable':
      left.source!==right.source?'source-different':
      JSON.stringify(left.value)!==JSON.stringify(right.value)?'changed':'same';
    return {...def,state,left,right};
  });
}
export function reportJson(a,b=null,at){
  assertSnapshot(a);if(b)assertSnapshot(b);
  return JSON.stringify({
    format:'opendesk.browser-fingerprint.report.a.v1',generatedAt:at,
    caveat:'PARTIAL: 此报告没有目标网页 JS 指纹字段，只含 Host 页面上下文；不证明 UA/IP/语言/时区一致。',
    snapshots:b?[a,b]:[a],comparison:b?compareSnapshots(a,b):null
  },null,2);
}
