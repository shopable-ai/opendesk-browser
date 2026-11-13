// One standalone conversation dock per installed Page Program.
// Conversation top and floating top share one physical button.
import {findSiteConversation} from './site-adapters.js';
import {jumpConversationEdge,jumpRegionTop,findConversationPages,currentConversationPageIndex,conversationPageTargetIndex,jumpConversationPage} from './conversation.js';
import {scrollConfiguredEdge} from './site-configuration.js';

const OWN='data-opendesk-ai-scroll-navigation';
const sessions=new WeakMap();
const LEGACY='[data-opendesk-prompts-floating]';
const GAP=4;
const COMPACT_GAP=6;
const SIZE=42;
const TURN_SIZE=28;
const INSET=20;
const unavailable=button=>button.getAttribute('aria-disabled')==='true';
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
  const pageHistory={snapshot:null};
  let landing=null;
  const coarsePointer=win.matchMedia?.('(any-pointer: coarse)');
  const context=()=>typeof resolveConversation==='function'?resolveConversation():findSiteConversation(doc,win);
  const isCurrent=()=>!disposed&&binding&&host?.isConnected&&
    binding.root===doc.documentElement&&binding.href===win.location.href;
  const enabled=next=>{
    const flags=resolveNavigation()||{};
    const floating=next.scroller.scrollTop>Math.max(320,Math.min(win.innerHeight,next.scroller.clientHeight)*.65);
    return {top:flags.conversationTop!==false||(flags.floatingTop!==false&&floating),
      bottom:flags.conversationBottom!==false,
      paging:flags.turnPaging!==false,
      showTurnCount:flags.showTurnCount===true,
      topKey:floating&&flags.floatingTop!==false?'floatingTop':'conversationTop'};
  };
  function settleLanding(next,key) {
    if(next.site!=='chatgpt'||!key||!pageHistory.snapshot?.known.has(key))return;
    const intent=landing={key,href:win.location.href,root:doc.documentElement,
      main:next.main,scroller:next.scroller,
      size:[next.scroller.clientWidth,next.scroller.clientHeight,win.innerWidth,win.innerHeight]};
    // A virtual round mounts asynchronously and may restore its own scroll
    // anchor after our first jump. Re-align to its verified live question,
    // at most twice; never keep chasing after user input or a route change.
    for(const delay of [180,600])owner.setTimeout(()=>{
      if(disposed||landing!==intent)return;
      const current=context();
      if(win.location.href!==intent.href||doc.documentElement!==intent.root||
          current?.main!==intent.main||current?.scroller!==intent.scroller||
          [intent.scroller.clientWidth,intent.scroller.clientHeight,win.innerWidth,win.innerHeight]
            .some((value,i)=>value!==intent.size[i])||
          !enabled(current).paging){landing=null;return;}
      const paging=findConversationPages(current,doc,win,pageHistory);
      const page=paging?.pages.find(page=>page.target?.getAttribute('data-content-search-unit-key')===key);
      if(page)jumpRegionTop({target:page.target,main:current.main,kind:'conversation'},doc,win);
      if(delay===600)landing=null;
      refresh();
    },delay);
  }
  function click(direction,event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.isTrusted!==true||!isCurrent()) return;
    if(event.target?.closest?.('.hint'))return;
    if(unavailable(buttons[direction])) {
      buttons.stack.classList.remove('hints-dismissed');
      buttons[direction].classList.add('show-hint');
      return;
    }
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
    landing=null;
    if(direction==='previous'||direction==='next') {
      if(!intent.paging)return;
      const paging=findConversationPages(next,doc,win,pageHistory);
      if(!paging)return;
      const destination=conversationPageTargetIndex(paging,direction,doc,win);
      const page=paging.pages[destination];
      const key=page?.remembered?page.key:page?.target?.getAttribute('data-content-search-unit-key');
      if(jumpConversationPage(paging,direction,doc,win))settleLanding(next,key);
    }else{
      if(!intent[direction])return;
      if(next.custom)scrollConfiguredEdge(next,direction,doc,win);
      else jumpConversationEdge(next.main,next.selector,direction,doc,win);
    }
    // A successful instant jump changes the scrollport synchronously. Reflect
    // the new disabled/enabled state now instead of waiting for the 120 ms
    // coalesced DOM/scroll observer; later native scroll events still resync.
    refresh();
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
      .stack{display:flex;flex-direction:column;align-items:center;gap:4px}
      /* Keep the production SVG artwork; reduce only the middle pair on desktop. */
      .stack.paging:not(.compact){gap:3px}
      .stack.paging:not(.compact) button[data-scroll-nav-key="turnPrevious"],
      .stack.paging:not(.compact) button[data-scroll-nav-key="turnNext"]{height:28px;border-radius:9px;box-shadow:0 2px 8px #0001}
      .stack.paging:not(.compact) button[data-scroll-nav-key="turnPrevious"] svg,
      .stack.paging:not(.compact) button[data-scroll-nav-key="turnNext"] svg{width:17px;height:17px}
      .stack.compact{flex-direction:row;gap:6px}
      button{pointer-events:auto;width:42px;height:42px;border:1px solid #b8c2d44d;
        border-radius:14px;background:#ffffffed;color:#2b3b51;box-shadow:0 4px 18px #0002;
        cursor:pointer;display:grid;place-items:center;padding:0;position:relative}
      button.turn{height:var(--turn-height,28px);border-radius:10px}
      button.turn svg{width:18px;height:18px}
      .stack.compact button.turn{border-radius:14px}
      :host(.dark) button{background:#303239ef;color:#f3f4f8;border-color:#ffffff30}
      button:hover:not([aria-disabled="true"]){background:#e8eef8}
      :host(.dark) button:hover:not([aria-disabled="true"]){background:#434a55}
      button[aria-disabled="true"]{color:#8a96a6;background:#ffffffc7;border-color:#b8c2d433;box-shadow:none;cursor:default}
      :host(.dark) button[aria-disabled="true"]{color:#a2a7b1;background:#303239cc;border-color:#ffffff1c}
      button:focus-visible{outline:3px solid #4c82ff;outline-offset:2px}
      .hint{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);
        padding:6px 9px;border-radius:7px;background:#263449;color:#fff;
        font:12px/1.4 system-ui,sans-serif;white-space:nowrap;pointer-events:auto;
        visibility:hidden;opacity:0;box-shadow:0 2px 8px #0002}
      .hint::before{content:"";position:absolute;right:100%;top:0;width:8px;height:100%}
      button:hover .hint,button:focus-visible .hint,button.show-hint .hint{visibility:visible;opacity:1}
      .stack.hints-dismissed .hint{visibility:hidden;opacity:0}
      .stack.compact .hint{left:0;top:auto;bottom:calc(100% + 8px);transform:none}
      .stack.compact .hint::before{right:auto;left:0;top:100%;width:100%;height:8px}
      svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;
        stroke-linecap:round;stroke-linejoin:round}
      .counter{width:var(--counter-width,42px);min-height:28px;display:grid;place-items:center;pointer-events:none;
        box-sizing:border-box;border:1px solid #b8c2d44d;border-radius:9px;
        font:650 11px/1.2 system-ui,sans-serif;font-variant-numeric:tabular-nums;
        color:#2b3b51;background:#ffffffed;white-space:nowrap}
      :host(.dark) .counter{background:#303239ef;color:#f3f4f8;border-color:#ffffff30}
      .stack.compact .counter{width:var(--counter-width,48px);min-height:42px}`;
    const stack=doc.createElement('div');
    stack.className='stack';
    const make=(direction,label,pathData)=>{
      const button=doc.createElement('button');
      button.type='button';button.setAttribute('aria-label',label);
      const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');
      svg.setAttribute('aria-hidden','true');
      const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',pathData);svg.append(path);button.append(svg);
      const hint=doc.createElement('span');hint.className='hint';hint.setAttribute('aria-hidden','true');
      button.append(hint);
      const reveal=()=>{
        buttons.stack.classList.remove('hints-dismissed');
        for(const key of ['top','previous','next','bottom'])buttons[key].classList.remove('show-hint');
      };
      owner.on(button,'pointerenter',reveal);
      owner.on(button,'focus',reveal);
      owner.on(button,'pointerdown',event=>{
        reveal();if(event.pointerType==='touch')button.classList.add('show-hint');
      });
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
    buttons.previous.className=buttons.next.className='turn';
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
      pageHistory.snapshot=null;
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
    const paging=directions.paging?findConversationPages(next,doc,win,pageHistory):null;
    if(!directions.paging)pageHistory.snapshot=null;
    const currentPage=paging?currentConversationPageIndex(paging,doc,win):-1;
    const canPage=currentPage>=0;
    if(!directions.top&&!directions.bottom&&!directions.paging){host?.remove();binding=null;return;}
    prepare();
    // Keep the enabled pager mounted through single-round transcripts and
    // transient role gaps. Availability changes disabled state, never layout.
    // No page nodes are persisted beyond this synchronous refresh.
    const options=[...(directions.top?[buttons.top]:[]),
      ...(directions.paging?[buttons.previous,...(canPage&&directions.showTurnCount?[buttons.counter]:[]),buttons.next]:[]),
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
    // aria-disabled keeps all four controls in the keyboard path so their
    // boundary reasons remain discoverable. Clicks still cannot scroll them.
    buttons.top.setAttribute('aria-disabled',String(scroller.scrollTop<=2));
    buttons.bottom.setAttribute('aria-disabled',String(scroller.scrollTop>=max-2));
    const previousPage=canPage?conversationPageTargetIndex(paging,'previous',doc,win):-1;
    const nextPage=canPage?conversationPageTargetIndex(paging,'next',doc,win):-1;
    buttons.previous.setAttribute('aria-disabled',String(previousPage<0));
    buttons.next.setAttribute('aria-disabled',String(nextPage<0));
    const describe=(button,text)=>{
      button.setAttribute('aria-description',text);
      button.querySelector('.hint').textContent=text;
    };
    describe(buttons.top,unavailable(buttons.top)?'已到对话顶部':'置顶');
    describe(buttons.bottom,unavailable(buttons.bottom)?'已到对话底部':'底部');
    describe(buttons.previous,!canPage?'暂未识别提问':max<=2?'对话已完整显示':
      previousPage<0?'已到首个已加载提问':previousPage===currentPage?'回到本轮提问':'上一轮提问');
    describe(buttons.next,!canPage?'暂未识别提问':max<=2?'对话已完整显示':
      nextPage<0?(unavailable(buttons.bottom)?'已到对话底部':'已到末个已加载提问'):'下一轮提问');
    buttons.previous.setAttribute('aria-label',previousPage>=0&&previousPage===currentPage?'回到本轮提问':'上一轮提问');
    if(canPage){
      if(directions.showTurnCount){
        buttons.counter.textContent=(currentPage+1)+'/'+paging.pages.length;
        buttons.counter.setAttribute('aria-label',
          '当前第'+(currentPage+1)+'轮，共'+paging.pages.length+'轮已识别对话');
        buttons.counter.title='仅统计当前会话中已加载并验证的用户提问；屏外轮次暂时卸载后保留';
      }
    }
    const rect=next.main.getBoundingClientRect();
    const compact=win.innerWidth<600;
    buttons.stack.classList.toggle('compact',compact);
    const turnSize=compact||coarsePointer?.matches?SIZE:TURN_SIZE;
    buttons.stack.style.setProperty('--turn-height',turnSize+'px');
    const compactPaging=directions.paging&&!compact&&!coarsePointer?.matches;
    buttons.stack.classList.toggle('paging',compactPaging);
    const gap=compact?COMPACT_GAP:compactPaging?3:GAP;
    const hasCount=options.includes(buttons.counter);
    // Keep short counts at the approved size, while fitting the full loaded
    // count in long transcripts. Reserve the same width for collision checks.
    const digits=hasCount?String(paging.pages.length).length:0;
    const counterWidth=Math.max(compact?48:SIZE,digits>2?(digits*2+1)*7+8:0);
    buttons.counter.style.setProperty('--counter-width',counterWidth+'px');
    const count=options.length;
    const extent=options.reduce((n,item)=>n+(item===buttons.counter?(compact?counterWidth:28):
      item===buttons.previous||item===buttons.next?turnSize:SIZE),0)
      +Math.max(0,count-1)*gap;
    const width=compact?extent:hasCount?counterWidth:SIZE;
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
    landing=null;
    pageHistory.snapshot=null;
    host?.remove();binding=null;
    if (sessions.get(doc)?.dispose===dispose) sessions.delete(doc);
  }
  owner.onDispose(dispose);
  owner.on(doc,'keydown',event=>{
    if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))landing=null;
    if(event.key==='Escape'&&buttons){
      buttons.stack.classList.add('hints-dismissed');
      for(const key of ['top','previous','next','bottom'])buttons[key].classList.remove('show-hint');
    }
  });
  owner.on(doc,'pointerdown',event=>{
    if(!event.composedPath?.().includes(host))landing=null;
    if(buttons&&!event.composedPath?.().includes(host))
      for(const key of ['top','previous','next','bottom'])buttons[key].classList.remove('show-hint');
  },true);
  for(const type of ['wheel','touchstart'])owner.on(doc,type,()=>{landing=null;},true);
  if(coarsePointer)owner.on(coarsePointer,'change',schedule);
  for (const type of ['popstate','hashchange','pageshow','resize','scroll'])
    owner.on(win,type,schedule,type==='scroll');
  // Element scrolls do not generally bubble to window. Capture the actual
  // transcript scroller, but ignore unrelated nested code/editor scrollports:
  // those must not trigger a full conversation/layout/obstacle rescan.
  owner.on(doc,'scroll',event=>{
    const target=event?.target;
    if(!target||!binding||target===binding.scroller||target===doc||
        target===doc.documentElement||target===doc.scrollingElement)
      schedule();
  },true);
  if(win.visualViewport)for(const type of ['resize','scroll'])owner.on(win.visualViewport,type,schedule);
  win.navigation&&owner.on(win.navigation,'navigatesuccess',schedule);
  const session={dispose,refresh};
  sessions.set(doc,session);
  observeRoot();refresh();owner.setTimeout(poll,1100);
  return session;
}
