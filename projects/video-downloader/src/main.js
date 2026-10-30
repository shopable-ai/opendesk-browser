(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk,$=id=>root.querySelector('#'+id);
const list=$('vd-list'),detect=$('vd-detect'),stop=$('vd-stop');
let phase='idle',taskId=null,jobEpoch=0,scanEpoch=0,closed=false,timer=null,busy=false;
function message(value,error=false){$('vd-message').textContent=value;$('vd-message').dataset.error=String(error);}
function label(state){
 return {starting:'正在启动',started:'已启动',in_progress:'下载中',cancel_requested:'停止中',
 complete:'Chrome 下载完成',complete_unverified:'文件未核实',cancelled:'已取消',
 interrupted:'下载中断',unknown:'结果未知'}[state]||'未开始';
}
function status(data){
 phase=data.state||'unknown';$('vd-state').textContent=label(phase);
 const total=data.totalBytes||0,received=data.bytesReceived||0;
 $('vd-progress').value=total>0?Math.min(100,Math.floor(received*100/total)):0;
 $('vd-info').textContent=phase==='complete'
  ?'已从 Chrome 下载记录核对：文件存在、收到数据；格式及独立播放仍需本机验证。'
  :phase==='complete_unverified'?'Chrome 认为下载完成，但文件存在性/大小未得到确认。'
  :phase==='interrupted'?'下载中断：'+String(data.error||'未知原因')
  :phase==='unknown'?'下载结果未知，检查 Chrome 下载记录；不要直接重试。'
  :phase==='cancel_requested'?'已请求取消，等待 Chrome 状态回读。'
  :total>0?received+' / '+total+' 字节':'进度以 Chrome 下载记录为准。';
 stop.disabled=!['starting','started','in_progress'].includes(phase);
 if(['complete','complete_unverified','cancelled','interrupted','unknown'].includes(phase))clearPoll();
}
function clearPoll(){if(timer!==null){clearTimeout(timer);timer=null;}}
function poll(){
 clearPoll();if(closed||!taskId)return;
 const current=jobEpoch;
 timer=setTimeout(async()=>{
  if(closed||current!==jobEpoch)return;
  try{
   const data=await request('media.status',{taskId});
   if(!closed&&current===jobEpoch){status(data);if(!['complete','complete_unverified','cancelled','interrupted','unknown'].includes(phase))poll();}
  }catch(error){if(!closed&&current===jobEpoch){clearPoll();message('状态不可确认：'+String(error?.message||error).slice(0,120),true);}}
 },800);
}
function describe(item){
 if(item.mode==='ready')return '同源直接文件 · 可下载';
 if(item.reason==='cross-origin')return '跨源媒体 · R0.1 不下载';
 if(item.format==='dash')return 'DASH · 后续版本';
 if(item.hls){
  const p=item.hls,details=p.kind==='master'?
   p.variants.map(x=>[x.resolution||'未知分辨率',x.bandwidth?Math.round(x.bandwidth/1000)+' kbps':'未知码率',
    x.encryption,x.segments===null?'分段未读回':x.segments+' 段'].join(' · ')).join('；'):
   [p.vod?'VOD':'非完整 VOD',p.segments+' 段',p.container,p.encryption].join(' · ');
  return 'HLS '+p.kind+' · '+details+' · 音轨声明 '+p.audio.length+' · DETECTED_ONLY';
 }
 return 'HLS 已发现；结构不可确认（'+(item.note||'未知')+'），DETECTED_ONLY';
}
function showCandidates(items){
 list.replaceChildren();
 if(!items.length){list.textContent='未检测到可识别的 HTML5 视频源。';return;}
 items.forEach((item,index)=>{
  const row=document.createElement('div');row.className='vd-item';
  const info=document.createElement('div');info.className='vd-item-info';
  const name=document.createElement('strong');name.textContent=(index+1)+'. '+item.format.toUpperCase();
  const detail=document.createElement('span');detail.textContent=describe(item);
  info.append(name,detail);
  const button=document.createElement('button');button.type='button';button.textContent='下载';
  button.disabled=item.mode!=='ready'||busy;
  button.setAttribute('aria-label','下载第 '+(index+1)+' 个 '+item.format+' 文件');
  button.addEventListener('click',()=>void start(item.id));
  row.append(info,button);list.append(row);
 });
}
async function scan(){
 if(closed||busy)return;
 const current=++scanEpoch;detect.disabled=true;list.replaceChildren();message('正在检测网页媒体…');
 try{
  const result=await request('media.detect',{});
  if(closed||current!==scanEpoch)return;
  if(!Array.isArray(result?.candidates))throw Error('媒体检测回执无效');
  showCandidates(result.candidates);
  message(!result.candidates.length?'当前网页没有可识别媒体':
    '检测到 '+result.candidates.length+' 个候选'+(result.partial?'（部分 iframe 未访问）':''));
 }catch(error){if(!closed&&current===scanEpoch)message('检测失败：'+String(error?.message||error).slice(0,120),true);}
 finally{if(!closed&&current===scanEpoch)detect.disabled=false;}
}
async function start(candidateId){
 if(closed||busy)return;
 busy=true;++jobEpoch;const current=jobEpoch;phase='starting';taskId=null;
 status({state:'starting'});message('正在请求 Chrome 下载…');
 try{
  const receipt=await request('media.start',{candidateId});
  if(closed||current!==jobEpoch)return;
  if(!Number.isInteger(receipt?.downloadId)||typeof receipt.taskId!=='string')
   throw Error('Chrome 未返回可核对的下载任务');
  taskId=receipt.taskId;status(receipt);message('已获得 Chrome downloadId '+receipt.downloadId+'，正在核对下载记录。');poll();
 }catch(error){if(!closed&&current===jobEpoch){status({state:'unknown'});message('启动结果未确认：'+String(error?.message||error).slice(0,140),true);}}
 finally{busy=false;}
}
async function stopDownload(){
 if(closed||!['starting','started','in_progress','cancel_requested'].includes(phase))return;
 stop.disabled=true;
 // An unanswered start has no taskId; consume the earlier receipt before Stop.
 if(!taskId)++jobEpoch;
 try{
  const result=await request('media.stop',taskId?{taskId}:{});
  if(closed)return;
  status({state:result.state||'cancel_requested'});if(taskId)poll();
 }catch(error){if(!closed)message('停止回执未知：'+String(error?.message||error).slice(0,130),true);}
}
detect.addEventListener('click',()=>void scan());
stop.addEventListener('click',()=>void stopDownload());
root.addEventListener('opendesk-page-changed',()=>{++scanEpoch;++jobEpoch;clearPoll();taskId=null;phase='idle';stop.disabled=true;
 list.replaceChildren();message('网页已切换，旧媒体候选及任务已失效。');});
window.addEventListener('pagehide',()=>{closed=true;++scanEpoch;++jobEpoch;clearPoll();},{once:true});
})();
