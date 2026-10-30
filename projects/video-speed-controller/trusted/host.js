import {VIDEO_SPEED_ID,VIDEO_SPEED_CAPABILITY,VIDEO_SPEED_OPERATIONS,validVideoSpeed} from './policy.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});

// Chrome serializes THIS fixed function into the isolated world of an exact
// webNavigation document. It must remain self-contained; sandbox JS is never
// passed to executeScript and never gains access to chrome.scripting.
//
// Results contain only bounded numbers and booleans, never source URLs, DOM
// text, media stream identifiers or other private webpage information.
export function pageVideoSpeed(mode,speed,index=-1,nonce='') {
  // Trusted fixed function installed in an isolated document. The listener
  // signals keys only; it cannot mutate media or authorize an operation.
  if(mode==='shortcut-on'||mode==='shortcut-off'){
    const key='__opendeskVideoSpeedShortcutListener_v1';
    const existing=globalThis[key];
    if(existing?.listener)document.removeEventListener('keydown',existing.listener,true);
    delete globalThis[key];
    if(mode==='shortcut-off')return {found:false,count:0,shortcuts:false};
    const runtime=globalThis.chrome?.runtime;
    if(typeof nonce!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(nonce)||
      typeof runtime?.sendMessage!=='function'||typeof document.addEventListener!=='function')
      return {found:false,count:0,shortcuts:false};
    const listener=event=>{
      if(event?.isTrusted!==true||event.repeat||event.isComposing||event.defaultPrevented||
         event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      if(event.target?.isContentEditable||
         event.target?.closest?.('input,textarea,select,[contenteditable],[role="textbox"]'))return;
      const path=typeof event.composedPath==='function'?event.composedPath().slice(0,16):[];
      if(path.some(node=>node?.isContentEditable||
        ['INPUT','TEXTAREA','SELECT'].includes(node?.tagName)||
        node?.getAttribute?.('role')==='textbox'))return;
      const hotkey=String(event.key||'').toLowerCase();
      if(hotkey!=='s'&&hotkey!=='d'&&hotkey!=='r')return;
      // Never preventDefault: a closed or revoked tool must not intercept the
      // website's own keyboard behavior. Only an admitted Host may write.
      try{
        const result=runtime.sendMessage({protocol:'opendesk.video-speed.shortcut.v1',
          nonce,key:hotkey});
        if(result&&typeof result.catch==='function')result.catch(()=>{});
      }catch{/* Side Panel closed. No mutation in the page listener. */}
    };
    document.addEventListener('keydown',listener,true);
    globalThis[key]={listener};
    return {found:false,count:0,shortcuts:true};
  }
  const nodes=Array.from(document.querySelectorAll('video')).slice(0,48);
  let best=null,bestIndex=-1,bestScore=-1;
  for(let i=0;i<nodes.length;i++){
    const video=nodes[i];
    const playing=!video.paused&&!video.ended;
    let area=0;
    try{
      const rect=video.getBoundingClientRect();
      area=Math.max(0,rect.width)*Math.max(0,rect.height);
    }catch{/* Detached/virtual media may not have a box. */}
    const score=(playing?1000000000:0)+Math.min(99999999,Math.floor(area));
    if(score>bestScore){bestScore=score;best=video;bestIndex=i;}
  }
  const chosen=Number.isInteger(index)&&index>=0?nodes[index]:best;
  const chosenIndex=Number.isInteger(index)&&index>=0?index:bestIndex;
  if(!chosen)return {found:false,count:nodes.length};
  const playing=!chosen.paused&&!chosen.ended;
  if(mode==='set'){
    if(typeof speed!=='number'||!Number.isFinite(speed)||speed<0.25||speed>4)
      return {found:true,count:nodes.length,applied:false};
    try{chosen.playbackRate=speed;}
    catch{return {found:true,count:nodes.length,applied:false};}
  }
  return {found:true,count:nodes.length,index:chosenIndex,playing,
    score:bestScore,speed:Number(chosen.playbackRate),
    ...(mode==='set'?{applied:true}:{})};
}

function checkedResult(injections,frame) {
  if(!Array.isArray(injections))return null;
  const row=injections.find(item=>item?.documentId===frame.documentId&&item?.frameId===frame.frameId);
  const result=row?.result;
  return result&&typeof result==='object'&&
    typeof result.found==='boolean'&&Number.isInteger(result.count)&&
    result.count>=0&&result.count<=48?result:null;
}

function admittedFrame(frame) {
  if(!frame||typeof frame.documentId!=='string'||!frame.documentId||
     !Number.isSafeInteger(frame.frameId)||frame.frameId<0||
     frame.errorOccurred||frame.documentLifecycle&&frame.documentLifecycle!=='active')
    return false;
  try {const u=new URL(frame.url);return ['http:','https:'].includes(u.protocol);}
  catch {return false;}
}
async function inject(api,tabId,frame,mode,speed=null,index=-1,nonce='') {
  // documentIds (Chrome 106+) prevents a navigated/recycled frame from
  // receiving an operation intended for an earlier document.
  const results=await api.scripting.executeScript({
    target:{tabId,documentIds:[frame.documentId]},
    world:'ISOLATED',func:pageVideoSpeed,args:[mode,speed,index,nonce]
  });
  const result=checkedResult(results,frame);
  if(!result)throw fail('E_VIDEO_READBACK','视频脚本未返回与目标文档匹配的结果');
  return result;
}
export async function requestVideoSpeed({
  api,tool,operation,payload,currentPageTarget,revocationEpoch,
  assertCurrent,assertInstalled,shortcutNonce=null
}={}) {
  if(tool?.id!==VIDEO_SPEED_ID||
     !tool?.capabilities?.includes(VIDEO_SPEED_CAPABILITY)||
     !VIDEO_SPEED_OPERATIONS.includes(operation))
    throw fail('E_VIDEO_CAPABILITY','视频倍速操作未经当前正式产品授权');
  const args=payload??{};
  if(!args||typeof args!=='object'||Array.isArray(args))
    throw fail('E_SCHEMA','视频倍速参数无效');
  const read=operation==='videoSpeed.status';
  const set=operation==='videoSpeed.set';
  const enableKeys=operation==='videoSpeed.shortcuts.enable';
  const disableKeys=operation==='videoSpeed.shortcuts.disable';
  if(set?(Object.keys(args).length!==1||!Object.hasOwn(args,'speed')||
      !validVideoSpeed(args.speed)):Object.keys(args).length!==0)
    throw fail('E_SCHEMA','倍速参数无效，应为 0.25×～4×');
  if(enableKeys&&(typeof shortcutNonce!=='string'||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(shortcutNonce)))
    throw fail('E_SCHEMA','快捷键会话令牌无效');
  if(typeof api?.scripting?.executeScript!=='function'||
     typeof api?.webNavigation?.getAllFrames!=='function'||
     typeof currentPageTarget?.capture!=='function'||
     typeof currentPageTarget?.revalidate!=='function'||
     typeof assertCurrent!=='function'||typeof assertInstalled!=='function')
    throw fail('E_VIDEO_UNAVAILABLE','当前 Chrome 视频控制能力不可用');
  assertCurrent();
  await assertInstalled();
  assertCurrent();
  const target=currentPageTarget.capture();
  if(!target.origin||!Number.isSafeInteger(target.tabId)||!target.documentId)
    throw fail('E_VIDEO_TARGET','请选择普通网页中的视频');
  const assertLiveTarget=()=>{
    assertCurrent();
    const live=currentPageTarget.capture();
    if(['windowId','tabId','documentId','url','origin'].some(key=>live[key]!==target[key]))
      throw fail('E_DOCUMENT_STALE','网页已切换，请重新检测视频');
  };
  await currentPageTarget.revalidate(target);
  assertCurrent();
  await assertInstalled();
  assertLiveTarget();
  const frames=await api.webNavigation.getAllFrames({tabId:target.tabId});
  if(!Array.isArray(frames))throw fail('E_VIDEO_DOCUMENT','无法检测当前网页的视频文档');
  const top=frames.find(row=>row?.frameId===0);
  if(top?.documentId!==target.documentId||top.url!==target.url)
    throw fail('E_DOCUMENT_STALE','网页正在导航，请刷新视频状态');
  const eligible=frames.filter(admittedFrame);
  // Bound per-click work; top frame is first, then currently active child frames.
  eligible.sort((a,b)=>a.frameId===0?-1:b.frameId===0?1:a.frameId-b.frameId);
  const truncated=eligible.length>16;
  const selectedFrames=eligible.slice(0,16);
  if(enableKeys||disableKeys){
    const frame=selectedFrames.find(row=>row.frameId===0&&row.documentId===target.documentId);
    if(!frame)throw fail('E_VIDEO_SITE_ACCESS','当前网页无法使用快捷键');
    await currentPageTarget.revalidate(target);
    assertCurrent();await assertInstalled();
    assertLiveTarget();
    const outcome=await inject(api,target.tabId,frame,
      enableKeys?'shortcut-on':'shortcut-off',null,-1,enableKeys?shortcutNonce:'');
    await currentPageTarget.revalidate(target);
    assertCurrent();await assertInstalled();
    assertLiveTarget();
    if(outcome.shortcuts!==enableKeys)
      throw fail('E_VIDEO_SHORTCUT','网页快捷键监听无法完成');
    return {enabled:enableKeys};
  }
  let rejected=0,videoCount=0;
  const rows=await Promise.all(selectedFrames.map(async frame=>{
    try {
      assertLiveTarget();
      const data=await inject(api,target.tabId,frame,'status');
      videoCount+=data.count;
      return data.found&&Number.isFinite(data.speed)&&data.speed>=0&&
        Number.isInteger(data.index)&&data.index>=0&&
        Number.isFinite(data.score)
        ?{frame,data}:null;
    }catch{rejected++;return null;}
  }));
  await currentPageTarget.revalidate(target);
  assertCurrent();
  await assertInstalled();
  assertLiveTarget();
  const candidates=rows.filter(Boolean).sort((a,b)=>b.data.score-a.data.score);
  const chosen=candidates[0];
  const partial=truncated||rejected>0;
  if(!chosen){
    if(rejected>0&&rejected===selectedFrames.length)
      throw fail('E_VIDEO_SITE_ACCESS','Chrome 未允许访问视频网页，请检查扩展网站访问权限');
    if(!read)throw fail('E_VIDEO_NOT_FOUND','当前网页没有检测到可控制的 HTML5 视频');
    return {status:'no-video',count:0,partial};
  }
  if(read)return {status:'available',speed:chosen.data.speed,
    playing:chosen.data.playing,count:videoCount,partial};
  // One deliberate mutation on exactly one selected media element/document;
  // no background reapplication or changes to other frames/videos.
  await currentPageTarget.revalidate(target);
  assertCurrent();
  await assertInstalled();
  // No asynchronous gap may remain between this live-session check and the
  // deliberate write. Admission itself can yield while the panel/tab changes.
  assertLiveTarget();
  const applied=await inject(api,target.tabId,chosen.frame,'set',args.speed,chosen.data.index);
  if(!applied.found||applied.applied!==true)
    throw fail('E_VIDEO_CHANGED','视频已切换或播放器拒绝调整，请刷新检测');
  // Independent second injection: never claim a successful adjustment solely
  // from the setter's acknowledgement. The site may override playbackRate.
  const verified=await inject(api,target.tabId,chosen.frame,'read',null,chosen.data.index);
  await currentPageTarget.revalidate(target);
  assertCurrent();
  await assertInstalled();
  assertLiveTarget();
  if(!verified.found||!Number.isFinite(verified.speed))
    throw fail('E_VIDEO_READBACK','倍速已经请求，但无法核对实际结果；请刷新读取');
  return {status:'available',speed:verified.speed,requested:args.speed,
    verified:Math.abs(verified.speed-args.speed)<=0.02,
    playing:verified.playing,count:videoCount,partial};
}
