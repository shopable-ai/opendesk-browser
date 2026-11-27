(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk,$=id=>root.querySelector('#'+id);
const list=$('vd-list'),detect=$('vd-detect'),stop=$('vd-stop'),check=$('vd-check');
const format=$('vd-output'),formatRetry=$('vd-format-retry'),formatFeedback=$('vd-format-feedback');
const initialInfo=$('vd-info').textContent;
const finished=new Set(['complete','complete_unverified','cancelled','interrupted']);
let phase='idle',taskId=null,candidateRef=null,jobEpoch=0,scanEpoch=0,readEpoch=0,closed=false,timer=null,scanning=false,checking=false,stopWanted=false,detached=false,controls=[];
let output=null,formatBusy=false;
const active=()=>phase!=='idle'&&!finished.has(phase);
function message(value,error=false){const node=$('vd-message');if(node.textContent!==value)node.textContent=value;node.dataset.error=String(error);}
function refreshControls(){
 const busy=scanning||active();
 detect.disabled=busy;
 for(const control of controls){
  const {button,select,used,ready,detail,item}=control;
  const method=downloadMethod(item,select?.value);
  detail.textContent=method.text;
  button.disabled=!method.allowed||used||busy||!output||formatBusy;
  if(select)select.disabled=used||busy;
  if(ready)button.setAttribute('aria-label','下载第 '+control.number+' 个视频');
 }
 format.disabled=formatBusy||!output;
 formatRetry.hidden=formatBusy||Boolean(output);
 stop.disabled=!active()||phase==='unknown'||phase==='cancel_requested'||stopWanted||detached;
 check.hidden=phase!=='unknown';check.disabled=checking||!(taskId||candidateRef);
}
function formatNotice(text,error=false){formatFeedback.textContent=text;formatFeedback.dataset.error=String(error);}
function parseOutput(receipt){
 if(receipt?.output!=='original'&&receipt?.output!=='mp4')throw Error('格式回执无效');
 return receipt.output;
}
async function loadFormat(){
 if(closed||formatBusy)return;
 formatBusy=true;refreshControls();formatNotice('正在读取下载格式…');
 try{
  const saved=parseOutput(await request('media.format.get',{}));
  if(!closed){output=saved;format.value=saved;formatNotice('');}
 }catch{if(!closed)formatNotice('无法读取下载格式。请重试；若刚更新扩展，请关闭并重新打开侧栏。',true);}
 finally{if(!closed){formatBusy=false;refreshControls();}}
}
async function changeFormat(){
 const next=format.value;
 if(closed||formatBusy||!output||next===output||!['original','mp4'].includes(next))return;
 formatBusy=true;refreshControls();formatNotice('正在保存下载格式…');
 try{
  const saved=parseOutput(await request('media.format.set',{output:next}));
  if(saved!==next)throw Error('保存值不匹配');
  if(!closed){output=saved;formatNotice('');}
 }catch{
  if(closed)return;
  // Read back a lost write receipt; never resend the write automatically.
  output=null;
  try{
   const saved=parseOutput(await request('media.format.get',{}));
   if(!closed){output=saved;formatNotice(saved===next?'':'格式未保存，已恢复原设置。请重新选择。',saved!==next);}
  }catch{if(!closed)formatNotice('格式保存结果无法确认，请重新读取格式。',true);}
 }finally{if(!closed){if(output)format.value=output;formatBusy=false;refreshControls();}}
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
 if(phase==='complete')progress.value=100;
 else if(phase==='segments'&&segments>0)progress.value=Math.min(100,Math.floor(completed*100/segments));
 else if(phase==='remuxing'&&data.remuxTotalBytes)progress.value=Math.min(100,Math.floor((data.remuxBytes||0)*100/data.remuxTotalBytes));
 else if(['started','in_progress'].includes(phase)&&total>0)progress.value=Math.min(100,Math.floor(received*100/total));
 else if(active()&&phase!=='unknown')progress.removeAttribute('value');
 else progress.value=0;
 $('vd-info').textContent=phase==='complete'
  ?'已从 Chrome 下载记录核对：文件存在、收到数据；格式及独立播放仍需本机验证。'
  :phase==='complete_unverified'?'Chrome 认为下载完成，但文件存在性/大小未得到确认。'
  :phase==='interrupted'?({E_MEDIA_CODEC_UNSUPPORTED:'当前音视频编码无法封装为 MP4。重新检测后可下载原分段。',E_MEDIA_AUDIO_CONFIG:'缺少 AAC 配置。请检测带编码信息的主清单，或下载原分段。',E_MEDIA_REMUX:'MP4 封装失败，未保存。重新检测后可下载原分段。',E_MEDIA_HTTP:'分段无法读取，可能已过期。请刷新播放器后重新检测。',E_MEDIA_TS:'有分段不是有效的 TS，未保存。请重新检测或换一个清晰度。',E_MEDIA_MP4:'有分段不是有效的 MP4，未保存。请重新检测或换一个清晰度。',E_MEDIA_PERMISSION:'网站访问权限已撤销。请检查权限后重新检测。'}[data.error]||'下载中断：'+String(data.error||'未知原因')+'。重新检测后可再试。')
  :phase==='unknown'?'下载结果未知，检查 Chrome 下载记录；不要直接重试。'
  :phase==='cancel_requested'?'正在停止分段请求或 Chrome 下载，等待状态回读。'
  :phase==='cancelled'?'下载已取消。重新检测后可选择媒体。'
  :phase==='segments'?(segments>0?'已下载 '+completed+' / '+segments+' 段':completed>0?'已下载 '+completed+' 段':'正在读取分段')+' · '+received+' 字节'
  :phase==='remuxing'?'正在封装 MP4，保留原音视频质量，不重新编码。'
  :phase==='assembling'?'全部分段已收到，正在按原顺序合并。'
  :phase==='saving'?'正在将完整文件交给 Chrome 保存。'
  :total>0?received+' / '+total+' 字节':received>0?'已接收 '+received+' 字节，文件总大小未知。':'进度以 Chrome 下载记录为准。';
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
function downloadMethod(item,variantId){
 if(item.mode!=='ready')return {allowed:false,text:describe(item)};
 const variant=item.hls?.kind==='master'?item.hls.variants.find(row=>row.id===variantId):null;
 if(variantId&&!variant?.ready)return {allowed:false,text:'请选择支持下载的清晰度。'};
 const block=variant?variant.mp4Block:item.mp4Block;
 if(output==='mp4'&&(block==='webm'||item.format==='webm'))
  return {allowed:false,text:'WebM 暂不支持转为 MP4。请选择「原格式」下载。'};
 if(output==='mp4'&&block==='codecs')
  return {allowed:false,text:'此清晰度的编码无法封装为 MP4。请换一个清晰度，或选择「原格式」。'};
 if(!item.hls)return {allowed:true,text:describe(item)};
 const container=variant?variant.container:item.hls.container;
 return {allowed:true,text:container==='ts'?(output==='mp4'?'自动封装为 MP4，无需重新编码。':'自动合并为 TS，需支持 TS 的播放器。'):
  container==='fmp4'?'自动合并分段，保存为 MP4。':describe(item)};
}
function showCandidates(items){
 list.replaceChildren();controls=[];
 if(!items.length){list.textContent='未检测到可识别的视频源。请先播放视频，再点「检测」。部分临时地址或加密视频暂不支持。';return;}
 items.forEach((item,index)=>{
  const ready=item.mode==='ready';
  const row=document.createElement('div');row.className='vd-item';
  const info=document.createElement('div');info.className='vd-item-info';
  const name=document.createElement('strong');name.textContent=(index+1)+'. '+item.format.toUpperCase();
  const detail=document.createElement('span');info.append(name,detail);
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
   select.value=variants.find(x=>x.ready)?.id||'';
   select.addEventListener('change',refreshControls);info.append(select);
  }
  const actions=document.createElement('div');actions.className='vd-actions';
  const button=document.createElement('button');button.type='button';actions.append(button);
  if(ready)button.addEventListener('click',()=>void start(item.id,select?.value));
  button.textContent=ready?'下载':'不可下载';
  button.setAttribute('aria-describedby',detail.id='vd-method-'+index);
  row.append(info,actions);
  controls.push({id:item.id,item,detail,button,select,ready,number:index+1,used:false});list.append(row);
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
async function start(candidateId,variantId){
 const control=controls.find(row=>row.id===candidateId);
 if(closed||scanning||active()||!output||formatBusy||!control||control.button.disabled)return;
 const jobOutput=output;
 control.used=true;
 const current=++jobEpoch;taskId=null;candidateRef=candidateId;stopWanted=false;detached=false;
 status({state:'starting'});message('正在启动下载…');
 try{
  const receipt=await request('media.start',{candidateId,...(variantId?{variantId}:{}),output:jobOutput});
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
format.addEventListener('change',()=>void changeFormat());
formatRetry.addEventListener('click',()=>void loadFormat());
root.addEventListener('opendesk-page-changed',()=>{
 ++scanEpoch;scanning=false;controls=[];list.replaceChildren();detached=phase!=='idle';
 if(phase==='idle')message('网页已切换，请重新检测当前网页的媒体。');
 else if(active()&&phase!=='unknown')poll();
 refreshControls();
});
window.addEventListener('pagehide',()=>{closed=true;++scanEpoch;++jobEpoch;clearPoll();},{once:true});
// Opening the installed UI is enough to reveal candidates; saving still needs a click.
void scan();
void loadFormat();
})();
