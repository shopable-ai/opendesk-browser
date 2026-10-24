import {parseTarget,redactMetadata,key,sameCookieMetadata,readAllCookies,scopedLiveCookies,nativeInput} from '../domain/cookie-model.js';

// This adapter is the ONLY Cookie transport used by the independent React
// candidate. Host permission checks and native receipts remain authoritative.
const safeCodes=new Set([
  'E_CANCELLED','E_COOKIE_CONFLICT','E_OUTCOME_UNKNOWN','E_PERMISSION_REQUIRED',
  'E_GRANT_REVOKED','E_SITE_GRANT_REQUIRED','E_SITE_PERMISSION_REVOKED','E_SESSION_EXPIRED','E_COOKIE_VALUES',
  'E_COOKIE_VALUES_REQUIRED',
  'E_COOKIE_READ','E_COOKIE_SET','E_COOKIE_REMOVE','E_COOKIE_CLEAR',
  'E_COOKIE_OBSERVE','E_COOKIE_IMPORT','E_COOKIE_EXPORT','E_CLIPBOARD',
  'E_DOWNLOAD','E_COOKIE_WRITE','E_SCHEMA','E_PERMISSION','E_COOKIE_SCOPE',
  'E_COOKIE_STORE','E_COOKIE_PARTITION','E_CHROME',
  'E_CHROME_UNSUPPORTED','E_CHROME_PERMISSION_REQUIRED','E_LIMIT',
  'E_TOOL_CHANGED','E_TOOL_DISABLED','E_OWNER','E_CONTEXT','E_DOCUMENT_CHANGED',
  'E_HOST_CLOSED','E_COOKIE_SDK_NOT_READY','E_TOOL_RUNTIME_UNAVAILABLE',
  'E_USER_GESTURE_REQUIRED'
]);
export const safeCode=(error,fallback='E_COOKIE_READ')=>
  safeCodes.has(error?.code)?error.code:fallback;

function exactRoute(target,row){
  const domain=row?.domain?.replace(/^\./,'').toLowerCase();
  if(!target||!(domain===target.hostname||
    (row.hostOnly===false&&target.hostname.endsWith('.'+domain))))
    throw Error('Cookie 不属于当前已授权网站');
  const url=new URL(target.origin);
  url.pathname=row.path;
  if(url.pathname!==row.path)
    throw Error('Cookie Path 无法无损映射为 Chrome URL');
  return url.href;
}
const identityScope=(row)=>({
  ...(row.storeId?{storeId:row.storeId}:{}),
  ...(row.partitionKey?{partitionKey:row.partitionKey}:{})
});

