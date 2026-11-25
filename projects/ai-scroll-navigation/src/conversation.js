// Toolbar and content targets are separate.
const TURN = '[data-testid^="conversation-turn-"],[data-content-search-unit-key],'
  + '[data-message-author-role],[data-message-role]';
const CONTENT = 'pre,textarea,[contenteditable="true"],'
  + '[data-message-author-role],[data-message-role]';
const NATIVE_EDITOR = 'button[aria-label="Open editor"],button[aria-label="打开编辑器"]';
const VIEWER_CLOSE = 'button[aria-label="Close viewer"],button[aria-label="关闭查看器"]';
const SEARCH_TURN = '[data-content-search-unit-key]';
const ASSISTANT_TURN = '[data-content-search-unit-key][data-chatgpt-search-unit-key],'
  + '[data-content-search-unit-key$=":assistant"]';
// Preserve the legacy token for currently installed Mind Map / older Page versions.
const OWN = 'data-opendesk-chatgpt-jump-top';
const MODERN_OWN = 'data-opendesk-ai-scroll-navigation';
const LEGACY_LIFECYCLE = '[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]';
const ANSWER_TOOLS = 'data-ai-answer-tools';
// Older installed peers may still own a live group with the original marker.
const ANSWER_TOOL_GROUPS = `[${ANSWER_TOOLS}],[data-opendesk-chatgpt-answer-tools]`;
const MINDMAP_VIEWER = '[data-opendesk-chatgpt-mindmap="viewer"]';
const ASSISTANT_CONTENT = '[data-d-component],[data-markdown-text-style="assistant-message"]';
const EXCLUDED = '[role="dialog"],[aria-modal="true"],[hidden],[inert],[aria-hidden="true"]';
const GAP = 12;
const MAX_REPLY_CONTEXT = 72;
const sessions = new WeakMap(); // doc -> per-owner sessions (Program and trusted tool may coexist)

// Yield only to a visible legacy navigator.
export function legacyNavigationPresent(doc,win=doc.defaultView) {
  return [...doc.querySelectorAll(`[${OWN}]`)].some(node => {
    if(!node.isConnected||node.hasAttribute(MODERN_OWN)||node.closest?.(EXCLUDED))return false;
    const button=node.shadowRoot?.querySelector('button');
    if(!button)return false;
    return [node,button].every(target=>{
      const rect=target.getBoundingClientRect?.();
      const style=win?.getComputedStyle?.(target)||target.style;
      return rect&&rect.width>1&&rect.height>1&&style&&
        style.display!=='none'&&!['hidden','collapse'].includes(style.visibility);
    });
  });
}

function isWritingViewer(element, aside, win) {
  const section = element.closest('section');
  if (!section || !aside.contains(section)) return false;
  const headers = [...section.querySelectorAll('header')];
  const editors = [...section.querySelectorAll('textarea,[contenteditable="true"]')];
  if (headers.length !== 1 || headers[0].parentElement !== section ||
      headers[0].querySelectorAll(VIEWER_CLOSE).length !== 1 || editors.length !== 1 ||
      headers[0].contains(editors[0])) return false;
  // Require a separate viewer scrollport.
  for (let node = editors[0]; node && aside.contains(node); node = node.parentElement) {
    if (!/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY)) continue;
    if (node === editors[0] && node.scrollHeight <= node.clientHeight + 1) continue;
    return node.scrollHeight > node.clientHeight + 1;
  }
  return false;
}

