// Fictional transport only. Policy and parsing belong to the real app/ Controller and Domain.
import {key,sameNativeSlot} from '../../../app/domain/cookie-model.js';
export const demoSite='shop.example.com';
const partitionKey={topLevelSite:'https://partner.example.net',hasCrossSiteAncestor:false};
export function fictionalCookies(){
 const b={domain:demoSite,path:'/',hostOnly:true,storeId:'0',session:true,secure:true,httpOnly:false,sameSite:'lax',valueRedacted:false};
 return [
  {...b,name:'session_id',value:'sess_demo_only_C18',httpOnly:true},
  {...b,name:'theme',value:'light',secure:false,session:false,expirationDate:1839061800},
  {...b,name:'locale',value:'zh-CN',secure:false,session:false,expirationDate:1835865000},
  {...b,name:'cart_count',value:'3',path:'/shop',sameSite:'strict'},
  {...b,name:'analytics_consent',value:'accepted',domain:'.example.com',hostOnly:false,sameSite:'no_restriction'},
  {...b,name:'__Host-auth',value:'secret_preview_never_real',httpOnly:true,sameSite:'strict'},
  {...b,name:'实验_超长Cookie名称_用于测试在窄屏下的安全折行与原位编辑',value:'演示数据',path:'/用户/long-path/nested'},
  {...b,name:'embedded_pref',value:'enabled',sameSite:'no_restriction',partitionKey}
 ];
}
const clone=value=>structuredClone(value);
const error=code=>Object.assign(Error(code),{code});
export function createMockSdk({scenario='ready',onFailureConsumed=()=>{}}={}){
 let rows=scenario==='empty'?[]:fictionalCookies(),failure='',clearPlan=null,releaseLoading;
 const loading=scenario==='loading'?new Promise(resolve=>{releaseLoading=resolve;}):null;
 const calls=[],deliveries=[],observations=new Set();
 const fail=operation=>{
  if(scenario==='readonly'&&['save','import','clear','remove'].includes(operation))throw error('E_PERMISSION_REQUIRED');
  if(scenario==='valuesDenied'&&operation==='values')throw error('E_COOKIE_VALUES');
  const persistent={saveError:'save',copyError:'copy',downloadError:'download'}[scenario];
  const unknown=(failure==='unknown'||scenario==='unknown')&&['save','import','clear','remove'].includes(operation);
  if(failure===operation||failure==='import'&&operation==='save'||persistent===operation||unknown){
   failure='';onFailureConsumed();
   throw error(unknown?'E_OUTCOME_UNKNOWN':({save:'E_COOKIE_SET',import:'E_COOKIE_IMPORT',copy:'E_CLIPBOARD',download:'E_DOWNLOAD',clear:'E_COOKIE_CLEAR',remove:'E_COOKIE_REMOVE'}[operation]));
  }
 };
 const samePartition=(a,b)=>JSON.stringify(a||null)===JSON.stringify(b||null);
 const matches=(row,args)=>{
  const host=new URL(args.url).hostname,domain=row.domain.replace(/^\./,'');
  return (host===domain||!row.hostOnly&&host.endsWith('.'+domain))&&
   (args.name===undefined||row.name===args.name)&&(args.storeId===undefined||row.storeId===args.storeId)&&samePartition(row.partitionKey,args.partitionKey);
 };
 const record=(op,args)=>{calls.push({op,args:clone(args)});};
 const write=(args,operation='save')=>{
  record('set',args);fail(operation);
  const host=new URL(args.url).hostname;
  const row={...args,domain:args.domain||host,hostOnly:!args.domain,session:args.expirationDate===undefined,storeId:args.storeId||'0',valueRedacted:false};
  delete row.url;delete row.ifAbsent;
  // Chrome replaces a native slot even when its hostOnly flag changes.
  if(args.ifAbsent&&rows.some(old=>sameNativeSlot(old,row)))throw error('E_COOKIE_CONFLICT');
  rows=rows.filter(old=>!sameNativeSlot(old,row));rows.push(row);return {saved:true,verified:true};
 };
 const cookies={
  getAll:async args=>{
   record('getAll',args);if(loading)await loading;if(args.includeValues)fail('values');
   return rows.filter(row=>matches(row,args)).map(row=>{
    if(args.includeValues)return clone(row);
    const {value,...metadata}=row;return {...clone(metadata),valueRedacted:true};
   });
  },
  getPartitionKey:async()=>({partitionKey:clone(partitionKey)}),
  getCurrentStore:async()=>({storeId:'0'}),
  get:async args=>{
   record('get',args);fail('values');
   const found=rows.find(row=>row.name===args.name&&row.domain===args.domain&&row.path===args.path&&matches(row,args));
   return {cookie:found?{...clone(found),valueRedacted:false}:null};
  },
  set:async args=>write(args),
  setMany:async args=>{
   record('setMany',args);fail('import');
   return {results:args.cookies.map((item,index)=>({index,...write({...item,url:item.url||args.url},'import')}))};
  },
  remove:async args=>{
   record('remove',args);fail('remove');
   rows=rows.filter(row=>!(row.name===args.name&&row.domain===args.domain&&row.path===args.path&&matches(row,args)));
   return {removed:true,verified:true};
  },
  clearSite:async args=>{
   record('clearSite',args);const host=new URL(args.url).hostname;
   const eligible=rows.filter(row=>row.domain===host&&row.hostOnly&&row.storeId==='0'&&!row.partitionKey).slice(0,50);
   if(args.preview){clearPlan={ref:'12345678-1234-1234-1234-123456789abc',url:args.url,ids:eligible.map(key)};return {matched:eligible.length,previewRef:clearPlan.ref};}
   fail('clear');
   if(!clearPlan||args.previewRef!==clearPlan.ref||args.url!==clearPlan.url||args.expectedCount!==eligible.length||JSON.stringify(eligible.map(key))!==JSON.stringify(clearPlan.ids))throw error('E_COOKIE_CONFLICT');
   rows=rows.filter(row=>!clearPlan.ids.includes(key(row)));clearPlan=null;
   return {preview:false,scope:'EXACT_HOST_HOST_ONLY',matched:eligible.length,removed:eligible.length,remaining:0};
  },
  observe:{start:async()=>{observations.add('preview-observation');return {sessionRef:'preview-observation'};},read:async()=>({events:[],nextCursor:'0'}),stop:async({sessionRef})=>{observations.delete(sessionRef);return {stopped:true};}}
 };
 return {
  browser:{cookies,capabilities:{getStatus:async()=>({callableNow:scenario!=='first',reasonCode:'E_SITE_GRANT_REQUIRED'})},
   clipboard:{writeText:async text=>{record('copy',{});fail('copy');deliveries.push({method:'copy',text});return {copied:true};}},
   downloads:{text:async args=>{
    record('download',{});fail('download');deliveries.push({method:'download',...args});
    if(typeof document!=='undefined'){
     const url=URL.createObjectURL(new Blob([args.text],{type:'text/plain'}));
     const link=document.createElement('a');link.href=url;link.download=args.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    return {downloadId:1};
   }}},
  request:async operation=>{if(operation!=='currentPage.info')throw error('E_PERMISSION');return {status:'available',url:'https://'+demoSite+'/'};},
  setFailure:value=>{failure=value;},dispose:()=>{releaseLoading?.();observations.clear();},
  inspect:()=>({rows:clone(rows),calls:clone(calls),deliveries:clone(deliveries),observations:[...observations]})
 };
}
