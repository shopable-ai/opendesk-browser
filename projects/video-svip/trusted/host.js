import {VIDEO_SVIP_ID,VIDEO_SVIP_CAPABILITY,VIDEO_SVIP_OPERATIONS,
  VIDEO_SVIP_WATCH_PORT,videoSVIPSiteFor} from './policy.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});

// This exact self-contained function is serialized into the ISOLATED world of
// ONE captured Chrome document. Tool JS cannot supply selectors, JS or tab IDs.
// It never touches media elements, credentials, streams, network or player APIs.
export function pageVideoSVIP(mode,site,nonce='') {
  const bound=()=>{
    try{
      const url=new URL(location.href),host=url.hostname.toLowerCase();
      return ['http:','https:'].includes(url.protocol)&&
        site?.hosts?.some(domain=>site.id==='fixture'?host===domain:host===domain||host.endsWith('.'+domain))&&
        site.paths.some(prefix=>url.pathname.startsWith(prefix));
    }catch{return false;}
  };
  if(!bound())return {ok:false,reason:'site-changed'};
  if(mode==='watch-on'){
    const key='__opendeskSVIPObserver_v1';
    try{globalThis[key]?.close?.();}catch{}
    delete globalThis[key];
    const runtime=globalThis.chrome?.runtime;
    if(typeof nonce!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(nonce)||
       typeof runtime?.connect!=='function'||typeof MutationObserver!=='function'||
       !document.documentElement)return {ok:true,watching:false};
    let port,timer=null,closed=false;
    const observer=new MutationObserver(()=>{
      if(closed||timer!==null)return;
      timer=setTimeout(()=>{
        timer=null;
        if(!closed)try{port.postMessage({nonce,kind:'changed'});}catch{close();}
      },180);
    });
    const close=()=>{
      if(closed)return;
      closed=true;observer.disconnect();
      if(timer!==null)clearTimeout(timer);
      timer=null;
      if(globalThis[key]?.port===port)delete globalThis[key];
      try{port?.disconnect();}catch{}
    };
    try{
      port=runtime.connect({name:'opendesk.video-svip.watch.v1'});
      port.onDisconnect.addListener(close);
      observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,
        attributes:true,attributeFilter:['class','aria-current','aria-selected','data-episode','data-current-episode','data-episode-number','content']});
      globalThis[key]={port,close};
      port.postMessage({nonce,kind:'ready'});
      return {ok:true,watching:true};
    }catch{close();return {ok:true,watching:false};}
  }
  if(mode!=='inspect')return {ok:false,reason:'unsupported-mode'};
  const trim=value=>String(value??'').replace(/\s+/g,' ').trim().slice(0,180);
  const text=node=>trim(node?.textContent||node?.getAttribute?.('content')||'');
  const find=selectors=>{
    for(const selector of selectors.slice(0,8)){
      try{const node=document.querySelector(selector);if(node)return {node,selector};}
      catch{/* Reviewed site selector may not exist in this version. */}
    }
    return null;
  };
  const cleanTitle=value=>trim(value)
    .replace(/\s*[-|·—]\s*(腾讯视频|爱奇艺|优酷|芒果TV|芒果 TV|哔哩哔哩|bilibili|YouTube|Netflix)\s*$/i,'')
    .replace(/\s*[-|·—]\s*第\s*\d{1,4}\s*[集话]\s*$/,'').trim();
  const badTitle=value=>!value||/^(首页|正在播放|视频|电视剧|电影|播放页|YouTube|Netflix|腾讯视频|爱奇艺|优酷|哔哩哔哩)$/i.test(value);
  let title='',titleSource='none',titleConfidence='none',titleSelector='';
  const preferred=find(site.titles||[]);
  if(preferred){
    const candidate=cleanTitle(text(preferred.node));
    if(!badTitle(candidate)){
      title=candidate;titleSelector=preferred.selector;
      titleSource='site-selector';
      titleConfidence=preferred.selector==='h1'?'medium':'high';
    }
  }
  if(!title){
    for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]']){
      const candidate=cleanTitle(text(document.querySelector(selector)));
      if(!badTitle(candidate)){title=candidate;titleSource='metadata';titleConfidence='low';titleSelector=selector;break;}
    }
  }
  if(!title){
    const candidate=cleanTitle(trim(document.title));
    if(!badTitle(candidate)){title=candidate;titleSource='document-title';titleConfidence='low';titleSelector='title';}
  }
  // Episode must describe the ACTIVE item, never a total or "updated to".
  const parseEpisode=value=>{
    const phrase=trim(value);
    if(/(?:共|全|更新至|已更新|总计)\s*\d{1,4}\s*[集话]|(?:全集|完结)/.test(phrase))return null;
    let m=phrase.match(/第\s*(\d{1,3})\s*季\s*第\s*(\d{1,4})\s*[集话]/);
    if(m)return {season:Number(m[1]),number:Number(m[2]),label:'第'+m[1]+'季 第'+m[2]+'集'};
    m=phrase.match(/\bS(\d{1,3})\s*E(\d{1,4})\b/i);
    if(m)return {season:Number(m[1]),number:Number(m[2]),label:'S'+m[1]+'E'+m[2]};
    m=phrase.match(/第\s*(\d{1,4})\s*[集话]/);
    if(m)return {season:null,number:Number(m[1]),label:'第'+m[1]+'集'};
    return null;
  };
  const acceptable=row=>row&&row.number>=1&&row.number<=9999&&
    (row.season===null||row.season>=1&&row.season<=100);
  let episode='unknown',episodeConfidence='none',episodeSource='none';
  for(const selector of (site.episodes||[]).slice(0,8)){
    const found=find([selector]);if(!found)continue;
    const node=found.node;
    const index=Number(node.getAttribute?.('data-episode-number'));
    const season=Number(node.getAttribute?.('data-season-number'));
    const fromData=Number.isInteger(index)&&index>0&&index<=9999
      ?{season:Number.isInteger(season)&&season>0&&season<=100?season:null,
         number:index,label:'第'+index+'集'}:null;
    const parsed=fromData||parseEpisode(text(node));
    if(acceptable(parsed)){
      episode=parsed;episodeConfidence='high';episodeSource='selected:'+selector;break;
    }
  }
  if(episode==='unknown'){
    try{
      const url=new URL(location.href);
      const path=url.pathname.match(/\/season\/(\d{1,3})\/episode\/(\d{1,4})(?:\/|$)/i)||
        url.pathname.match(/\/s(\d{1,3})e(\d{1,4})(?:\/|$)/i);
      if(path){
        const parsed={season:Number(path[1]),number:Number(path[2]),
          label:'第'+path[1]+'季 第'+path[2]+'集'};
        if(acceptable(parsed)){episode=parsed;episodeConfidence='medium';episodeSource='current-url';}
      }else if(site.id!=='bilibili'){
        const index=url.searchParams.get('episode_number')||url.searchParams.get('episode');
        if(/^[1-9]\d{0,3}$/.test(index||'')){
          episode={season:null,number:Number(index),label:'第'+index+'集'};
          episodeConfidence='medium';episodeSource='current-url';
        }
      }
    }catch{/* Navigation invalidates the captured document in Host. */}
  }
  const state=!title?'unrecognized':titleConfidence!=='high'?'needs-confirmation':'recognized';
  const reason=!title?'title-not-found':titleConfidence!=='high'?'weak-title-evidence':
    episode==='unknown'?'episode-unknown':'site-evidence';
  // Non-security fingerprint only; the Host independently binds documentId.
  const snapshot=[location.href,document.title,title,titleSource,titleSelector,
    episode==='unknown'?'unknown':episode.label,episodeSource].join('|');
  let hash=2166136261;
  for(let i=0;i<snapshot.length&&i<1024;i++)hash=Math.imul(hash^snapshot.charCodeAt(i),16777619)>>>0;
  return {ok:true,title,titleSource,titleConfidence,episode,episodeConfidence,
    recognitionState:state,recognitionReason:reason,contentRevision:hash.toString(16).padStart(8,'0'),
    evidence:{title:titleSelector.slice(0,80),episode:episodeSource.slice(0,80)}};
}

