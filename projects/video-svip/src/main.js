(function(){
'use strict';
const bridge=globalThis.OpenDeskTool;
if(!bridge||!bridge.root||typeof bridge.request!=='function')return;
const root=bridge.root,request=bridge.request,el=id=>root.querySelector('#'+id);
const PROVIDERS=Object.freeze([
 {id:'tencent',name:'腾讯视频',hosts:['v.qq.com','m.v.qq.com']},
 {id:'iqiyi',name:'爱奇艺',hosts:['iqiyi.com','iq.com']},
 {id:'youku',name:'优酷',hosts:['youku.com']},
 {id:'mango',name:'芒果 TV',hosts:['mgtv.com']},
 {id:'bilibili',name:'哔哩哔哩',hosts:['bilibili.com']}
]);
const SHARE_KEYS=new Set(['vid','v','id','ep','episode','p','bvid','aid','cid','season_id','episode_id']);
let page=null,memberRecords=[],etag=null,storageReady=false,writing=false,closed=false,pageEpoch=0;
function flash(text='',kind=''){
 const node=el('vp-flash');node.textContent=text;node.dataset.kind=kind;node.hidden=!text;
}
function safeUrl(input){
 if(typeof input!=='string'||input.length>4096)return null;
 try{const u=new URL(input);return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password?u:null;}
 catch{return null;}
}
function siteFor(u){
 if(!u)return null;
 const host=u.hostname.toLowerCase();
 return PROVIDERS.find(p=>p.hosts.some(base=>host===base||host.endsWith('.'+base)))||null;
}
function shareUrl(u){
 if(!u)return '';
 const safe=new URL(u.href);safe.hash='';
 for(const key of [...safe.searchParams.keys()])if(!SHARE_KEYS.has(key.toLowerCase()))safe.searchParams.delete(key);
 return safe.href;
}
function paintPage(){
 const site=page?.site||null;
 el('vp-title').textContent=page?.title||'未识别到视频网页';
 el('vp-provider').textContent=site?.name||'未识别';
 el('vp-page-state').textContent=page?.state||'仅支持常见视频网站';
 el('vp-route-state').textContent=site?'原站入口':'不可用';
 const open=el('vp-open');open.hidden=!site;open.href=site?page.url.href:'#';
 el('vp-copy').disabled=!site;
 el('vp-manual-wrap').hidden=true;
 if(site&&storageReady)el('vp-member-provider').value=site.id;
}
async function refresh(){
 const epoch=++pageEpoch;
 page=null;paintPage();
 el('vp-page-state').textContent='正在从 Host 读取…';
 try{
  const result=await request('currentPage.info');
  if(epoch!==pageEpoch||closed)return;
  const url=result?.status==='available'?safeUrl(result.url):null;
  const site=siteFor(url);
  page={url,site,title:site?String(result.title||'未命名视频页面').slice(0,160):'未识别到支持的视频网页',
    state:site?'已识别站点 · 播放状态未检测':url?'此网站暂未适配':'当前网页不可读取'};
  paintPage();
 }catch(error){
  if(epoch!==pageEpoch||closed)return;
  page={state:'网页读取失败；请检查网站访问权限'};
  paintPage();flash('识别失败：'+String(error?.message||'未知错误').slice(0,130),'error');
 }
}
async function share(){
 if(!page?.site||!page.url)return;
 const address=shareUrl(page.url);
 try{
  if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');
  await globalThis.navigator.clipboard.writeText(address);
  flash('已复制影片网页链接（已去除无关查询参数）。');
 }catch{
  el('vp-manual-wrap').hidden=false;el('vp-manual').value=address;
  el('vp-manual').focus();el('vp-manual').select();
  flash('当前环境未开放剪贴板；请复制已选中的链接。');
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
 }finally{writing=false;renderRecords();}
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
el('vp-refresh').addEventListener('click',()=>void refresh());
el('vp-recheck').addEventListener('click',()=>void refresh());
el('vp-copy').addEventListener('click',()=>void share());
root.addEventListener('opendesk-page-changed',()=>{flash('');void refresh();});
window.addEventListener('focus',()=>void refresh());
window.addEventListener('pagehide',()=>{closed=true;pageEpoch++;},{once:true});
void Promise.all([refresh(),restoreMembers()]);
})();
