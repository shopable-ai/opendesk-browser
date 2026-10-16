import {readTocPlacement,tocViewport,tocClampPoint,tocPlacementFromPoint,tocPlacementPoint} from './placement.js';
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
'background:transparent;color:inherit;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}',
'.grab:active{cursor:grabbing}.grab svg{width:13px;height:13px;flex:none;color:#8b90a1}',
'.reset{display:grid;place-items:center;flex:none;width:24px;height:27px;border:0;border-radius:6px;',
'background:transparent;color:#858996;padding:0}.reset svg{width:14px;height:14px}',
'.reset:hover{background:#f1f3f8;color:#303342}',
':host([data-toc-custom]){transition:left .16s ease,top .16s ease}',
':host([data-toc-dragging]){transition:none!important}',
':host([data-toc-dragging]) .panel{box-shadow:0 9px 25px #1018272b}',
'.heading{font-size:12px;font-weight:650;letter-spacing:.045em;color:#727685}',
'.modes{display:flex;align-items:center;gap:1px;margin-left:auto;padding:2px;border:1px solid #e9e9ef;border-radius:8px;background:#fafafd}',
'.mode{display:grid;place-items:center;width:27px;height:27px;border:0;border-radius:5px;background:transparent;color:#858996;padding:0}',
'.mode svg{width:14px;height:14px}.mode[aria-pressed=true]{background:#fff;box-shadow:0 1px 3px #171d2a15;color:#303342}',
'.modes[hidden]{display:none}',
// Available height follows the viewport rather than the narrowed layout width
// (opening Chrome Side Panel can shrink an otherwise tall desktop to <1100px).
'.scroll{max-height:min(68dvh,calc(100dvh - 150px),var(--toc-scroll-limit,10000px));overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}',
'.list{list-style:none;margin:0;padding:0;display:grid;gap:1px}',
'.list li{margin:0;padding-left:calc(var(--depth,0)*12px)}',
'.link{display:block;width:100%;text-align:left;border:0;border-left:2px solid transparent;background:transparent;color:#6b7280;',
'border-radius:0 3px 3px 0;padding:2px 0 2px 10px;line-height:1.45;font-size:13px}',
'.link.child{font-size:12px}.link:hover,.link[aria-current=location]{color:#20222b}',
'.link[aria-current=location]{border-left-color:#426cff}',
'.label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;max-height:2.9em}',
'.empty{margin:7px 0 0;color:#777b8a;font-size:12px}',
'.more{display:block;width:100%;margin-top:6px;padding:7px 8px;text-align:left;',
'border:1px solid #e9e9ef;border-radius:7px;background:#f8f9fc;color:#5062a0;font-size:12px}',
'.more:hover{background:#eef2ff;color:#2c49b6}.more[hidden]{display:none}',
'@media(prefers-color-scheme:dark){:host{color:#e6e8ef}.panel{background:#1b1c24;border-color:#383a48}',
'.heading{color:#a4a7b3}.modes{background:#16171e;border-color:#383a48}',
'.mode{color:#8b90a1}.mode[aria-pressed=true]{background:#2a2d3a;color:#e3e7f4}',
'.link{color:#a0a5b4}.link:hover,.link[aria-current=location]{color:#f4f5f7}',
'.reset:hover{background:#2a2d3a;color:#e3e7f4}',
'.more{background:#272936;color:#acbfff;border-color:#383a48}.more:hover{background:#303850;color:#d4dfff}}',
'@media(max-width:1100px){:host{right:8px;top:8px;width:220px;opacity:.95}.heading{font-size:11px}}',
'@media(max-width:720px){:host{top:auto;bottom:var(--toc-bottom,8px);right:8px;width:min(254px,calc(100vw - 16px));opacity:.94}}',
'@media(prefers-reduced-motion:reduce){:host{transition:none!important}*{scroll-behavior:auto!important;transition:none!important}}'
].join('');
const ICONS=[
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5h13M13 12h8M13 19h8M3 10a2 2 0 0 0 2 2h3M3 5v12a2 2 0 0 0 2 2h3"/></svg>'
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
  const modes=make('div','modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','目录视图');
  const types=['top','focus','full'],buttons=[];
  let mode='focus',modeExplicit=false,selected='',snapshot={items:[],sources:[],activeId:''},lastKey='',moreRemaining=0;
  types.forEach((name,index)=>{
    const button=make('button','mode');button.type='button';button.title=t(['topLabel','focusLabel','fullLabel'][index]);
    button.setAttribute('aria-label',button.title);button.dataset.mode=name;
    button.setAttribute('aria-pressed',String(index===0));button.innerHTML=ICONS[index];
    button.addEventListener('click',()=>{mode=name;modeExplicit=true;render();});buttons.push(button);modes.append(button);
  });
  const grab=make('button','grab');grab.type='button';
  grab.title=t('dragTitle');
  grab.setAttribute('aria-label',t('dragAria'));
  grab.setAttribute('aria-keyshortcuts','ArrowUp ArrowDown ArrowLeft ArrowRight Home');
  grab.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1"/><circle cx="11" cy="3" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="13" r="1"/><circle cx="11" cy="13" r="1"/></svg>';
  grab.append(caption);
  const reset=make('button','reset');reset.type='button';
  reset.title=t('resetTitle');
  reset.setAttribute('aria-label',t('resetAria'));
  reset.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 3 7"/><path d="M3 4v7h7"/><path d="M12 7v5l3 2"/></svg>';
  head.append(grab,modes,reset);
  const scroll=make('nav','scroll'),list=make('ul','list'),empty=make('p','empty');
  const more=make('button','more');more.type='button';more.hidden=true;
  more.addEventListener('click',()=>{mode='full';modeExplicit=true;render();});
  empty.textContent=t('pageEmpty');scroll.append(list,more,empty);panel.append(head,scroll);root.append(panel);
  function updateMore(){
    more.textContent=t('moreWithCount',{count:moreRemaining});
    more.setAttribute('aria-label',t('moreAria',{count:moreRemaining}));
  }
  function updateLanguage(){
    panel.setAttribute('aria-label',t('pageLabel'));
    caption.textContent=t('contents');
    modes.setAttribute('aria-label',t('modesLabel'));
    buttons.forEach((button,index)=>{
      button.title=t(['topLabel','focusLabel','fullLabel'][index]);
      button.setAttribute('aria-label',button.title);
    });
    grab.title=t('dragTitle');grab.setAttribute('aria-label',t('dragAria'));
    reset.title=t('resetTitle');reset.setAttribute('aria-label',t('resetAria'));
    empty.textContent=t('pageEmpty');updateMore();
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
  reset.addEventListener('click',()=>setPlacement(null,{persist:true}));
  const onResize=()=>{reposition();place();};
  win.addEventListener('resize',onResize);
  win.visualViewport?.addEventListener('resize',onResize);
  win.visualViewport?.addEventListener('scroll',onResize);
  const observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(onResize):null;
  observer?.observe(panel);
  function render(next) {
    if(next)snapshot=next;
    const {items,sources,activeId}=snapshot;
    // Website overlay follows the currently read answer automatically.
    // Source IDs remain internal so navigation never crosses answer boundaries.
    const activeSource=items.find(i=>i.id===activeId)?.sourceId;
    selected=sources.find(s=>s.id===activeSource)?.id||sources[0]?.id||'';
    const scoped=items.filter(item=>item.sourceId===selected);
    const active=scoped.find(item=>item.id===activeId)||scoped[0];
    const overview=snapshot.overview?.[selected];
    const compact=scoped.length<=5&&(scoped.length===0||overview?.ids?.length===scoped.length);
    const displayMode=readingTocDisplayMode(mode,compact,modeExplicit);
    modes.hidden=compact&&!modeExplicit;
    const overviewIds=new Set(overview?.ids||scoped.filter(item=>item.depth===0).map(item=>item.id));
    const represented=displayMode==='top'
      ?scoped.find(item=>item.id===(overview?.representedId||active?.topId)):active;
    const show=displayMode==='full'?scoped:displayMode==='top'?scoped.filter(item=>overviewIds.has(item.id)):
      scoped.filter(item=>item.depth===0||item.topId===active?.topId);
    const key=displayMode+'|'+selected+'|'+show.map(i=>i.id+'-'+i.label+'-'+i.depth).join('|');
    if(key!==lastKey){
      const fragment=doc.createDocumentFragment();
      for(const item of show){
        const li=make('li');li.style.setProperty('--depth',String(Math.min(item.depth,3)));
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
    const remaining=displayMode==='top'?Math.max(0,overview?.hiddenCount||0):0;
    more.hidden=remaining===0;
    moreRemaining=remaining;updateMore();
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