function rootFrame(frames,target){
  if(!Array.isArray(frames))throw fail('E_VIDEO_DOCUMENT','无法读取 Chrome 活动文档');
  const top=frames.find(frame=>frame?.frameId===0);
  if(!top||top.documentId!==target.documentId||top.url!==target.url||top.errorOccurred||
     top.documentLifecycle&&top.documentLifecycle!=='active')
    throw fail('E_DOCUMENT_STALE','视频网页已导航，请重新识别');
  return top;
}
function checkRead(rows,target){
  const row=Array.isArray(rows)?rows.find(x=>x?.documentId===target.documentId&&x?.frameId===0):null;
  const data=row?.result;
  if(!data||data.ok!==true||typeof data.contentRevision!=='string'||
     !/^[a-f0-9]{8}$/.test(data.contentRevision)||
     typeof data.title!=='string'||data.title.length>180||
     !['high','medium','low','none'].includes(data.titleConfidence)||
     !['site-selector','metadata','document-title','none'].includes(data.titleSource)||
     !['recognized','needs-confirmation','unrecognized'].includes(data.recognitionState)||
     !['none','medium','high'].includes(data.episodeConfidence)||
     !(data.episode==='unknown'||data.episode&&typeof data.episode==='object'&&
       Number.isInteger(data.episode.number)&&data.episode.number>=1&&data.episode.number<=9999&&
       (data.episode.season===null||Number.isInteger(data.episode.season)&&data.episode.season>=1&&data.episode.season<=100)&&
       typeof data.episode.label==='string'&&data.episode.label.length<=50)||
     typeof data.recognitionReason!=='string'||data.recognitionReason.length>64||
     !data.evidence||typeof data.evidence.title!=='string'||data.evidence.title.length>80||
     typeof data.evidence.episode!=='string'||data.evidence.episode.length>80)
    throw fail('E_VIDEO_READBACK','无法验证与活动文档绑定的视频识别结果');
  // Return only reviewed fields. Untrusted DOM must not append secret fields.
  return {title:data.title,titleSource:data.titleSource,titleConfidence:data.titleConfidence,
    episode:data.episode,episodeConfidence:data.episodeConfidence,
    recognitionState:data.recognitionState,recognitionReason:data.recognitionReason,
    contentRevision:data.contentRevision,evidence:{title:data.evidence.title,episode:data.evidence.episode}};
}
async function injection(api,target,site,mode,nonce=''){
  let rows;
  try{
    rows=await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},
      world:'ISOLATED',func:pageVideoSVIP,args:[mode,site,nonce]});
  }catch{
    throw fail('E_VIDEO_SITE_ACCESS','Chrome 无法读取当前网站，请检查已授予的网页访问权限');
  }
  if(mode==='watch-on'){
    const item=rows?.find(row=>row.documentId===target.documentId&&row.frameId===0)?.result;
    if(item?.ok!==true||item.watching!==true)
      throw fail('E_VIDEO_WATCH_UNAVAILABLE','当前页面无法建立 DOM 变化监听；可手动重新识别');
    return {watching:true};
  }
  return checkRead(rows,target);
}
function canonical(url){
  const u=new URL(url);u.hash='';
  const keys=new Set(['v','vid','id','episode','episode_number','bvid','p']);
  for(const key of [...u.searchParams.keys()])if(!keys.has(key.toLowerCase()))u.searchParams.delete(key);
  return u.href.slice(0,4096);
}
export async function requestVideoSVIP({api,tool,operation,payload={},currentPageTarget,
  assertCurrent,assertInstalled,watchNonce=null}={}){
  if(tool?.id!==VIDEO_SVIP_ID||!tool?.capabilities?.includes(VIDEO_SVIP_CAPABILITY)||
     !VIDEO_SVIP_OPERATIONS.includes(operation))
    throw fail('E_VIDEO_CAPABILITY','当前工具没有视频识别权限');
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length)
    throw fail('E_SCHEMA','视频识别不接受网页脚本、选择器、tabId 或其他参数');
  if(typeof assertCurrent!=='function'||typeof assertInstalled!=='function'||
     typeof currentPageTarget?.capture!=='function'||typeof currentPageTarget?.revalidate!=='function')
    throw fail('E_VIDEO_UNAVAILABLE','当前可信宿主未准备好');
  assertCurrent();await assertInstalled();
  if(operation==='videoSVIP.stop'){assertCurrent();return {stopped:true};}
  if(typeof api?.scripting?.executeScript!=='function'||
     typeof api?.webNavigation?.getAllFrames!=='function')
    throw fail('E_VIDEO_UNAVAILABLE','此 Chrome 缺少固定网页读取能力');
  const target=currentPageTarget.capture();
  if(!target.origin||!Number.isSafeInteger(target.tabId)||!target.documentId)
    throw fail('E_VIDEO_TARGET','请选择普通 HTTP(S) 视频网页');
  const site=videoSVIPSiteFor(target.url);
  await currentPageTarget.revalidate(target);assertCurrent();await assertInstalled();
  if(!site){
    return operation==='videoSVIP.watch'?{watching:false,reason:'unsupported-site'}:{
      siteId:null,siteName:null,domain:null,canonicalPageUrl:canonical(target.url),
      title:null,titleSource:'none',titleConfidence:'none',episode:'unknown',
      episodeConfidence:'none',recognitionState:'unsupported',recognitionReason:'unsupported-site',
      contentRevision:null,partial:false,evidence:{title:'',episode:''}};
  }
  const frames=await api.webNavigation.getAllFrames({tabId:target.tabId});
  rootFrame(frames,target);
  const partial=frames.some(row=>row?.frameId!==0&&row?.errorOccurred!==true);
  const check=async()=>{
    await currentPageTarget.revalidate(target);assertCurrent();await assertInstalled();
  };
  await check();
  if(operation==='videoSVIP.watch'){
    if(typeof watchNonce!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(watchNonce))
      throw fail('E_SCHEMA','DOM 监听会话无效');
    const result=await injection(api,target,site,'watch-on',watchNonce);
    await check();
    return result;
  }
  let first=null,second=null;
  for(let attempt=0;attempt<3;attempt++){
    first=await injection(api,target,site,'inspect');await check();
    await new Promise(resolve=>setTimeout(resolve,125));
    await check();
    second=await injection(api,target,site,'inspect');await check();
    if(first.contentRevision===second.contentRevision&&
       first.title===second.title&&JSON.stringify(first.episode)===JSON.stringify(second.episode))
      break;
    if(attempt===2)second=null;
  }
  if(!second)return {siteId:site.id,siteName:site.name,domain:new URL(target.url).hostname,
    canonicalPageUrl:canonical(target.url),title:null,titleSource:'none',titleConfidence:'none',
    episode:'unknown',episodeConfidence:'none',recognitionState:'changing',
    recognitionReason:'content-changed-during-read',contentRevision:null,partial,
    evidence:{title:'',episode:''}};
  return {siteId:site.id,siteName:site.name,domain:new URL(target.url).hostname,
    canonicalPageUrl:canonical(target.url),...second,partial};
}