function rendered(element, win) {
  if (!element?.isConnected || element.closest?.(EXCLUDED)) return false;
  const aside = element.closest?.('aside');
  if (aside && !isWritingViewer(element, aside, win)) return false;
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width < 1 || rect.height < 1) return false;
  const style = win.getComputedStyle(element);
  return style.display !== 'none' && !/^(hidden|collapse)$/.test(style.visibility);
}
function visible(element, win) {
  if (!rendered(element, win)) return false;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < win.innerHeight;
}
export function findConversationMain(doc, win) {
  const matching = [...doc.querySelectorAll('main,[role="main"]')]
    .filter(root => visible(root, win) && root.querySelector(TURN));
  const outer = matching.filter(root =>
    !matching.some(other => other !== root && other.contains(root)));
  return outer.length === 1 ? outer[0] : null;
}
export function chooseConversationHeader(doc, win, main) {
  if (!main) return null;
  const region = main.getBoundingClientRect();
  const upperLimit = Math.min(180, Math.max(100, win.innerHeight * 0.28));
  const candidates = [...doc.querySelectorAll('header')].filter(header => {
    if (!visible(header, win) || header.closest(TURN) || header.closest('aside')) return false;
    const rect = header.getBoundingClientRect();
    return rect.top >= -8 && rect.top < upperLimit
      && rect.left < region.right && rect.right > region.left;
  });
  const scoped = candidates.filter(header => main.contains(header));
  const pool = scoped.length ? scoped : candidates;
  const editors = pool.filter(header => header.querySelector(NATIVE_EDITOR));
  if (editors.length) return editors.length === 1 ? editors[0] : null;
  pool.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  return pool.length === 1 || (pool.length > 1 && pool[0].getBoundingClientRect().width
    > pool[1].getBoundingClientRect().width * 1.2) ? pool[0] : null;
}
export function findHeaderAction(header, win) {
  if (!header) return null;
  const actions = [...header.querySelectorAll('button')]
    .filter(button => rendered(button, win) && !button.closest(`[${OWN}]`));
  const editors = actions.filter(button => button.matches(NATIVE_EDITOR));
  if (editors.length) return editors.length === 1 ? editors[0] : null;
  return actions.at(-1) || null;
}
export function findConversationScroller(target, doc, win, {includeSelf = false} = {}) {
  for (let node = includeSelf ? target : target?.parentElement; node; node = node.parentElement) {
    if (node === doc.body || node === doc.documentElement) break;
    // An empty inner scrollport still blocks outer scrolling.
    if (/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY)) {
      // Skip auto-height code blocks with implicit overflow-y:auto.
      if (node === target && node.scrollHeight <= node.clientHeight + 1) continue;
      return node;
    }
  }
  const root = doc.scrollingElement || doc.documentElement;
  // An unscrollable transcript still has disabled edge controls.
  return root || null;
}
function viewport(scroller, doc, win) {
  if (scroller === doc.scrollingElement || scroller === doc.documentElement) {
    return {top: 0, left: 0, right: win.innerWidth, height: win.innerHeight};
  }
  const rect = scroller.getBoundingClientRect();
  return {top: rect.top + (scroller.clientTop || 0), left: rect.left,
    right: rect.right, height: scroller.clientHeight};
}
function visibleReplyPort(scroller, doc, win) {
  const port = viewport(scroller, doc, win);
  const visual = win.visualViewport;
  const viewportTop = visual?.offsetTop ?? 0;
  const viewportLeft = visual?.offsetLeft ?? 0;
  let top = Math.max(port.top, viewportTop);
  let bottom = Math.min(port.top + port.height, viewportTop + (visual?.height ?? win.innerHeight));
  const left = Math.max(port.left, viewportLeft);
  const right = Math.min(port.right, viewportLeft + (visual?.width ?? win.innerWidth));
  for (let node = scroller.parentElement; node && node !== doc.documentElement; node = node.parentElement) {
    if (node === doc.body || !/^(auto|scroll|overlay|hidden|clip)$/.test(win.getComputedStyle(node).overflowY)) continue;
    const clip = viewport(node, doc, win);
    top = Math.max(top, clip.top);
    bottom = Math.min(bottom, clip.top + clip.height);
  }
  return {top, left, right, height: bottom - top};
}
function firstLineHeight(target, win) {
  const style = win.getComputedStyle(target);
  return parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 20;
}
function replyContext(height, lineHeight) {
  return Math.max(0, Math.min(MAX_REPLY_CONTEXT, Math.floor(height * .16), height - lineHeight));
}
function obstruction(binding, doc, win, port, gap = GAP) {
  const obstacles = new Set(doc.querySelectorAll('header'));
  for (let node = binding.header; node && node !== doc.body; node = node.parentElement) obstacles.add(node);
  const intervals = [];
  const targetRect = binding.target.getBoundingClientRect();
  const left = Math.max(port.left, targetRect.left);
  const right = Math.min(port.right, targetRect.right);
  const lineHeight = firstLineHeight(binding.target, win);
  for (const node of obstacles) {
    if (node === binding.target || binding.target.contains?.(node) || !rendered(node, win)) continue;
    const style = win.getComputedStyle(node);
    if (!/^(sticky|fixed)$/.test(style.position)) continue;
    if (style.position === 'sticky' && node.closest(TURN)
        && node !== binding.header && !node.contains(binding.header)) continue;
    const rect = node.getBoundingClientRect();
    if (left >= right || rect.right <= left || rect.left >= right) continue;
    intervals.push({top: rect.top, bottom: rect.bottom});
  }
  intervals.sort((a, b) => a.top - b.top);
  let edge = port.top;
  for (const interval of intervals) {
    if (interval.top < edge + gap + lineHeight && interval.bottom > edge) {
      edge = interval.bottom;
    }
  }
  return edge - port.top;
}
export function jumpRegionTop(binding, doc, win) {
  const {target, header, main, kind} = binding || {};
  if (!target?.isConnected || !main?.isConnected || !main.contains(target)
      || (header && !header.isConnected)) return false;
  if (/^(sticky|fixed)$/.test(win.getComputedStyle(target).position)) return false;
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || (kind === 'editor' && scroller !== target)) return false;
  if (scroller === target) return scrollPort(scroller, doc, win, 0);
  const reply = kind === 'reply';
  const port = reply ? visibleReplyPort(scroller, doc, win) : viewport(scroller, doc, win);
  const rect = target.getBoundingClientRect();
  const line = reply ? firstLineHeight(target, win) : GAP;
  if (reply && (port.height < line || Math.max(rect.left, port.left) >= Math.min(rect.right, port.right))) return false;
  const gap = reply ? replyContext(port.height, line) : GAP;
  const start = scroller.scrollTop;
  if (!scrollPort(scroller, doc, win, start + rect.top - port.top - gap)) return false;

  const landing = reply ? visibleReplyPort(scroller, doc, win) : viewport(scroller, doc, win);
  const cover = obstruction(binding, doc, win, landing, gap);
  const usable = landing.height - cover;
  if (reply ? usable < line : usable <= GAP) {
    if (reply && scroller.scrollTop !== start) scrollPort(scroller, doc, win, start);
    return false;
  }
  const desired = landing.top + cover + (reply ? replyContext(usable, line) : GAP);
  const missing = desired - target.getBoundingClientRect().top;
  if (missing > 1 && scroller.scrollTop > 0) {
    scrollPort(scroller, doc, win, scroller.scrollTop - missing);
  }
  return true;
}
export function jumpConversationTop(main, doc, win) {
  return jumpRegionTop({target: main?.querySelector(TURN), main, kind: 'conversation'}, doc, win);
}

