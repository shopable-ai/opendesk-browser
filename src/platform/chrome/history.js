import {isToolSender,resolveToolSender} from '../../environment.js';

const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const MAX_TEXT_BYTES=256,MAX_URL=2048,MAX_TITLE=256;

function bytes(value){return new TextEncoder().encode(value).byteLength;}

function safeHttpUrl(value){
  if(typeof value!=='string'||value.length<1||value.length>MAX_URL)return null;
  try{
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    return url.href.length<=MAX_URL?url.href:null;
  }catch{return null}
}

function normalizeQuery(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('E_SCHEMA','History query must be an object');
  const keys=Object.keys(input).sort().join(',');
  if(!['endTime,limit,startTime,text','endTime,startTime,text'].includes(keys))
    throw fail('E_SCHEMA','Unsupported history search fields');
  if(typeof input.text!=='string'||!input.text.trim()||input.text!==input.text.trim()||
     bytes(input.text)>MAX_TEXT_BYTES)
    throw fail('E_SCHEMA','History search text must be a non-empty bounded string');
  const query={text:input.text};
  if(input.startTime!==undefined){
    if(!Number.isSafeInteger(input.startTime)||input.startTime<0)throw fail('E_SCHEMA','Invalid history startTime');
    query.startTime=input.startTime;
  }
  if(input.endTime!==undefined){
    if(!Number.isSafeInteger(input.endTime)||input.endTime<0)throw fail('E_SCHEMA','Invalid history endTime');
    query.endTime=input.endTime;
  }
  if(query.endTime<query.startTime||query.endTime-query.startTime>31*24*60*60*1000-1)
    throw fail('E_SCHEMA','History requires an explicit date range of at most 31 days');
  query.maxResults=input.limit??25;
  if(!Number.isSafeInteger(query.maxResults)||query.maxResults<1||query.maxResults>100)
    throw fail('E_SCHEMA','History limit must be 1..100');
  return query;
}

async function requireTrustedSidePanel({api,sender,hostInstanceId}){
  const trusted=await resolveToolSender(api,sender);
  if(!isToolSender(api,trusted)||trusted.id!==api.runtime.id||trusted.tab?.incognito||
     (trusted.frameId!==undefined&&trusted.frameId!==0))
    throw fail('E_OWNER','Only the trusted OpenDesk Side Panel may search history');
  const expected=new URL(api.runtime.getURL('ui/tool.html'));
  let actual;
  try{actual=new URL(trusted.url)}catch{throw fail('E_OWNER','Invalid Side Panel sender URL')}
  if(actual.protocol!==expected.protocol||actual.host!==expected.host||actual.pathname!==expected.pathname||
     (hostInstanceId!==undefined&&actual.searchParams.get('hostInstanceId')!==hostInstanceId))
    throw fail('E_OWNER','History search is not bound to the trusted host document');
  if(typeof api.runtime.getContexts!=='function')throw fail('E_SERVICE_UNSUPPORTED','Trusted Side Panel context proof unavailable');
  {
    const contexts=await api.runtime.getContexts({
      contextTypes:['SIDE_PANEL'],documentUrls:[trusted.url],documentIds:[trusted.documentId]
    });
    if(!Array.isArray(contexts)||contexts.filter(context=>
      context.contextType==='SIDE_PANEL'&&context.documentUrl===trusted.url&&
      context.documentId===trusted.documentId&&context.frameId===0&&!context.incognito).length!==1)
      throw fail('E_DOCUMENT_CHANGED','Trusted Side Panel document is no longer current');
  }
  return trusted;
}

async function requireHistoryPermission(api){
  if(typeof api?.permissions?.contains!=='function')
    throw fail('E_SERVICE_UNSUPPORTED','Chrome permissions API unavailable');
  if(await api.permissions.contains({permissions:['history']})!==true)
    throw fail('E_CHROME_PERMISSION_REQUIRED','Chrome history permission is not granted');
}

function minimizeVisit(row){
  const url=safeHttpUrl(row?.url);
  if(!url||!Number.isFinite(row?.lastVisitTime)||row.lastVisitTime<0)return null;
  const title=typeof row.title==='string'?row.title.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,MAX_TITLE):'';
  return {url,...(title?{title}:{}),lastVisitTime:Math.trunc(row.lastVisitTime)};
}

export function createBrowserHistoryHost({api=globalThis.chrome}={}){
  async function searchTrusted(input,{sender,hostInstanceId}={}){
    const query=normalizeQuery(input);
    if(typeof api?.history?.search!=='function')
      throw fail('E_SERVICE_UNSUPPORTED','Chrome history.search unavailable');
    const trusted=await requireTrustedSidePanel({api,sender,hostInstanceId});
    await requireHistoryPermission(api);
    let rows;
    try{rows=await api.history.search(query)}
    catch(error){throw fail(error?.code||'E_CHROME','Chrome history search failed')}
    await requireTrustedSidePanel({api,sender:trusted,hostInstanceId});
    await requireHistoryPermission(api);
    if(!Array.isArray(rows))throw fail('E_OUTCOME_UNKNOWN','Chrome history returned an invalid result');
    const visits=rows.map(minimizeVisit).filter(row=>row&&row.lastVisitTime>=query.startTime&&
      row.lastVisitTime<=query.endTime).slice(0,query.maxResults);
    return {visits};
  }
  return Object.freeze({searchTrusted});
}

export {normalizeQuery as normalizeTrustedHistoryQuery};
