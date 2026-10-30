(function(){
'use strict';
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
let memberDirty=false,memberDraftRevision=0;
let closed=false,stopped=false,pageEpoch=0,eventTimer=null;
function reportMemberState(){bridge.setState?.({dirty:memberDirty,busy:writing});}
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
 page=null;paintPage();
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
 ++pageEpoch;page=null;paintPage();
 if(eventTimer!==null)clearTimeout(eventTimer);
 eventTimer=setTimeout(()=>{eventTimer=null;void refresh();},230);
}
function stop(){
 if(stopped||closed)return;
 stopped=true;++pageEpoch;
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
  memberRecords=rows;etag=read.etag;storageReady=true;renderRecords();
  if(page?.site)el('vp-member-provider').value=page.site.id;
 }catch(error){storageReady=false;renderRecords();flash('本机存储读取失败：'+String(error.message||error).slice(0,120),'error');}
}
async function writeMembers(next,success,saveDraft=false){
 if(!storageReady||writing||!validRecords(next))return;
 const draftRevision=memberDraftRevision;
 if(saveDraft)memberDirty=true;
 writing=true;reportMemberState();renderRecords();
 try{
  const result=await request('storage.set',{key:'memberships',value:next,ifMatch:etag});
  if(typeof result?.etag!=='string'||!/^[0-9a-f]{64}$/.test(result.etag))throw Error('保存结果不可核验');
  memberRecords=next;etag=result.etag;flash(success);
  if(saveDraft&&draftRevision===memberDraftRevision)memberDirty=false;
 }catch(error){
  flash('未确认保存成功；为避免覆盖其他窗口更改，请重开工具核对：'+String(error?.message||error).slice(0,120),'error');
  storageReady=false;
  memberDirty=true;
 }finally{writing=false;reportMemberState();renderRecords();}
}
async function removeMember(id){
 if(!storageReady||writing)return;
 await writeMembers(memberRecords.filter(row=>row.id!==id),'记录已从本机移除。');
}
function saveMember(event){
 event.preventDefault();if(!storageReady||writing)return;
 const id=el('vp-member-provider').value,expiry=el('vp-member-expiry').value;
 if(!PROVIDERS.some(p=>p.id===id)||!validDate(expiry)){flash('请选择网站和有效的到期日期。','error');return;}
 const next=[...memberRecords.filter(row=>row.id!==id),{id,expiry}];
 void writeMembers(next,'到期日期已保存到本机（未验证真实会员权益）。',true);
}
for(const kind of ['input','change'])el('vp-member-form').addEventListener(kind,()=>{
 ++memberDraftRevision;memberDirty=true;reportMemberState();
});
// The opaque sandbox forbids native form navigation; save through Storage RPC.
el('vp-member-save').addEventListener('click',saveMember);
el('vp-member-form').addEventListener('submit',saveMember);
for(const tab of root.querySelectorAll('[data-vp-tab]'))tab.addEventListener('click',()=>{
 const mode=tab.dataset.vpTab;
 for(const control of root.querySelectorAll('[data-vp-tab]'))control.setAttribute('aria-pressed',String(control.dataset.vpTab===mode));
 el('vp-watch').hidden=mode!=='watch';el('vp-member').hidden=mode!=='member';flash('');
});
el('vp-refresh').addEventListener('click',()=>void refresh({resume:true}));
el('vp-recheck').addEventListener('click',()=>void refresh({resume:true}));
el('vp-stop').addEventListener('click',stop);
el('vp-copy').addEventListener('click',()=>void share());
root.addEventListener('opendesk-page-changed',invalidateAndSchedule);
window.addEventListener('focus',()=>{if(!stopped)invalidateAndSchedule();});
window.addEventListener('pagehide',()=>{
 closed=true;stopped=true;++pageEpoch;
 if(eventTimer!==null)clearTimeout(eventTimer);
},{once:true});
void Promise.all([refresh(),restoreMembers()]);
})();
