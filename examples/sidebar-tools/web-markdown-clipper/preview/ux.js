/* R1.9 preview-only UX adapter: SAME official notes list, reader and editor.
   Uses src/notes.js createStore for data; demo Host lives in stage.html.
   This file is NOT the installed extension. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const root=document.querySelector('.clip'),home=$('clip-home'),notes=$('clip-notes');
const list=$('clip-note-list'),slot=$('clip-recent-slot'),search=$('clip-search'),filter=$('clip-kind-filter');
const reader=$('clip-note-reader');
const request=globalThis.OpenDeskTool.request;
const saveStore=globalThis.OpenDeskClipNotes.createStore({request});
const queryStore=globalThis.OpenDeskClipNotes.createStore({request});
let mode='recent',savedSearch='',savedFilter='all',recentScroll=0,libraryScroll=0,entry='full',newFromRecent=false,saving=false,approved=null;
const say=(value,error=false)=>{const p=$('clip-status');p.textContent=value;p.dataset.error=String(error);};
async function updateCount(){
 try{$('clip-recent-count').textContent=String((await queryStore.list('',0)).total);}
 catch{$('clip-recent-count').textContent='?';}
}
function showRecent(preserveLibraryState=false){
 if(mode==='full'&&!preserveLibraryState){
  savedSearch=search.value;savedFilter=filter.value;libraryScroll=window.scrollY;
 }
 mode='recent';root.dataset.previewView=mode;
 slot.append(list);search.value='';filter.value='all';
 home.hidden=false;notes.hidden=true;
 search.dispatchEvent(new Event('input',{bubbles:true}));
 requestAnimationFrame(()=>window.scrollTo(0,recentScroll));
 void updateCount();
}
function showFull(fromRecent=false){
 recentScroll=window.scrollY;
 mode='full';root.dataset.previewView=mode;
 notes.insertBefore(list,$('clip-note-more'));
 if(!fromRecent){search.value=savedSearch;filter.value=savedFilter;}
 else filter.value='all';
 home.hidden=true;notes.hidden=false;applyFilter();
 requestAnimationFrame(()=>window.scrollTo(0,fromRecent?0:libraryScroll));
}
const iconPaths={
 edit:['M12 20h9','M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4z'],
 remove:['M3 6h18','M8 6V4h8v2','M6 6l1 15h10l1-15','M10 10v7','M14 10v7'],
 more:['M5 12h.01','M12 12h.01','M19 12h.01']
};
function svg(name){
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
 for(const d of iconPaths[name]){
  const line=document.createElementNS('http://www.w3.org/2000/svg','path');
  line.setAttribute('d',d);icon.append(line);
 }
 return icon;
}
function button(cls,label,shape){
 const b=document.createElement('button');b.type='button';b.className=cls;
 b.title=label;b.setAttribute('aria-label',label);b.append(svg(shape));return b;
}
function applyFilter(){
 for(const card of list.querySelectorAll('.clip-note-card')){
  card.hidden=mode==='full'&&filter.value!=='all'&&card.dataset.kind!==filter.value;
 }
}
function decorate(){
 for(const card of list.querySelectorAll('.clip-note-card')){
  if(card.dataset.previewReady)continue;
  const actions=card.querySelector('.clip-note-buttons'),remove=actions?.querySelector('button');
  if(!remove)continue;
  card.dataset.previewReady='1';
  card.dataset.kind=card.querySelector('.clip-note-meta')?.textContent.startsWith('便签 ·')?'note':'clip';
  remove.classList.add('preview-remove');remove.replaceChildren(svg('remove'));
  remove.title=remove.getAttribute('aria-label')||'删除摘录';
  const edit=button('preview-edit','编辑完整正文','edit');
  const more=button('preview-more','更多操作','more');more.setAttribute('aria-expanded','false');
  more.addEventListener('click',event=>{
   event.stopPropagation();
   const active=actions.dataset.menuOpen==='true';
   for(const other of list.querySelectorAll('.clip-note-buttons[data-menu-open=true]')){
    other.dataset.menuOpen='false';other.querySelector('.preview-more')?.setAttribute('aria-expanded','false');
   }
   actions.dataset.menuOpen=String(!active);more.setAttribute('aria-expanded',String(!active));
  });
  edit.addEventListener('click',event=>{
   event.stopPropagation();actions.dataset.menuOpen='false';void editCard(card);
  });
  actions.prepend(more,edit);
 }
 applyFilter();
}
function readerReady(){
 if(!reader.hidden)return Promise.resolve(true);
 return new Promise(resolve=>{
  const obs=new MutationObserver(()=>{
   if(!reader.hidden){obs.disconnect();clearTimeout(timer);resolve(true);}
  });
  obs.observe(reader,{attributes:true,attributeFilter:['hidden']});
  const timer=setTimeout(()=>{obs.disconnect();resolve(false);},5000);
 });
}
async function editCard(card){
 const open=card.querySelector('.clip-note-open');if(!open)return;
 const wasRecent=mode==='recent';
 if(wasRecent)showFull(true);
 const reading=readerReady();open.click();entry=wasRecent?'recent':'full';
 if(await reading)$('clip-note-read-edit').click();
 else $('clip-notes-status').textContent='读取正文失败，请重新尝试编辑';
}
function confirmRemove(target){
 document.querySelectorAll('.preview-remove-confirm').forEach(x=>x.remove());
 const card=target.closest('.clip-note-card')||reader;
 const panel=document.createElement('div');panel.className='preview-remove-confirm';
 panel.setAttribute('role','group');panel.setAttribute('aria-label','确认删除摘录');
 const message=document.createElement('span');message.textContent='删除后不能恢复，确定删除？';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
 const yes=document.createElement('button');yes.type='button';yes.textContent='删除';yes.className='confirm-danger';
 cancel.onclick=()=>{panel.remove();target.focus();};
 yes.onclick=()=>{panel.remove();approved=target;target.click();};
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();cancel.click();}
 });
 panel.append(message,cancel,yes);card.append(panel);cancel.focus();
}
// Runs before the original delete listeners; confirmed click continues to them.
for(const area of [list,reader]){
 area.addEventListener('click',event=>{
  const target=event.target.closest('.preview-remove,#clip-note-read-remove');
  if(!target)return;
  if(approved===target){approved=null;return;}
  event.preventDefault();event.stopImmediatePropagation();confirmRemove(target);
 },true);
}
// Body and title have the same reading action. Toolbar clicks are independent.
list.addEventListener('click',event=>{
 const card=event.target.closest('.clip-note-card');
 if(!card||event.target.closest('.clip-note-buttons,.preview-remove-confirm'))return;
 if(mode==='recent'){entry='recent';showFull(true);}
 else if(event.isTrusted)entry='full';
},true);
list.addEventListener('click',event=>{
 const card=event.target.closest('.clip-note-card');
 if(card&&!event.target.closest('button,a,.preview-remove-confirm'))
  card.querySelector('.clip-note-open')?.click();
});
filter.addEventListener('change',applyFilter);
search.addEventListener('input',()=>{if(mode==='full')savedSearch=search.value;});
$('clip-view-all').addEventListener('click',()=>{
 entry='full';showFull();$('clip-my-notes').click();
});
$('clip-recent-new').addEventListener('click',()=>{
 newFromRecent=true;entry='recent';showFull(true);$('clip-note-new').click();
});
$('clip-notes-back').addEventListener('click',()=>{
 // Original controller ran its busy/dirty guard first.
 if(!home.hidden){const preserve=entry==='recent'||newFromRecent;entry='full';newFromRecent=false;showRecent(preserve);}
});
$('clip-note-reader-back').addEventListener('click',()=>{
 if(entry==='recent'){entry='full';showRecent(true);}
});
$('clip-note-cancel').addEventListener('click',()=>{
 if(newFromRecent&&$('clip-note-editor').hidden){newFromRecent=false;showRecent(true);}
});
$('clip-note-save').addEventListener('click',()=>{
 if(!newFromRecent)return;
 const status=$('clip-notes-status');
 const obs=new MutationObserver(()=>{
  if($('clip-note-editor').hidden&&status.textContent.includes('已保存完整正文')){
   obs.disconnect();clearTimeout(timer);newFromRecent=false;showRecent(true);
  }
 });
 obs.observe(status,{childList:true,characterData:true,subtree:true});
 const timer=setTimeout(()=>obs.disconnect(),8000);
});
$('clip-note-reload').addEventListener('click',()=>{
 void saveStore.recover().then(()=>{
  $('clip-recent-retry').hidden=true;void updateCount();
 }).catch(()=>{});
});
$('clip-recent-retry').addEventListener('click',async()=>{
 try{
  await saveStore.recover();
  $('clip-note-reload').click();$('clip-recent-retry').hidden=true;
  say('已重新读取摘录，请核对记录是否存在再重试');
 }catch(error){say('核对失败：'+String(error.message||error),true);}
});
// Preview-only home save; official createStore still verifies write+readback.
$('clip-save').addEventListener('click',async event=>{
 event.preventDefault();event.stopImmediatePropagation();
 if(saving)return;
 const clip=globalThis.__previewClip;
 if(!clip?.body)return say('请先提取网页内容',true);
 saving=true;$('clip-save').disabled=true;
 try{
  const result=await saveStore.save({...clip,kind:'clip'});
  $('clip-note-reload').click();await updateCount();
  $('clip-recent-retry').hidden=true;
  say(result.duplicate?'这条全文已存在，没有重复保存':'摘录已保存，最近列表已刷新');
 }catch(error){
  $('clip-recent-retry').hidden=!saveStore.uncertain;
  say((saveStore.uncertain?'保存结果未知，请先重新核对：':'保存失败：')+String(error.message||error),true);
 }finally{
  saving=false;$('clip-save').disabled=!globalThis.__previewClip;
 }
},true);
list.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 const menu=list.querySelector('.clip-note-buttons[data-menu-open=true]');
 if(menu){menu.dataset.menuOpen='false';menu.querySelector('.preview-more')?.focus();}
 document.querySelectorAll('.preview-remove-confirm').forEach(x=>x.remove());
});
document.addEventListener('pointerdown',event=>{
 if(!event.target.closest('.preview-remove-confirm'))
  document.querySelectorAll('.preview-remove-confirm').forEach(x=>x.remove());
 if(!event.target.closest('.clip-note-buttons')){
  for(const m of list.querySelectorAll('.clip-note-buttons[data-menu-open=true]')){
   m.dataset.menuOpen='false';m.querySelector('.preview-more')?.setAttribute('aria-expanded','false');
  }
 }
});
// Observe freshly RENDERED cards only; never force a hidden page visible.
new MutationObserver(()=>{decorate();void updateCount();}).observe(list,{childList:true});
showRecent();decorate();void updateCount();
})();