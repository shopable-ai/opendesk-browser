(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk,$=id=>root.querySelector('#'+id);
const list=$('vd-list'),detect=$('vd-detect'),stop=$('vd-stop'),check=$('vd-check');
const initialInfo=$('vd-info').textContent;
const finished=new Set(['complete','complete_unverified','cancelled','interrupted']);
let phase='idle',taskId=null,candidateRef=null,jobEpoch=0,scanEpoch=0,readEpoch=0,closed=false,timer=null,scanning=false,checking=false,stopWanted=false,detached=false,controls=[];
const active=()=>phase!=='idle'&&!finished.has(phase);
function message(value,error=false){const node=$('vd-message');if(node.textContent!==value)node.textContent=value;node.dataset.error=String(error);}
function refreshControls(){
 const busy=scanning||active();
 detect.disabled=busy;
 for(const control of controls){
  const {button,select,ready,used,mp4,setChoice}=control;
  button.disabled=!ready||used||busy;
  if(select)select.disabled=used||busy;
  if(mp4){mp4.disabled=button.disabled;if(button.disabled)setChoice(false);}
 }
 stop.disabled=!active()||phase==='unknown'||phase==='cancel_requested'||stopWanted||detached;
 check.hidden=phase!=='unknown';check.disabled=checking||!(taskId||candidateRef);
}
function label(state){
 return {starting:'正在启动',segments:'下载分段',assembling:'正在合并',remuxing:'正在封装 MP4',saving:'正在保存',started:'已启动',in_progress:'下载中',cancel_requested:'停止中',
 complete:'Chrome 下载完成',complete_unverified:'文件未核实',cancelled:'已取消',
 interrupted:'下载中断',unknown:'结果未知'}[state]||'未开始';
}
function status(data){
 phase=data.state||'unknown';$('vd-state').textContent=label(phase);
 const total=data.totalBytes||0,received=data.bytesReceived||0,segments=data.segmentsTotal||0,completed=data.segmentsCompleted||0;
 const progress=$('vd-progress');
 if(phase==='segments')progress.value=segments>0?Math.min(100,Math.floor(completed*100/segments)):0;
 else if(phase==='remuxing')progress.value=data.remuxTotalBytes?Math.min(100,Math.floor((data.remuxBytes||0)*100/data.remuxTotalBytes)):0;
 else if(phase==='assembling'||phase==='saving')progress.removeAttribute('value');
 else progress.value=total>0?Math.min(100,Math.floor(received*100/total)):0;
 $('vd-info').textContent=phase==='complete'
  ?'已从 Chrome 下载记录核对：文件存在、收到数据；格式及独立播放仍需本机验证。'
  :phase==='complete_unverified'?'Chrome 认为下载完成，但文件存在性/大小未得到确认。'
  :phase==='interrupted'?({E_MEDIA_CODEC_UNSUPPORTED:'当前音视频编码无法封装为 MP4。重新检测后可下载原分段。',E_MEDIA_AUDIO_CONFIG:'缺少 AAC 配置。请检测带编码信息的主清单，或下载原分段。',E_MEDIA_REMUX:'MP4 封装失败，未保存。重新检测后可下载原分段。',E_MEDIA_HTTP:'分段无法读取，可能已过期。请刷新播放器后重新检测。',E_MEDIA_TS:'有分段不是有效的 TS，未保存。请重新检测或换一个清晰度。',E_MEDIA_MP4:'有分段不是有效的 MP4，未保存。请重新检测或换一个清晰度。',E_MEDIA_PERMISSION:'网站访问权限已撤销。请检查权限后重新检测。'}[data.error]||'下载中断：'+String(data.error||'未知原因')+'。重新检测后可再试。')
  :phase==='unknown'?'下载结果未知，检查 Chrome 下载记录；不要直接重试。'
  :phase==='cancel_requested'?'正在停止分段请求或 Chrome 下载，等待状态回读。'
  :phase==='cancelled'?'下载已取消。重新检测后可选择媒体。'
  :phase==='segments'?'已下载 '+completed+' / '+segments+' 段 · '+received+' 字节'
  :phase==='remuxing'?'正在封装 MP4，保留原音视频质量，不重新编码。'
  :phase==='assembling'?'全部分段已收到，正在按原顺序合并。'
  :phase==='saving'?'正在将完整文件交给 Chrome 保存。'
  :total>0?received+' / '+total+' 字节':'进度以 Chrome 下载记录为准。';
 if(finished.has(phase)||['unknown','cancel_requested','segments','remuxing','assembling','saving','started','in_progress'].includes(phase))
  message(label(phase),['interrupted','unknown','complete_unverified'].includes(phase));
 refreshControls();
 if(finished.has(phase)||phase==='unknown')clearPoll();
}
function resetJob(){
 ++jobEpoch;++readEpoch;clearPoll();taskId=null;candidateRef=null;phase='idle';stopWanted=false;detached=false;checking=false;
 $('vd-state').textContent='未开始';$('vd-progress').value=0;$('vd-info').textContent=initialInfo;
}
function clearPoll(){if(timer!==null){clearTimeout(timer);timer=null;}}
const canRead=()=>Boolean(taskId||candidateRef);
async function readStatus(){
 if(closed||checking||!canRead())return;
 const current=jobEpoch,reading=++readEpoch;
 const live=()=>!closed&&current===jobEpoch&&reading===readEpoch;
 checking=true;refreshControls();
 try{
  const data=await request('media.status',taskId?{taskId}:{candidateId:candidateRef});
  if(live()){
   if(typeof data.taskId==='string')taskId=data.taskId;
   status(data);if(active()&&phase!=='unknown')poll();
  }
 }catch(error){if(live()){status({state:'unknown'});message('状态不可确认：'+String(error?.message||error).slice(0,120),true);}}
 finally{if(live()){checking=false;refreshControls();}}
}
function poll(){
 clearPoll();if(closed||!canRead())return;
 timer=setTimeout(readStatus,800);
}
function protectionReason(encryption){
 return encryption==='drm'?'视频受 DRM 保护':encryption==='encrypted'?'视频流已加密':'';
}
function describe(item){
 if(item.hls){
  const p=item.hls,protection=protectionReason(p.encryption);
  if(protection)return 'HLS · '+(p.kind==='media'?p.segments+' 段 · ':'')+protection+'，无法下载';
  if(p.kind==='master')return 'HLS · '+(item.mode==='ready'?'选择清晰度':'没有支持下载的清晰度');
  return ['HLS',p.segments+' 段',item.mode==='ready'?'完整点播':!p.vod?'直播或点播未结束，无法下载':'清单结构暂不支持下载'].join(' · ');
 }
 if(item.mode==='ready')return '保留原格式，直接交给 Chrome 下载';
 if(item.format==='dash')return '暂不支持合并 DASH 分段';
 if(item.note==='E_MEDIA_ORIGIN')return 'HLS 来源不受支持，无法下载';
 if(item.note==='E_MEDIA_PERMISSION')return '缺少 HLS 来源访问权限，请检查网站权限后重新检测';
 if(item.note==='E_HLS_HTTP'||item.note==='E_MEDIA_TIMEOUT')return 'HLS 清单无法读取，请刷新播放器后重新检测';
 if(item.reason==='cross-origin'&&item.format!=='hls')return '原文件与当前网页不同源，无法下载';
 return 'HLS 结构不可确认（'+(item.note||'未知')+'）· 仅检测';
}
function showCandidates(items){
 list.replaceChildren();controls=[];
 if(!items.length){list.textContent='未检测到可识别的视频源。请先播放视频，再点「检测」。部分临时地址或加密视频暂不支持。';return;}
 items.forEach((item,index)=>{
  const ready=item.mode==='ready';
  const row=document.createElement('div');row.className='vd-item';
  const info=document.createElement('div');info.className='vd-item-info';
  const name=document.createElement('strong');name.textContent=(index+1)+'. '+item.format.toUpperCase();
  const detail=document.createElement('span');detail.textContent=describe(item);info.append(name,detail);
  let select=null;
  if(item.hls?.kind==='master'&&item.hls.variants.length){
   select=document.createElement('select');select.setAttribute('aria-label','第 '+(index+1)+' 个视频的清晰度');
   const variants=[...item.hls.variants].sort((a,b)=>(a.bandwidth||Infinity)-(b.bandwidth||Infinity));
   for(const variant of variants){
    const option=document.createElement('option');option.value=variant.id;option.disabled=!variant.ready;
    option.textContent=[variant.resolution?.replace('x','×')||'未知分辨率',
     variant.bandwidth?Math.round(variant.bandwidth/1000)+' kbps':'未知码率',
     variant.segments===null?'分段未确认':variant.segments+' 段',
     variant.ready?'':protectionReason(variant.encryption)||'不可下载'].filter(Boolean).join(' · ');
    select.append(option);
   }
   select.value=variants.find(x=>x.ready)?.id||'';info.append(select);
  }
  const actions=document.createElement('div');actions.className='vd-actions';
  const button=document.createElement('button');button.type='button';actions.append(button);
  if(ready)button.addEventListener('click',()=>void start(item.id,select?.value));
  const control={id:item.id,button,select,ready,used:false};
  row.append(info,actions);
  if(ready&&item.hls){
   const method=document.createElement('span');info.append(method);
   let mp4,choice,confirm,cancel;
   if(item.hls.originalTs){
    mp4=document.createElement('button');mp4.type='button';mp4.textContent='另存为 MP4…';actions.append(mp4);
    choice=document.createElement('div');choice.className='vd-choice';choice.hidden=true;choice.id='vd-format-'+index;
    mp4.setAttribute('aria-controls',choice.id);
    const hint=document.createElement('span');hint.textContent='将支持的 H.264/AAC 分段封装为 MP4。无需重新编码，但需要额外处理。';
    confirm=document.createElement('button');confirm.type='button';confirm.textContent='封装并下载 MP4';
    cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
    choice.append(hint,confirm,cancel);row.append(choice);
    control.mp4=mp4;
    control.setChoice=open=>{choice.hidden=!open;mp4.setAttribute('aria-expanded',String(open));};
    mp4.addEventListener('click',()=>{control.setChoice(true);confirm.focus();});
    const dismiss=()=>{control.setChoice(false);mp4.focus();};
    cancel.addEventListener('click',dismiss);
    choice.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss();}});
    confirm.addEventListener('click',()=>{if(!choice.hidden)void start(item.id,select?.value,'mp4');});
   }
   const updateMethod=()=>{
    const container=select?item.hls.variants.find(variant=>variant.id===select.value)?.container:item.hls.container;
    const originalTs=container==='ts'&&item.hls.originalTs;
    if(mp4){mp4.hidden=!originalTs;control.setChoice(false);}
    button.textContent=originalTs?'合并并下载 TS':container==='fmp4'?'合并并下载 MP4':container==='ts'?'封装并下载 MP4':'下载分段';
    method.textContent=originalTs?'默认保留原封装 · 需支持 TS 的播放器':container==='fmp4'?'原分段已是 MP4，只合并分段':container==='ts'?'封装分段，无需重新编码':'';
   };
   select?.addEventListener('change',updateMethod);updateMethod();
  }else button.textContent=ready?'下载原文件 · '+item.format.toUpperCase():'不可下载';
  controls.push(control);list.append(row);
 });
 refreshControls();
}
async function scan(){
 if(closed||scanning||active())return;
 resetJob();
 const current=++scanEpoch;scanning=true;refreshControls();list.replaceChildren();controls=[];message('正在检测网页媒体…');
 try{
  const result=await request('media.detect',{});
  if(closed||current!==scanEpoch)return;
  if(!Array.isArray(result?.candidates))throw Error('媒体检测回执无效');
  showCandidates(result.candidates);
  const total=result.candidates.length,ready=result.candidates.filter(item=>item.mode==='ready').length;
  const summary=total?'已识别 '+total+' 个视频源 · '+(ready?ready+' 个可下载':'没有可下载的视频源'):'当前网页没有可识别媒体';
  message(summary+(result.partial?'（部分嵌入页面未检测）':''));
 }catch(error){if(!closed&&current===scanEpoch)message('检测失败：'+String(error?.message||error).slice(0,120),true);}
 finally{if(!closed&&current===scanEpoch){scanning=false;refreshControls();}}
}
async function start(candidateId,variantId,output){
 const control=controls.find(row=>row.id===candidateId);
 if(closed||scanning||active()||!control?.ready||control.used)return;
 control.used=true;
 const current=++jobEpoch;taskId=null;candidateRef=candidateId;stopWanted=false;detached=false;
 status({state:'starting'});message('正在启动下载…');
 try{
  const receipt=await request('media.start',{candidateId,...(variantId?{variantId}:{}),...(output?{output}:{})});
  if(closed||current!==jobEpoch)return;
  if(typeof receipt?.taskId!=='string'||!receipt.taskId)throw Error('未返回可核对的下载任务');
  taskId=receipt.taskId;
  if(!stopWanted&&!detached){status(receipt);if(!finished.has(phase)&&phase!=='unknown')message(receipt.state==='segments'?'正在下载所选清晰度的完整分段。':'已提交 Chrome，正在核对下载记录。');}
  if(active()&&phase!=='unknown')poll();
 }catch(error){
  if(!closed&&current===jobEpoch){
   const known=['E_SCHEMA','E_MEDIA_BUSY','E_MEDIA_STALE','E_MEDIA_TARGET','E_MEDIA_TRUST','E_MEDIA_PERMISSION','E_MEDIA_UNAVAILABLE','E_MEDIA_CAPABILITY','E_MEDIA_UNSUPPORTED','E_DOCUMENT_STALE'].includes(error?.code);
   if(stopWanted&&taskId){poll();return;}
   status({state:stopWanted&&known?'cancelled':known?'interrupted':'unknown',error:error.code});
   message((known?'下载未启动：':'启动结果未确认：')+String(error?.message||error).slice(0,140),true);
  }
 }
}
async function stopDownload(){
 if(closed||stop.disabled)return;
 for(const control of controls)control.used=true;
 const current=jobEpoch;stopWanted=true;++readEpoch;checking=false;clearPoll();status({state:'cancel_requested'});
 try{
  const result=await request('media.stop',taskId?{taskId}:{});
  if(closed||current!==jobEpoch)return;
  if(typeof result.taskId==='string')taskId=result.taskId;
  status(result);if(active()&&phase!=='unknown')poll();
 }catch(error){if(!closed&&current===jobEpoch){status({state:'unknown'});message('停止回执未知：'+String(error?.message||error).slice(0,130),true);}}
}
detect.addEventListener('click',()=>void scan());
stop.addEventListener('click',()=>void stopDownload());
check.addEventListener('click',()=>void readStatus());
root.addEventListener('opendesk-page-changed',()=>{
 ++scanEpoch;scanning=false;controls=[];list.replaceChildren();detached=phase!=='idle';
 if(phase==='idle')message('网页已切换，请重新检测当前网页的媒体。');
 else if(active()&&phase!=='unknown')poll();
 refreshControls();
});
window.addEventListener('pagehide',()=>{closed=true;++scanEpoch;++jobEpoch;clearPoll();},{once:true});
// Opening the installed UI is enough to reveal candidates; saving still needs a click.
void scan();
})();