function scrollPort(scroller, doc, win, top) {
  const max = scroller.scrollHeight - scroller.clientHeight;
  if (!(max > 1) || !Number.isFinite(top)) return false;
  const options = {top: Math.max(0, Math.min(max, top)),
    left: scroller.scrollLeft || 0, behavior: 'instant'};
  if (scroller === doc.scrollingElement && typeof win.scrollTo === 'function') win.scrollTo(options);
  else if (typeof scroller.scrollTo === 'function') scroller.scrollTo(options);
  else scroller.scrollTop = options.top;
  return true;
}
const anchored = (node, win) => /^(absolute|fixed|sticky)$/.test(win.getComputedStyle(node).position);
function chatGPTComposer(scroller, target, bottom, win) {
  const composers = [...scroller.querySelectorAll('form[data-chatgpt-composer][data-composer-placement="thread"]')]
    .filter(node => !target.contains(node) && rendered(node, win));
  if (composers.length !== 1) return null;
  const [composer] = composers;
  for (let node = composer; node && node !== scroller; node = node.parentElement) {
    if (anchored(node, win) && node.getBoundingClientRect().bottom >= bottom - 1) return composer;
  }
  return null;
}
function geminiComposer(main, scroller, bottom, win) {
  if (!main.contains(scroller)) return null;
  const composers = [...main.querySelectorAll('input-container')].filter(node =>
    node.closest('chat-window') === main && !scroller.contains(node) && rendered(node, win));
  if (composers.length !== 1) return null;
  const [composer] = composers;
  if (!anchored(composer, win) || composer.getBoundingClientRect().bottom < bottom - 1) return null;
  // Avoid the input field, not its decorative gradient.
  const fields = [...composer.querySelectorAll('.text-input-field')].filter(node =>
    composer.contains(node.closest('input-area-v2')) && rendered(node, win) &&
    win.getComputedStyle(node).pointerEvents !== 'none');
  return fields.length === 1 ? fields[0] : null;
}
export function jumpRegionEnd(binding, doc, win, refreshDock, floor=-Infinity) {
  const {target, main, header, kind} = binding || {};
  if (!target?.isConnected || !main?.isConnected || !main.contains(target) ||
      (header && !header.isConnected) ||
      /^(sticky|fixed)$/.test(win.getComputedStyle(target).position)) return false;
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || (kind === 'editor' && scroller !== target)) return false;
  if (scroller === target) return scrollPort(scroller, doc, win,
    scroller.scrollHeight - scroller.clientHeight);
  const chatGPTReply = kind === 'reply' && binding.answerRoot === target;
  const geminiReply = kind === 'reply' && main.matches('chat-window');
  const siteReply = chatGPTReply || geminiReply;
  const port = siteReply ? visibleReplyPort(scroller, doc, win) : viewport(scroller, doc, win);
  const rect = target.getBoundingClientRect();
  if ((siteReply && port.height <= GAP) || rect.left >= port.right || rect.right <= port.left) return false;
  const overlaps = box => box.left < Math.min(port.right, rect.right) && box.right > Math.max(port.left, rect.left);
  let bottom = port.top + port.height;
  const composer = chatGPTReply ? chatGPTComposer(scroller, target, bottom, win) :
    geminiReply ? geminiComposer(main, scroller, bottom, win) : null;
  const cover = composer?.getBoundingClientRect();
  if (cover && cover.top > port.top && cover.top < bottom && overlaps(cover)) bottom = cover.top;
  if (siteReply) {
    const line = firstLineHeight(target, win);
    const peers = [...doc.documentElement.children].filter(node => {
      const style = win.getComputedStyle(node);
      return style.position === 'fixed' && style.opacity !== '0' && rendered(node, win);
    }).map(node => ({box: node.getBoundingClientRect(), dock: node.getAttribute(MODERN_OWN) === 'dock'}))
      .sort((a,b) => b.box.top - a.box.top);
    // On narrow screens the compact dock can sit well above the composer.
    for (const {box, dock} of peers) if (box.top >= port.top + GAP + line && box.top < bottom - GAP &&
        (dock || box.bottom > bottom - GAP - line) && overlaps(box)) bottom = box.top;
  }
  const next = scroller.scrollTop + rect.bottom - bottom + GAP;
  if (next <= floor) return true;
  if (!scrollPort(scroller, doc, win, next)) return false;
  if (siteReply && refreshDock) {
    // The first scroll can reveal the Dock. Correct for its new geometry once.
    refreshDock();
    jumpRegionEnd(binding, doc, win, null, scroller.scrollTop);
  }
  return true;
}
export function findConversationNavigation(main, turnSelector, doc, win) {
  if (!main?.isConnected || !rendered(main, win) ||
      typeof turnSelector !== 'string' || !turnSelector) return null;
  const candidates = [...main.querySelectorAll(turnSelector)].filter(node=>rendered(node, win));
  const turns = candidates.filter(node=>!candidates.some(parent=>parent!==node&&parent.contains(node)));
  if (!turns.length) return null;
  const first = turns[0], last = turns.at(-1);
  const scroller = findConversationScroller(first, doc, win, {includeSelf: true});
  if (!scroller || turns.includes(scroller) ||
      turns.some(turn => findConversationScroller(turn, doc, win, {includeSelf: true}) !== scroller))
    return null;
  if (scroller !== doc.scrollingElement && scroller !== doc.documentElement &&
      (!scroller.contains(first) || !scroller.contains(last) || scroller.closest('aside')))
    return null;
  return {scroller, main, first, last, turns};
}
// DeepSeek speaker markers must be direct children.
export function deepSeekMessage(node) {
  if(!node?.matches('.ds-message'))return null;
  const users=[...node.children].filter(child=>child.matches('.fbb737a4'));
  const replies=[...node.children].filter(child=>child.matches('.ds-assistant-message-main-content'));
  if(users.length+replies.length!==1)return null;
  if(replies.length)return node.matches('.d29f3d7d')?null:{role:'assistant',body:replies[0]};
  return node.matches('.d29f3d7d')?{role:'user',body:users[0]}:null;
}

