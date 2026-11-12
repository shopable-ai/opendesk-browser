// One standalone conversation dock per installed Page Program.
// Conversation top and floating top share one physical button.
import {findSiteConversation} from './site-adapters.js';
import {jumpConversationEdge,findConversationPages,currentConversationPageIndex,jumpConversationPage} from './conversation.js';
import {scrollConfiguredEdge} from './site-configuration.js';

const OWN='data-opendesk-ai-scroll-navigation';
const sessions=new WeakMap();
const LEGACY='[data-opendesk-prompts-floating]';
const GAP=6;
const SIZE=42;
const INSET=20;
// Only a genuinely rendered global control owns this surface. Hidden old
// hosts may remain in the DOM during upgrades and must not reserve buttons.
function renderedControl(node,win) {
  if(!node?.isConnected||node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;
  const control=node.shadowRoot?.querySelector('button')||node.querySelector?.('button');
  if(!control)return false;
  return [node,control].every(target=>{
    const rect=target.getBoundingClientRect?.(),style=win.getComputedStyle(target);
    return rect&&rect.width>1&&rect.height>1&&style&&
      style.display!=='none'&&!['hidden','collapse'].includes(style.visibility);
  });
}
export function legacyFloatingPresent(doc,win) {
  return [...doc.querySelectorAll(LEGACY)].some(node=>renderedControl(node,win));
}
export function liveDock(node,win) {
  return node?.getAttribute?.(OWN)==='dock'&&renderedControl(node,win);
}
const between=(value,min,max)=>Math.max(min,Math.min(max,value));

function controlObstacles(doc,win) {
  const controls=[];
  const collect=root=>{
    controls.push(...root.querySelectorAll('button,[role="button"],input,textarea,[contenteditable="true"]'));
    for(const node of root.querySelectorAll('*'))
      if(node.shadowRoot&&!node.closest?.(`[${OWN}],${LEGACY}`))collect(node.shadowRoot);
  };
  collect(doc);
  // A closed shadow does not expose its controls. Root-level fixed peers
  // still reserve their visible host rectangle, without a tool-specific hook.
  controls.push(...[...doc.documentElement.children]
    .filter(node=>win.getComputedStyle(node).position==='fixed'));
  return controls.filter(node=>{
    for(let area=node;area;area=area.parentElement||area.getRootNode?.().host) {
      if(area.hidden||area.matches?.(`[${OWN}],${LEGACY},[inert],[aria-hidden="true"]`))return false;
      const style=win.getComputedStyle(area);
      if(style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0')return false;
    }
    const r=node.getBoundingClientRect();
    return r.width>0&&r.height>0;
  }).map(node=>node.getBoundingClientRect());
}

function chatGPTGutterLeft(main,doc,win) {
  const rect=main.getBoundingClientRect();
  const visibleBox=node=>{
    if(!node?.isConnected||node.hidden||node.closest?.('[hidden],[inert],[aria-hidden="true"]'))return null;
    const style=win.getComputedStyle(node),box=node.getBoundingClientRect();
    return style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&
      style.opacity!=='0'&&box.width>0&&box.height>0&&box.right>0&&box.bottom>0&&
      box.left<win.innerWidth&&box.top<win.innerHeight?box:null;
  };
  let safeLeft=rect.left;
  // ChatGPT's history can be a sibling of main or a column inside it.
  // Reserve only a visible, tall navigation occupying the region's left edge.
  for(const navigation of doc.querySelectorAll('aside,nav,[role="navigation"]')) {
    const box=visibleBox(navigation);
    if(!box)continue;
    const height=Math.min(rect.bottom,win.innerHeight,box.bottom)-Math.max(rect.top,0,box.top);
    if(box.left<=rect.left&&box.right>Math.max(rect.left,0)&&
        box.right<=rect.left+rect.width/2&&height>=rect.height/2)
      safeLeft=Math.max(safeLeft,box.right);
  }
  let left=safeLeft;
  const composers=[...main.querySelectorAll('#prompt-textarea,[data-testid="composer-text-input"],#mobile-composer-prompt,[data-composer-markdown][contenteditable="true"][role="textbox"]')]
    .filter(node=>visibleBox(node));
  if(composers.length===1) {
    // Use the outermost full-height content column, never the indented
    // message text or the composer box itself. No prompt-tool DOM is needed.
    for(let area=composers[0].parentElement;area&&area!==main;area=area.parentElement) {
      if(!main.contains(area))break;
      const box=visibleBox(area);
      if(box&&box.left>=safeLeft&&box.right<=rect.right+1&&box.width>=200&&
          box.height>=rect.height/2&&box.top>=rect.top-1&&box.bottom<=rect.bottom+1)
        left=box.left;
    }
  }
  // Both hosts are documentElement siblings with the same 8px region gutter.
  // The prompt rail's border and inner padding do not belong to that gutter.
  return Math.max(8,left+8,safeLeft+8);
}

export function installFloatingNavigation({doc,win,owner,resolveConversation=null,resolveNavigation=()=>({})}) {
  sessions.get(doc)?.dispose();
  let disposed=false,pending=false,observedRoot=null,observer=null,host=null,buttons=null;
  let resizeObserver=null,resizeTargets=[];
  let binding=null,lastHref=win.location.href;
  const context=()=>typeof resolveConversation==='function'?resolveConversation():findSiteConversation(doc,win);
  const isCurrent=()=>!disposed&&binding&&host?.isConnected&&
    binding.root===doc.documentElement&&binding.href===win.location.href;
  const enabled=next=>{
    const flags=resolveNavigation()||{};
    const floating=next.scroller.scrollTop>Math.max(320,Math.min(win.innerHeight,next.scroller.clientHeight)*.65);
    return {top:flags.conversationTop!==false||(flags.floatingTop!==false&&floating),
      bottom:flags.conversationBottom!==false,
      paging:flags.turnPaging!==false,
      topKey:floating&&flags.floatingTop!==false?'floatingTop':'conversationTop'};
  };
  function click(direction,event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.isTrusted!==true||!isCurrent()) return;
    // A legacy Page may mount after our last refresh. Do not race it.
    const active=[...doc.querySelectorAll(`[${OWN}="dock"]`)]
      .find(node=>liveDock(node,win));
    if (legacyFloatingPresent(doc,win)||active!==host) {
      schedule();return;
    }
    // Invalidate stale buttons before navigation/React reconciliation finishes.
    const next=context();
    if (!next||next.main!==binding.main||next.scroller!==binding.scroller) return;
    const intent=enabled(next);
    if(direction==='previous'||direction==='next') {
      if(!intent.paging)return;
      const paging=findConversationPages(next,doc,win);
      if(!paging)return;
      jumpConversationPage(paging,direction,doc,win);
    }else{
      if(!intent[direction])return;
      if(next.custom)scrollConfiguredEdge(next,direction,doc,win);
      else jumpConversationEdge(next.main,next.selector,direction,doc,win);
    }
    schedule();
  }
  function prepare() {
    if (host) return;
    host=doc.createElement('nav');
    host.setAttribute(OWN,'dock');
    host.setAttribute('aria-label','AI 对话滚动导航');
    host.style.cssText='position:fixed;left:0;top:0;z-index:2147483599;pointer-events:none;visibility:hidden;';
    const shadow=host.attachShadow({mode:'open'});
    const style=doc.createElement('style');
    style.textContent=`:host{all:initial;display:block;pointer-events:none;color-scheme:light}
      :host(.dark){color-scheme:dark}
      .stack{display:flex;flex-direction:column;align-items:center;gap:6px}
      .stack.compact{flex-direction:row}
      button{pointer-events:auto;width:42px;height:42px;border:1px solid #b8c2d44d;
        border-radius:14px;background:#ffffffed;color:#2b3b51;box-shadow:0 4px 18px #0002;
        cursor:pointer;display:grid;place-items:center;padding:0}
      :host(.dark) button{background:#303239ef;color:#f3f4f8;border-color:#ffffff30}
      button:hover:not(:disabled){background:#e8eef8}
      :host(.dark) button:hover:not(:disabled){background:#434a55}
      button:disabled{opacity:.48;cursor:default}
      button:focus-visible{outline:3px solid #4c82ff;outline-offset:2px}
      svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;
        stroke-linecap:round;stroke-linejoin:round}
      .counter{width:42px;min-height:28px;display:grid;place-items:center;pointer-events:none;
        box-sizing:border-box;border:1px solid #b8c2d44d;border-radius:9px;
        font:650 11px/1.2 system-ui,sans-serif;font-variant-numeric:tabular-nums;
        color:#2b3b51;background:#ffffffed;white-space:nowrap}
      :host(.dark) .counter{background:#303239ef;color:#f3f4f8;border-color:#ffffff30}
      .stack.compact .counter{width:48px;min-height:42px}`;
    const stack=doc.createElement('div');
    stack.className='stack';
    const make=(direction,label,pathData)=>{
      const button=doc.createElement('button');
      button.type='button';button.title=label;button.setAttribute('aria-label',label);
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('aria-hidden','true');
      const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData);svg.append(path);button.append(svg);
      owner.on(button,'click',event=>click(direction,event));
      return button;
    };
    const counter=doc.createElement('span');
    counter.className='counter';
    counter.setAttribute('role','status');
    counter.setAttribute('aria-live','off');
    buttons={
      stack,
      top:make('top','回到对话顶部','M17 11l-5-5-5 5m10 7-5-5-5 5'),
      previous:make('previous','上一轮提问','M5 15l7-7 7 7'),
      counter,
      next:make('next','下一轮提问','M5 9l7 7 7-7'),
      bottom:make('bottom','跳到对话底部','M7 6l5 5 5-5M7 13l5 5 5-5')
    };
    buttons.previous.dataset.scrollNavKey='turnPrevious';
    buttons.next.dataset.scrollNavKey='turnNext';
    shadow.append(style,stack);
  }
  function refresh() {
    pending=false;
    if (disposed) return;
    const next=context();
    const targets=next?[...new Set([next.main,next.scroller])]:[];
    if(win.ResizeObserver&&(targets.length!==resizeTargets.length||
        targets.some((target,index)=>target!==resizeTargets[index]))) {
      resizeObserver?.disconnect();
      resizeTargets=targets;
      resizeObserver??=new win.ResizeObserver(schedule);
      targets.forEach(target=>resizeObserver.observe(target));
    }
    // Existing old trusted-page navigation wins during extension upgrade.
    // Once that owner is removed, its DOM mutation permits standalone mounting.
    // Old reply-local buttons do not own the global two-key dock.
    // Only a live former global floating control may block this surface.
    if (!next||legacyFloatingPresent(doc,win)) {
      host?.remove();binding=null;return;
    }
    // One visible dock across independently installed script instances, even
    // when the modules do not share their in-memory WeakMap. Keep the first
    // connected live ShadowRoot, never retire a peer's host.
    const existing=[...doc.querySelectorAll(`[${OWN}="dock"]`)]
      .find(node=>liveDock(node,win));
    if (existing&&existing!==host) {
      host?.remove();binding=null;return;
    }
    const directions=enabled(next);
    const paging=directions.paging?findConversationPages(next,doc,win):null;
    const currentPage=paging?currentConversationPageIndex(paging,doc,win):-1;
    const canPage=currentPage>=0;
    if(!directions.top&&!directions.bottom&&!canPage){host?.remove();binding=null;return;}
    prepare();
    // Reuse one dock: whole-conversation edges bracket the optional question
    // pager. No page nodes are persisted beyond this synchronous refresh.
    const options=[...(directions.top?[buttons.top]:[]),
      ...(canPage?[buttons.previous,buttons.counter,buttons.next]:[]),
      ...(directions.bottom?[buttons.bottom]:[])];
    if (options.length!==buttons.stack.children.length||
        options.some((button,index)=>buttons.stack.children[index]!==button))
      buttons.stack.replaceChildren(...options);
    const scroller=next.scroller;
    const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    // A visible conversationTop and scroll-triggered floatingTop reuse the
    // same physical top control; no second arrow is created.
    buttons.top.dataset.scrollNavKey=directions.topKey;
    buttons.bottom.dataset.scrollNavKey='conversationBottom';
    buttons.top.disabled=scroller.scrollTop<=2;
    buttons.bottom.disabled=scroller.scrollTop>=max-2;
    if(canPage){
      buttons.previous.disabled=currentPage===0;
      buttons.next.disabled=currentPage===paging.pages.length-1;
      buttons.counter.textContent=(currentPage+1)+'/'+paging.pages.length;
      buttons.counter.setAttribute('aria-label',
        '当前第'+(currentPage+1)+'轮，共'+paging.pages.length+'轮已加载对话');
      buttons.counter.title='仅统计当前已加载且可识别的用户提问';
    }
    const rect=next.main.getBoundingClientRect();
    const compact=win.innerWidth<600;
    buttons.stack.classList.toggle('compact',compact);
    const count=options.length;
    const extent=options.reduce((n,item)=>n+(item===buttons.counter?(compact?48:28):SIZE),0)
      +Math.max(0,count-1)*GAP;
    const width=compact?extent:SIZE;
    const height=compact?SIZE:extent;
    // The transcript content can extend far above/below the screen. Anchor to
    // its visible scroll port, never to moving message boxes or document edges.
    const viewport=win.visualViewport;
    const viewportLeft=viewport?.offsetLeft??0,viewportTop=viewport?.offsetTop??0;
    const viewportRight=viewportLeft+(viewport?.width??win.innerWidth);
    const viewportBottom=viewportTop+(viewport?.height??win.innerHeight);
    const documentScroller=scroller===doc.scrollingElement||scroller===doc.documentElement||scroller===doc.body;
    let scrollRect={left:viewportLeft,top:viewportTop,right:viewportRight,bottom:viewportBottom};
    if(!documentScroller){
      const bounds=scroller.getBoundingClientRect();
      const scaleX=scroller.offsetWidth>0?bounds.width/scroller.offsetWidth:1;
      const scaleY=scroller.offsetHeight>0?bounds.height/scroller.offsetHeight:1;
      const left=bounds.left+(scroller.clientLeft||0)*scaleX;
      const top=bounds.top+(scroller.clientTop||0)*scaleY;
      scrollRect={left,top,
        right:left+(Number.isFinite(scroller.clientWidth)?scroller.clientWidth*scaleX:bounds.width),
        bottom:top+(Number.isFinite(scroller.clientHeight)?scroller.clientHeight*scaleY:bounds.height)};
    }
    const port={left:Math.max(viewportLeft,rect.left,scrollRect.left),
      top:Math.max(viewportTop,rect.top,scrollRect.top),
      right:Math.min(viewportRight,rect.right,scrollRect.right),
      bottom:Math.min(viewportBottom,rect.bottom,scrollRect.bottom)};
    const minLeft=Math.ceil(port.left+8),maxLeft=Math.floor(port.right-width-8);
    const minTop=Math.ceil(port.top+8);
    const topPos=Math.floor(port.bottom-INSET-height);
    if(maxLeft<minLeft||topPos<minTop){host.style.visibility='hidden';binding=null;return;}
    const chosenAnchor=next.custom?next.anchor?.getBoundingClientRect?.():null;
    const alignChatGPT=!next.custom&&next.site==='chatgpt'&&!compact;
    const desiredLeft=alignChatGPT
      ?chatGPTGutterLeft(next.main,doc,win)
      :chosenAnchor?chosenAnchor.left+12:minLeft;
    const left=between(Math.round(desiredLeft),minLeft,maxLeft);
    // Avoid collisions locally: exhaust the lower-left row before a small
    // upward adjustment. A distant free gap is not a bottom-left dock.
    const obstacles=controlObstacles(doc,win);
    const limitLeft=Math.min(maxLeft,left+Math.min(160,(port.right-port.left)*.25));
    const lowestTop=Math.max(minTop,Math.ceil(topPos-Math.min(SIZE+12,(port.bottom-port.top)*.15)));
    const columns=[...new Set([left,...obstacles.flatMap(r=>[
      Math.ceil(r.right+12),Math.floor(r.left-width-12)])])]
      .filter(x=>x>=left&&x<=limitLeft).sort((a,b)=>a-b);
    const rows=[...new Set([topPos,...obstacles.map(r=>Math.floor(r.top-height-12)),lowestTop])]
      .filter(y=>y>=lowestTop&&y<=topPos).sort((a,b)=>b-a);
    const candidates=rows.flatMap(y=>columns.map(x=>[x,y]));
    const chosen=candidates.find(([x,y])=>
      Number.isFinite(x)&&Number.isFinite(y)&&
      x>=minLeft&&x+width<=port.right-8&&
      y>=minTop&&y+height<=port.bottom-8&&
      !obstacles.some(r=>r.left<x+width&&r.right>x&&r.top<y+height&&r.bottom>y));
    if(!chosen){host.style.visibility='hidden';binding=null;return;}
    host.classList.toggle('dark',doc.documentElement?.classList?.contains('dark')||
      doc.documentElement?.getAttribute('data-theme')==='dark');
    if (!host.isConnected) doc.documentElement?.append(host);
    host.style.left=Math.round(chosen[0])+'px';
    host.style.top=Math.round(chosen[1])+'px';
    host.style.visibility='visible';
    binding={href:win.location.href,main:next.main,scroller,root:doc.documentElement};
  }
  function schedule() {
    if (disposed||pending) return;
    pending=true;owner.setTimeout(refresh,120);
  }
  function observeRoot() {
    if (disposed||doc.documentElement===observedRoot) return;
    observer?.disconnect();
    observedRoot=doc.documentElement;
    if (!observedRoot) return;
    // Custom CSS may depend on any attribute (including data-*, id or inert).
    // Filter our own host/children below to avoid refresh loops.
    observer=owner.observe(observedRoot,records=>{
      if (records.every(record=>{
        const node=record.target;
        if (node===host||host?.contains(node)) return true;
        if (record.type==='childList'&&[...record.addedNodes,...record.removedNodes].length)
          return [...record.addedNodes,...record.removedNodes].every(n=>n===host||host?.contains(n));
        return false;
      })) return;
      schedule();
    },{subtree:true,childList:true,attributes:true});
  }
  function poll() {
    if (disposed) return;
    if (lastHref!==win.location.href||observedRoot!==doc.documentElement) {
      lastHref=win.location.href;observeRoot();schedule();
    }
    owner.setTimeout(poll,1100);
  }
  function dispose() {
    if (disposed) return;
    disposed=true;observer?.disconnect();observer=null;resizeObserver?.disconnect();
    host?.remove();binding=null;
    if (sessions.get(doc)?.dispose===dispose) sessions.delete(doc);
  }
  owner.onDispose(dispose);
  for (const type of ['popstate','hashchange','pageshow','resize','scroll'])
    owner.on(win,type,schedule,type==='scroll');
  // Element scrolls usually do not bubble to window; capture them on document
  // to update boundary-disabled keys after an actual transcript scroll.
  owner.on(doc,'scroll',schedule,true);
  if(win.visualViewport)for(const type of ['resize','scroll'])owner.on(win.visualViewport,type,schedule);
  win.navigation&&owner.on(win.navigation,'navigatesuccess',schedule);
  const session={dispose,refresh};
  sessions.set(doc,session);
  observeRoot();refresh();owner.setTimeout(poll,1100);
  return session;
}
