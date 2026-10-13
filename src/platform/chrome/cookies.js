import {fail, httpUrl, fields} from '../../framework/sdk/registry.js';
import {chromeCall} from './tabs.js';

export function extractDomainFromUrl(url) {
  if (typeof url !== 'string') throw fail('E_SCHEMA');
  return new URL(httpUrl(/^https?:\/\//i.test(url) ? url : `http://${url}`)).hostname;
}
export function createCookieService({api = globalThis.chrome, authorize, resolveTarget} = {}) {
  const permission = async (url, method, phase, context) => {
    if (!authorize) throw fail('E_PERMISSION');
    await authorize({capability: 'cookies', url: httpUrl(url), method, phase}, context);
  };
  async function getCookies(url, context) {
    url = httpUrl(url); await permission(url, 'get', 'pre', context);
    const cookies = await chromeCall(api, api.cookies, 'getAll', {url});
    if (!Array.isArray(cookies)) throw fail('E_CHROME', 'Missing native cookie read receipt');
    await permission(url, 'get', 'post', context);
    return cookies;
  }
  async function deleteCookiesByUrl(url, context) {
    const cookies = await getCookies(url, context);
    for (const cookie of cookies) {
      const cookieUrl = new URL(url); cookieUrl.pathname = cookie.path; cookieUrl.search = ''; cookieUrl.hash = '';
      await permission(cookieUrl.href, 'remove', 'pre', context);
      await chromeCall(api, api.cookies, 'remove', {url: cookieUrl.href, name: cookie.name, ...(cookie.storeId ? {storeId: cookie.storeId} : {})});
      await permission(cookieUrl.href, 'remove', 'post', context);
    }
  }
  async function setCookies(cookies, context) {
    if (!Array.isArray(cookies) || cookies.length > 100) throw fail('E_SCHEMA');
    // Validate the whole batch before producing any cookie side effect.
    const details = cookies.map(cookie => {
      fields(cookie, ['url', 'name', 'value', 'domain', 'path', 'secure', 'httpOnly', 'sameSite', 'expirationDate', 'session', 'storeId', 'hostOnly']);
      if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string') throw fail('E_SCHEMA');
      const url = httpUrl(cookie.url ?? `${cookie.secure ? 'https' : 'http'}://${String(cookie.domain ?? '').replace(/^\./, '')}${cookie.path ?? '/'}`);
      const host = new URL(url).hostname;
      const domain = cookie.domain?.replace(/^\./, '');
      if (domain !== undefined && domain !== host) throw fail('E_SCHEMA', 'Cookie may not broaden authorized hostname');
      const item = {url, name: cookie.name, value: cookie.value};
      for (const name of ['path', 'secure', 'httpOnly', 'sameSite', 'storeId']) if (cookie[name] !== undefined) item[name] = cookie[name];
      if (cookie.domain !== undefined && cookie.hostOnly !== true) item.domain = cookie.domain;
      if (cookie.expirationDate !== undefined && cookie.session !== true) {
        if (!Number.isFinite(cookie.expirationDate)) throw fail('E_SCHEMA'); item.expirationDate = cookie.expirationDate;
      }
      if (cookie.name.startsWith('__Host-')) {
        if (new URL(url).protocol !== 'https:') throw fail('E_SCHEMA', '__Host- cookies require HTTPS');
        delete item.domain; item.path = '/'; item.secure = true;
      }
      return item;
    });
    for (const item of details) await permission(item.url, 'set', 'pre', context);
    for (const item of details) {
      await permission(item.url, 'set', 'pre', context);
      const receipt = await chromeCall(api, api.cookies, 'set', item);
      if (!receipt) throw fail('E_CHROME', 'Missing native cookie write receipt');
      await permission(item.url, 'set', 'post', context);
    }
  }

  // R8 trusted-only driver. No sandbox RPC, no implicit "official tool" trust.
  const verified=async(url,method,phase,context)=>{
    url=httpUrl(url);
    if(!authorize||await authorize({capability:'cookies',url,origin:new URL(url).origin,method,phase},context)!==true)
      throw fail('E_PERMISSION','Trusted exact-document Cookie authorization required');
  };
  const native=async(method,details)=>{
    if(typeof api?.cookies?.[method]!=='function')throw fail('E_CHROME_UNSUPPORTED');
    return method==='getAllCookieStores'?chromeCall(api,api.cookies,method):
      chromeCall(api,api.cookies,method,details);
  };
  const scoped=(args,kind)=>{
    const allowed=kind==='set'?['url','name','value','domain','path','secure','httpOnly','sameSite','session','expirationDate','storeId','partitionKey']:
      kind==='getAll'?['url','name','limit','storeId','partitionKey']:['url','name','storeId','partitionKey'];
    fields(args,allowed,['url']);
    if(typeof args.url!=='string'||args.url.length>2048||args.url.trim()!==args.url)throw fail('E_SCHEMA');
    const url=httpUrl(args.url),host=new URL(url).hostname;
    if(kind!=='getAll'&&(typeof args.name!=='string'||!args.name||args.name.length>256||/[;=\s\x00-\x1f\x7f]/.test(args.name)))
      throw fail('E_SCHEMA','Invalid Cookie name');
    if(kind==='getAll'&&args.name!==undefined&&(typeof args.name!=='string'||!args.name||args.name.length>256))
      throw fail('E_SCHEMA');
    if(args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>100))throw fail('E_SCHEMA');
    if(args.storeId!==undefined&&(typeof args.storeId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(args.storeId)))
      throw fail('E_SCHEMA','Invalid Cookie storeId');
    const out={url,...(args.name!==undefined?{name:args.name}:{}),
      ...(args.storeId!==undefined?{storeId:args.storeId}:{})};
    if(args.partitionKey!==undefined){
      fields(args.partitionKey,['topLevelSite','hasCrossSiteAncestor'],['topLevelSite']);
      const p=args.partitionKey;
      if(typeof p.topLevelSite!=='string'||p.topLevelSite.length>256||
         !p.topLevelSite.startsWith('https://')||new URL(httpUrl(p.topLevelSite)).origin!==p.topLevelSite||
         (p.hasCrossSiteAncestor!==undefined&&typeof p.hasCrossSiteAncestor!=='boolean'))
        throw fail('E_SCHEMA','Invalid exact partition site');
      out.partitionKey={topLevelSite:p.topLevelSite,
        ...(p.hasCrossSiteAncestor!==undefined?{hasCrossSiteAncestor:p.hasCrossSiteAncestor}:{})};
    }
    if(kind==='set'){
      if(typeof args.value!=='string'||new TextEncoder().encode(args.value).length>4096)throw fail('E_SCHEMA');
      out.value=args.value;
      if(args.domain!==undefined){
        if(typeof args.domain!=='string'||args.domain.startsWith('..')||
           args.domain.replace(/^\./,'').toLowerCase()!==host)throw fail('E_COOKIE_SCOPE');
        out.domain=args.domain;
      }
      if(args.path!==undefined){
        if(typeof args.path!=='string'||!args.path.startsWith('/')||args.path.length>1024||/[\r\n;]/.test(args.path))throw fail('E_SCHEMA');
        out.path=args.path;
      }
      for(const key of ['secure','httpOnly','session'])if(args[key]!==undefined&&typeof args[key]!=='boolean')
        throw fail('E_SCHEMA');
      for(const key of ['secure','httpOnly'])if(args[key]!==undefined)out[key]=args[key];
      if(args.sameSite!==undefined){
        if(!['no_restriction','lax','strict','unspecified'].includes(args.sameSite))throw fail('E_SCHEMA');
        out.sameSite=args.sameSite;
      }
      if(args.expirationDate!==undefined){
        if(!Number.isFinite(args.expirationDate)||args.expirationDate<=0||
           args.expirationDate>253402300799||args.session===true)throw fail('E_SCHEMA');
        out.expirationDate=args.expirationDate;
      }
      const https=new URL(url).protocol==='https:';
      if((out.secure===true||out.sameSite==='no_restriction')&&!https)throw fail('E_COOKIE_SCOPE');
      if(out.sameSite==='no_restriction'&&out.secure!==true)throw fail('E_COOKIE_SCOPE');
      if(args.name.startsWith('__Secure-')&&(!https||out.secure!==true))throw fail('E_COOKIE_SCOPE');
      if(args.name.startsWith('__Host-')&&(!https||out.secure!==true||out.path!=='/'||out.domain!==undefined))
        throw fail('E_COOKIE_SCOPE');
    }
    return out;
  };
  const within=(cookie,url)=>{
    if(!cookie||typeof cookie.domain!=='string'||typeof cookie.path!=='string')return false;
    const host=new URL(url).hostname,domain=cookie.domain.replace(/^\./,'').toLowerCase();
    return host===domain||(!cookie.hostOnly&&host.endsWith('.'+domain));
  };
  const redact=cookie=>Object.fromEntries(['name','domain','path','hostOnly','secure','httpOnly','sameSite',
    'session','expirationDate','storeId','partitionKey'].filter(k=>cookie[k]!==undefined)
    .map(k=>[k,cookie[k]]).concat([['valueRedacted',true]]));
  // cookies.remove({url,name}) uses a URL/name filter and can remove multiple
  // matching Paths. Expire the exact native identity instead; do not read or
  // forward the old Value. A successful expired set normally returns null.
  const expireExact=async(cookie,url)=>{
    const details={url,name:cookie.name,value:'',path:cookie.path,expirationDate:0,
      ...(cookie.hostOnly===false?{domain:cookie.domain}:{}),
      ...(cookie.storeId?{storeId:cookie.storeId}:{}),
      ...(cookie.partitionKey?{partitionKey:cookie.partitionKey}:{}),
      secure:cookie.secure===true,httpOnly:cookie.httpOnly===true,
      ...(cookie.sameSite?{sameSite:cookie.sameSite}:{})};
    await native('set',details);
  };
  // After expiring a more specific Cookie, get() may return the surviving
  // same-name Cookie on "/". Read back only the exact deleted identity.
  const sameIdentity=(left,right)=>Boolean(left&&right&&left.name===right.name&&
    left.domain===right.domain&&left.path===right.path&&left.storeId===right.storeId&&
    Boolean(left.partitionKey)===Boolean(right.partitionKey)&&
    (!left.partitionKey||left.partitionKey.topLevelSite===right.partitionKey.topLevelSite&&
      Boolean(left.partitionKey.hasCrossSiteAncestor)===
        Boolean(right.partitionKey.hasCrossSiteAncestor)));
  const exactExists=async (cookie,url)=>{
    const query={url,name:cookie.name,
      ...(cookie.storeId?{storeId:cookie.storeId}:{}),
      ...(cookie.partitionKey?{partitionKey:cookie.partitionKey}:{})};
    const rows=await native('getAll',query);
    if(!Array.isArray(rows)||rows.length>10000)throw fail('E_CHROME','Invalid exact Cookie readback');
    return rows.some(row=>sameIdentity(row,cookie));
  };
  async function get(args,context){
    const details=scoped(args,'get');await verified(details.url,'get','pre',context);
    const result=await native('get',details);
    if(result&&!within(result,details.url))throw fail('E_COOKIE_SCOPE');
    await verified(details.url,'get','post',context);
    return result?redact(result):null;
  }
  async function getAll(args,context){
    const details=scoped(args,'getAll');await verified(details.url,'getAll','pre',context);
    const rows=await native('getAll',details);
    if(!Array.isArray(rows)||rows.length>10000)throw fail('E_CHROME');
    const filtered=rows.filter(row=>within(row,details.url));
    await verified(details.url,'getAll','post',context);
    const limit=args.limit??50;
    return {cookies:filtered.slice(0,limit).map(redact),count:filtered.length,
      truncated:filtered.length>limit,scope:'URL_MATCHING_COOKIES',valuesRedacted:true};
  }
  async function set(args,context){
    const details=scoped(args,'set');await verified(details.url,'set','pre',context);
    if(typeof api?.cookies?.set!=='function'||typeof api?.cookies?.get!=='function')throw fail('E_CHROME_UNSUPPORTED');
    try{
      const result=await native('set',details);
      if(!result||!within(result,details.url))throw Error('Unconfirmed Cookie set');
      await verified(details.url,'set','post',context);
      const lookup=new URL(details.url);
      if(details.path)lookup.pathname=details.path;
      lookup.search='';lookup.hash='';
      const key={url:lookup.href,name:details.name,...(details.storeId?{storeId:details.storeId}:{}),
        ...(details.partitionKey?{partitionKey:details.partitionKey}:{})};
      const check=await native('get',key);
      if(!check||check.value!==details.value||!within(check,details.url))throw Error('Cookie readback mismatch');
      await verified(details.url,'set','post',context);
      return {saved:true,verified:true,cookie:redact(check)};
    }catch{throw fail('E_OUTCOME_UNKNOWN','Cookie write effect uncertain; do not automatically retry');}
  }
  async function remove(args,context){
    const details=scoped(args,'remove');await verified(details.url,'remove','pre',context);
    const before=await native('get',details);
    if(!before){await verified(details.url,'remove','post',context);return {removed:false,verified:true};}
    if(!within(before,details.url))throw fail('E_COOKIE_SCOPE');
    if(context?.expectedCookieIdentity&&!sameIdentity(before,context.expectedCookieIdentity))
      throw fail('E_COOKIE_AMBIGUOUS','Cookie identity changed before deletion');
    if(typeof api?.cookies?.set!=='function')throw fail('E_CHROME_UNSUPPORTED');
    // Native lookup may await a callback while the tool/site is revoked.
    // Recheck immediately before dispatching the exact expiration.
    await verified(details.url,'remove','pre',context);
    try{
      await expireExact(before,details.url);
      await verified(details.url,'remove','post',context);
      if(await exactExists(before,details.url))throw Error('Exact Cookie still exists after remove');
      await verified(details.url,'remove','post',context);
      return {removed:true,verified:true};
    }catch{throw fail('E_OUTCOME_UNKNOWN','Cookie removal effect uncertain; do not automatically retry');}
  }
  async function clearSite(args,context){
    fields(args,['url','storeId','partitionKey','maxCookies'],['url']);
    const details=scoped({url:args.url,storeId:args.storeId,partitionKey:args.partitionKey},'getAll');
    if(args.maxCookies!==undefined&&(!Number.isSafeInteger(args.maxCookies)||args.maxCookies<1||args.maxCookies>50))
      throw fail('E_SCHEMA');
    await verified(details.url,'clearSite','pre',context);
    const host=new URL(details.url).hostname;
    const query={domain:host,...(details.storeId?{storeId:details.storeId}:{}),
      ...(details.partitionKey?{partitionKey:details.partitionKey}:{})};
    const scan=async()=>{
      const rows=await native('getAll',query);
      if(!Array.isArray(rows)||rows.length>10000)throw fail('E_CHROME');
      const exactPartition=row=>details.partitionKey?
        row.partitionKey?.topLevelSite===details.partitionKey.topLevelSite&&
          Boolean(row.partitionKey?.hasCrossSiteAncestor)===
            Boolean(details.partitionKey.hasCrossSiteAncestor):!row.partitionKey;
      // Verify the actual returned Store/Partition even if Chrome's native
      // filter was ignored or the callback returned unexpected wider data.
      return rows.filter(row=>row.hostOnly===true&&
        (!details.storeId||row.storeId===details.storeId)&&exactPartition(row)&&
        row.domain?.replace(/^\./,'').toLowerCase()===host&&
        (!row.secure||details.url.startsWith('https:')));
    };
    const candidates=await scan();
    if(candidates.length>(args.maxCookies??50))throw fail('E_LIMIT');
    const identity=row=>JSON.stringify([row.name,row.path,row.domain,row.storeId,row.partitionKey??null]);
    if(new Set(candidates.map(identity)).size!==candidates.length)throw fail('E_COOKIE_SCOPE');
    await verified(details.url,'clearSite','pre',context);
    let removed=0;
    for(const row of candidates){
      const target=new URL(details.url);target.pathname=row.path;target.search='';target.hash='';
      const key={url:target.href,name:row.name,...(row.storeId?{storeId:row.storeId}:{}),
        ...(row.partitionKey?{partitionKey:row.partitionKey}:{})};
      try{
        await verified(key.url,'remove','pre',context);
        await expireExact(row,key.url);
        await verified(key.url,'remove','post',context);
        if(await exactExists(row,key.url))throw Error('Exact Cookie still present');
        await verified(key.url,'remove','post',context);
        removed++;
      }catch{throw fail('E_OUTCOME_UNKNOWN','Partial Cookie site cleanup possible; reconcile before retry');}
    }
    const remaining=(await scan()).length;
    await verified(details.url,'clearSite','post',context);
    return {matched:candidates.length,removed,remaining,scopeComplete:remaining===0,
      siteFullyCleared:false,scope:'HOST_ONLY_EXACT_HOST_SELECTED_STORE_AND_PARTITION'};
  }
  async function target(args,context,operation){
    fields(args,['url'],['url']);const url=httpUrl(args.url);
    if(typeof resolveTarget!=='function')throw fail('E_CONTEXT','Trusted document resolver unavailable');
    await verified(url,operation,'pre',context);
    const match=await resolveTarget({url,origin:new URL(url).origin},context);
    if(!match||!Number.isSafeInteger(match.tabId)||match.tabId<0||
       !match.documentId||match.origin!==new URL(url).origin)
      throw fail('E_DOCUMENT_STALE','Current trusted document changed');
    return {url,match};
  }
  async function getStores(args,context){
    const {url,match}=await target(args,context,'getStores');
    const rows=await native('getAllCookieStores');
    if(!Array.isArray(rows))throw fail('E_CHROME');
    const matched=rows.filter(row=>Array.isArray(row.tabIds)&&row.tabIds.includes(match.tabId)&&
      typeof row.id==='string');
    if(matched.length!==1)throw fail('E_COOKIE_SCOPE');
    await verified(url,'getStores','post',context);
    return {storeId:matched[0].id};
  }
  async function getPartitionKey(args,context){
    const {url,match}=await target(args,context,'getPartitionKey');
    const receipt=await native('getPartitionKey',{tabId:match.tabId,frameId:match.frameId??0});
    await verified(url,'getPartitionKey','post',context);
    if(!receipt?.partitionKey)throw fail('E_CHROME');
    return {partitionKey:scoped({url,name:'check',partitionKey:receipt.partitionKey},'get').partitionKey};
  }

  return Object.freeze({getCookies, setCookies, deleteCookiesByUrl, extractDomainFromUrl,
    get,getAll,set,remove,clearSite,getStores,getPartitionKey});
}
