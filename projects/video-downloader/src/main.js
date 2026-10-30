(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk,$=id=>root.querySelector('#'+id);
const list=$('vd-list'),detect=$('vd-detect'),stop=$('vd-stop');
const initialInfo=$('vd-info').textContent;
const finished=new Set(['complete','complete_unverified','cancelled','interrupted']);
let phase='idle',taskId=null,jobEpoch=0,scanEpoch=0,closed=false,timer=null,scanning=false,stopWanted=false,controls=[];
const active=()=>phase!=='idle'&&!finished.has(phase);
function message(value,error=false){$('vd-message').textContent=value;$('vd-message').dataset.error=String(error);}
function refreshControls(){
 detect.disabled=scanning||active();
 for(const {button,select,ready} of controls){button.disabled=!ready||scanning||active();if(select)select.disabled=scanning||active();}
 stop.disabled=!active()||phase==='cancel_requested';
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
 else if(phase==='assembling'||phase==='saving')progress.value=100;
 else progress.value=total>0?Math.min(100,Math.floor(received*100/total)):0;
 $('vd-info').textContent=phase==='complete'
  ?'已从 Chrome 下载记录核对：文件存在、收到数据；格式及独立播放仍需本机验证。'
  :phase==='complete_unverified'?'Chrome 认为下载完成，但文件存在性/大小未得到确认。'
  :phase==='interrupted'?({E_MEDIA_CODEC_UNSUPPORTED:'当前音视频编码不支持直接封装为 MP4，未保存文件。',E_MEDIA_AUDIO_CONFIG:'缺少低采样率 AAC 配置，请从含编码信息的 HLS 主清单检测。',E_MEDIA_REMUX:'MP4 封装失败，未保存文件。'}[data.error]||'下载中断：'+String(data.error||'未知原因'))
  :phase==='unknown'?'下载结果未知，检查 Chrome 下载记录；不要直接重试。'
  :phase==='cancel_requested'?'正在停止分段请求或 Chrome 下载，等待状态回读。'
  :phase==='cancelled'?'下载已取消。重新检测后可选择媒体。'
  :phase==='segments'?'已下载 '+completed+' / '+segments+' 段 · '+received+' 字节'
  :phase==='remuxing'?'正在封装 MP4，保留原音视频质量，不重新编码。'
  :phase==='assembling'?'全部分段已收到，正在按原顺序合并。'
  :phase==='saving'?'正在将完整文件交给 Chrome 保存。'
  :total>0?received+' / '+total+' 字节':'进度以 Chrome 下载记录为准。';
 if(finished.has(phase)||phase==='unknown'||phase==='cancel_requested'||phase==='remuxing'||phase==='saving')
  message(label(phase),['interrupted','unknown','complete_unverified'].includes(phase));
 refreshControls();
 if(finished.has(phase)||phase==='unknown')clearPoll();
}
function resetJob(){
 ++jobEpoch;clearPoll();taskId=null;phase='idle';stopWanted=false;
 $('vd-state').textContent='未开始';$('vd-progress').value=0;$('vd-info').textContent=initialInfo;
}
function clearPoll(){if(timer!==null){clearTimeout(timer);timer=null;}}
function poll(){
 clearPoll();if(closed||!taskId)return;
 const current=jobEpoch,id=taskId;
 timer=setTimeout(async()=>{
  if(closed||current!==jobEpoch)return;
  try{
   const data=await request('media.status',{taskId:id});
   if(!closed&&current===jobEpoch){status(data);if(!finished.has(phase)&&phase!=='unknown')poll();}
  }catch(error){if(!closed&&current===jobEpoch){status({state:'unknown'});message('状态不可确认：'+String(error?.message||error).slice(0,120),true);}}
 },800);
}
function describe(item){
 if(item.hls){
  const p=item.hls;
  if(p.kind==='master')return item.mode==='ready'?'HLS · 选择清晰度后下载完整视频':'HLS · 当前清晰度不可下载（独立音轨、加密或清单未确认）';
  return ['HLS',p.vod?'完整 VOD':'非完整 VOD',p.segments+' 段',p.container,p.encryption,
   item.mode==='ready'?'可下载':'仅检测'].join(' · ');
 }
 if(item.mode==='ready')return '同源直接文件 · 可下载';
 if(item.reason==='cross-origin')return '跨源直接媒体 · 暂不下载';
 if(item.format==='dash')return 'DASH · 后续版本';
 return 'HLS 结构不可确认（'+(item.note||'未知')+'）· 仅检测';
}
function showCandidates(items){
 list.replaceChildren();controls=[];
 if(!items.length){list.textContent='未检测到可识别的视频源；若视频已播放较久，请重新加载播放器网页后立即检测。部分临时地址或加密视频暂不支持。';return;}
 items.forEach((item,index)=>{
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
     variant.segments===null?'分段未确认':variant.segments+' 段',variant.ready?'':'不可下载'].filter(Boolean).join(' · ');
    select.append(option);
   }
   select.value=variants.find(x=>x.ready)?.id||'';info.append(select);
  }
  const button=document.createElement('button');button.type='button';button.textContent='下载';
  button.setAttribute('aria-label','下载第 '+(index+1)+' 个 '+item.format+' 文件');
  button.addEventListener('click',()=>void start(item.id,select?.value));
  controls.push({button,select,ready:item.mode==='ready'});row.append(info,button);list.append(row);
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
  message(!result.candidates.length?'当前网页没有可识别媒体':
    '检测到 '+result.candidates.length+' 个候选'+(result.partial?'（部分 iframe 未访问）':''));
 }catch(error){if(!closed&&current===scanEpoch)message('检测失败：'+String(error?.message||error).slice(0,120),true);}
 finally{if(!closed&&current===scanEpoch){scanning=false;refreshControls();}}
}
async function start(candidateId,variantId){
 if(closed||scanning||active())return;
 const current=++jobEpoch;taskId=null;stopWanted=false;
 status({state:'starting'});message('正在启动下载…');
 try{
  const receipt=await request('media.start',{candidateId,...(variantId?{variantId}:{})});
  if(closed||current!==jobEpoch)return;
  if(typeof receipt?.taskId!=='string'||!receipt.taskId)throw Error('未返回可核对的下载任务');
  taskId=receipt.taskId;
  if(!stopWanted){status(receipt);if(!finished.has(phase)&&phase!=='unknown')message(receipt.state==='segments'?'正在下载所选清晰度的完整分段。':'已提交 Chrome，正在核对下载记录。');}
  if(!finished.has(phase))poll();
 }catch(error){
  if(!closed&&current===jobEpoch){
   const known=typeof error?.code==='string'&&error.code.startsWith('E_')&&error.code!=='E_OUTCOME_UNKNOWN';
   if(stopWanted&&taskId){poll();return;}
   status({state:stopWanted&&known?'cancelled':known?'interrupted':'unknown',error:error.code});
   message((known?'下载未启动：':'启动结果未确认：')+String(error?.message||error).slice(0,140),true);
  }
 }
}
async function stopDownload(){
 if(closed||!active()||phase==='cancel_requested')return;
 const current=jobEpoch;stopWanted=true;status({state:'cancel_requested'});
 try{
  const result=await request('media.stop',taskId?{taskId}:{});
  if(closed||current!==jobEpoch)return;
  if(typeof result.taskId==='string')taskId=result.taskId;
  status({state:result.state||'cancel_requested'});if(taskId&&!finished.has(phase)&&phase!=='unknown')poll();
 }catch(error){if(!closed&&current===jobEpoch){status({state:'unknown'});message('停止回执未知：'+String(error?.message||error).slice(0,130),true);}}
}
detect.addEventListener('click',()=>void scan());
stop.addEventListener('click',()=>void stopDownload());
root.addEventListener('opendesk-page-changed',()=>{++scanEpoch;resetJob();scanning=false;controls=[];
 list.replaceChildren();refreshControls();message('网页已切换，旧媒体候选及任务已失效。');});
window.addEventListener('pagehide',()=>{closed=true;++scanEpoch;++jobEpoch;clearPoll();},{once:true});
})();