// Only count questions with an unambiguous role.
function conversationTurnRole(node,site) {
  if(site==='gemini')
    return node.localName==='user-query'?'user':node.localName==='model-response'?'assistant':null;
  if(site==='deepseek')return deepSeekMessage(node)?.role??null;
  const roles=new Set();
  const mark=(name,value)=>{
    if(typeof value!=='string')return;
    const clean=value.trim().toLowerCase();
    const match=name==='data-content-search-unit-key'
      ?/(?:^|[:._-])(user|assistant)(?:$|[:._-])/.exec(clean)
      :/^(user|assistant)$/.exec(clean);
    if(match)roles.add(match[1]);
  };
  const markers=['data-turn','data-message-author-role','data-message-role',
    'data-conversation-role','data-role','data-content-search-unit-key'];
  for(const name of markers)mark(name,node.getAttribute(name));
  for(const child of node.querySelectorAll(
    '[data-turn],[data-message-author-role],[data-message-role],' +
    '[data-conversation-role],[data-role],[data-content-search-unit-key]')) {
    for(const name of markers)if(child.hasAttribute(name))mark(name,child.getAttribute(name));
    if(roles.size>1)return null;
  }
  return roles.size===1?[...roles][0]:null;
}
export function isVirtualChatGPT(binding,win) {
  return win.location?.origin==='https://chatgpt.com'&&
    (binding.site==='chatgpt'||binding.custom===true)&&
    binding.scroller.hasAttribute('data-app-action-timeline-scroll');
}

// Native IDs survive search-unit key hydration.
function virtualQuestionId(target) {
  const id=target.parentElement?.getAttribute('data-chatgpt-search-message-ids');
  return /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id||'')?id.toLowerCase():null;
}

