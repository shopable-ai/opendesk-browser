(function(){
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const bundledCatalog=__OPENDESK_TOOL_MESSAGES__;
let catalog=globalThis.OpenDeskTool.messages||bundledCatalog;
let locale=globalThis.OpenDeskTool.locale||catalog.sourceLocale;
function t(key,values={}){
 const languages=Object.keys(catalog.messages);
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
// The AI surface is intentionally non-operational until a reviewed identity + provider contract exists.
// Never infer membership from TOC access, and never synthesize model output or a checkout destination.
const aiView=root.querySelector('#toc-ai-view'),freeView=root.querySelector('#toc-free-view');
const aiNodes=aiView?Object.fromEntries([
 'toc-member-card','toc-member-title','toc-member-tag','toc-member-description',
 'toc-member-meta','toc-member-entry','toc-member-disclaimer','toc-promo',
 'toc-promo-brand','toc-promo-kind','toc-promo-title','toc-promo-description',
 'toc-promo-action','toc-ai-navigation','toc-ai-list','toc-ai-status'
].map(id=>[id,root.querySelector('#'+id)])):null;
const promotion='recruit'; // reviewed static default; no remote scripts, ad iframe or tracker.
function paintAi(){
 if(!aiView||!aiNodes)return;
 const ai=mode==='ai';
 aiView.hidden=settingsPage||!ai;
 if(freeView)freeView.hidden=settingsPage||ai;
 if(!ai)return;
 const n=id=>aiNodes[id];
 // Service is not published. Unverified identities are never treated as active members.
 n('toc-member-card').hidden=false;
 n('toc-member-title').textContent=t('memberTitle');
 n('toc-member-tag').textContent=t('memberTag');
 n('toc-member-description').textContent=t('memberDescription');
 n('toc-member-meta').textContent=t('memberUnavailableMeta');
 n('toc-member-disclaimer').textContent=t('memberUnavailableDisclaimer');
 n('toc-member-entry').hidden=true;
 n('toc-member-entry').disabled=true;
 n('toc-ai-list').replaceChildren(); // No real AI output or stale navigation can enter the DOM.
 n('toc-ai-navigation').hidden=true;
 n('toc-ai-status').textContent=t('aiUnavailableFooter');
 n('toc-ai-navigation').setAttribute('aria-label',t('aiNavigationLabel'));
 const key=promotion==='official'?'official':promotion==='recruit'?'recruit':
   promotion==='external'?'external':null;
 n('toc-promo').hidden=!key;
 if(key){
  n('toc-promo').setAttribute('aria-label',t(key==='recruit'?'promoRecruit':key==='official'?'promoOfficial':'promoExternal'));
  for(const part of ['brand','kind','title','description'])
   n('toc-promo-'+part).textContent=t(key+part[0].toUpperCase()+part.slice(1));
  n('toc-promo-action').hidden=key!=='official';
  n('toc-promo-action').textContent=key==='official'?t('officialAction'):'';
 }
}
let mode='focus',selected='',sourceChoice='',data={items:[],sources:[],activeId:''},lastKey='';
let reading=false,closed=false,hasSnapshot=false,stale=false,failures=0,missing=0,timer=0,wantForce=false,recoveryBlocked=false;
let pageGeneration=0,readinessSince=null;
let statusKey='',statusValues={},statusState='',moreCount=0;
function paintStatus(){
 error.textContent=statusKey?t(statusKey,statusValues):'';
 error.dataset.state=statusState;error.hidden=!statusKey;
}
function paintLanguage(){
 settingsLanguage();
 root.querySelector('.toc-panel').setAttribute('aria-label',t('panelLabel'));
 paintSettingsNavigation();
 root.querySelector('.toc-modes').setAttribute('aria-label',t('modesLabel'));
 root.querySelector('.toc-scroll').setAttribute('aria-label',t('navigationLabel'));
 source.setAttribute('aria-label',t('sourceLabel'));
 controls.forEach(button=>{
  const key={top:'topLabel',focus:'focusLabel',full:'fullLabel',ai:'aiLabel'}[button.dataset.tocMode];
  button.title=t(button.dataset.tocMode==='top'?'topTitle':key);
  button.setAttribute('aria-label',t(key));
 });
 reload.title=t('refreshTitle');reload.setAttribute('aria-label',t('refreshLabel'));
 empty.textContent=t('emptyLabel');paintStatus();
 more.textContent=t('moreWithCount',{count:moreCount});
 more.setAttribute('aria-label',t('moreAria',{count:moreCount}));
 paintAi();
}
function showStatus(key='',values={},state=''){
 statusKey=key;statusValues=values;statusState=state;paintStatus();
}
function render(){
 paintAi();
 const {items,sources,activeId,adapter}=data;
 if(sourceChoice&&!sources.some(item=>item.id===sourceChoice))sourceChoice='';
 const activeSource=items.find(item=>item.id===activeId)?.sourceId;
 selected=sourceChoice||sources.find(item=>item.id===activeSource)?.id||sources[0]?.id||'';
 source.hidden=true; // The sidebar follows the active document/answer automatically; no dropdown.
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
 // A short page already fits in the sidebar; never truncate it into a second action.
 const overviewShowsAll=scoped.length<=12;
 const represented=mode==='top'&&!overviewShowsAll
  ?scoped.find(item=>item.id===(overview?.representedId||current?.topId)):current;
 // For short outlines the trusted overview already represents every heading.
 // Keep both distinct H2s beneath two H1s in the default focus view, even
 // when the labels are identical. Long outlines still focus on the active tree.
 const compact=Boolean(scoped.length&&scoped.length<=5&&overview?.ids?.length===scoped.length);
 const isChatFull=adapter==='chatgpt'&&mode==='full';
  const shown=isChatFull?items:mode==='full'?scoped:mode==='top'
  ?(overviewShowsAll?scoped:scoped.filter(item=>overviewIds.has(item.id)))
  :compact?scoped:scoped.filter(item=>item.depth===0||item.topId===current?.topId);
 const key=mode+'|'+(isChatFull?'chat-all':'source')+'|'+selected+'|'+shown.map(item=>item.id+':'+item.label+':'+item.depth+':'+item.sourceId).join('|');
 if(key!==lastKey){
  const fragment=document.createDocumentFragment();
  shown.forEach((item,index)=>{
   const li=document.createElement('li');
   if(isChatFull&&index>0&&shown[index-1].sourceId!==item.sourceId)li.classList.add('toc-answer-start');
   li.style.setProperty('--depth',String(Math.min(item.depth,3)));
   const button=document.createElement('button');button.className='toc-link'+(item.depth?' child':'');
   button.type='button';button.title=item.label;button.dataset.id=item.id;button.setAttribute('aria-label',item.label);
   const span=document.createElement('span');span.textContent=item.label;button.append(span);
   button.addEventListener('click',async()=>{
    if(stale)return;
    const generation=pageGeneration;
    showStatus('');
    try{const result=await request('page.request',{operation:'toc.navigate',payload:{id:item.id,sourceId:item.sourceId}});
     if(closed||generation!==pageGeneration)return;
     if(!result?.ok)throw Error(t('navigateChanged'));
     data.activeId=item.id;render();
    }catch(e){if(!closed&&generation===pageGeneration)showStatus('navigateChanged',{},'error');}
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
 more.hidden=true;moreCount=remaining; // The existing full-view icon opens long outlines.
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
 if(reading)return; // Explicit refreshes are retained until the in-flight read settles.
 clearTimeout(timer);timer=0;
 void refresh();
}
async function refresh(){
 if(closed||reading)return;
 reading=true;
 const generation=pageGeneration;
 let waitingForPage=false;
 const force=wantForce||(hasSnapshot&&missing>0&&missing<3);
 wantForce=false;
 reload.setAttribute('aria-busy','true');
 if(!hasSnapshot)showStatus('loading',{},'loading');
 try{
  const snapshot=await request('page.request',{operation:'toc.snapshot',payload:force?{refresh:true}:{}});
  if(closed||generation!==pageGeneration)return;
  if(!snapshot||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.sources))
   throw Object.assign(Error(t('invalidData')),{code:'E_TOC_SNAPSHOT'});
  data=snapshot;hasSnapshot=true;stale=false;failures=0;recoveryBlocked=false;readinessSince=null;void loadSettings(snapshot);
  missing=snapshot.items.length===0?Math.min(3,missing+1):0;
  showStatus('');render();
 }catch(e){
  if(!closed&&generation===pageGeneration){
   failures=Math.min(8,failures+1);
   stale=hasSnapshot&&data.items.length>0;
   render();
   const detail=String(e?.message||t('readFail')).slice(0,150);
   const installationBlocked=e?.code==='E_APP_PAGE_OWNER'||e?.code==='E_PAGE_INSTALLATION';
   const pageReloadRequired=e?.code==='E_APP_PAGE_RELOAD_REQUIRED';
   recoveryBlocked=installationBlocked||pageReloadRequired;
   // A reload can briefly have no live document/handler or no usable snapshot.
   // Retry only this read, with a bounded loading phase; stale links stay disabled.
   // Current Page Target reports navigation/loading as E_DOCUMENT_UNRESOLVED.
   // Its real readiness transition, not three fast reads, ends this loading phase.
   // A bounded elapsed window still exposes a sustained failure with recovery steps.
   if(readinessSince===null)readinessSince=Date.now();
   waitingForPage=e?.code==='E_DOCUMENT_UNRESOLVED'?Date.now()-readinessSince<10000:
    failures<=3&&['E_TOC_SNAPSHOT','E_TARGET','E_DOCUMENT_STALE',
     'E_PAGE_AUTHORIZATION','E_APP_PAGE_NOT_READY'].includes(e?.code);
   showStatus(installationBlocked?'installationRepair':pageReloadRequired?'pageReloadRequired':waitingForPage?'loading':stale?'stale':'retry',
    {detail},waitingForPage?'loading':'error');
  }
 }finally{
  reading=false;reload.removeAttribute('aria-busy');
  if(closed)return;
  if(wantForce)schedule(80); // Do not lose a new-document event to the old request's error.
  else if(recoveryBlocked)return; // Requires page/installation recovery, not background polling.
  else if(waitingForPage)schedule(Math.min(4000,250*Math.pow(2,failures-1)));
  else if(failures)schedule(Math.min(8000,500*Math.pow(2,Math.min(failures-1,4))));
  else if(hasSnapshot&&missing>0&&missing<3)schedule(missing===1?600:1600);
  else schedule(4000);
 }
}
globalThis.OpenDeskTool.onLocaleChange?.(next=>{
 if(closed)return;
 catalog=globalThis.OpenDeskTool.messages||bundledCatalog;
 locale=next;paintLanguage();render(); // Same data; never makes a network or TOC request.
});
// App-owned site/page controls. Each change merges just one list membership
// against the latest ETag; capacity/unknown failures preserve all existing data.
const settings=root.querySelector('#toc-settings'),settingsError=root.querySelector('#toc-settings-error');
const settingsRecover=root.querySelector('#toc-settings-recover');
const settingsOpen=root.querySelector('#toc-settings-open'),settingsBack=root.querySelector('#toc-settings-back');
let settingsIdentity=null,settingsBusy=false,settingsDirty=false,settingsToken=0,settingsPage=false;
let settingsChecking=false;
const settingFields=['blockedOrigins','disabledPages','hiddenSites','hiddenPages'];
const settingsLabels=['本站启用目录','本页启用目录','本站显示悬浮目录','本页显示悬浮目录'];
// A click before the target/preferences are ready cannot be saved. Prevent
// the Bridge's real-input dirty signal from creating a draft with no action.
for(const input of settings?.querySelectorAll('input')||[])input.disabled=true;
function settingsLanguage(){
 const en=String(locale).startsWith('en');
 const label=en?'Site and page settings':'网站与页面设置';
 settings?.setAttribute('aria-label',label);
 if(settingsOpen){settingsOpen.title=label;settingsOpen.setAttribute('aria-label',label);}
 settingsBack?.setAttribute('aria-label',en?'Back to contents':'返回目录');
 if(settingsRecover)settingsRecover.textContent=en?'Check saved settings':'重新核对设置';
 const index=settings?.querySelector('[data-settings-group="index"]');
 const overlay=settings?.querySelector('[data-settings-group="overlay"]');
 if(index)index.textContent=en?'Contents indexing':'目录索引';
 if(overlay)overlay.textContent=en?'Floating contents':'悬浮目录';
 const labels=en?['Enable on this site','Enable on this page','Show overlay on this site','Show overlay on this page']:settingsLabels;
 settings?.querySelectorAll('[data-setting-label]').forEach((node,i)=>{node.textContent=labels[i];});
}
function paintSettingsNavigation(){
 const tool=globalThis.OpenDeskTool,en=String(locale).startsWith('en');
 const title=settingsPage?(en?'Settings':'设置'):t('title');
 const base={page:settingsPage?'settings':'home',title,canBack:settingsPage,primary:null};
 let accepted=false,projected=false;
 if(typeof tool.setNavigation==='function'){
  if(tool.navigationFeatures?.settingsPage===true){
   accepted=tool.setNavigation({...base,settingsPage:'settings'});
   projected=accepted===true;
  }
  if(!projected&&tool.navigationFeatures?.headerActions===true){
   accepted=tool.setNavigation({...base,headerActions:!settingsPage&&settingsIdentity
    ?[{id:'settings',label:settingsOpen?.title||title,icon:'settings'}]:[]});
   projected=accepted===true;
   if(accepted===false)accepted=tool.setNavigation(base);
  }else if(!projected)accepted=tool.setNavigation(base);
 }
 const heading=root.querySelector('.toc-title');
 heading.textContent=title;heading.hidden=accepted===true;
 if(settingsOpen)settingsOpen.hidden=settingsPage||!settingsIdentity||projected;
 if(settingsBack)settingsBack.hidden=!settingsPage||accepted===true;
 root.querySelector('.toc-modes').hidden=settingsPage;
 reload.hidden=settingsPage;
 if(settings)settings.hidden=!settingsPage;
 if(freeView)freeView.hidden=settingsPage||mode==='ai';
 if(aiView)aiView.hidden=settingsPage||mode!=='ai';
 root.querySelector('.toc-head').hidden=settingsPage&&accepted===true;
}
function showSettings(next){
 if(closed||settingsBusy||settingsDirty)return;
 settingsPage=next;paintSettingsNavigation();
 // The content stays mounted, preserving the selected mode and outline scroll.
 if(next)settings?.querySelector('input')?.focus?.();
 else if(settingsOpen&&!settingsOpen.hidden)settingsOpen.focus();
}
function onNavigation({detail}){
 if(detail?.action==='settings'&&detail.page==='settings')showSettings(true);
 else if(detail?.action==='header'&&detail.page==='home'&&detail.actionId==='settings'&&!settingsPage)showSettings(true);
 else if(detail?.action==='back'&&settingsPage)showSettings(false);
}
settingsOpen?.addEventListener('click',()=>showSettings(true));
settingsBack?.addEventListener('click',()=>showSettings(false));
root.addEventListener('opendesk-tool-navigation',onNavigation);
async function loadSettings(snapshot,{reconcile=false}={}){
 if(!settings||settingsBusy||!reconcile&&(settingsChecking||stale||!snapshot?.url))return;
 const token=++settingsToken;
 try{
  const stored=await request('storage.get',{key:'preferences',withEtag:true});
  if(closed||settingsBusy)return;
  if(token!==settingsToken){
   if(reconcile&&settingsError){settingsError.hidden=false;settingsError.textContent=
    String(locale).startsWith('en')?'The page changed. Check saved settings again.':'页面已变化，请重新核对设置。';}
   return;
  }
  const value=stored.value??{};
  if(typeof stored.etag!=='string'||!stored.etag||typeof value!=='object'||Array.isArray(value)||
    settingFields.some(field=>value[field]!==undefined&&(!Array.isArray(value[field])||
     value[field].some(item=>typeof item!=='string'))))throw Error('Invalid saved settings');
  if(reconcile){
   // This read follows the Host's original write queue. It never repeats a
   // mutation; only a current, authoritative read can retire the unknown state.
   settingsDirty=false;setState({dirty:false,busy:false});
   if(settingsRecover)settingsRecover.hidden=true;
   if(settingsError){settingsError.hidden=true;settingsError.textContent='';}
  }
  if(stale||!snapshot?.url)return;
  const url=new URL(snapshot.url);
  const identity={origin:url.origin,page:url.origin+url.pathname};
  settingsIdentity=identity;paintSettingsNavigation();
  for(const input of settings.querySelectorAll('input[data-toc-setting]')){
   const field=input.dataset.tocSetting;
   input.checked=!(value[field]||[]).includes(field.endsWith('Origins')||field==='hiddenSites'?identity.origin:identity.page);
   input.disabled=settingsDirty;
  }
 }catch(error){if(!closed&&token===settingsToken){
  settingsIdentity=null;paintSettingsNavigation();
  for(const input of settings.querySelectorAll('input'))input.disabled=true;
  if(reconcile&&settingsError){settingsError.hidden=false;settingsError.textContent=
   (String(locale).startsWith('en')?'Could not check saved settings: ':'设置核对失败：')+String(error?.message||error).slice(0,150);}
 }}
}
settingsRecover?.addEventListener('click',async()=>{
 if(closed||settingsBusy||settingsChecking||!settingsDirty)return;
 settingsChecking=true;settingsRecover.disabled=true;
 try{await loadSettings(data,{reconcile:true});}
 finally{settingsChecking=false;settingsRecover.disabled=false;}
});
settings?.addEventListener('change',async event=>{
 const input=event.target,field=input.dataset?.tocSetting;
 if(!settingFields.includes(field)||!settingsIdentity||settingsBusy||settingsDirty)return;
 const identity=settingsIdentity,target=field==='blockedOrigins'||field==='hiddenSites'?identity.origin:identity.page;
 const excluded=!input.checked;settingsBusy=true;settingsDirty=true;settingsToken++;
 let saved=false;
 setState({dirty:true,busy:true});
 for(const node of settings.querySelectorAll('input'))node.disabled=true;
 try{
  for(let attempt=0;attempt<4;attempt++){
   const before=await request('storage.get',{key:'preferences',withEtag:true});
   if(closed)return;
   if(typeof before?.etag!=='string'||!before.etag)throw Error('Missing storage ETag');
   const value=before.value??{};
   if(typeof value!=='object'||Array.isArray(value))throw Error('Invalid preferences');
   const items=value[field]||[];
   if(!Array.isArray(items)||items.some(item=>typeof item!=='string'))throw Error('Invalid preferences');
   const next=items.filter(item=>item!==target);if(excluded)next.push(target);
   try{
    const receipt=await request('storage.set',{key:'preferences',value:{...value,[field]:next},ifMatch:before.etag});
    if(receipt?.saved!==true)throw Error('Storage write not confirmed');
    saved=true;break;
   }catch(error){if(error?.code!=='E_STORAGE_CONFLICT'||attempt===3)throw error;}
  }
  if(saved&&settingsError){settingsError.hidden=true;settingsError.textContent='';}
 }catch(error){
  if(settingsError){settingsError.hidden=false;settingsError.textContent=(String(locale).startsWith('en')?'Settings were not saved: ':'设置未保存：')+String(error?.message||error).slice(0,150);}
 }
 finally{
  settingsBusy=false;settingsDirty=!saved;
  if(!closed){
   // A follow-up display read must not keep a confirmed save busy.
   setState({dirty:settingsDirty,busy:false});
   if(settingsRecover)settingsRecover.hidden=!settingsDirty;
   void loadSettings(data);requestRefresh();
  }
 }
});
settingsLanguage();
paintLanguage();
controls.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.tocMode;render();}));
const modeGroup=root.querySelector('.toc-modes');
modeGroup.addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const index=controls.indexOf(document.activeElement);
 if(index<0)return;
 const next=event.key==='Home'?0:event.key==='End'?controls.length-1:
  (index+(event.key==='ArrowRight'?1:-1)+controls.length)%controls.length;
 event.preventDefault();controls[next].focus();mode=controls[next].dataset.tocMode;render();
});
if(aiNodes)aiNodes['toc-promo-action'].addEventListener('click',()=>{
 if(promotion==='official'){mode='full';render();}
});
more.addEventListener('click',()=>{mode='full';render();});
source.addEventListener('change',()=>{sourceChoice=source.value;render();});
reload.addEventListener('click',()=>requestRefresh(true));
const onPageChanged=()=>{
 if(closed)return;
 pageGeneration++;failures=0;missing=0;readinessSince=null;recoveryBlocked=false;
 settingsToken++;settingsIdentity=null;paintSettingsNavigation();
 for(const input of settings?.querySelectorAll('input')||[])input.disabled=true;
 stale=hasSnapshot;showStatus('loading',{},'loading');render();
 requestRefresh(true);
};
root.addEventListener('opendesk-page-changed',onPageChanged);
window.addEventListener('focus',()=>requestRefresh());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestRefresh();});
window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);root.removeEventListener('opendesk-tool-navigation',onNavigation);root.removeEventListener('opendesk-page-changed',onPageChanged);},{once:true});
requestRefresh();
})();
