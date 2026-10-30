(function(){
'use strict';

/* R0.4A: source identity, eligibility, deterministic ranking and bounded playback.
   No third-party player control, network discovery or remote URL forwarding. */
const SOURCE_TYPES=new Set(['OFFICIAL_LINK','AUTHORIZED_MEDIA','CATALOG_ONLY','UNAVAILABLE']);
class SourceRegistry{
 constructor(){this.byId=new Map();}
 add(input){
  if(!input||!(/^[a-z0-9][a-z0-9:._-]{2,79}$/.test(input.sourceId||''))||!SOURCE_TYPES.has(input.type))
   throw Error('Invalid source identity or type');
  if(this.byId.has(input.sourceId))throw Error('Duplicate sourceId: '+input.sourceId);
  const pick=(value,allowed)=>allowed.includes(value)?value:'UNKNOWN';
  const row=Object.freeze({
   sourceId:input.sourceId,type:input.type,label:String(input.label||'未知来源').slice(0,70),
   platform:String(input.platform||'UNKNOWN').slice(0,40),
   contentKey:typeof input.contentKey==='string'?input.contentKey:'UNKNOWN',
   authorization:pick(input.authorization,['APPROVED','DENIED','UNKNOWN']),
   rights:pick(input.rights,['SELF_AUTHORED','CONTRACTED','NONE','UNKNOWN']),
   region:pick(input.region,['SUPPORTED','UNSUPPORTED','UNKNOWN']),
   entitlement:pick(input.entitlement,['VERIFIED','SELF_REPORTED','NOT_REQUIRED','NONE','UNKNOWN']),
   availability:pick(input.availability,['AVAILABLE','UNAVAILABLE','UNKNOWN']),
   verificationLevel:pick(input.verificationLevel,['OWNED_VIDEO_EVENTS','OFFICIAL_URL','CATALOG','UNKNOWN']),
   lastOutcome:pick(input.lastOutcome,['VERIFIED','FAILED','UNKNOWN']),
   checkedAt:typeof input.checkedAt==='number'&&Number.isFinite(input.checkedAt)?input.checkedAt:'UNKNOWN',
   cost:typeof input.cost==='number'&&Number.isFinite(input.cost)&&input.cost>=0?input.cost:'UNKNOWN',
   mediaUrl:typeof input.mediaUrl==='string'?input.mediaUrl:null,
   pageUrl:typeof input.pageUrl==='string'?input.pageUrl:null
  });
  this.byId.set(row.sourceId,row);return row;
 }
 list(){return [...this.byId.values()];}
}
const sourceContentKey=ctx=>{
 if(!ctx?.siteId||!ctx?.title||ctx.recognitionState!=='recognized')return 'UNKNOWN';
 const ep=ctx.episode==='unknown'?'single-or-unknown':
  String(ctx.episode.season??0)+'-'+String(ctx.episode.number);
 return [ctx.siteId,String(ctx.title).trim(),ep].join('|');
};
function rankSources(items,{contentKey='UNKNOWN',preferredSourceId=null}={}){
 const rows=items.map(source=>{
  const exact=contentKey!=='UNKNOWN'&&source.contentKey===contentKey;
  const openable=source.type==='OFFICIAL_LINK'&&Boolean(source.pageUrl)&&source.availability!=='UNAVAILABLE';
  const playable=source.type==='AUTHORIZED_MEDIA'&&exact&&
   source.authorization==='APPROVED'&&source.rights==='SELF_AUTHORED'&&
   source.region==='SUPPORTED'&&source.entitlement==='NOT_REQUIRED'&&
   source.availability!=='UNAVAILABLE'&&source.verificationLevel==='OWNED_VIDEO_EVENTS'&&Boolean(source.mediaUrl);
  const reason=playable?'自制授权媒体 · 作品匹配 · 无需额外付费':
   openable?'官方页面入口可打开 · 权益与实际播放未核验':
   source.authorization==='DENIED'?'来源未授权，禁止播放':
   source.region==='UNSUPPORTED'?'当前地区不适用':
   source.entitlement==='NONE'?'未核验观看权益':
   source.type==='CATALOG_ONLY'?'仅渠道信息 · 不可观测播放':
   source.availability==='UNAVAILABLE'?'来源已知不可用':
   source.type==='AUTHORIZED_MEDIA'?'匹配、权益或授权证据不足':'暂不可用';
  const tier=playable?0:openable?1:2;
  const score=[
   tier,exact?0:1,source.region==='SUPPORTED'?0:source.region==='UNKNOWN'?1:2,
   source.entitlement==='VERIFIED'||source.entitlement==='NOT_REQUIRED'?0:source.entitlement==='SELF_REPORTED'?1:2,
   source.cost==='UNKNOWN'?1:0,source.cost==='UNKNOWN'?0:source.cost,
   source.lastOutcome==='VERIFIED'?0:source.lastOutcome==='UNKNOWN'?1:2,
   preferredSourceId===source.sourceId?0:1
  ];
  return {source,exact,playable,openable,reason,score};
 });
 return rows.sort((a,b)=>{
  for(let i=0;i<a.score.length;i++)if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];
  return a.source.sourceId.localeCompare(b.source.sourceId);
 });
}
function createSourceOrchestrator({playOwned,stopOwned,inspectOwned,onUpdate=()=>{},maxFallbacks=1,timeoutMs=5500}){
 let version=0,active=null,snapshot={status:'IDLE',operationId:null,sourceId:null,attempts:[]};
 const publish=(next,ticket)=>{
  if(ticket!==version)return;
  snapshot={...snapshot,...next};onUpdate({...snapshot});
 };
 function cancel(reason='STOPPED'){
  ++version;active?.abort();active=null;stopOwned();
  snapshot={status:reason,operationId:null,sourceId:null,attempts:[]};
  onUpdate({...snapshot});
 }
 function start(rows,{sourceId=null}={}){
  cancel('REPLACED');
  const token=version,controller=new AbortController();
  active=controller;
  const allowed=rows.filter(row=>row.playable);
  const preferred=sourceId?allowed.find(row=>row.source.sourceId===sourceId):allowed[0];
  const queue=preferred?[preferred,...allowed.filter(row=>row!==preferred)]:[];
  const operationId='svip-'+Date.now().toString(36)+'-'+token.toString(36);
  publish({status:'PREPARING',sourceId:preferred?.source.sourceId||null,operationId,attempts:[]},token);
  if(!preferred){
   publish({status:'ALL_UNAVAILABLE'},token);
   active=null;return Promise.resolve({...snapshot});
  }
  // Called synchronously from a user click: first HTMLMediaElement.play() retains user activation.
  const perform=async()=>{
   const attempts=[];
   for(let i=0;i<Math.min(queue.length,1+maxFallbacks);i++){
    if(controller.signal.aborted||token!==version)return {...snapshot};
    const row=queue[i];publish({status:i?'FALLBACK':'PREPARING',sourceId:row.source.sourceId,attempts:[...attempts]},token);
    let result;
    try{result=await playOwned(row.source,controller.signal,timeoutMs);}
    catch{result={outcome:'UNKNOWN',reason:'UNEXPECTED_PLAYER_ERROR'};}
    if(controller.signal.aborted||token!==version)return {...snapshot};
    const outcome=['VERIFIED','FAILED','UNKNOWN','GESTURE_REQUIRED'].includes(result?.outcome)?result.outcome:'UNKNOWN';
    attempts.push({sourceId:row.source.sourceId,outcome,reason:String(result?.reason||'UNKNOWN').slice(0,80)});
    if(outcome==='VERIFIED'){
     publish({status:'PLAYING_VERIFIED',sourceId:row.source.sourceId,attempts:[...attempts]},token);
     active=null;return {...snapshot};
    }
    // Unknown and browser gesture denial do NOT trigger automatic retries.
    if(outcome!=='FAILED'){
     publish({status:outcome==='GESTURE_REQUIRED'?'NEEDS_USER_ACTION':'UNKNOWN',attempts:[...attempts]},token);
     active=null;return {...snapshot};
    }
    stopOwned();
   }
   publish({status:'ALL_FAILED',attempts:[...attempts]},token);active=null;return {...snapshot};
  };
  return perform();
 }
 function readback(){
  const observation=inspectOwned();
  return {...snapshot,observation:observation&&typeof observation==='object'?{...observation}:null};
 }
 return {start,cancel,readback};
}
function makeOwnedPlayer(video,allowedUrls){
 function stop(){
  if(!video)return;
  video.pause();video.removeAttribute('src');video.load();delete video.dataset.vpSourceId;
 }
 function inspect(){
  if(!video)return null;
  return {sourceId:video.dataset.vpSourceId||null,paused:video.paused,ended:video.ended,
   readyState:video.readyState,currentTime:Number(video.currentTime)||0,
   videoWidth:video.videoWidth||0,errorCode:video.error?.code??null};
 }
 function play(source,signal,timeoutMs){
  if(!video||!allowedUrls.has(source.mediaUrl))
   return Promise.resolve({outcome:'UNKNOWN',reason:'MEDIA_NOT_ADMITTED'});
  stop();video.dataset.vpSourceId=source.sourceId;video.src=source.mediaUrl;
  // The play() call is issued during the originating user gesture.
  return new Promise(resolve=>{
   let done=false,timer=null;
   const beginning=Number(video.currentTime)||0;
   const finish=(outcome,reason)=>{
    if(done)return;done=true;clearTimeout(timer);
    for(const [event,handler] of listeners)video.removeEventListener(event,handler);
    signal.removeEventListener('abort',aborted);
    resolve({outcome,reason});
   };
   const aborted=()=>finish('CANCELLED','ABORTED');
   const progress=()=>{
    let frames=null;
    try{frames=video.getVideoPlaybackQuality?.().totalVideoFrames??null;}catch{}
    if(video.readyState>=2&&!video.paused&&video.videoWidth>0&&
       video.currentTime-beginning>=0.08&&(frames===null||frames>0))
      finish('VERIFIED','VIDEO_FRAME_AND_TIME_ADVANCED');
   };
   const failed=()=>finish('FAILED','MEDIA_ERROR_'+(video.error?.code??'UNKNOWN'));
   const listeners=[['timeupdate',progress],['playing',progress],['loadeddata',progress],['error',failed]];
   for(const [event,handler] of listeners)video.addEventListener(event,handler);
   signal.addEventListener('abort',aborted,{once:true});
   timer=setTimeout(()=>finish('UNKNOWN','PLAYBACK_NOT_OBSERVED_BEFORE_DEADLINE'),timeoutMs);
   if(signal.aborted){aborted();return;}
   try{
    const promise=video.play();
    Promise.resolve(promise).then(progress,error=>{
     if(signal.aborted){aborted();return;}
     finish(error?.name==='NotAllowedError'?'GESTURE_REQUIRED':'FAILED',
      error?.name==='NotAllowedError'?'USER_GESTURE_REQUIRED':'PLAY_REJECTED');
    });
   }catch(error){finish(error?.name==='NotAllowedError'?'GESTURE_REQUIRED':'FAILED','PLAY_THROWN');}
  });
 }
 return {play,stop,inspect};
}

const bridge=globalThis.OpenDeskTool;
if(!bridge?.root||typeof bridge.request!=='function')return;
const {root,request}=bridge,el=id=>root.querySelector('#'+id);
const PROVIDERS=Object.freeze([
 {id:'tencent',name:'腾讯视频'},{id:'iqiyi',name:'爱奇艺'},
 {id:'youku',name:'优酷'},{id:'mango',name:'芒果 TV'},
 {id:'bilibili',name:'哔哩哔哩'}
]);
const SHARE_KEYS=new Set(['vid','v','id','ep','episode','p','bvid','aid','cid','season_id','episode_id']);
let page=null,memberRecords=[],etag=null,storageReady=false,writing=false;
let closed=false,stopped=false,pageEpoch=0,eventTimer=null;
function flash(text='',kind=''){
 const node=el('vp-flash');node.textContent=text;node.dataset.kind=kind;node.hidden=!text;
}
function safeUrl(input){
 if(typeof input!=='string'||input.length>4096)return null;
 try{const u=new URL(input);return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password?u:null;}
 catch{return null;}
}
function shareUrl(u){
 if(!u)return '';
 const safe=new URL(u.href);safe.hash='';
 for(const key of [...safe.searchParams.keys()])if(!SHARE_KEYS.has(key.toLowerCase()))safe.searchParams.delete(key);
 return safe.href;
}

const previewMode=bridge.demoMode==='R04A_AUTHORIZED_MEDIA'&&
 /\/projects\/video-svip\/preview\/index\.html$/.test(globalThis.location?.pathname||'');
const playerNode=el('vp-owned-video');
const mediaUrls=previewMode?Object.freeze({
 good:new URL('../../video-downloader/tests/fixtures/tiny.mp4',globalThis.location.href).href,
 bad:new URL('./__r04a_missing_media__.mp4',globalThis.location.href).href
}):Object.freeze({});
const admittedMedia=new Set(previewMode?[mediaUrls.good,mediaUrls.bad]:[]);
const owned=makeOwnedPlayer(playerNode,admittedMedia);
let sourceRows=[],lastContentKey='UNKNOWN',sessionPreferred=null;
const orchestrator=createSourceOrchestrator({
 playOwned:owned.play,stopOwned:owned.stop,inspectOwned:owned.inspect,
 onUpdate:()=>paintSources()
});
function discoverSources(){
 const ctx=page?.context,registry=new SourceRegistry();
 if(!ctx?.siteId||!page?.url)return [];
 const contentKey=sourceContentKey(ctx),official=page.url;
 registry.add({sourceId:'official:'+ctx.siteId,type:'OFFICIAL_LINK',
  label:(ctx.siteName||'当前平台')+' · 原站入口',platform:ctx.siteId,
  contentKey,authorization:'UNKNOWN',rights:'UNKNOWN',region:'UNKNOWN',
  entitlement:memberRecords.some(r=>r.id===ctx.siteId)?'SELF_REPORTED':'UNKNOWN',
  availability:'UNKNOWN',verificationLevel:'OFFICIAL_URL',pageUrl:official.href});
 // Media sources exist only in a separately labelled preview; no remote
 // VIP parser or arbitrary media URL is admitted into production.
 if(previewMode&&ctx.siteId==='fixture'&&contentKey!=='UNKNOWN'){
  const scene=String(bridge.demoScene||'');
  const media=(id,label,url,props={})=>registry.add({
   sourceId:'demo:'+id,type:'AUTHORIZED_MEDIA',label,platform:'self-authored',
   contentKey,authorization:'APPROVED',rights:'SELF_AUTHORED',
   region:'SUPPORTED',entitlement:'NOT_REQUIRED',cost:0,
   availability:'UNKNOWN',verificationLevel:'OWNED_VIDEO_EVENTS',mediaUrl:url,...props
  });
  if(scene==='r04a-fallback'){media('a-fails','测试来源 A · 确定失败',mediaUrls.bad);
   media('b-backup','测试来源 B · 自制视频',mediaUrls.good);}
  else if(scene==='r04a-unavailable'){media('a-fails','测试来源 A · 失效',mediaUrls.bad);
   media('b-fails','测试来源 B · 失效',mediaUrls.bad);}
  else if(scene==='r04a-unauthorized')media('denied','测试来源 · 未获授权',mediaUrls.good,{authorization:'DENIED'});
  else if(scene==='r04a-region')media('wrong-region','测试来源 · 地区不符',mediaUrls.good,{region:'UNSUPPORTED'});
  else if(scene==='r04a-entitlement')media('no-right','测试来源 · 无权益',mediaUrls.good,{entitlement:'NONE'});
  else if(scene==='r04a-unknown')registry.add({
   sourceId:'demo:iframe',type:'CATALOG_ONLY',label:'跨域 iframe · 不可观测',
   platform:'external-iframe',contentKey,authorization:'UNKNOWN',region:'UNKNOWN',
   entitlement:'UNKNOWN',availability:'UNKNOWN',verificationLevel:'CATALOG'
  });
  else if(scene==='r04a-manual'){media('manual-a','自制测试片 A',mediaUrls.good);
   media('manual-b','自制测试片 B',mediaUrls.good);}
  else media('primary','自制授权测试视频',mediaUrls.good);
 }
 return rankSources(registry.list(),{contentKey,preferredSourceId:sessionPreferred});
}
function paintSources(){
 const panel=el('vp-source-list');if(!panel)return;
 const ctx=page?.context,valid=Boolean(ctx?.siteId&&!stopped);
 const rows=valid?sourceRows:[];
 const chosen=rows[0],state=orchestrator.readback();
 el('vp-source-reason').textContent=chosen?.reason||'当前没有确认可用的候选来源';
 el('vp-source-name').textContent=chosen?.source.label||'暂无推荐来源';
 const action=el('vp-source-play');
 if(action){action.hidden=!chosen?.playable;action.disabled=!valid;action.textContent='播放授权测试媒体';}
 const description={
  IDLE:'等待用户操作',REPLACED:'已取消旧操作',PREPARING:'正在使用真实视频元素验证…',
  FALLBACK:'第一来源真实失败，正在尝试备用授权来源…',
  PLAYING_VERIFIED:'自有视频已出现视频帧并推进播放时间（不代表第三方会员可用）',
  ALL_FAILED:'已尝试的授权来源均明确失败',ALL_UNAVAILABLE:'没有具备播放准入的来源',
  UNKNOWN:'结果不可确认，未继续自动重试',NEEDS_USER_ACTION:'浏览器要求再次点击播放，可手动选择备用来源',
  STOPPED:'已停止测试播放',DOCUMENT_CHANGE:'作品变化，已取消旧播放',
  CLOSED:'侧边栏关闭，已清理自有播放器'
 };
 const status=el('vp-source-status');
 if(status)status.textContent=state.status==='IDLE'&&rows.some(r=>r.source.type==='CATALOG_ONLY')?
  'UNKNOWN · 跨站媒体无可用播放观测协议，不能确认成功或失败':
  description[state.status]||'等待用户操作';
 const proof=el('vp-source-evidence');
 if(proof){
  const observe=state.observation;
  proof.textContent=state.operationId?('任务 '+state.operationId+' · 尝试 '+state.attempts.length+
   ' 次 · 独立读回：'+(observe?.sourceId||'无受控视频')+' / readyState '+(observe?.readyState??'UNKNOWN')+
   ' / t='+Number(observe?.currentTime||0).toFixed(2)+'s / '+(observe?.paused?'paused':'active')):
   '未启动授权播放。原站链接仅表示可以打开，不代表实际播放成功。';
 }
 panel.replaceChildren();
 if(rows.length<=1)panel.textContent='暂无其他来源。';
 for(const row of rows.slice(1)){
  const wrap=document.createElement('div');wrap.className='vp-source-row';
  const info=document.createElement('div');info.className='vp-source-info';
  const label=document.createElement('strong');label.textContent=row.source.label;
  const why=document.createElement('small');why.textContent=row.reason;
  info.append(label,why);wrap.append(info);
  if(row.playable){
   const button=document.createElement('button');button.type='button';
   button.className='vp-secondary';button.textContent='播放';
   button.disabled=!valid;button.setAttribute('aria-label','播放 '+row.source.label);
   button.addEventListener('click',()=>startOwned(row.source.sourceId));
   wrap.append(button);
  }else if(row.openable){
   const link=document.createElement('a');link.className='vp-secondary';link.textContent='打开';
   link.href=row.source.pageUrl;link.target='_blank';link.rel='noopener noreferrer';
   wrap.append(link);
  }
  panel.append(wrap);
 }
 const video=el('vp-owned-video');if(video)video.hidden=!previewMode||ctx?.siteId!=='fixture';
 const note=el('vp-source-dev-note');if(note)note.hidden=!previewMode||ctx?.siteId!=='fixture';
}
function refreshSources(){
 const nextKey=sourceContentKey(page?.context);
 if(lastContentKey!==nextKey)sessionPreferred=null;
 lastContentKey=nextKey;
 sourceRows=discoverSources();
 paintSources();
}
function startOwned(sourceId){
 if(closed||stopped||!page?.context||!previewMode)return;
 // Only the pre-admitted local self-authored test video can be played.
 const row=sourceRows.find(x=>x.source.sourceId===sourceId&&x.playable);
 if(!row)return;
 sessionPreferred=sourceId;sourceRows=discoverSources();
 const ticket=pageEpoch;
 void orchestrator.start(sourceRows,{sourceId}).then(()=>{
  if(ticket!==pageEpoch||closed||stopped)return;
  paintSources(); // independent read of the product-owned <video> state
 });
}

const statusText=ctx=>{
 if(!ctx)return '正在读取活动文档';
 if(ctx.recognitionState==='recognized')
   return ctx.episode==='unknown'?'已识别影片 · 当前集数未知':'已识别 · 与活动文档核对';
 if(ctx.recognitionState==='needs-confirmation')return '需人工确认 · 仅有弱标题证据';
 if(ctx.recognitionState==='changing')return '页面内容正在切换 · 尚未确认';
 if(ctx.recognitionState==='unsupported')return '当前页面不在视频识别范围内';
 return '无法识别影片 · 请检查页面后重试';
};
function paintPage(){
 const ctx=page?.context,siteId=ctx?.siteId;
 const site=siteId?{id:siteId,name:ctx.siteName}:null;
 const url=page?.url;
 el('vp-title').textContent=stopped?'已停止识别':ctx?.title||'未识别影片';
 el('vp-provider').textContent=site?.name||'未识别';
 el('vp-episode').textContent=ctx?.episode&&ctx.episode!=='unknown'?
  String(ctx.episode.label||'集数未知').slice(0,50):'集数未知';
 el('vp-page-state').textContent=stopped?'监听已停止 · 点击 ↻ 可重新开始':page?.error||statusText(ctx);
 el('vp-page-state').dataset.kind=page?.error?'error':
  ctx?.recognitionState==='recognized'?'ready':
  ctx?.recognitionState==='needs-confirmation'||ctx?.recognitionState==='changing'?'warn':'neutral';
 el('vp-route-state').textContent=site&&url?'原站入口':'不可用';
 const open=el('vp-open');open.hidden=!site||!url;open.href=site&&url?url.href:'#';
 el('vp-copy').disabled=!site||!url||stopped;
 el('vp-stop').disabled=stopped||closed;
 el('vp-manual-wrap').hidden=true;
 const evidence=ctx?.evidence;
 el('vp-evidence-text').textContent=page?.error||(
  ctx?'来源：'+(ctx.titleSource||'none')+' · 标题可信度：'+(ctx.titleConfidence||'none')+
  ' · 集数可信度：'+(ctx.episodeConfidence||'none')+
  ' · 标题依据：'+(evidence?.title||'无')+' · 集数依据：'+(evidence?.episode||'无')+
  ' · 页面版本：'+(ctx.contentRevision||'未确认')+
  (ctx.partial?' · iframe 未全面检测':'')+
  (page?.watchProblem?' · 自动监听不可用，请手动重新识别':''):'没有来自可信 Host 的 DOM 证据');
 if(site&&storageReady&&PROVIDERS.some(item=>item.id===site.id))
  el('vp-member-provider').value=site.id;
 refreshSources();
}
function classify(error){
 const code=String(error?.code||''),message=String(error?.message||'无法读取网页').slice(0,130);
 if(code==='E_VIDEO_SITE_ACCESS'||code==='E_VIDEO_TRUST'||/权限|授权|permission/i.test(message))
  return '网站访问或官方安装权限不足，请检查 Chrome 扩展权限';
 if(code==='E_DOCUMENT_STALE'||code==='E_VIDEO_TARGET')
  return '视频网页正在切换，旧识别结果已废弃，请重试';
 return code?code+'：'+message:message;
}
async function refresh({resume=false}={}){
 if(closed||stopped&&!resume)return;
 if(eventTimer!==null){clearTimeout(eventTimer);eventTimer=null;}
 if(resume)stopped=false;
 const ticket=++pageEpoch;
 orchestrator.cancel('DOCUMENT_CHANGE');page=null;paintPage();
 let watchProblem=false;
 try{
  try{const watch=await request('videoSVIP.watch',{});watchProblem=watch?.watching!==true;}
  catch{watchProblem=true;}
  if(ticket!==pageEpoch||closed||stopped)return;
  const ctx=await request('videoSVIP.inspect',{});
  if(ticket!==pageEpoch||closed||stopped)return;
  if(!ctx||!['recognized','needs-confirmation','unrecognized','unsupported','changing'].includes(ctx.recognitionState)||
    ctx.title!==null&&typeof ctx.title!=='string'||
    !(ctx.episode==='unknown'||ctx.episode&&typeof ctx.episode.label==='string'))
   throw Error('Host 返回了无效的视频识别结果');
  page={context:ctx,url:safeUrl(ctx.canonicalPageUrl),watchProblem};
  paintPage();
 }catch(error){
  if(ticket!==pageEpoch||closed||stopped)return;
  page={error:classify(error)};
  paintPage();
 }
}
function invalidateAndSchedule(){
 if(closed||stopped)return;
 ++pageEpoch;orchestrator.cancel('DOCUMENT_CHANGE');page=null;paintPage();
 if(eventTimer!==null)clearTimeout(eventTimer);
 eventTimer=setTimeout(()=>{eventTimer=null;void refresh();},230);
}
function stop(){
 if(stopped||closed)return;
 stopped=true;++pageEpoch;orchestrator.cancel('STOPPED');
 if(eventTimer!==null){clearTimeout(eventTimer);eventTimer=null;}
 page=null;paintPage();
 // The trusted Host releases its MutationObserver port; this response must
 // never turn an already stopped UI back on.
 void request('videoSVIP.stop',{}).catch(()=>{});
}
async function share(){
 if(!page?.context?.siteId||!page.url||stopped)return;
 const address=shareUrl(page.url);
 try{
  if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');
  await globalThis.navigator.clipboard.writeText(address);
  flash('已复制原站视频页面链接。');
 }catch{
  el('vp-manual-wrap').hidden=false;el('vp-manual').value=address;
  el('vp-manual').focus();el('vp-manual').select();
  flash('无法访问剪贴板，请复制已选中的链接。');
 }
}
function validDate(input){
 if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input))return false;
 const parsed=new Date(input+'T00:00:00Z');
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===input;
}
function validRecords(rows){
 return Array.isArray(rows)&&rows.length<=PROVIDERS.length&&new Set(rows.map(r=>r?.id)).size===rows.length&&
  rows.every(r=>r&&Object.keys(r).sort().join(',')==='expiry,id'&&PROVIDERS.some(p=>p.id===r.id)&&validDate(r.expiry));
}
function memberName(id){return PROVIDERS.find(p=>p.id===id)?.name||'';}
function renderRecords(){
 const target=el('vp-member-list');target.replaceChildren();
 if(!storageReady){target.textContent='会员记录暂不可写；请检查本机存储。';el('vp-member-save').disabled=true;return;}
 if(!memberRecords.length){const empty=document.createElement('p');empty.className='vp-empty';empty.textContent='尚未登记会员到期日期。';target.append(empty);}
 for(const record of memberRecords){
  const row=document.createElement('div');row.className='vp-member-row';
  const name=document.createElement('strong');name.textContent=memberName(record.id);
  const expiry=document.createElement('span');expiry.textContent=record.expiry+' · 手动登记';
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';
  remove.title='删除记录';remove.setAttribute('aria-label','删除 '+memberName(record.id)+' 的记录');
  remove.disabled=writing;remove.addEventListener('click',()=>void removeMember(record.id));
  row.append(name,expiry,remove);target.append(row);
 }
 el('vp-member-save').disabled=writing;
}
async function restoreMembers(){
 try{
  const read=await request('storage.get',{key:'memberships',withEtag:true});
  if(typeof read?.etag!=='string'||!/^[0-9a-f]{64}$/.test(read.etag))throw Error('存储版本不可核验');
  const rows=read.value===null?[]:read.value;
  if(!validRecords(rows))throw Error('已有记录格式异常，禁止覆盖');
  memberRecords=rows;etag=read.etag;storageReady=true;renderRecords();refreshSources();
  if(page?.site)el('vp-member-provider').value=page.site.id;
 }catch(error){storageReady=false;renderRecords();flash('本机存储读取失败：'+String(error.message||error).slice(0,120),'error');}
}
async function writeMembers(next,success){
 if(!storageReady||writing||!validRecords(next))return;
 writing=true;renderRecords();
 try{
  const result=await request('storage.set',{key:'memberships',value:next,ifMatch:etag});
  if(typeof result?.etag!=='string'||!/^[0-9a-f]{64}$/.test(result.etag))throw Error('保存结果不可核验');
  memberRecords=next;etag=result.etag;flash(success);
 }catch(error){
  flash('未确认保存成功；为避免覆盖其他窗口更改，请重开工具核对：'+String(error?.message||error).slice(0,120),'error');
  storageReady=false;
 }finally{writing=false;renderRecords();refreshSources();}
}
async function removeMember(id){
 if(!storageReady||writing)return;
 await writeMembers(memberRecords.filter(row=>row.id!==id),'记录已从本机移除。');
}
el('vp-member-form').addEventListener('submit',event=>{
 event.preventDefault();if(!storageReady||writing)return;
 const id=el('vp-member-provider').value,expiry=el('vp-member-expiry').value;
 if(!PROVIDERS.some(p=>p.id===id)||!validDate(expiry)){flash('请选择网站和有效的到期日期。','error');return;}
 const next=[...memberRecords.filter(row=>row.id!==id),{id,expiry}];
 void writeMembers(next,'到期日期已保存到本机（未验证真实会员权益）。');
});
for(const tab of root.querySelectorAll('[data-vp-tab]'))tab.addEventListener('click',()=>{
 const mode=tab.dataset.vpTab;
 for(const control of root.querySelectorAll('[data-vp-tab]'))control.setAttribute('aria-pressed',String(control.dataset.vpTab===mode));
 el('vp-watch').hidden=mode!=='watch';el('vp-member').hidden=mode!=='member';flash('');
});
el('vp-refresh').addEventListener('click',()=>void refresh({resume:true}));
el('vp-recheck').addEventListener('click',()=>void refresh({resume:true}));
el('vp-stop').addEventListener('click',stop);
el('vp-copy').addEventListener('click',()=>void share());
el('vp-source-play')?.addEventListener('click',()=>{const first=sourceRows.find(row=>row.playable);if(first)startOwned(first.source.sourceId);});
root.addEventListener('opendesk-page-changed',invalidateAndSchedule);
window.addEventListener('focus',()=>{if(!stopped)invalidateAndSchedule();});
window.addEventListener('pagehide',()=>{
 closed=true;stopped=true;++pageEpoch;orchestrator.cancel('CLOSED');
 if(eventTimer!==null)clearTimeout(eventTimer);
},{once:true});
void Promise.all([refresh(),restoreMembers()]);
})();