export function findConversationPages(binding,doc,win,history=null) {
  const forget=()=>{if(history)history.snapshot=null;return null;};
  const {main,scroller,selector,site}=binding||{};
  if(!main?.isConnected||!scroller?.isConnected||!selector||
      !['chatgpt','deepseek','gemini','custom'].includes(site))return forget();
  const navigation=findConversationNavigation(main,selector,doc,win);
  if(!navigation||navigation.scroller!==scroller||navigation.turns.length>2000)return forget();
  const virtual=isVirtualChatGPT(binding,win);
  const pages=[];
  for(const node of navigation.turns) {
    const role=conversationTurnRole(node,site);
    if(!role)return forget();
    if(role==='user')pages.push({target:node});
    else if(!pages.length&&!virtual)return forget();
  }
  // A virtual window may briefly contain only the tail of an answer.
  if(!pages.length)return virtual?null:forget();
  const paging={main,scroller,pages};
  // Cache only observed keys and geometry; never hold detached nodes.
  if(!history)return paging;
  if(!virtual&&(site!=='chatgpt'||win.location?.origin!=='https://chatgpt.com')) {
    forget();return paging;
  }
  const port=viewport(scroller,doc,win),known=new Map(),live=new Map();
  for(const {target} of pages) {
    const unit=target.getAttribute('data-content-search-unit-key');
    const slot=/^(?:fallback-)?(turn-[0-9]+:[0-9]+):user$/.exec(unit||'')?.[1];
    const key=virtual?virtualQuestionId(target):(slot&&unit);
    const top=scroller.scrollTop+target.getBoundingClientRect().top-port.top;
    const cover=obstruction({target,main},doc,win,port);
    if(!key||known.has(key)||
        !Number.isFinite(top)||!Number.isFinite(cover)) {
      forget();return paging;
    }
    known.set(key,{key,top,cover,slot});
    live.set(key,{target,key});
  }
  const scope=[doc.documentElement,win.location.href,main,scroller,selector,site,virtual];
  const size=[scroller.clientHeight,scroller.clientWidth,win.innerWidth,win.innerHeight,
    ...(virtual?[]:[scroller.scrollHeight])];
  const old=history.snapshot;
  const shared=old?[...known.values()].filter(({key})=>old.known.has(key)):[];
  const oldSlots=new Map(virtual&&old?[...old.known.values()]
    .filter(({slot})=>slot).map(({slot,key})=>[slot,key]):[]);
  const reusable=old&&
    scope.every((value,i)=>value===old.scope[i])&&
    size.every((value,i)=>value===old.size[i])&&
    (virtual?[...known.values()].every(({key,slot})=>!slot||!oldSlots.has(slot)||oldSlots.get(slot)===key):
      shared.length>0&&shared.every(value=>{
        const previous=old.known.get(value.key);
        return Math.abs(previous.top-value.top)<=2&&Math.abs(previous.cover-value.cover)<=2;
      }));
  const merged=new Map(reusable?old.known:[]);
  if(virtual&&reusable&&shared.some(({key,top})=>Math.abs(top-old.known.get(key).top)>2)) {
    // Update estimates from the nearest shared question.
    for(const [key,value] of merged)if(!known.has(key)){
      const nearest=shared.reduce((best,current)=>
        Math.abs(old.known.get(current.key).top-value.top)<Math.abs(old.known.get(best.key).top-value.top)?current:best);
      merged.set(key,{...value,top:value.top+nearest.top-old.known.get(nearest.key).top});
    }
  }
  for(const [key,value] of known)merged.set(key,value);
  if(merged.size>2000){forget();return paging;}
  history.snapshot={scope,size,known:merged};
  paging.pages=[...merged.values()].sort((a,b)=>a.top-b.top)
    .map(value=>live.get(value.key)||{...value,remembered:true});
  return paging;
}
function questionLanding(paging,page,doc,win) {
  const port=viewport(paging.scroller,doc,win);
  if(page.remembered) {
    return page.cover+GAP<port.height?page.top-page.cover-GAP:null;
  }
  if(!page.target?.isConnected||!paging.main.contains(page.target))return null;
  const cover=obstruction({target:page.target,main:paging.main},doc,win,port);
  if(cover+GAP>=port.height)return null;
  return paging.scroller.scrollTop+page.target.getBoundingClientRect().top-port.top-cover-GAP;
}
export function currentConversationPageIndex(paging,doc,win) {
  if(!paging?.pages?.length||!paging.scroller?.isConnected)return -1;
  // Count from the landing below sticky headers.
  let index=-1;
  for(const [position,page] of paging.pages.entries()) {
    const top=questionLanding(paging,page,doc,win);
    if(top===null)return -1;
    if(top<=paging.scroller.scrollTop+2)index=position;
    else break;
  }
  const {scroller,pages}=paging;
  const max=scroller.scrollHeight-scroller.clientHeight;
  // At bottom, count a visible final question that cannot align.
  if(index>=0&&index===pages.length-2&&max>2&&scroller.scrollTop>=max-2) {
    const target=pages.at(-1).target;
    if(target?.isConnected&&paging.main.contains(target)) {
      const port=viewport(scroller,doc,win),rect=target.getBoundingClientRect();
      const cover=obstruction({target,main:paging.main},doc,win,port);
      if(rect.top>=port.top+cover&&rect.top+firstLineHeight(target,win)<=port.top+port.height)return index+1;
    }
  }
  return Math.max(0,index);
}
export function conversationPageTargetIndex(paging,direction,doc,win) {
  if(!['previous','next'].includes(direction))return -1;
  const index=currentConversationPageIndex(paging,doc,win);
  if(index<0)return -1;
  const {scroller,pages}=paging;
  const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
  // From a long answer, return to its question before paging back.
  const step=direction==='previous'?-1:1;
  for(let candidate=index+(step>0?1:0);candidate>=0&&candidate<pages.length;candidate+=step) {
    const landing=questionLanding(paging,pages[candidate],doc,win);
    if(landing===null)return -1;
    const top=Math.max(0,Math.min(max,landing));
    if(step*(top-scroller.scrollTop)>2)return candidate;
  }
  return -1;
}
export function jumpConversationPage(paging,direction,doc,win) {
  const destination=conversationPageTargetIndex(paging,direction,doc,win);
  if(destination<0)return false;
  const page=paging.pages[destination];
  if(page.remembered)return scrollPort(paging.scroller,doc,win,questionLanding(paging,page,doc,win));
  return jumpRegionTop({target:page.target,
    main:paging.main,kind:'conversation'},doc,win);
}
export function jumpConversationEdge(main, turnSelector, direction, doc, win) {
  if (direction !== 'top' && direction !== 'bottom') return false;
  const navigation = findConversationNavigation(main, turnSelector, doc, win);
  if (!navigation) return false;
  const {scroller} = navigation;
  return scrollPort(scroller, doc, win,
    direction === 'top' ? 0 : scroller.scrollHeight - scroller.clientHeight);
}
function localTarget(header, anchor, main, idIndex, win) {
  const controls = anchor.getAttribute('aria-controls');
  if (controls) {
    const ids = controls.trim().split(/\s+/);
    if (ids.length !== 1) return null;
    const targets = idIndex.get(ids[0]) || [];
    return targets.length === 1 && main.contains(targets[0]) && !targets[0].contains(header)
      && rendered(targets[0], win) ? targets[0] : null;
  }
  const turn = header.closest(TURN);
  for (let scope = header.parentElement; scope && scope !== main; scope = scope.parentElement) {
    const contents = [...scope.querySelectorAll(CONTENT)].filter(node =>
      !node.contains(header) && !header.contains(node) && !node.closest('header') && rendered(node, win));
    const outer = contents.filter(node => !contents.some(other => other !== node && other.contains(node)));
    if (outer.length === 1 && scope.querySelectorAll('header').length === 1) return outer[0];
    if (scope === turn || scope.matches('article,section,form')) break;
  }
  return null;
}
export function isLong(target, doc, win) {
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return false;
  const height = Math.max(target.getBoundingClientRect().height, target.scrollHeight || 0);
  return height > Math.max(240, Math.min(win.innerHeight, scroller.clientHeight) * 0.65);
}
function messageActions(marker, copySelector, peerSelector, boundary, win) {
  for (let group = marker.parentElement; group && group !== boundary; group = group.parentElement) {
    if (group.matches('header') || group.querySelector(TURN)) return null;
    const copies = [...group.querySelectorAll(copySelector)];
    const peers = [...group.querySelectorAll(peerSelector)];
    if (copies.length > 1 || peers.length > 1) return null;
    if (copies.length !== 1 || peers.length !== 1) continue;
    if (!rendered(group, win) || !rendered(copies[0], win) || !rendered(peers[0], win)) return null;
    // Insert beside the native action wrapper, preserving its tooltip ownership.
    let anchor = copies[0];
    while (anchor.parentElement !== group) anchor = anchor.parentElement;
    return {header: group, anchor};
  }
  return null;
}

