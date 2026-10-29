// Browser Fingerprint R2.1 — R2.0-approved choices, not native Chrome claims.
export const ORIGINAL_CONFIG=Object.freeze({ua:'native',lang:'system',tz:'system',geo:'off',viewport:'native'});
export const BUILTIN_PRESETS=Object.freeze({
  original:{name:'原始浏览器环境',config:ORIGINAL_CONFIG},
  us:{name:'美国 · 桌面 Chrome',config:{ua:'windows',lang:'en-US',tz:'America/New_York',geo:'nyc',viewport:'desktop'}},
  de:{name:'德国 · 桌面 Chrome',config:{ua:'mac',lang:'de-DE',tz:'Europe/Berlin',geo:'berlin',viewport:'desktop'}},
  jp:{name:'日本 · 桌面 Chrome',config:{ua:'mac',lang:'ja-JP',tz:'Asia/Tokyo',geo:'tokyo',viewport:'mobile'}}
});
export const CONFIG_FIELDS=Object.freeze({
  ua:{label:'浏览器标识 / 系统平台',note:'User-Agent 与 UA Client Hints 必须分别核验',
    values:[['native','保持 Chrome 原始值'],['windows','Chrome · Windows'],['mac','Chrome · macOS'],['linux','Chrome · Linux']]},
  lang:{label:'网页语言',note:'网页 JS 与 HTTP Accept-Language 需要分别核验',
    values:[['system','保持原始语言'],['zh-CN','简体中文 · zh-CN'],['en-US','English · en-US'],['de-DE','Deutsch · de-DE'],['ja-JP','日本語 · ja-JP']]},
  tz:{label:'时区',note:'仅影响受控网页，不改变公网 IP',
    values:[['system','保持原始时区'],['Asia/Shanghai','Asia/Shanghai'],['America/New_York','America/New_York'],['Europe/Berlin','Europe/Berlin'],['Asia/Tokyo','Asia/Tokyo']]},
  geo:{label:'地理位置',note:'网站定位许可与环境配置是两项独立授权',
    values:[['off','保持原值 / 不模拟'],['nyc','美国 · 纽约'],['berlin','德国 · 柏林'],['tokyo','日本 · 东京']]},
  viewport:{label:'网页视口',note:'视口模拟不会改变物理屏幕',
    values:[['native','保持浏览器原始视口'],['desktop','1366 × 768 · 桌面'],['mobile','390 × 844 · 移动']]}
});
const hasOwn=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
export const copyConfig=config=>Object.fromEntries(Object.keys(CONFIG_FIELDS).map(k=>[k,config[k]]));
export function validConfig(config){
  return plain(config)&&Object.keys(config).length===Object.keys(CONFIG_FIELDS).length&&
    Object.entries(CONFIG_FIELDS).every(([key,field])=>hasOwn(config,key)&&
      field.values.some(([value])=>value===config[key]));
}
export const displayChoice=(key,value)=>CONFIG_FIELDS[key]?.values.find(([v])=>v===value)?.[1]||String(value??'—');
export const baselineRows=Object.freeze([
  {key:'ua',label:'User-Agent',configKey:'ua',source:'page-runtime'},
  {key:'uaCH',label:'UA Client Hints',configKey:'ua',source:'page-runtime'},
  {key:'language',label:'网页语言',configKey:'lang',source:'page-runtime'},
  {key:'acceptLanguage',label:'HTTP Accept-Language',configKey:'lang',source:'network'},
  {key:'timezone',label:'时区 · Intl',configKey:'tz',source:'page-runtime'},
  {key:'geolocation',label:'地理位置',configKey:'geo',source:'page-runtime'},
  {key:'viewport',label:'Viewport',configKey:'viewport',source:'page-runtime'},
  {key:'publicIp',label:'公网 IP / Proxy',configKey:null,source:'network'}
]);
export function emptyVerification(config){
  if(!validConfig(config))throw Object.assign(Error('配置无效'),{code:'E_CONFIG'});
  return baselineRows.map(field=>Object.freeze({
    key:field.key,label:field.label,
    expected:field.configKey?displayChoice(field.configKey,config[field.configKey]):'本工具不修改',
    observed:null,source:null,status:'unverifiable',reason:'NO_INDEPENDENT_READBACK'
  }));
}
// The application cannot self-certify a match. A reviewed Host must return a
// bounded session/document-bound observation for each independently checked field.
export function checkedVerification(config,receipt,{sessionRef,documentRef}){
  const empty=emptyVerification(config);
  if(receipt?.source!=='trusted-browser-host'||receipt?.preview===true||
     receipt?.sessionRef!==sessionRef||receipt?.documentRef!==documentRef||
     !Array.isArray(receipt.rows)||receipt.rows.length>baselineRows.length)
    throw Object.assign(Error('可信网页读回身份或来源无效'),{code:'E_UNVERIFIED_READBACK'});
  const sourceKeys=new Set(),allowed=new Map(baselineRows.map(x=>[x.key,x]));
  for(const row of receipt.rows){
    if(!row||!allowed.has(row.key)||sourceKeys.has(row.key)||
       !['match','mismatch','unverifiable','unauthorized'].includes(row.status)||
       row.source!==allowed.get(row.key).source||
       (row.status==='match'||row.status==='mismatch')&&
         (row.verified!==true||typeof row.observed!=='string'||!row.observed.trim()||
          row.observed.length>512))
      throw Object.assign(Error('Host 读回字段无效'),{code:'E_UNVERIFIED_READBACK'});
    sourceKeys.add(row.key);
  }
  const byKey=new Map(receipt.rows.map(x=>[x.key,x]));
  return empty.map(x=>{
    const row=byKey.get(x.key);
    return Object.freeze(row?{...x,
      observed:typeof row.observed==='string'?row.observed.slice(0,512):null,
      source:row.source,status:row.status,
      reason:typeof row.reason==='string'?row.reason.slice(0,100):null}:x);
  });
}
export function classifyVerification(rows){
  const verified=rows.filter(x=>x.status==='match'||x.status==='mismatch');
  if(verified.some(x=>x.status==='mismatch'))return 'partial';
  return verified.length>0?'verified_limited':'partial';
}