export function createCookieSdkAdapter({getBrowser,request}){
  if(typeof getBrowser!=='function'||typeof request!=='function')
    throw Error('E_COOKIE_SDK_NOT_READY');
  const browser=()=>{
    const value=getBrowser();
    if(!value?.cookies?.getAll||!value?.cookies?.getPartitionKey||
      !value?.capabilities?.getStatus)
      throw Object.assign(Error('E_COOKIE_SDK_NOT_READY'),{code:'E_COOKIE_SDK_NOT_READY'});
    return value;
  };
  let lastPageReason='E_NO_ACTIVE_TAB';
  async function targetFor(input=''){
    if(input){lastPageReason=null;return parseTarget(input);}
    const page=await request('currentPage.info');
    if(page?.status!=='available'||typeof page.url!=='string'){
      lastPageReason=typeof page?.reasonCode==='string'?page.reasonCode:'E_NO_ACTIVE_TAB';
      return null;
    }
    try{
      const target=parseTarget(page.url);
      lastPageReason=null;
      return target;
    }catch{
      // Restricted/invalid tab URLs are not granted a substitute Origin.
      lastPageReason='E_UNSUPPORTED_SCHEME';
      return null;
    }
  }
  async function checkRead(target){
    const status=await browser().capabilities.getStatus({
      operation:'browser.cookies.getAll',url:target.url
    });
    return {callableNow:status?.callableNow===true,
      reasonCode:safeCode({code:status?.reasonCode},'E_PERMISSION_REQUIRED')};
  }
  async function list(target,{includeValues=false,isCurrent=()=>true}={}){
    const result=await scopedLiveCookies(browser(),target,{includeValues,isCurrent});
    if(result===null)return null;
    // Metadata must be stripped before leaving this adapter, even if the
    // native host accidentally returned a value without a values grant.
    return includeValues?result:redactMetadata(result);
  }
  async function exactList(target,row,isCurrent=()=>true){
    const result=await readAllCookies(browser(),{
      url:exactRoute(target,row),...identityScope(row)
    },isCurrent);
    return result===null?null:redactMetadata(result);
  }
  async function readValue(target,row){
    const receipt=await browser().cookies.get({
      url:exactRoute(target,row),name:row.name,
      domain:row.domain,path:row.path,...identityScope(row),
      includeValues:true
    });
    const cookie=receipt?.cookie;
    if(!cookie)
      throw Object.assign(Error('E_COOKIE_CONFLICT'),{code:'E_COOKIE_CONFLICT'});
    if((cookie.storeId??null)!==(row.storeId??null))
      throw Object.assign(Error('E_COOKIE_STORE'),{code:'E_COOKIE_STORE'});
    if((cookie.partitionKey?.topLevelSite??null)!==(row.partitionKey?.topLevelSite??null)||
       Boolean(cookie.partitionKey?.hasCrossSiteAncestor)!==Boolean(row.partitionKey?.hasCrossSiteAncestor))
      throw Object.assign(Error('E_COOKIE_PARTITION'),{code:'E_COOKIE_PARTITION'});
    if(key(cookie)!==key(row)||!sameCookieMetadata(redactMetadata([cookie])[0],row))
      throw Object.assign(Error('E_COOKIE_CONFLICT'),{code:'E_COOKIE_CONFLICT'});
    if(cookie.valueRedacted!==false||typeof cookie.value!=='string')
      throw Object.assign(Error('E_COOKIE_VALUES'),{code:'E_COOKIE_VALUES'});
    return cookie.value;
  }
  return {
    targetFor,getTargetReason:()=>lastPageReason,checkRead,list,exactList,readValue,
    beginExportIntent:(target,method)=>request('cookieEditor.export.begin',{url:target.url,method}),
    finishExportIntent:ref=>request('cookieEditor.export.finish',{ref}),
    beginImportIntent:target=>request('cookieEditor.import.begin',{url:target.url}),
    finishImportIntent:ref=>request('cookieEditor.import.finish',{ref}),
    beginWriteIntent:(target,row,{renameFrom=null}={})=>request('cookieEditor.write.begin',{
       url:target.url,name:row.name,path:row.path||'/',
       ...(renameFrom?{renameFrom}:{})
     }),
     beginRemoveIntent:(target,row)=>request('cookieEditor.write.begin',{
       url:target.url,name:row.name,path:row.path||'/',action:'remove'
     }),
    finishWriteIntent:ref=>request('cookieEditor.write.finish',{ref}),
    getStore:target=>browser().cookies.getCurrentStore({url:target.url}),
    getPartition:target=>browser().cookies.getPartitionKey({url:target.url}),
    write:(target,row,{ifAbsent=false}={})=>
      browser().cookies.set({...nativeInput(row,target),...(ifAbsent?{ifAbsent:true}:{})}),
    writeMany:(target,cookies)=>browser().cookies.setMany({url:target.url,cookies}),
    supportsWriteMany:()=>typeof browser().cookies.setMany==='function',
    remove:(target,row)=>browser().cookies.remove({
      url:target.url,name:row.name,domain:row.domain,path:row.path,
      ...identityScope(row)
    }),
    beginClearIntent:(target,previewRef,expectedCount)=>request('cookieEditor.clear.begin',{
      url:target.url,previewRef,expectedCount
    }),
    finishClearIntent:ref=>request('cookieEditor.clear.finish',{ref}),
    clearPreview:(target)=>browser().cookies.clearSite({
      url:target.url,preview:true,maxCookies:50
    }),
    clearExecute:(target,previewRef,expectedCount)=>browser().cookies.clearSite({
      url:target.url,previewRef,expectedCount,maxCookies:50
    }),
    copy:text=>browser().clipboard.writeText(text),
    download:(text,filename)=>browser().downloads.text({text,filename})
  };
}