function assistantActions(original, main, win) {
  // DIL puts regenerate inside More; bind the outer turn footer.
  const turn = original.closest('[data-talvt-turn-state]');
  if (turn && original.matches('[data-content-search-unit-key$=":assistant"]')) {
    if (turn.getAttribute('data-talvt-turn-state') !== 'complete' ||
        turn.querySelectorAll(ASSISTANT_TURN).length !== 1 ||
        original.querySelectorAll('[data-conversation-role="assistant"]').length !== 1 ||
        ![...original.children].some(node => node.matches('[data-conversation-role="assistant"]')))
      return null;
    const footers = [...turn.children].filter(node => node.matches('.turn-action-controls'));
    if (footers.length !== 1 || footers[0].contains(original) ||
        original.contains(footers[0]) || footers[0].querySelector(TURN)) return null;
    const feedback = [...footers[0].querySelectorAll('button[aria-label="评价回复"],button[aria-label="反馈"]')];
    if (feedback.length !== 1) return null;
    const actions = messageActions(feedback[0], 'button[aria-label="复制"]',
      'button[aria-label="更多操作"]', turn, win);
    return actions && footers[0].contains(actions.header) ? actions : null;
  }
  // Never associate an action bar across a second assistant reply.
  for (let scope = original.parentElement; scope && scope !== main; scope = scope.parentElement) {
    if (scope.querySelectorAll(ASSISTANT_TURN).length !== 1) break;
    const markers = [...scope.querySelectorAll('button[aria-label="评价回复"]')]
      .filter(button => !original.contains(button) && !button.closest('header'));
    if (markers.length > 1) break;
    if (markers.length === 1) return messageActions(markers[0], 'button[aria-label="复制"]',
      'button[aria-label="重新生成回复"]', scope, win);
  }
  return null;
}

function messageBindings(main, doc, win) {
  const bindings = [];
  for (const original of main.querySelectorAll(SEARCH_TURN)) {
    let target = original;
    const assistant = original.matches(ASSISTANT_TURN);
    if (!rendered(original, win)) continue;
    if (assistant) {
      const viewers = [...original.children].filter(node => node.matches(MINDMAP_VIEWER));
      const contents = [...original.children].filter(node => node.tagName === 'DIV'
        && !node.matches('[data-opendesk-chatgpt-mindmap]')
        && node.querySelector(ASSISTANT_CONTENT));
      if (!viewers.length && contents.some(node => !rendered(node, win))) continue;
      if (viewers.length) {
        // The adjacent viewer replaces the concealed assistant content.
        if (viewers.length !== 1 || contents.length !== 1
            || contents[0].nextElementSibling !== viewers[0]
            || rendered(contents[0], win) || !rendered(viewers[0], win)
            || viewers[0].querySelector(SEARCH_TURN)) continue;
        target = viewers[0];
      }
    }
    // A compact viewer still belongs to the full reply.
    if (target === original && !isLong(target, doc, win)) continue;
    let actions = null;
    if (!assistant) {
      const copies = [...target.querySelectorAll('button[aria-label="复制消息"]')];
      if (copies.length === 1) actions = messageActions(copies[0],
        'button[aria-label="复制消息"]', 'button[aria-label="编辑消息"]', target, win);
    } else {
      actions = assistantActions(original, main, win);
    }
    if (actions) bindings.push({...actions, target, main, kind: assistant && target === original ? 'reply' : 'region',
      ...(assistant ? {answerRoot: original} : {})});
  }
  return bindings;
}

export function findRegionBindings(doc, win) {
  const main = findConversationMain(doc, win);
  if (!main) return [];
  const bindings = [];
  const used = new Set();
  const headers = [...main.querySelectorAll('header')];
  const idIndex = new Map();
  if (headers.some(header => header.querySelector('button[aria-controls]'))) {
    for (const node of doc.querySelectorAll('[id]')) {
      const matches = idIndex.get(node.id) || [];
      matches.push(node);
      idIndex.set(node.id, matches);
    }
  }
  for (const header of headers) {
    if (!rendered(header, win)) continue;
    const anchor = findHeaderAction(header, win);
    if (!anchor) continue;
    const target = localTarget(header, anchor, main, idIndex, win);
    if (!target || used.has(target) || !isLong(target, doc, win)) continue;
    let kind = 'region';
    if (target.matches('textarea,[contenteditable="true"]')) {
      if (findConversationScroller(target, doc, win, {includeSelf: true}) === target) {
        kind = 'editor';
      } else {
        // Editors with overflow must keep scrolling locally.
        if (!target.matches('[contenteditable="true"]') ||
            target.scrollHeight > target.clientHeight + 1 ||
            /^(hidden|clip)$/.test(win.getComputedStyle(target).overflowY)) continue;
      }
    }
    used.add(target);
    bindings.push({header, anchor, target, main, kind});
  }
  for (const binding of messageBindings(main, doc, win)) {
    if (!used.has(binding.target) && !bindings.some(item => item.header === binding.header)) {
      used.add(binding.target);
      bindings.push(binding);
    }
  }
  const header = chooseConversationHeader(doc, win, main);
  // An unresolved Open editor does not prove a global conversation relation.
  if (header && !header.querySelector(NATIVE_EDITOR) && !bindings.some(item => item.header === header)) {
    const target = main.querySelector(TURN);
    const scroller = findConversationScroller(target, doc, win);
    const anchor = findHeaderAction(header, win);
    if (anchor && scroller && scroller.scrollHeight - scroller.clientHeight > scroller.clientHeight) {
      bindings.push({header, anchor, target, main, kind: 'conversation'});
    }
  }
  return bindings;
}
// Share the verified footer layout; each tool owns its own host.
function answerToolScope(bar) {
  return bar.closest?.('.turn-action-controls') || bar;
}
export function mountAnswerTool(bar, host) {
  if (!bar?.isConnected || !host || host === bar || host.contains(bar)) return null;
  const scope = answerToolScope(bar);
  const groups = [...scope.querySelectorAll(ANSWER_TOOL_GROUPS)];
  let group = groups[0];
  if (groups.length > 1) {
    const previous = host.parentElement;
    const destinations = groups.filter(candidate => candidate !== previous);
    // Only move our own host into the older peer group.
    if (groups.length !== 2 || destinations.length !== 1 ||
        previous?.childNodes.length !== 1 || previous.childNodes[0] !== host ||
        ![...destinations[0].children].some(node =>
          node.matches('[data-opendesk-chatgpt-mindmap="button"]'))) return null;
    group = destinations[0];
  }
  const target = group?.parentElement || scope;
  if (!target?.isConnected || !scope.contains(target)) return null;
  if (!group) {
    group = bar.ownerDocument.createElement('span');
    group.setAttribute(ANSWER_TOOLS, '');
    group.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:2px;'
      + 'border-radius:12px;background:color-mix(in srgb,currentColor 6%,transparent);'
      + 'border:1px solid color-mix(in srgb,currentColor 10%,transparent);'
      + 'max-width:100%;flex-wrap:wrap;flex:0 0 auto;';
  }
  if (!group.hasAttribute(ANSWER_TOOLS)) group.setAttribute(ANSWER_TOOLS, '');
  // Normalize peer layout only when it changes.
  if (group.style.marginInlineStart !== '0px') group.style.marginInlineStart = '0px';
  if (group.style.marginInlineEnd !== 'auto') group.style.marginInlineEnd = 'auto';
  if (group.style.justifyContent !== 'flex-start') group.style.justifyContent = 'flex-start';
  const previous = host.parentElement;
  if (previous !== group) group.append(host);
  if (previous !== group && previous?.matches(ANSWER_TOOL_GROUPS) && !previous.childNodes.length)
    previous.remove();
  // Order navigation before Mind Map without replacing peer controls.
  const mindmap = [...group.children].find(node =>
    node.matches('[data-opendesk-chatgpt-mindmap="button"]'));
  if (mindmap) {
    const navigators = [...group.children].filter(node => node.hasAttribute(OWN));
    for (const navigation of navigators) {
      if ([...group.children].indexOf(navigation) > [...group.children].indexOf(mindmap))
        mindmap.before(navigation);
    }
  }
  if (target.lastElementChild !== group) target.append(group);
  return group;
}

