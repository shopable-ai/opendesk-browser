import {readTocPlacement,tocViewport,tocClampPoint,tocPlacementFromPoint,tocPlacementPoint} from '../../examples/sidebar-tools/reading-toc/trusted/placement.js';
import readingTocCatalog from './locales.generated.js';
import {uiMessage,resolveUiLocale} from '../ui/app-localization.js';

// Same compact R3 layout as the official sandbox tool, but implemented only in
// trusted extension code. No untrusted website text is parsed as markup.
const CSS=[
':host{all:initial;position:fixed;right:12px;top:clamp(90px,15vh,190px);width:254px;max-width:calc(100vw - 24px);z-index:2147483000;',
'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20222b;font-size:13px;line-height:1.45}',
'*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #426cff;outline-offset:2px}',
'.panel{background:#fff;border:1px solid #e9e9ef;border-radius:12px;padding:12px;box-shadow:0 3px 13px #10182716}',
':host([hidden]){display:none!important}',
'.head{display:flex;justify-content:space-between;align-items:center;gap:2px;margin-bottom:8px}',
'.grab{display:flex;align-items:center;gap:4px;min-width:0;padding:3px 1px;border:0;border-radius:6px;',
'background:transparent;color:inherit;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;flex:0 1 auto;overflow:hidden}',
'.grab:active{cursor:grabbing}.grab svg{width:13px;height:13px;flex:none;color:#8b90a1}',
':host([data-toc-custom]){transition:left .16s ease,top .16s ease}',
':host([data-toc-dragging]){transition:none!important}',
':host([data-toc-dragging]) .panel{box-shadow:0 9px 25px #1018272b}',
'.heading{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:650;letter-spacing:.045em;color:#727685}',
'.modes{display:flex;align-items:center;gap:1px;margin-left:auto;padding:2px;border:1px solid #e9e9ef;border-radius:8px;background:#fafafd;flex:none}',
'.mode{display:grid;place-items:center;flex:none;width:25px;height:27px;border:0;border-radius:5px;background:transparent;color:#858996;padding:0}',
'.mode svg{width:13px;height:13px}.mode[aria-pressed=true]{background:#fff;box-shadow:0 1px 3px #171d2a15;color:#303342}',
'.scroll[hidden],.ai-view[hidden]{display:none!important}',
'.ai-view{min-width:0}',
'.ai-member{padding:10px;background:#f8faff;border:1px solid #e4eaf7;border-radius:9px}',
'.ai-member-head,.ai-promo-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px}',
'.ai-member-title{color:#1b2c49;font-size:12px;font-weight:680}',
'.ai-member-tag,.ai-promo-brand,.ai-promo-kind{color:#7889a2;font-size:10px}',
'.ai-member-copy{margin:5px 0 7px;color:#566982;font-size:11px;line-height:1.5}',
'.ai-member-status{color:#697b96;font-size:11px}',
'.ai-member-disclaimer{margin:5px 0 0;color:#8b96a8;font-size:10px;line-height:1.45}',
'.ai-promo{margin-top:9px;padding:10px;background:#fff;border:1px solid #e6ebf3;border-radius:9px}',
'.ai-promo-title{margin:5px 0 0;color:#2c3b56;font-size:12px;font-weight:650}',
'.ai-promo-copy{margin:4px 0 0;color:#6d7f95;font-size:11px;line-height:1.5}',
// Available height follows the viewport rather than the narrowed layout width
// (opening Chrome Side Panel can shrink an otherwise tall desktop to <1100px).
'.scroll{max-height:min(68dvh,calc(100dvh - 150px),var(--toc-scroll-limit,10000px));overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}',
'.list{list-style:none;margin:0;padding:0;display:grid;gap:1px}',
'.list li{margin:0;padding-left:calc(var(--depth,0)*12px)}',
'.list li.answer-start{border-top:1px solid #e9e9ef;margin-top:7px;padding-top:7px}',
'.link{display:block;width:100%;text-align:left;border:0;border-left:2px solid transparent;background:transparent;color:#6b7280;',
'border-radius:0 3px 3px 0;padding:2px 0 2px 10px;line-height:1.45;font-size:13px}',
'.link.child{font-size:12px}.link:hover,.link[aria-current=location]{color:#20222b}',
'.link[aria-current=location]{border-left-color:#426cff}',
'.label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;max-height:2.9em}',
'.empty{margin:7px 0 0;color:#777b8a;font-size:12px}',
'@media(prefers-color-scheme:dark){:host{color:#e6e8ef}.panel{background:#1b1c24;border-color:#383a48}',
'.heading{color:#a4a7b3}.modes{background:#16171e;border-color:#383a48}',
'.mode{color:#8b90a1}.mode[aria-pressed=true]{background:#2a2d3a;color:#e3e7f4}',
'.link{color:#a0a5b4}.link:hover,.link[aria-current=location]{color:#f4f5f7}',
'.list li.answer-start{border-color:#383a48}',
'.ai-member{background:#23283a;border-color:#39415d}',
'.ai-member-title,.ai-promo-title{color:#edf1fc}',
'.ai-member-copy,.ai-member-status{color:#abb8d0}',
'.ai-member-tag,.ai-member-disclaimer,.ai-promo-brand,.ai-promo-kind,.ai-promo-copy{color:#9aa8be}',
'.ai-promo{background:#1b1c24;border-color:#383a48}}',
'@media(max-width:1100px){:host{right:8px;top:8px;width:220px;opacity:.95}.heading{font-size:11px}}',
'@media(max-width:720px){:host{top:auto;bottom:var(--toc-bottom,8px);right:8px;width:min(254px,calc(100vw - 16px));opacity:.94}}',
'@media(prefers-reduced-motion:reduce){:host{transition:none!important}*{scroll-behavior:auto!important;transition:none!important}}'
].join('');
const ICONS=[
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5h13M13 12h8M13 19h8M3 10a2 2 0 0 0 2 2h3M3 5v12a2 2 0 0 0 2 2h3"/></svg>',
'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.55 5.2L19 10l-5.45 1.8L12 17l-1.55-5.2L5 10l5.45-1.8L12 3Z"/><path d="m19 17 .65 1.35L21 19l-1.35.65L19 21l-.65-1.35L17 19l1.35-.65L19 17ZM4 15l.62 1.38L6 17l-1.38.62L4 19l-.62-1.38L2 17l1.38-.62L4 15Z"/></svg>'
];
// A short outline defaults to overview without mutating the user's selected mode.
export function readingTocDisplayMode(mode,compact,userSelected=false){
  return compact&&!userSelected?'top':mode;
}
export function createReadingTocView({doc,win=doc.defaultView,initialPlacement=null,initialLocale='zh-CN',onPlacementChange=()=>{},onNavigate}) {
  let locale=resolveUiLocale(initialLocale,Object.keys(readingTocCatalog.messages),'zh-CN');
  const t=(key,params)=>uiMessage(readingTocCatalog,locale,key,params);
  const host=doc.createElement('div');
  host.setAttribute('data-opendesk-toc-root','');
  const root=host.attachShadow({mode:'closed'});
  const sheet=new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets=[sheet];
  const make=(tag,cls)=>{const node=doc.createElement(tag);if(cls)node.className=cls;return node;};
  const panel=make('section','panel');panel.setAttribute('aria-label','网页目录');
  const head=make('div','head'),caption=make('strong','heading');
  caption.textContent='CONTENTS';
  const modes=make('div','modes');modes.hidden=false;modes.setAttribute('role','group');modes.setAttribute('aria-label','目录视图');
  const types=['top','focus','full','ai'],buttons=[];
  let mode='focus',modeExplicit=false,selected='',snapshot={items:[],sources:[],activeId:''},lastKey='';
  types.forEach((name,index)=>{
    const button=make('button','mode');button.type='button';const key=['topLabel','focusLabel','fullLabel','aiLabel'][index];
    button.title=t(name==='top'?'topTitle':key);
    button.setAttribute('aria-label',t(key));button.dataset.mode=name;
    button.setAttribute('aria-pressed',String(index===0));button.innerHTML=ICONS[index];
    button.addEventListener('click',()=>{mode=name;modeExplicit=true;render();});buttons.push(button);modes.append(button);
  });
  const grab=make('button','grab');grab.type='button';
  grab.title=t('dragTitle');
  grab.setAttribute('aria-label',t('dragAria'));
  grab.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight Home');
  grab.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1"/><circle cx="11" cy="3" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="13" r="1"/><circle cx="11" cy="13" r="1"/></svg>';
  grab.append(caption);
  // The webpage outline already follows DOM/SPA changes, so its toolbar has no
  // refresh-like circular-arrow action. Position reset remains on Home/double-click.
  head.append(grab,modes);
  const scroll=make('nav','scroll'),list=make('ul','list'),empty=make('p','empty');
  empty.textContent=t('pageEmpty');scroll.append(list,empty);
  // Reuse the reviewed, localized AI membership/partner contract from the
  // official Side Panel. This trusted view never calls a model or payment API.
  const aiView=make('section','ai-view');aiView.hidden=true;
  const member=make('div','ai-member'),memberHead=make('div','ai-member-head');
  const memberTitle=make('strong','ai-member-title'),memberTag=make('span','ai-member-tag');
  const memberCopy=make('p','ai-member-copy'),memberStatus=make('div','ai-member-status');
  const memberDisclaimer=make('p','ai-member-disclaimer');
  memberHead.append(memberTitle,memberTag);
  member.append(memberHead,memberCopy,memberStatus,memberDisclaimer);
  const promo=make('section','ai-promo'),promoHead=make('div','ai-promo-head');
  const promoBrand=make('span','ai-promo-brand'),promoKind=make('span','ai-promo-kind');
  const promoTitle=make('strong','ai-promo-title'),promoCopy=make('p','ai-promo-copy');
  promoHead.append(promoBrand,promoKind);
  promo.append(promoHead,promoTitle,promoCopy);aiView.append(member,promo);
  panel.append(head,scroll,aiView);root.append(panel);
  function updateAiCopy(){
    aiView.setAttribute('aria-label',t('aiLabel'));
    memberTitle.textContent=t('memberTitle');
    memberTag.textContent=t('memberTag');
    memberCopy.textContent=t('memberDescription');
    memberStatus.textContent=t('memberUnavailableMeta');
    memberDisclaimer.textContent=t('memberUnavailableDisclaimer');
    promo.setAttribute('aria-label',t('promoRecruit'));
    promoBrand.textContent=t('recruitBrand');
    promoKind.textContent=t('recruitKind');
    promoTitle.textContent=t('recruitTitle');
    promoCopy.textContent=t('recruitDescription');
  }
  function updateLanguage(){
    panel.setAttribute('aria-label',t('pageLabel'));
    // Preserve the approved literal CONTENTS heading shared with the Side Panel.
    // Accessible panel and control names remain localized.
    caption.textContent='CONTENTS';
    modes.setAttribute('aria-label',t('modesLabel'));
    buttons.forEach((button,index)=>{
      const key=['topLabel','focusLabel','fullLabel','aiLabel'][index];
      button.title=t(button.dataset.mode==='top'?'topTitle':key);
      button.setAttribute('aria-label',t(key));
    });
    grab.title=t('dragTitle');grab.setAttribute('aria-label',t('dragAria'));
    empty.textContent=t('pageEmpty');updateAiCopy();
  }
  updateLanguage();
  (doc.body||doc.documentElement).append(host);
  let composerObserved=null;
  function place(){
    if(disposed)return;
    host.hidden=false;
    host.style.removeProperty('--toc-bottom');host.style.removeProperty('--toc-scroll-limit');
    if(!placement)host.style.removeProperty('top');
    const input=doc.querySelector?.('#prompt-textarea');
    if(!input?.getClientRects().length){
      if(observer&&composerObserved)observer.unobserve(composerObserved);
      composerObserved=null;return;
    }
    const form=input.closest('form'),inputRect=input.getBoundingClientRect();
    const formRect=form?.getBoundingClientRect();
    const rect=formRect&&formRect.height>0?formRect:inputRect;
    const target=form||input;
    if(observer&&composerObserved!==target){
      if(composerObserved)observer.unobserve(composerObserved);
      observer.observe(target);composerObserved=target;
    }
    if(rect.bottom<=0||rect.top>=win.innerHeight)return;
    const card=host.getBoundingClientRect();
    if(card.right<=rect.left||card.left>=rect.right)return;
    if(win.innerWidth<=720&&!placement){
      host.style.setProperty('--toc-bottom',Math.max(8,win.innerHeight-rect.top+8)+'px');
      if(host.getBoundingClientRect().top<8)host.hidden=true;
    }else{
      host.style.setProperty('--toc-scroll-limit',Math.max(0,rect.top-scroll.getBoundingClientRect().top-20)+'px');
      const adjusted=host.getBoundingClientRect();
      if(adjusted.height>rect.top-16)host.hidden=true;
      else if(adjusted.bottom>rect.top-8)host.style.top=Math.max(8,rect.top-adjusted.height-8)+'px';
    }
  }
  let placement=readTocPlacement(initialPlacement),drag=null,disposed=false;
  function applyPoint(left,top) {
    const point=tocClampPoint(left,top,host.getBoundingClientRect(),tocViewport(win));
    host.style.left=point.left+'px';host.style.top=point.top+'px';
    host.style.right='auto';host.style.bottom='auto';
    host.setAttribute('data-toc-custom','');
  }
  function reposition() {
    if(!placement||drag||disposed)return;
    const point=tocPlacementPoint(placement,host.getBoundingClientRect(),tocViewport(win));
    if(point)applyPoint(point.left,point.top);
  }
  function setPlacement(next,{persist=false}={}) {
    if(drag||disposed)return;
    placement=readTocPlacement(next);
    if(placement)reposition();
    else {
      for(const side of ['left','top','right','bottom'])host.style.removeProperty(side);
      host.removeAttribute('data-toc-custom');
    }
    place();
    if(persist)onPlacementChange(placement);
  }
  function pointerMove(event) {
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<3)return;
    drag.moved=true;
    applyPoint(drag.left+dx,drag.top+dy);
    event.preventDefault();
  }
  function pointerFinish(event,cancel=false) {
    if(!drag||event.pointerId!==drag.id)return;
    const prior=drag.prior,moved=drag.moved;
    drag=null;
    host.removeAttribute('data-toc-dragging');
    try {if(grab.hasPointerCapture(event.pointerId))grab.releasePointerCapture(event.pointerId);}catch{}
    if(cancel||!moved){setPlacement(prior);return;}
    const rect=host.getBoundingClientRect();
    setPlacement(tocPlacementFromPoint(rect.left,rect.top,rect,tocViewport(win)),{persist:true});
  }
  grab.addEventListener('pointerdown',event=>{
    if(disposed||drag||event.button!==0||event.isPrimary===false)return;
    const rect=host.getBoundingClientRect();
    try {grab.setPointerCapture(event.pointerId);}catch{return;}
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,
      left:rect.left,top:rect.top,prior:placement,moved:false};
    host.setAttribute('data-toc-dragging','');
    event.preventDefault();
  });
  grab.addEventListener('pointermove',pointerMove);
  grab.addEventListener('pointerup',event=>{pointerMove(event);pointerFinish(event);});
  grab.addEventListener('pointercancel',event=>pointerFinish(event,true));
  grab.addEventListener('lostpointercapture',event=>pointerFinish(event,true));
  grab.addEventListener('keydown',event=>{
    const steps={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    if(event.key!=='Home'&&!Object.hasOwn(steps,event.key))return;
    event.preventDefault();
    if(event.key==='Home'){setPlacement(null,{persist:true});return;}
    const rect=host.getBoundingClientRect(),unit=event.shiftKey?32:12;
    const [dx,dy]=steps[event.key],viewport=tocViewport(win);
    const point=tocClampPoint(rect.left+dx*unit,rect.top+dy*unit,rect,viewport);
    setPlacement(tocPlacementFromPoint(point.left,point.top,rect,viewport),{persist:true});
  });
  grab.addEventListener('dblclick',()=>setPlacement(null,{persist:true}));
  const onResize=()=>{reposition();place();};
  win.addEventListener('resize',onResize);
  win.visualViewport?.addEventListener('resize',onResize);
  win.visualViewport?.addEventListener('scroll',onResize);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(onResize):null;
  observer?.observe(panel);
  function render(next) {
    if(next)snapshot=next;
    const {items,sources,activeId,adapter}=snapshot;
    // Website overlay follows the currently read answer automatically.
    // Source IDs remain internal so navigation never crosses answer boundaries.
    const activeSource=items.find(i=>i.id===activeId)?.sourceId;
    selected=sources.find(s=>s.id===activeSource)?.id||sources[0]?.id||'';
    const scoped=items.filter(item=>item.sourceId===selected);
    const active=scoped.find(item=>item.id===activeId)||scoped[0];
    const overview=snapshot.overview?.[selected];
    // All four modes remain visible even for a single-heading page.
    // AI is intentionally read-only and retains the last free TOC snapshot.
    if(mode==='ai'){
      scroll.hidden=true;aiView.hidden=false;
      for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.mode==='ai'));
      reposition();place();return;
    }
    scroll.hidden=false;aiView.hidden=true;
    // The approved four-icon toolbar is always visible, including compact outlines.
    modes.hidden=false;
    // For short outlines, default to the complete overview; an explicit mode choice still wins.
    const compact=scoped.length<=12;
    const displayMode=readingTocDisplayMode(mode,compact,modeExplicit);
    const overviewIds=new Set(overview?.ids||scoped.filter(item=>item.depth===0).map(item=>item.id));
    const overviewShowsAll=scoped.length<=12;
    const represented=displayMode==='top'&&!overviewShowsAll
      ?scoped.find(item=>item.id===(overview?.representedId||active?.topId)):active;
    const isChatFull=adapter==='chatgpt'&&displayMode==='full';
    const show=isChatFull?items:displayMode==='full'?scoped:displayMode==='top'
      ?(overviewShowsAll?scoped:scoped.filter(item=>overviewIds.has(item.id))):
      scoped.filter(item=>item.depth===0||item.topId===active?.topId);
    const key=displayMode+'|'+(isChatFull?'chat-all':'source')+'|'+selected+'|'+show.map(i=>i.id+'-'+i.label+'-'+i.depth+'-'+i.sourceId).join('|');
    if(key!==lastKey){
      const fragment=doc.createDocumentFragment();
      for(const [index,item] of show.entries()){
        const li=make('li');
        if(isChatFull&&index>0&&show[index-1].sourceId!==item.sourceId)li.classList.add('answer-start');
        li.style.setProperty('--depth',String(Math.min(item.depth,3)));
        const button=make('button','link'+(item.depth?' child':''));button.type='button';
        button.dataset.id=item.id;button.title=item.label;button.setAttribute('aria-label',item.label);
        const span=make('span','label');span.textContent=item.label;button.append(span);
        button.addEventListener('click',()=>onNavigate(item.id,item.sourceId));
        li.append(button);fragment.append(li);
      }
      list.replaceChildren(fragment);lastKey=key;
    }
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.mode===displayMode));
    for(const button of list.querySelectorAll('button')){
      if(button.dataset.id===represented?.id)button.setAttribute('aria-current','location');
      else button.removeAttribute('aria-current');
    }
    empty.hidden=show.length>0;
    reposition();place();
    const current=list.querySelector('[aria-current="location"]');
    if(current){
      const outer=scroll.getBoundingClientRect(),inner=current.getBoundingClientRect();
      if(inner.top<outer.top)scroll.scrollTop-=outer.top-inner.top;
      else if(inner.bottom>outer.bottom)scroll.scrollTop+=inner.bottom-outer.bottom;
    }
  }
  render();
  return Object.freeze({render,setPlacement,
    setLocale(next){
      const resolved=resolveUiLocale(next,Object.keys(readingTocCatalog.messages),'zh-CN');
      if(locale===resolved)return;
      locale=resolved;updateLanguage(); // No heading reindex, navigation, placement or scroll reset.
    },
    dispose(){
    if(disposed)return;disposed=true;drag=null;observer?.disconnect();
    win.removeEventListener('resize',onResize);
    win.visualViewport?.removeEventListener('resize',onResize);
    win.visualViewport?.removeEventListener('scroll',onResize);
    host.remove();
  }});
}
