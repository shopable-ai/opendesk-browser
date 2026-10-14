// Restricted Cookie driver for the EXISTING authenticated Browser Host.
// This is not a public SDK RPC, grant database, or sandbox-accessible handler.
import {createCookieService} from './cookies.js';
import {chromeCall} from './tabs.js';
import {permissionPattern} from '../../environment.js';
import {fields,fail,httpUrl} from '../../framework/sdk/registry.js';

export const TRUSTED_COOKIE_OPERATIONS=Object.freeze([
  'browser.cookies.get','browser.cookies.getAll','browser.cookies.set','browser.cookies.remove',
  'browser.cookies.clearSite','browser.cookies.getCurrentStore','browser.cookies.getPartitionKey',
  'browser.cookies.observe.start','browser.cookies.observe.getStatus',
  'browser.cookies.observe.read','browser.cookies.observe.stop'
]);
const MUTATIONS=new Set(['browser.cookies.set','browser.cookies.remove','browser.cookies.clearSite']);
const error=(code,message=code)=>fail(code,message);
const byteLength=row=>new TextEncoder().encode(JSON.stringify(row)).byteLength;
const sameDocument=(a,b)=>a&&b&&['tabId','windowId','documentId','url','origin'].every(key=>a[key]===b[key]);
function targetOf(value){
  fields(value,['tabId','windowId','documentId','url','origin'],['tabId','windowId','documentId','url','origin']);
  if(!Number.isSafeInteger(value.tabId)||value.tabId<0||
     !Number.isSafeInteger(value.windowId)||value.windowId<0||
     typeof value.documentId!=='string'||!value.documentId||value.documentId.length>160)
    throw error('E_SCHEMA');
  if(httpUrl(value.url)!==value.url||new URL(value.url).origin!==value.origin)
    throw error('E_SCHEMA','Exact page URL and Origin required');
  return Object.freeze({...value});
}
function partitionKey(value){
  fields(value,['topLevelSite','hasCrossSiteAncestor'],['topLevelSite']);
  if(typeof value.topLevelSite!=='string'||value.topLevelSite!==new URL(httpUrl(value.topLevelSite)).origin||
     value.hasCrossSiteAncestor!==undefined&&typeof value.hasCrossSiteAncestor!=='boolean')
    throw error('E_SCHEMA','Invalid partition key');
}
function normalized(op,input={}){
  if(!TRUSTED_COOKIE_OPERATIONS.includes(op))throw error('E_SERVICE_UNSUPPORTED');
  switch(op){
    case 'browser.cookies.get':
      fields(input,['name','storeId','partitionKey'],['name']);
      if(typeof input.name!=='string'||!input.name||input.name.length>256)throw error('E_SCHEMA');
      break;
    case 'browser.cookies.getAll':fields(input,['storeId','partitionKey']);break;
    case 'browser.cookies.set':{
      fields(input,['cookie'],['cookie']);const c=input.cookie;
      fields(c,['name','value','domain','path','secure','httpOnly','sameSite','session','expirationDate','storeId','partitionKey'],['name','value']);
      if(typeof c.name!=='string'||!c.name||c.name.length>256||
         typeof c.value!=='string'||c.value.length>4096||
         c.path!==undefined&&(typeof c.path!=='string'||!c.path.startsWith('/')||c.path.length>512)||
         c.domain!==undefined&&(typeof c.domain!=='string'||c.domain.length>253)||
         ['secure','httpOnly','session'].some(k=>c[k]!==undefined&&typeof c[k]!=='boolean')||
         c.sameSite!==undefined&&!['unspecified','no_restriction','lax','strict'].includes(c.sameSite)||
         c.expirationDate!==undefined&&(!Number.isFinite(c.expirationDate)||c.expirationDate<0))
        throw error('E_SCHEMA','Invalid Cookie attributes');
      if(c.partitionKey)partitionKey(c.partitionKey);
      if(c.storeId!==undefined&&(typeof c.storeId!=='string'||c.storeId.length>128))throw error('E_SCHEMA');
      break;
    }
    case 'browser.cookies.remove':
      fields(input,['name','domain','path','storeId','partitionKey'],['name','domain','path']);
      if(typeof input.name!=='string'||!input.name||input.name.length>256||
         typeof input.domain!=='string'||!input.domain||input.domain.length>253||
         typeof input.path!=='string'||!input.path.startsWith('/')||input.path.length>512)
        throw error('E_SCHEMA');
      break;
    case 'browser.cookies.observe.start':
      fields(input,['durationMs','maxEvents']);
      if(input.durationMs!==undefined&&(!Number.isSafeInteger(input.durationMs)||input.durationMs<1000||input.durationMs>30000)||
         input.maxEvents!==undefined&&(!Number.isSafeInteger(input.maxEvents)||input.maxEvents<1||input.maxEvents>50))
        throw error('E_SCHEMA');
      break;
    case 'browser.cookies.observe.getStatus':
    case 'browser.cookies.observe.stop':
    case 'browser.cookies.observe.read':
      fields(input,op==='browser.cookies.observe.read'?['sessionRef','cursor','limit']:['sessionRef'],['sessionRef']);
      if(typeof input.sessionRef!=='string'||!/^[0-9a-f-]{36}$/i.test(input.sessionRef))throw error('E_SCHEMA');
      if(op==='browser.cookies.observe.read'){
        if(input.cursor!==undefined&&(typeof input.cursor!=='string'||!/^(0|[1-9][0-9]{0,9})$/.test(input.cursor)))throw error('E_SCHEMA','Invalid Cookie event cursor');
        if(input.limit!==undefined&&(!Number.isSafeInteger(input.limit)||input.limit<1||input.limit>50))throw error('E_SCHEMA','Invalid Cookie event limit');
      }
      break;
    default:fields(input,[]);
  }
  const opts=op==='browser.cookies.set'?input.cookie:input;
  if(opts.storeId!==undefined&&(typeof opts.storeId!=='string'||opts.storeId.length>128))throw error('E_SCHEMA');
  if(opts.partitionKey)partitionKey(opts.partitionKey);
  return structuredClone(input);
}
export function createTrustedCookieHost({api=globalThis.chrome,now=Date.now}={}){
  const approvals=new Map(),sessions=new Map(),clearPreviews=new Map();
  async function guard(target){
    if(!api.permissions?.contains||
       !await api.permissions.contains({permissions:['cookies']})||
       !await api.permissions.contains({origins:[permissionPattern(target.url)]}))
      throw error('E_CHROME_PERMISSION_REQUIRED');
    const tabs=await api.tabs?.query?.({active:true,windowId:target.windowId});
    const tab=Array.isArray(tabs)&&tabs.length===1?tabs[0]:null;
    if(!tab||tab.id!==target.tabId||tab.windowId!==target.windowId||
       !tab.active||tab.incognito||tab.pendingUrl||tab.url!==target.url||
       ['loading','unloaded'].includes(tab.status))throw error('E_DOCUMENT_CHANGED');
    const frame=await api.webNavigation?.getFrame?.({tabId:target.tabId,frameId:0});
    if(!frame||frame.documentId!==target.documentId||frame.url!==target.url||
       frame.documentLifecycle&&frame.documentLifecycle!=='active')
      throw error('E_DOCUMENT_CHANGED');
  }
  // One shared Cookie Driver, including the R8 readback and unknown-effect logic.
  // The Controller's original methods are reused unchanged for trusted raw read.
  const existing=createCookieService({api,
    authorize:async ({url,method,phase},context)=>{
      if(context?.cookieTool){
        await context.cookieTool.authorize(url,method,phase);
        return true;
      }
      await guard(context.target);
      if(new URL(url).origin!==context.target.origin)throw error('E_COOKIE_SCOPE');
      return true;
    },
    resolveTarget:async ({url},context)=>{
      await guard(context.target);
      if(new URL(url).origin!==context.target.origin)throw error('E_COOKIE_SCOPE');
      return {tabId:context.target.tabId,frameId:0,documentId:context.target.documentId,
        origin:context.target.origin};
    }
  });
  async function storeId(target){
    const all=await chromeCall(api,api.cookies,'getAllCookieStores');
    if(!Array.isArray(all))throw error('E_CHROME');
    const own=all.filter(row=>!row.incognito&&row.tabIds?.includes(target.tabId));
    if(own.length!==1||typeof own[0].id!=='string')throw error('E_COOKIE_STORE');
    return own[0].id;
  }
  async function scope(target,args={}){
    const id=await storeId(target);
    if(args.storeId!==undefined&&args.storeId!==id)throw error('E_COOKIE_STORE');
    if(args.partitionKey){
      const receipt=await chromeCall(api,api.cookies,'getPartitionKey',{tabId:target.tabId,frameId:0});
      const partition=receipt?.partitionKey;
      if(partition?.topLevelSite!==args.partitionKey.topLevelSite||
         args.partitionKey.hasCrossSiteAncestor!==undefined&&
         partition.hasCrossSiteAncestor!==args.partitionKey.hasCrossSiteAncestor)
        throw error('E_COOKIE_PARTITION');
    }
    return {storeId:id,...(args.partitionKey?{partitionKey:args.partitionKey}:{})};
  }
  async function read(target,args={}){
    const exact=await scope(target,args);
    await guard(target);
    // R8 Driver redacts values. This HOST_ONLY native read uses the exact
    // current Cookie store and never forwards values to the installed sandbox.
    const rows=await chromeCall(api,api.cookies,'getAll',{url:target.url,...exact});
    await guard(target);
    if(!Array.isArray(rows)||rows.length>100)throw error('E_LIMIT','Narrow the Cookie scope');
    const owned=rows.filter(row=>row.storeId===exact.storeId);
    if(byteLength(owned)>60000)throw error('E_LIMIT','Cookie response too large');
    return owned;
  }
  async function remove(target,key){
    const rows=(await read(target,key)).filter(row=>
      row.name===key.name&&row.domain===key.domain&&row.path===key.path);
    if(rows.length!==1)throw error(rows.length?'E_COOKIE_AMBIGUOUS':'E_COOKIE_NOT_FOUND');
    const cookie=rows[0],url=new URL(target.url);
    url.pathname=cookie.path||'/';url.search='';url.hash='';
    await guard(target);
    const receipt=await existing.remove({url:url.href,name:cookie.name,
      storeId:cookie.storeId,...(cookie.partitionKey?{partitionKey:cookie.partitionKey}:{})},
      {target,expectedCookieIdentity:{name:cookie.name,domain:cookie.domain,path:cookie.path,storeId:cookie.storeId,
        ...(cookie.partitionKey?{partitionKey:cookie.partitionKey}:{})}});
    return {removed:receipt.removed};
  }
  async function operate(op,args,target){
    if(op==='browser.cookies.getAll')return {cookies:await read(target,args),scope:'CURRENT_URL_MATCHES'};
    if(op==='browser.cookies.get'){
      const matches=(await read(target,args)).filter(row=>row.name===args.name);
      // getAll may include identical names from different paths/partitions.
      // Never return an arbitrary first match with an unintended secret.
      if(matches.length>1)throw error('E_COOKIE_AMBIGUOUS','Select the exact path and partition from getAll');
      return {cookie:matches[0]??null};
    }
    if(op==='browser.cookies.getCurrentStore')return {stores:[await existing.getStores({url:target.url},{target})]};
    if(op==='browser.cookies.getPartitionKey')
      return existing.getPartitionKey({url:target.url},{target});
    if(op==='browser.cookies.set'){
      const c=args.cookie,host=new URL(target.url).hostname;
      if(c.domain!==undefined&&c.domain.replace(/^\./,'')!==host)
        throw error('E_SCHEMA','Cookie domain may not broaden the selected host');
      if(c.name.startsWith('__Host-')&&(new URL(target.url).protocol!=='https:'||
         c.domain!==undefined||c.secure!==true||c.path!==undefined&&c.path!=='/'))
        throw error('E_SCHEMA','Invalid __Host- Cookie');
      if(c.name.startsWith('__Secure-')&&(new URL(target.url).protocol!=='https:'||c.secure!==true))
        throw error('E_SCHEMA','Invalid __Secure- Cookie');
      if(c.sameSite==='no_restriction'&&c.secure!==true)throw error('E_SCHEMA','SameSite=None requires Secure');
      const targetStore=await scope(target,c);
      await existing.set({url:target.url,...c,storeId:targetStore.storeId},{target});
      return {written:true};
    }
    if(op==='browser.cookies.remove')return remove(target,args);
    if(op==='browser.cookies.clearSite'){
      const rows=await read(target);let count=0;
      for(const row of rows){
        try{
          await remove(target,{name:row.name,domain:row.domain,path:row.path,
            storeId:row.storeId,...(row.partitionKey?{partitionKey:row.partitionKey}:{})});
          count++;
        }catch(cause){
          if(count)throw error('E_OUTCOME_UNKNOWN','Partial Cookie deletion; refresh before retry');
          throw cause;
        }
      }
      return {removed:count,scope:'CURRENT_URL_MATCHES'};
    }
    if(op==='browser.cookies.observe.start'){
      if(!api.cookies?.onChanged?.addListener)throw error('E_CAPABILITY');
      for(const [ref,row] of sessions)if(now()>=row.expiresAt)sessions.delete(ref);
      if(sessions.size>=8)throw error('E_LIMIT');
      const ownStore=await storeId(target);
      const partition=(await chromeCall(api,api.cookies,'getPartitionKey',{
        tabId:target.tabId,frameId:0}))?.partitionKey;
      if(!partition?.topLevelSite)throw error('E_COOKIE_PARTITION');
      const sessionRef=crypto.randomUUID(),expiresAt=now()+(args.durationMs??15000);
      sessions.set(sessionRef,{target,storeId:ownStore,partitionKey:partition,expiresAt,
        events:[],maxEvents:args.maxEvents??40,dropped:0,nextSeq:1});
      return {sessionRef,expiresAt,status:'running'};
    }
    const session=sessions.get(args.sessionRef);
    if(!session||!sameDocument(session.target,target)||now()>=session.expiresAt){
      sessions.delete(args.sessionRef);throw error('E_SESSION_EXPIRED');
    }
    if(op==='browser.cookies.observe.stop'){
      sessions.delete(args.sessionRef);return {stopped:true};
    }
    if(op==='browser.cookies.observe.getStatus')
      return {sessionRef:args.sessionRef,status:'running',bufferedCount:session.events.length,
        droppedCount:session.dropped,expiresAt:session.expiresAt};
    if(op==='browser.cookies.observe.read'){
      const cursor=Number(args.cursor??'0');
      const events=session.events.filter(event=>event.seq>cursor).slice(0,args.limit??50);
      const earliest=session.events[0]?.seq??session.nextSeq;
      return {sessionRef:args.sessionRef,events,
        nextCursor:String(events.length?events.at(-1).seq:Math.max(cursor,session.nextSeq-1)),
        gapCount:Math.max(0,earliest-cursor-1),droppedCount:session.dropped,
        expiresAt:session.expiresAt};
    }
    throw error('E_SERVICE_UNSUPPORTED','Unsupported Cookie session operation');
  }

  // This is an alternate identity/scope on the SAME native Cookie Service and
  // Chrome event listener. Tool-provided data can never create authority.
  async function executeInstalled(op,args,{origin,storeId,partitionKey=null,ownerKey,authorize}){
    if(!TRUSTED_COOKIE_OPERATIONS.includes(op)||typeof authorize!=='function'||
       typeof storeId!=='string'||typeof ownerKey!=='string'||new URL(httpUrl(args.url)).origin!==origin)
      throw error('E_COOKIE_SCOPE');
    if(args.storeId!==undefined&&args.storeId!==storeId)throw error('E_COOKIE_STORE');
    const samePartition=(a,b)=>Boolean(a)===Boolean(b)&&(!a||
      a.topLevelSite===b.topLevelSite&&Boolean(a.hasCrossSiteAncestor)===Boolean(b.hasCrossSiteAncestor));
    if(args.partitionKey&&!samePartition(args.partitionKey,partitionKey))throw error('E_COOKIE_PARTITION');
    const key={storeId,...(args.partitionKey?{partitionKey:args.partitionKey}:{})};
    const check=(phase,url=args.url)=>authorize({operation:op,phase,url,storeId,
      partitionKey:args.partitionKey??null,includeValues:args.includeValues===true});
    const context={cookieTool:{authorize:async(url,_method,phase)=>{
      await check(phase,url);
      if(op==='browser.cookies.set'&&phase==='pre'&&args.ifAbsent===true){
        const domain=(args.domain??new URL(args.url).hostname).replace(/^\./,'').toLowerCase();
        // Cookie Paths are literal identities; URL.pathname would normalize them.
        const rows=await scan({domain,name:args.name,path:args.path,...key});
        if(rows.some(row=>row.name===args.name&&row.path===args.path&&
          row.domain.replace(/^\./,'').toLowerCase()===domain))
          throw error('E_COOKIE_CONFLICT','相同域名、路径、存储区和分区的新名称已存在；未覆盖该 Cookie');
        await check('pre',url);
      }
    }}};
    const permitted=row=>row.storeId===storeId&&samePartition(row.partitionKey??null,args.partitionKey??null);
    const redact=(row,values=false)=>{
      if(!row)return null;
      const item=Object.fromEntries(['name','domain','path','hostOnly','secure','httpOnly','sameSite',
        'session','expirationDate','storeId','partitionKey'].filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
      if(values){item.value=row.value;item.valueRedacted=false;}else item.valueRedacted=true;
      return item;
    };
    const scan=async (query,limit=50)=>{
      const rows=await chromeCall(api,api.cookies,'getAll',query);
      if(!Array.isArray(rows)||rows.length>10000)throw error('E_CHROME');
      const allowed=rows.filter(permitted);
      if(allowed.length>limit)throw error('E_LIMIT','Narrow Cookie scope to 50 entries');
      return allowed;
    };
    await check('pre');
    let result;
    if(op==='browser.cookies.get'||op==='browser.cookies.getAll'){
      const rows=await scan({url:args.url,...key,...(args.name?{name:args.name}:{})});
      if(op==='browser.cookies.get'){
        const matches=rows.filter(row=>row.name===args.name&&
          (args.domain===undefined||row.domain===args.domain)&&
          (args.path===undefined||row.path===args.path));
        if(matches.length>1)throw error('E_COOKIE_AMBIGUOUS');
        result={cookie:redact(matches[0]??null,args.includeValues===true),scope:'APPROVED_URL'};
      }else{
        result=rows.map(row=>redact(row,args.includeValues===true));
        if(byteLength(result)>11500)throw error('E_LIMIT','Cookie response exceeds SDK budget');
      }
    }else if(op==='browser.cookies.getCurrentStore')result={storeId};
    else if(op==='browser.cookies.getPartitionKey'){
      if(!partitionKey)throw error('E_COOKIE_PARTITION');
      result={partitionKey};
    }else if(op==='browser.cookies.set'){
      const {ifAbsent,...nativeArgs}=args;
      result=await existing.set({...nativeArgs,storeId},context);
    }else if(op==='browser.cookies.remove'){
      const target=new URL(args.url);target.pathname=args.path;target.search='';target.hash='';
      await check('pre',target.href);
      const found=(await scan({url:target.href,...key,name:args.name}))
        .filter(row=>row.name===args.name&&row.path===args.path&&row.domain===args.domain);
      if(found.length!==1)throw error(found.length?'E_COOKIE_AMBIGUOUS':'E_COOKIE_NOT_FOUND');
      const chosen=await chromeCall(api,api.cookies,'get',{url:target.href,...key,name:args.name});
      if(!chosen||chosen.path!==args.path||chosen.domain!==args.domain||!permitted(chosen))
        throw error('E_COOKIE_AMBIGUOUS','Native selection differs from exact identity');
      result=await existing.remove({url:target.href,name:args.name,...key},
        {...context,expectedCookieIdentity:redact(chosen)});
      if((await scan({url:target.href,...key,name:args.name}))
        .some(row=>row.name===args.name&&row.domain===args.domain&&row.path===args.path))
        throw error('E_OUTCOME_UNKNOWN','Cookie still exists after native remove');
    }else if(op==='browser.cookies.clearSite'){
      const host=new URL(args.url).hostname;
      const rows=await scan({domain:host,...key});
      const current=rows.filter(row=>row.hostOnly===true&&row.domain.replace(/^\./,'').toLowerCase()===host&&
        (!row.secure||args.url.startsWith('https:')));
      if(current.length>(args.maxCookies??50))throw error('E_LIMIT');
      const cookieIdentity=row=>JSON.stringify([row.name,row.path,row.domain,row.storeId,
        row.partitionKey?.topLevelSite??null,Boolean(row.partitionKey?.hasCrossSiteAncestor)]);
      const identities=current.map(cookieIdentity);
      if(new Set(identities).size!==current.length)throw error('E_COOKIE_AMBIGUOUS');
      for(const [ref,preview] of clearPreviews)if(now()>=preview.expiresAt)clearPreviews.delete(ref);
      const prior=args.preview===true?null:clearPreviews.get(args.previewRef);
      // Store no Cookie plaintext in approval receipts. Bind a preview to the
      // exact values and attributes, not just name/path/count: another login
      // can replace a Cookie without changing its native identity.
      const salt=args.preview===true?crypto.randomUUID():prior?.salt;
      const fingerprints=salt?(await Promise.all(current.map(async row=>{
        const bytes=new TextEncoder().encode(JSON.stringify([salt,row.name,row.path,row.domain,
          row.storeId,row.partitionKey?.topLevelSite??null,
          Boolean(row.partitionKey?.hasCrossSiteAncestor),row.value??null,
          row.secure===true,row.httpOnly===true,row.sameSite??null,row.session===true,
          row.expirationDate??null]));
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
        return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
      }))).sort():[];
      if(args.preview===true){
        if(clearPreviews.size>=16)throw error('E_LIMIT','Too many pending Cookie clear previews');
        const previewRef=crypto.randomUUID();
        clearPreviews.set(previewRef,{url:args.url,ownerKey,storeId,salt,
          partition:JSON.stringify(key.partitionKey??null),fingerprints,
          count:current.length,expiresAt:now()+60000});
        result={matched:current.length,removed:0,remaining:current.length,
          preview:true,previewRef,scope:'EXACT_HOST_HOST_ONLY'};
      }else{
        const preview=prior;
        clearPreviews.delete(args.previewRef); // one-use even on a stale/corrupt request
        if(!preview||now()>=preview.expiresAt||preview.url!==args.url||
           preview.ownerKey!==ownerKey||preview.storeId!==storeId||
           preview.partition!==JSON.stringify(key.partitionKey??null)||
           preview.count!==args.expectedCount||
           JSON.stringify(preview.fingerprints)!==JSON.stringify(fingerprints))
          throw error('E_COOKIE_STALE','Cookie values or identities changed; refresh the preview');
        result={...await existing.clearSite({url:args.url,...key,maxCookies:args.maxCookies??50},context),
          preview:false,scope:'EXACT_HOST_HOST_ONLY'};
      }
    }else if(op==='browser.cookies.observe.start'){
      if(!api.cookies?.onChanged?.addListener)throw error('E_CHROME_UNSUPPORTED');
      for(const [ref,row] of sessions)if(now()>=row.expiresAt)sessions.delete(ref);
      if(sessions.size>=8)throw error('E_LIMIT');
      const sessionRef=crypto.randomUUID(),expiresAt=now()+(args.durationMs??15000);
      // Installed observe.start has no partitionKey parameter. Keep its default
      // event scope identical to getAll({url}) without a partitionKey: only
      // unpartitioned Cookies. A site grant's partition receipt is NOT a
      // request to expose that partition's onChanged metadata.
      sessions.set(sessionRef,{kind:'installed',ownerKey,target:{url:args.url,origin},storeId,
        partitionKey:null,expiresAt,events:[],maxEvents:args.maxEvents??40,dropped:0,nextSeq:1});
      result={sessionRef,expiresAt,status:'running'};
    }else if(op.startsWith('browser.cookies.observe.')){
      const session=sessions.get(args.sessionRef);
      if(!session||session.kind!=='installed'||session.ownerKey!==ownerKey||
         session.target.url!==args.url||session.storeId!==storeId||now()>=session.expiresAt){
        if(session&&now()>=session.expiresAt)sessions.delete(args.sessionRef);
        throw error('E_SESSION_EXPIRED');
      }
      if(op==='browser.cookies.observe.stop'){sessions.delete(args.sessionRef);result={stopped:true};}
      else if(op==='browser.cookies.observe.getStatus')
        result={sessionRef:args.sessionRef,status:'running',bufferedCount:session.events.length,
          droppedCount:session.dropped,expiresAt:session.expiresAt};
      else if(op==='browser.cookies.observe.read'){
        const cursor=Number(args.cursor??'0');
        const events=session.events.filter(event=>event.seq>cursor).slice(0,args.limit??50);
        const first=session.events[0]?.seq??session.nextSeq;
        result={sessionRef:args.sessionRef,events,
          nextCursor:String(events.length?events.at(-1).seq:Math.max(cursor,session.nextSeq-1)),
          gapCount:Math.max(0,first-cursor-1),droppedCount:session.dropped,expiresAt:session.expiresAt};
      }
    }
    if(result===undefined)throw error('E_SERVICE_UNSUPPORTED');
    try{await check('post');}
    catch(cause){
      if(MUTATIONS.has(op)&&args.preview!==true)
        throw error('E_OUTCOME_UNKNOWN','Site authority changed after a Cookie effect');
      throw cause;
    }
    return result;
  }
  api.cookies?.onChanged?.addListener?.(event=>{
    const cookie=event?.cookie;
    for(const [id,s] of sessions){
      if(now()>=s.expiresAt){sessions.delete(id);continue;}
      if(!cookie||cookie.storeId!==s.storeId)continue;
      // An unpartitioned cookie can apply to the selected URL; a partitioned
      // Cookie from any OTHER top-level site/cross-site ancestry cannot.
      if(cookie.partitionKey&&
         (!s.partitionKey||cookie.partitionKey.topLevelSite!==s.partitionKey.topLevelSite||
          Boolean(cookie.partitionKey.hasCrossSiteAncestor)!==
            Boolean(s.partitionKey.hasCrossSiteAncestor)))continue;
      const domain=String(cookie.domain||'').replace(/^\./,'').toLowerCase();
      const selected=new URL(s.target.url),host=selected.hostname;
      if(!domain||(cookie.hostOnly?host!==domain:host!==domain&&!host.endsWith('.'+domain)))
        continue;
      // chrome.cookies.onChanged is global: check the current URL's Path
      // BEFORE emitting any metadata from an unrelated sibling path.
      const cookiePath=typeof cookie.path==='string'?cookie.path:'';
      const requestPath=selected.pathname||'/';
      if(!cookiePath.startsWith('/')||
        !(requestPath===cookiePath||requestPath.startsWith(cookiePath)&&
          (cookiePath.endsWith('/')||requestPath[cookiePath.length]==='/')))
        continue;
      if(s.events.length>=s.maxEvents){s.events.shift();s.dropped++;}
      // Events contain NO Cookie value and never use the generic network event schema.
      s.events.push({seq:s.nextSeq++,name:String(cookie.name||'').slice(0,256),domain,path:String(cookie.path||'').slice(0,512),
        removed:Boolean(event.removed),cause:String(event.cause||'').slice(0,40),at:now()});
    }
  });
  return Object.freeze({
    executeInstalled,
    async approve({targetOperation,targetArgs,document,hostInstanceId},caller){
      const target=targetOf(document),args=normalized(targetOperation,targetArgs??{});
      if(!caller?.documentId||caller.hostInstanceId!==hostInstanceId)throw error('E_OWNER');
      await guard(target);
      for(const [ref,row] of approvals)if(now()>=row.expiresAt)approvals.delete(ref);
      if(approvals.size>=16)throw error('E_LIMIT');
      const approvalRef=crypto.randomUUID(),expiresAt=now()+15000;
      approvals.set(approvalRef,{target,args,op:targetOperation,hostInstanceId,
        senderDocumentId:caller.documentId,expiresAt});
      return {approvalRef,expiresAt};
    },
    async execute({approvalRef,hostInstanceId},caller){
      if(typeof approvalRef!=='string'||!/^[0-9a-f-]{36}$/i.test(approvalRef))throw error('E_SCHEMA');
      const pending=approvals.get(approvalRef);
      approvals.delete(approvalRef); // one-shot, never replay a native effect
      if(!pending||pending.expiresAt<=now()||pending.hostInstanceId!==hostInstanceId||
         pending.hostInstanceId!==caller?.hostInstanceId||
         pending.senderDocumentId!==caller.documentId)throw error('E_USER_GESTURE_REQUIRED');
      await guard(pending.target);
      let began=false;
      try{
        began=MUTATIONS.has(pending.op);
        const result=await operate(pending.op,pending.args,pending.target);
        await guard(pending.target);
        return result;
      }catch(cause){
        if(began&&['E_DOCUMENT_CHANGED','E_CHROME_PERMISSION_REQUIRED'].includes(cause?.code))
          throw error('E_OUTCOME_UNKNOWN','Cookie effect may have occurred; do not replay');
        throw cause;
      }
    },
    revoke(){approvals.clear();sessions.clear();clearPreviews.clear();},
    noteNavigation(tabId){
      for(const [id,row] of approvals)if(row.target.tabId===tabId)approvals.delete(id);
      for(const [id,row] of sessions)if(row.target.tabId===tabId)sessions.delete(id);
    }
  });
}