export function unmountAnswerTool(host) {
  const group = host?.parentElement;
  host?.remove();
  if (group?.matches(ANSWER_TOOL_GROUPS) && !group.childNodes.length) group.remove();
}

function newButton(doc, kind, directions, sessionKey) {
  const host = doc.createElement('span');
  host.setAttribute(OWN, sessionKey === 'default' ? 'host' : sessionKey);
  host.setAttribute(MODERN_OWN, 'reply');
  host.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;color:inherit;';
  const shadow = host.attachShadow({mode: 'open'});
  const style = doc.createElement('style');
  style.textContent = `button{width:34px;height:34px;display:inline-flex;
    align-items:center;justify-content:center;cursor:pointer;border:0;
    border-radius:10px;background:transparent;color:inherit;padding:0;
    font:inherit;line-height:1}
    button:hover{background:color-mix(in srgb,currentColor 9%,transparent)}
    button:disabled{opacity:.45;cursor:default}
    button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;
    stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}`;
  shadow.append(style);
  const controls = directions.map(direction => {
    const button = doc.createElement('button');
    button.type = 'button';
    const label = kind === 'conversation'
      ? (direction === 'top' ? 'Back to start of this conversation' : 'Go to end of this conversation')
      : (direction === 'top' ? 'Back to start of this content' : 'Go to end of this content');
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.scrollNavKey = kind === 'conversation'
      ? (direction === 'top' ? 'conversationTop' : 'conversationBottom')
      : (direction === 'top' ? 'regionTop' : 'regionBottom');
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'top'
      ? 'M5 4h14M12 20V8m-6 6 6-6 6 6'
      : 'M5 20h14M12 4v12m-6-6 6 6 6-6');
    svg.append(path);
    button.append(svg);
    shadow.append(button);
    return {button, direction};
  });
  return {host, controls};
}
export function installJumpToTop({doc, win, owner, resolveBindings = findRegionBindings,
  regionSelector = 'main,[role="main"],header', sessionKey = 'default',
  resolveNavigation = () => ({}),
  refreshDock,
  regionDirections = {top: true, bottom: false},
  conversationDirections = {top: true, bottom: false}}) {
  // Disposal may remove the owner map; reacquire it.
  sessions.get(doc)?.get(sessionKey)?.dispose();
  let active = sessions.get(doc);
  if (!active) {active = new Map();sessions.set(doc, active);}
  const mounted = new Map();
  const cleanups = [];
  let pending = false;
  let disposed = false;
  function remove(header) {
    const item = mounted.get(header);
    item?.unlisten();
    unmountAnswerTool(item?.host);
    mounted.delete(header);
  }
  function refresh() {
    pending = false;
    if (disposed) return;
    // Yield to a live older installation.
    if (legacyNavigationPresent(doc)) {
      for (const header of [...mounted.keys()]) remove(header);
      return;
    }
    const resolved = resolveBindings(doc, win);
    for (const old of mounted.values()) {
      const root = old.answerRoot;
      if (!root || resolved.some(binding => binding.header === old.header)
          || !old.main.isConnected || !old.main.contains(root)
          || findConversationMain(doc, win) !== old.main || !rendered(root, win)
          || !root.matches(ASSISTANT_TURN)
          || root.getAttribute('data-content-search-unit-key') !== old.answerKey) continue;
      // Keep proven controls through staged transitions without scrolling.
      const replacing = root.querySelector(MINDMAP_VIEWER) || [...root.children].some(node =>
        node.tagName === 'DIV' && node.querySelector('[data-d-component]') && !rendered(node, win));
      const actions = replacing && assistantActions(root, old.main, win);
      if (actions?.header === old.header && actions.anchor === old.anchor)
        resolved.push({...old, target: null});
    }
    const bindings = resolved.map(binding => {
      const options = binding.kind === 'conversation' ? conversationDirections : regionDirections;
      const programTop = sessionKey !== 'default' &&
        [...binding.header.querySelectorAll(`[${OWN}="host"]`)].some(host => host.isConnected);
      const directions = ['top', 'bottom'].filter(direction =>
        options[direction] === true &&
        resolveNavigation()?.[(binding.kind === 'conversation' ? 'conversation' : 'region') +
          (direction === 'top' ? 'Top' : 'Bottom')] !== false && !(direction === 'top' && programTop));
      return {...binding, directions};
    }).filter(binding => binding.directions.length);
    for (const header of mounted.keys()) {
      if (!bindings.some(binding => binding.header === header)) remove(header);
    }
    for (const binding of bindings) {
      // First live host wins even across independent module instances.
      const incumbent = [...answerToolScope(binding.header).querySelectorAll(`[${MODERN_OWN}="reply"]`)]
        .find(node => node.isConnected && node.shadowRoot &&
          node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
      if (incumbent && incumbent !== mounted.get(binding.header)?.host) {
        remove(binding.header);
        continue;
      }
      // Remove only our inert clones.
      for (const clone of answerToolScope(binding.header).querySelectorAll(
        `[${OWN}="${sessionKey === 'default' ? 'host' : sessionKey}"]`)) {
        if (!clone.shadowRoot) unmountAnswerTool(clone);
      }
      const old = mounted.get(binding.header);
      if (old?.host.isConnected && old.anchor === binding.anchor
          && (old.answerRoot || old.target) === (binding.answerRoot || binding.target)
          && old.directions.join(',') === binding.directions.join(',') &&
          (binding.answerRoot
            ? old.host.parentElement?.matches(ANSWER_TOOL_GROUPS)
              && answerToolScope(binding.header).contains(old.host.parentElement)
            : old.host.nextElementSibling === binding.anchor)) {
        if (binding.answerRoot) mountAnswerTool(binding.header, old.host);
        for (const {button} of old.controls) button.disabled = !binding.target;
        continue;
      }
      remove(binding.header);
      const item = newButton(doc, binding.kind, binding.directions, sessionKey);
      const cleanups = item.controls.map(({button, direction})=>owner.on(button, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        const active = [...answerToolScope(binding.header).querySelectorAll(`[${MODERN_OWN}="reply"]`)]
          .find(node => node.isConnected && node.shadowRoot &&
            node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
        // Revalidate owner before scrolling.
        if (resolveNavigation()?.[(binding.kind === 'conversation' ? 'conversation' : 'region') +
            (direction === 'top' ? 'Top' : 'Bottom')] === false ||
            button.disabled || legacyNavigationPresent(doc) || active !== item.host) {
          schedule();return;
        }
        const current = resolveBindings(doc, win).find(next => next.header === binding.header
          && next.anchor === binding.anchor
          && (next.answerRoot || next.target) === (binding.answerRoot || binding.target));
        if (current) {
          if (direction === 'bottom') jumpRegionEnd(current, doc, win, refreshDock);
          else jumpRegionTop(current, doc, win);
        } else {
          // A click can beat the debounced refresh during a mode transition.
          for (const {button: control} of item.controls) control.disabled = true;
          schedule();
        }
      }));
      if (binding.answerRoot) mountAnswerTool(binding.header, item.host);
      else binding.anchor.before(item.host);
      mounted.set(binding.header, {...item, ...binding,
        answerKey: binding.answerRoot?.getAttribute('data-content-search-unit-key'),
        unlisten:()=>cleanups.forEach(off=>off())});
    }
  }
  function schedule() {
    if (disposed || pending) return;
    pending = true;
    owner.setTimeout(refresh, 120);
  }
  const observer = owner.observe(doc.documentElement, records => {
    // Handle legacy takeover immediately.
    const peerChanged = records.some(record => record.type === 'childList' &&
      [...record.addedNodes, ...record.removedNodes].some(node =>
        (node.matches?.(LEGACY_LIFECYCLE)) ||
        (node.hasAttribute?.(OWN) && node.shadowRoot &&
          ![...mounted.values()].some(item => item.host === node))));
    if (peerChanged) { refresh(); return; }
    const relevant = records.some(record => {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest(`[${OWN}="${sessionKey === 'default' ? 'host' : sessionKey}"]`)) return false;
      const inRegion = target?.closest(regionSelector);
      if (record.type !== 'childList') return Boolean(inRegion);
      if ([...record.removedNodes].some(node => node.hasAttribute?.(OWN)
          && [...mounted.values()].some(item => item.host === node && !node.isConnected))) return true;
      const changed = [...record.addedNodes, ...record.removedNodes]
        .filter(node => node.getAttribute?.(OWN) !== (sessionKey === 'default' ? 'host' : sessionKey));
      return changed.length > 0 && (inRegion || changed.some(node => node.nodeType === 1
        && (node.matches(regionSelector) || node.querySelector(regionSelector))));
    });
    if (relevant) schedule();
  }, {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-controls', 'aria-label', 'id', 'class', 'style',
      'data-content-search-unit-key', 'data-chatgpt-search-unit-key']});
  cleanups.push(() => observer.disconnect());
  for (const type of ['popstate', 'hashchange', 'pageshow', 'resize']) cleanups.push(owner.on(win, type, schedule));
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const header of mounted.keys()) remove(header);
    cleanups.forEach(cleanup => cleanup());
    if (sessions.get(doc)?.get(sessionKey)?.dispose === dispose) {
      sessions.get(doc).delete(sessionKey);
      if (!sessions.get(doc).size) sessions.delete(doc);
    }
  }
  owner.onDispose(dispose);
  const session = {refresh, dispose, isMounted: () => [...mounted.values()].some(item => item.host.isConnected)};
  active.set(sessionKey, session);
  refresh();
  return session;
}
