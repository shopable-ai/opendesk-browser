(function(){
'use strict';
const sdk=globalThis.OpenDeskTool;
if(!sdk?.root||typeof sdk.request!=='function')return;
const {root,request}=sdk,$=id=>root.querySelector('#'+id);
const list=$('vd-list'),detect=$('vd-detect'),stop=$('vd-stop'),check=$('vd-check');
const format=$('vd-output'),formatRetry=$('vd-format-retry'),formatFeedback=$('vd-format-feedback');
const batchList=$('vd-batch-list'),addresses=$('vd-addresses'),jobPanel=$('vd-job');
const {parseLinks,defaultName,createQueue}=VideoDownloaderBatch;
const initialInfo=$('vd-info').textContent;
const finished=new Set(['complete','complete_unverified','cancelled','interrupted']);
let phase='idle',taskId=null,candidateRef=null,jobEpoch=0,scanEpoch=0,readEpoch=0,closed=false,timer=null,scanning=false,checking=false,stopWanted=false,detached=false,controls=[];
let output=null,formatBusy=false,detection=null;
let batchJob=null,batchControls=[],renderedCandidates=null;
const pageRows=new Map(),jobRows=new Map(),pageDone=page=>['complete','skipped'].includes(page?.state);
let parsedAddresses=parseLinks('');
const active=()=>phase!=='idle'&&!finished.has(phase);
const batch=createQueue({request,canOperate:()=>!scanning&&!active(),onChange:renderBatch,
 launch:job=>beginJob(job,job)});
function message(value,error=false){const node=$('vd-message');if(node.textContent!==value)node.textContent=value;node.dataset.error=String(error);}
function refreshControls(){
 const view=batch.snapshot();
 const busy=scanning||active()||view.busy;
 detect.disabled=busy;
 let downloadable=0;
 for(const control of [...controls,...batchControls]){
  const {button,select,used,detail,choices}=control;
  const options=choices.map(choice=>downloadMethod(choice.item,choice.variant?.id));
  if(!control.page&&options.some(method=>method.allowed))downloadable++;
  const preferred=options.findIndex(method=>method.allowed);
  const index=control.selected??(preferred<0?0:preferred);
  const choice=choices[index],method=options[index];
  control.choice=choice;
  if(select){select.value=String(index);select.disabled=busy;}
  const spent=used.has(choice.item.id);
  const queued=control.page&&view.jobs.some(job=>job.page===control.page&&
   job.videoKey===(choice.item.videoKey??choice.item.id)&&job.state!=='stale');
  detail.textContent=queued?'已加入队列。':spent?'此来源已提交。重新检测后可再次下载。':method.text;
  if(control.filename)control.filename.disabled=busy||spent||Boolean(queued);
  if(button)button.disabled=!method.allowed||spent||Boolean(queued)||busy||!output||formatBusy||
   Boolean(control.page&&control.page.state!=='ready');
 }
 if(detection&&phase==='idle'&&!scanning){
  const total=controls.length;
  const summary=total?'已识别 '+total+' 个视频'+(output?' · '+(downloadable?downloadable+' 个可下载':'没有可下载的视频'):''):'当前网页没有可识别媒体';
  message(summary+(detection.partial?'（部分嵌入页面未检测）':''));
 }
 format.disabled=formatBusy||!output;
 formatRetry.hidden=formatBusy||Boolean(output);
 stop.disabled=!active()||phase==='unknown'||phase==='cancel_requested'||stopWanted||detached;
 check.hidden=phase!=='unknown';check.disabled=checking||!(taskId||candidateRef);
 jobPanel.hidden=phase==='idle'||Boolean(batchJob&&finished.has(phase));
 $('vd-playing-name').hidden=!batchJob;
 if(batchJob)$('vd-playing-name').textContent=batchJob.filename||'当前批量下载';
 setBatchButtons(view);
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
  ?(data.filename?'已保存 '+data.filename+'。':'')+'已从 Chrome 下载记录核对：文件存在、收到数据；格式及独立播放仍需本机验证。'
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
 if(!batchJob&&(finished.has(phase)||['unknown','cancel_requested','segments','remuxing','assembling','saving','started','in_progress'].includes(phase)))
  message(label(phase),['interrupted','unknown','complete_unverified'].includes(phase));
 if(batchJob)batch.update(batchJob,{...data,state:phase});
 refreshControls();
 if(finished.has(phase)||phase==='unknown')clearPoll();
}
function resetJob(){
 ++jobEpoch;++readEpoch;clearPoll();taskId=null;candidateRef=null;phase='idle';stopWanted=false;detached=false;checking=false;
 batchJob=null;
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
  if(p.kind==='master')return item.mode==='ready'?'可选清晰度':'没有支持下载的清晰度';
  return ['HLS',p.segments+' 段',item.mode==='ready'?'完整点播':!p.vod?'直播或点播未结束，无法下载':'清单结构暂不支持下载'].join(' · ');
 }
 if(item.mode==='ready')return '原文件直存';
 if(item.format==='dash')return '暂不支持合并 DASH 分段';
 if(item.note==='E_MEDIA_ORIGIN')return 'HLS 来源不受支持，无法下载';
 if(item.note==='E_MEDIA_PERMISSION')return '缺少 HLS 来源访问权限，请检查网站权限后重新检测';
 if(item.note==='E_HLS_HTTP'||item.note==='E_MEDIA_TIMEOUT')return 'HLS 清单无法读取，请刷新播放器后重新检测';
 if(item.reason==='cross-origin'&&item.format!=='hls')return '原文件与当前网页不同源，无法下载';
 return 'HLS 结构不可确认（'+(item.note||'未知')+'）· 仅检测';
}
function downloadMethod(item,variantId){
 const variant=item.hls?.kind==='master'?item.hls.variants.find(row=>row.id===variantId):null;
 if(variantId&&!variant?.ready)return {allowed:false,text:protectionReason(item.hls?.encryption)||protectionReason(variant?.encryption)||'此清晰度无法下载，请换一个清晰度。'};
 if(item.mode!=='ready'||item.hls?.kind==='master'&&!variant)return {allowed:false,text:describe(item)};
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
function rowChoices(items){
 const choices=[],direct=new Map();
 for(const item of items){
  const name=item.format.toUpperCase();
  const variants=item.hls?.kind==='master'?[...item.hls.variants].sort((a,b)=>(a.bandwidth||Infinity)-(b.bandwidth||Infinity)):[];
  if(variants.length){
   for(const [index,variant] of variants.entries()){
    const size=variant.resolution?.split('x').at(-1);
    const bitrate=variant.bandwidth?Math.round(variant.bandwidth/1000)+' kbps':null;
    const title=[size?size+'p':null,bitrate].filter(Boolean).join(' · ')||'清晰度 '+(index+1);
    choices.push({item,variant,name:name+' '+title});
   }
  }else if(item.hls||!direct.has(item.format)){
   if(!item.hls)direct.set(item.format,choices.length);
   choices.push({item,name});
  }else if(item.mode==='ready'&&choices[direct.get(item.format)].item.mode!=='ready'){
   choices[direct.get(item.format)]={item,name};
  }
 }
 return choices;
}
function downloadIcon(){
 const ns='http://www.w3.org/2000/svg';
 const icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
 path.setAttribute('d','M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4');
 icon.append(path);return icon;
}
function showCandidates(items,target,metadata,page=null){
 target.replaceChildren();
 const rendered=[];
 if(!items.length){if(!page)target.textContent='未检测到可识别的视频源。请先播放视频，再点「检测」。部分临时地址或加密视频暂不支持。';return rendered;}
 const groups=new Map();
 for(const item of items){
  const key=item.videoKey??item.id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(item);
 }
 Array.from(groups.values()).forEach((sources,index)=>{
  const choices=rowChoices(sources),number=index+1;
  const ready=choices.some(({item,variant})=>item.mode==='ready'&&(!variant||variant.ready));
  const row=document.createElement('div');row.className='vd-item';
  const info=document.createElement('div');info.className='vd-item-info';
  const heading=document.createElement('div');heading.className='vd-item-heading';
  const name=document.createElement('strong');name.textContent='视频 '+number;
  const detail=document.createElement('span');detail.id=(page?'vd-batch-method-':'vd-method-')+index;
  heading.append(name);info.append(heading,detail);
  let select=null;
  const control={choices,choice:null,selected:null,detail,button:null,select:null,used:new Set(),page,filename:null};
  if(choices.length>1){
   select=document.createElement('select');select.setAttribute('aria-label','视频 '+number+' 的来源或清晰度');
   select.setAttribute('aria-describedby',detail.id);
   for(const [i,choice] of choices.entries()){
    const option=document.createElement('option');option.value=String(i);
    option.textContent=choice.name;
    select.append(option);
   }
   select.addEventListener('change',()=>{control.selected=Number(select.value);refreshControls();});
   control.select=select;heading.append(select);
  }else{
   const type=document.createElement('small');type.textContent=choices[0].name;heading.append(type);
  }
  row.append(info);
  if(ready){
   const button=document.createElement('button');button.type='button';button.className='vd-download';
   if(page){button.textContent='加入队列';button.title='将视频 '+number+' 加入队列';}
   else {button.append(downloadIcon());button.title='下载视频 '+number;}
   button.setAttribute('aria-label',button.title);button.setAttribute('aria-describedby',detail.id);
   button.addEventListener('click',()=>page?enqueue(control):start(control));
   control.button=button;row.append(button);
   const nameLabel=document.createElement('label');nameLabel.className='vd-file-name';
   const nameInput=document.createElement('input');nameInput.type='text';nameInput.maxLength=512;
   nameInput.setAttribute('aria-label','视频 '+number+' 的保存文件名');
   nameInput.placeholder='文件名主体';
   if(page||metadata?.title!==undefined||metadata?.url!==undefined){
    nameInput.value=defaultName({...metadata,index:page?.index,number,count:groups.size});
    control.defaulted=true;
   }
   nameInput.addEventListener('input',()=>{control.defaulted=true;});
   nameLabel.textContent='保存文件名';nameLabel.append(nameInput);row.append(nameLabel);control.filename=nameInput;
  }
  rendered.push(control);target.append(row);
 });
 return rendered;
}
async function scan(){
 if(closed||scanning||active()||batch.snapshot().busy)return;
 batch.pageChanged();
 resetJob();detection=null;
 const current=++scanEpoch;scanning=true;refreshControls();list.replaceChildren();controls=[];message('正在检测网页媒体…');
 try{
  const result=await request('media.detect',{});
  if(closed||current!==scanEpoch)return;
  if(!Array.isArray(result?.candidates))throw Error('媒体检测回执无效');
  controls=showCandidates(result.candidates,list,result);
  detection={partial:result.partial};
 }catch(error){if(!closed&&current===scanEpoch)message('检测失败：'+String(error?.message||error).slice(0,120),true);}
 finally{if(!closed&&current===scanEpoch){scanning=false;refreshControls();}}
}
function selectedInput(control){
 const {item,variant}=control.choice,candidateId=item.id,variantId=variant?.id;
 return {candidateId,variantId,output,...(control.defaulted?{filename:control.filename.value}:{})};
}
function enqueue(control){
 if(!batchControls.includes(control)||control.button.disabled)return;
 const {item,variant,name}=control.choice;
 const container=variant?.container??item.hls?.container;
 const fileFormat=item.format==='hls'?(container==='fmp4'||output==='mp4'?'mp4':container==='ts'?'ts':'hls'):item.format;
 batch.addJob({...selectedInput(control),format:fileFormat,quality:name});
}
function start(control){
 if(!controls.includes(control)||control.button.disabled)return;
 const input=selectedInput(control);
 if(beginJob(input))control.used.add(input.candidateId);
 refreshControls();
}
function beginJob(input,queueJob=null){
 if(closed||scanning||active()||batch.snapshot().busy)return false;
 batchJob=queueJob;
 const {candidateId,variantId,output:jobOutput,filename}=input;
 const current=++jobEpoch;taskId=null;candidateRef=candidateId;stopWanted=false;detached=false;
 status({state:'starting'});if(!batchJob)message('正在启动下载…');
 void submit({candidateId,...(variantId?{variantId}:{}),output:jobOutput,...(filename!==undefined?{filename}:{})},current);
 return true;
}
async function submit(input,current){
 try{
  const receipt=await request('media.start',input);
  if(closed||current!==jobEpoch)return;
  if(typeof receipt?.taskId!=='string'||!receipt.taskId)throw Error('未返回可核对的下载任务');
  taskId=receipt.taskId;
  if(!stopWanted&&!detached){status(receipt);if(!batchJob&&!finished.has(phase)&&phase!=='unknown')message(receipt.state==='segments'?'正在下载所选清晰度的完整分段。':'已提交 Chrome，正在核对下载记录。');}
  if(active()&&phase!=='unknown')poll();
 }catch(error){
  if(!closed&&current===jobEpoch){
   const known=['E_SCHEMA','E_MEDIA_BUSY','E_MEDIA_STALE','E_MEDIA_TARGET','E_MEDIA_TRUST','E_MEDIA_PERMISSION','E_MEDIA_UNAVAILABLE','E_MEDIA_CAPABILITY','E_MEDIA_UNSUPPORTED','E_DOCUMENT_STALE'].includes(error?.code);
   if(stopWanted&&taskId){poll();return;}
   status({state:stopWanted&&known?'cancelled':known?'interrupted':'unknown',error:error.code});
   if(!batchJob)message((known?'下载未启动：':'启动结果未确认：')+String(error?.message||error).slice(0,140),true);
  }
 }
}
async function stopDownload(){
 if(closed||stop.disabled)return;
 if(batchJob)batch.pause('正在停止当前下载；队列已暂停。');
 for(const control of controls)for(const {item} of control.choices)control.used.add(item.id);
 const current=jobEpoch;stopWanted=true;++readEpoch;checking=false;clearPoll();status({state:'cancel_requested'});
 try{
  const result=await request('media.stop',taskId?{taskId}:{});
  if(closed||current!==jobEpoch)return;
  if(typeof result.taskId==='string')taskId=result.taskId;
  status(result);if(active()&&phase!=='unknown')poll();
 }catch(error){if(!closed&&current===jobEpoch){status({state:'unknown'});message('停止回执未知：'+String(error?.message||error).slice(0,130),true);}}
}
const pageStatus={pending:'待打开',opening:'正在打开',detecting:'正在检测',ready:'可选视频',waiting:'等待网页操作',
 permission:'等待授权',stale:'需要重新核对网页',blocked:'处理失败',tab_unknown:'标签页结果未知',complete:'已完成',skipped:'已跳过'};
function setText(node,value){if(node.textContent!==value)node.textContent=value;}
function setBatchButtons(view){
 const {pages,current,jobs,busy,paused,active:currentJob}=view;
 const locked=busy||scanning||active()||Boolean(currentJob);
 $('vd-import').disabled=locked||pages.some(page=>!pageDone(page))||!parsedAddresses.urls.length||parsedAddresses.overflow;
 $('vd-open-next').disabled=locked||Boolean(current&&!pageDone(current))||!pages.some(page=>page.state==='pending');
 const retry=$('vd-redetect'),skip=$('vd-skip');
 retry.hidden=!current||!['ready','waiting','stale','permission','blocked'].includes(current.state)||
  !current.ref&&!['permission','blocked'].includes(current.state);
 retry.textContent=current?.ref?'激活并检测':'重新打开';
 retry.disabled=locked;skip.hidden=!current||pageDone(current);skip.disabled=locked;
 $('vd-run').disabled=locked||current?.state!=='ready'||!jobs.some(job=>job.page===current&&job.state==='queued');
 $('vd-pause').disabled=paused;
 for(const [page,{close}] of pageRows){close.hidden=!pageDone(page)||!page.ref||Boolean(page.closeUnknown);close.disabled=locked;}
 for(const [job,{name}] of jobRows)name.disabled=locked||job.state!=='queued';
}
function renderBatch(view){
 const {pages,current,jobs,notice,active:currentJob}=view;
 setText($('vd-batch-message'),notice);
 for(const page of pages){
  let row=pageRows.get(page);
  if(!row){
   const element=document.createElement('li'),name=document.createElement('strong'),detail=document.createElement('span'),
    url=document.createElement('span'),close=document.createElement('button');
   close.type='button';close.textContent='关闭此标签页';close.setAttribute('aria-label','关闭第 '+(page.index+1)+' 条网页的标签页');
   close.addEventListener('click',()=>void batch.remove(page));
   element.append(name,url,detail,close);$('vd-pages').append(element);
   row={element,name,url,detail,close};pageRows.set(page,row);
  }
  setText(row.name,(page.index+1)+'. '+(page.title||'视频网页'));
  setText(row.url,page.url);row.url.title=page.url;
  setText(row.detail,pageStatus[page.state]+(page.count?' · '+page.count+' 个视频':'')+(page.closeUnknown?' · 关闭结果未知':''));
  if(page===current&&!pageDone(page))row.element.setAttribute('aria-current','step');
  else row.element.removeAttribute('aria-current');
 }
 const candidates=current&&!pageDone(current)?current.candidates:null;
 if(candidates!==renderedCandidates){
  renderedCandidates=candidates;
  if(candidates?.length)batchControls=showCandidates(candidates,batchList,current,current);
  else {batchControls=[];batchList.replaceChildren();}
 }
 if(current?.state==='detecting'&&controls.length){
  detection=null;controls=[];list.replaceChildren();message('已切换到批量网页，请重新检测当前网页。');
 }
 $('vd-queue').hidden=!jobs.length;
 for(const [index,job] of jobs.entries()){
  let row=jobRows.get(job);
  if(!row){
   const element=document.createElement('li'),title=document.createElement('strong'),
    fields=document.createElement('label'),name=document.createElement('input'),detail=document.createElement('span');
   fields.className='vd-file-name';fields.textContent='保存文件名';
   name.type='text';name.maxLength=512;name.value=job.filename??'';
   name.setAttribute('aria-label','第 '+(index+1)+' 个下载任务的文件名');
   name.addEventListener('input',()=>{if(!batch.rename(job,name.value))name.value=job.filename??'';});
   fields.append(name);element.append(title,fields,detail);$('vd-jobs').append(element);
   row={element,title,fields,name,detail};jobRows.set(job,row);
  }
  const queued=job.state==='queued',actual=job.receipt?.filename;
  row.fields.hidden=!queued;
  setText(row.title,'网页 '+(job.page.index+1)+(queued?'':' · '+(actual||job.filename||'默认文件名')));
  const state=job===currentJob?'':queued?'待下载':job.state==='stale'?'候选已失效':label(job.state);
  setText(row.detail,[job.format?.toUpperCase(),job.quality,state,
   job.state==='interrupted'&&job.receipt?.error].filter(Boolean).join(' · '));
 }
 refreshControls();
}
function previewAddresses(){
 parsedAddresses=parseLinks(addresses.value);
 const {urls,duplicates,invalid,overflow}=parsedAddresses,summary=$('vd-address-summary');
 setText(summary,'有效 '+urls.length+' 条 · 重复 '+duplicates+' 条 · 无效 '+invalid.length+' 条'+
  (invalid.length?'（第 '+invalid.join('、')+' 行）':'')+(overflow?'。超过 8 条，请减少地址后导入。':'。'));
 summary.dataset.error=String(Boolean(invalid.length||overflow));
 setBatchButtons(batch.snapshot());
}
function switchWorkspace(showBatch){
 $('vd-batch').hidden=!showBatch;$('vd-single').hidden=showBatch;
 $('vd-batch-mode').setAttribute('aria-pressed',String(showBatch));
 $('vd-single-mode').setAttribute('aria-pressed',String(!showBatch));
}
detect.addEventListener('click',()=>void scan());
stop.addEventListener('click',()=>void stopDownload());
check.addEventListener('click',()=>void readStatus());
format.addEventListener('change',()=>void changeFormat());
formatRetry.addEventListener('click',()=>void loadFormat());
addresses.addEventListener('input',previewAddresses);
$('vd-import').addEventListener('click',()=>{if(batch.addLinks(addresses.value))$('vd-open-next').focus();});
$('vd-single-mode').addEventListener('click',()=>switchWorkspace(false));
$('vd-batch-mode').addEventListener('click',()=>switchWorkspace(true));
$('vd-auto-open').addEventListener('change',event=>batch.setAutoOpen(event.target.checked));
$('vd-open-next').addEventListener('click',()=>void batch.openNext());
$('vd-redetect').addEventListener('click',()=>void batch.redetect());
$('vd-skip').addEventListener('click',()=>batch.skip());
$('vd-run').addEventListener('click',()=>batch.run());
$('vd-pause').addEventListener('click',()=>batch.pause());
root.addEventListener('opendesk-page-changed',()=>{
 batch.pageChanged();
 ++scanEpoch;scanning=false;controls=[];detection=null;list.replaceChildren();detached=phase!=='idle';
 if(phase==='idle')message('网页已切换，请重新检测当前网页的媒体。');
 else if(active()&&phase!=='unknown')poll();
 refreshControls();
});
window.addEventListener('pagehide',()=>{closed=true;batch.dispose();++scanEpoch;++jobEpoch;clearPoll();},{once:true});
// Opening the installed UI is enough to reveal candidates; saving still needs a click.
previewAddresses();
void scan();
void loadFormat();
})();
