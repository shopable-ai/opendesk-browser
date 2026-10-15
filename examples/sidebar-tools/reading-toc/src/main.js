(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const catalog=__OPENDESK_TOOL_MESSAGES__;
const languages=Object.keys(catalog.messages);
let locale=globalThis.OpenDeskTool.locale||catalog.sourceLocale;
function t(key,values={}){
 let display=languages.includes(locale)?locale:catalog.sourceLocale;
 if(display===catalog.sourceLocale){
  try{const base=new Intl.Locale(locale).language;
   if(languages.includes(base))display=base;
   else{const matched=languages.filter(lang=>new Intl.Locale(lang).language===base);
    if(matched.length===1)display=matched[0];}
  }catch{/* Unsupported preference uses source text. */}
 }
 const template=catalog.messages[display]?.[key]||catalog.messages[catalog.sourceLocale]?.[key]||'';
 return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>String(values[name]??'').slice(0,180));
}
const source=root.querySelector('#toc-source'),list=root.querySelector('#toc-list');
const empty=root.querySelector('#toc-empty'),error=root.querySelector('#toc-error');
const more=root.querySelector('#toc-overview-more'),reload=root.querySelector('#toc-refresh');
const controls=[...root.querySelectorAll('button[data-toc-mode]')];
let mode='focus',selected='',sourceChoice='',data={items:[],sources:[],activeId:''},lastKey='';
let reading=false,closed=false,hasSnapshot=false,stale=false,failures=0,missing=0,timer=0,wantForce=false;
let statusKey='',statusValues={},statusState='',moreCount=0;
function paintStatus(){
 error.textContent=statusKey?t(statusKey,statusValues):'';
 error.dataset.state=statusState;error.hidden=!statusKey;
}
function paintLanguage(){
 root.querySelector('.toc-panel').setAttribute('aria-label',t('panelLabel'));
 root.querySelector('.toc-title').textContent=t('contents');
 root.querySelector('.toc-modes').setAttribute('aria-label',t('modesLabel'));
 root.querySelector('.toc-scroll').setAttribute('aria-label',t('navigationLabel'));
 source.setAttribute('aria-label',t('sourceLabel'));
 controls.forEach(button=>{
  const key={top:'topLabel',focus:'focusLabel',full:'fullLabel'}[button.dataset.tocMode];
  button.title=t(button.dataset.tocMode==='top'?'topTitle':key);
  button.setAttribute('aria-label',t(key));
 });
 reload.title=t('refreshTitle');reload.setAttribute('aria-label',t('refreshLabel'));
 empty.textContent=t('emptyLabel');paintStatus();
 more.textContent=t('moreWithCount',{count:moreCount});
 more.setAttribute('aria-label',t('moreAria',{count:moreCount}));
}
function showStatus(key='',values={},state=''){
 statusKey=key;statusValues=values;statusState=state;paintStatus();
}
function render(){
 const {items,sources,activeId}=data;
 if(sourceChoice&&!sources.some(item=>item.id===sourceChoice))sourceChoice='';
 const activeSource=items.find(item=>item.id===activeId)?.sourceId;
 selected=sourceChoice||sources.find(item=>item.id===activeSource)?.id||sources[0]?.id||'';
 source.hidden=sources.length<2;
 const followed=sources.find(item=>item.id===selected)?.label||t('sourceCurrent');
 const options=[{id:'',label:t('following',{source:followed})},...sources];
 if(source.options.length!==options.length||[...source.options].some((node,i)=>
  node.value!==options[i].id||node.textContent!==options[i].label)){
  source.replaceChildren();options.forEach(item=>{const node=document.createElement('option');node.value=item.id;node.textContent=item.label;source.append(node);});
 }
 source.value=sourceChoice;const scoped=items.filter(item=>item.sourceId===selected);
 const current=scoped.find(item=>item.id===activeId)||scoped[0];
 const overview=data.overview?.[selected];
 const overviewIds=new Set(overview?.ids||scoped.filter(item=>item.depth===0).map(item=>item.id));
 const represented=mode==='top'
  ?scoped.find(item=>item.id===(overview?.representedId||current?.topId)):current;
 const shown=mode==='full'?scoped:mode==='top'
  ?scoped.filter(item=>overviewIds.has(item.id))
  :scoped.filter(item=>item.depth===0||item.topId===current?.topId);
 const key=mode+'|'+selected+'|'+shown.map(item=>item.id+':'+item.label+':'+item.depth).join('|');
 if(key!==lastKey){
  const fragment=document.createDocumentFragment();
  shown.forEach(item=>{
   const li=document.createElement('li');li.style.setProperty('--depth',String(Math.min(item.depth,3)));
   const button=document.createElement('button');button.className='toc-link'+(item.depth?' child':'');
   button.type='button';button.title=item.label;button.dataset.id=item.id;button.setAttribute('aria-label',item.label);
   const span=document.createElement('span');span.textContent=item.label;button.append(span);
   button.addEventListener('click',async()=>{
    if(stale)return;
    showStatus('');
    try{const result=await request('toc.navigate',{id:item.id,sourceId:item.sourceId});
     if(!result?.ok)throw Error(t('navigateChanged'));
     data.activeId=item.id;render();
    }catch(e){showStatus('navigateChanged',{},'error');}
   });li.append(button);fragment.append(li);
  });list.replaceChildren(fragment);lastKey=key;
 }
 for(const button of list.querySelectorAll('button')){
  button.disabled=stale;
  if(button.dataset.id===represented?.id)button.setAttribute('aria-current','location');
  else button.removeAttribute('aria-current');
 }
 for(const button of controls)button.setAttribute('aria-pressed',String(button.dataset.tocMode===mode));
 empty.hidden=shown.length!==0||!hasSnapshot;
 empty.textContent=t('emptyLabel');
 const remaining=mode==='top'?Math.max(0,overview?.hiddenCount||0):0;
 more.hidden=remaining===0;moreCount=remaining;
 more.textContent=t('moreWithCount',{count:remaining});
 more.setAttribute('aria-label',t('moreAria',{count:remaining}));
}
function schedule(delay){
 clearTimeout(timer);
 if(!closed)timer=setTimeout(()=>{timer=0;void refresh();},delay);
}
function requestRefresh(force=false){
 if(closed)return;
 if(force)wantForce=true;
 if(reading)return; // Manual reload is replayed after the in-flight read.
 clearTimeout(timer);timer=0;
 void refresh();
}
async function refresh(){
 if(closed||reading)return;
 reading=true;
 const force=wantForce||(hasSnapshot&&missing>0&&missing<3);
 wantForce=false;
 reload.setAttribute('aria-busy','true');
 if(!hasSnapshot)showStatus('loading',{},'loading');
 try{
  const snapshot=await request('toc.snapshot',force?{refresh:true}:{});
  if(closed)return;
  if(!snapshot||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.sources))throw Error(t('invalidData'));
  data=snapshot;hasSnapshot=true;stale=false;failures=0;
  missing=snapshot.items.length===0?Math.min(3,missing+1):0;
  showStatus('');render();
 }catch(e){
  if(!closed){
   failures=Math.min(8,failures+1);
   stale=hasSnapshot&&data.items.length>0;
   render();
   const detail=String(e?.message||t('readFail')).slice(0,150);
   showStatus(stale?'stale':'retry',{detail},'error');
  }
 }finally{
  reading=false;reload.removeAttribute('aria-busy');
  if(closed)return;
  if(wantForce)schedule(80);
  else if(failures)schedule(Math.min(8000,500*Math.pow(2,Math.min(failures-1,4))));
  else if(hasSnapshot&&missing>0&&missing<3)schedule(missing===1?600:1600);
  else schedule(4000);
 }
}
globalThis.OpenDeskTool.onLocaleChange?.(next=>{
 if(closed)return;
 locale=next;paintLanguage();render(); // Same data; never makes a network or TOC request.
});
paintLanguage();
controls.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.tocMode;render();}));
more.addEventListener('click',()=>{mode='full';render();});
source.addEventListener('change',()=>{sourceChoice=source.value;render();});
reload.addEventListener('click',()=>requestRefresh(true));
window.addEventListener('focus',()=>requestRefresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestRefresh();});
window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);},{once:true});
requestRefresh();
})();
