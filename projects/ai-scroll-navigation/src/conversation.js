const SEARCH_KEY = 'data-content-search-unit-key';
const SEARCH_TURN = `[${SEARCH_KEY}]`;
const TURN = `[data-testid^="conversation-turn-"],${SEARCH_TURN},`
  + '[data-message-author-role],[data-message-role],[data-conversation-role]';
const CONTENT = 'pre,textarea,[contenteditable="true"],'
  + '[data-message-author-role],[data-message-role]';
const NATIVE_EDITOR = 'button[aria-label="Open editor"],button[aria-label="打开编辑器"]';
const VIEWER_CLOSE = 'button[aria-label="Close viewer"],button[aria-label="关闭查看器"]';
const ASSISTANT_KEY = `[${SEARCH_KEY}$=":assistant"]`;
const ASSISTANT_TURN = `${SEARCH_TURN}[data-chatgpt-search-unit-key],${ASSISTANT_KEY}`;
// Shared with older Mind Map and Page installs.
const OWN = 'data-opendesk-chatgpt-jump-top';
const MODERN_OWN = 'data-opendesk-ai-scroll-navigation';
const LEGACY_LIFECYCLE = '[data-opendesk-ui-owner][data-od-id="opendesk.chatgpt-jump-top.lifecycle"]';
const ANSWER_TOOLS = 'data-ai-answer-tools';
const ANSWER_TOOL_GROUPS = `[${ANSWER_TOOLS}],[data-opendesk-chatgpt-answer-tools]`;
const MINDMAP = 'data-opendesk-chatgpt-mindmap';
const MINDMAP_VIEWER = `[${MINDMAP}="viewer"]`;
const MINDMAP_BUTTON = `[${MINDMAP}="button"]`;
const ASSISTANT_CONTENT = '[data-d-component],[data-markdown-text-style="assistant-message"]';
const WRITING_BLOCK = '[data-client-defined-widget="writing_block"]';
const ASSISTANT_ROLE = '[data-message-author-role="assistant"],[data-conversation-role="assistant"]';
const ASSISTANT_OWNER = ASSISTANT_TURN + ',' + ASSISTANT_ROLE;
const EDITOR = 'textarea,[contenteditable]:not([contenteditable="false"])';
const BUSY_REPLY = '[aria-busy="true"],[data-is-streaming="true"],'
  + '[data-talvt-turn-state]:not([data-talvt-turn-state="complete"])';
const PIN_BLOCKER = 'dialog[open],[aria-modal="true"],' + MINDMAP_VIEWER +
  `,[${MODERN_OWN}="picker"]`;
const EXCLUDED = '[role="dialog"],[aria-modal="true"],[hidden],[inert],[aria-hidden="true"]';
const GAP = 12;
const MAX_REPLY_CONTEXT = 72;
const sessions = new WeakMap(); // per-document, per owner

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
    if (/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY)) {
      if (node === target && node.scrollHeight <= node.clientHeight + 1) continue;
      return node;
    }
  }
  const root = doc.scrollingElement || doc.documentElement;
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
  const chatGPTReply = kind === 'reply' && (binding.beforeTarget || binding.writing || binding.answerRoot === target);
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
      if (node.matches(FIXED_REPLY)) return false;
      const style = win.getComputedStyle(node);
      return style.position === 'fixed' && style.opacity !== '0' && rendered(node, win);
    }).map(node => ({box: node.getBoundingClientRect(), dock: node.getAttribute(MODERN_OWN) === 'dock'}))
      .sort((a,b) => b.box.top - a.box.top);
    for (const {box, dock} of peers) if (box.top >= port.top + GAP + line && box.top < bottom - GAP &&
        (dock || box.bottom > bottom - GAP - line) && overlaps(box)) bottom = box.top;
  }
  const next = scroller.scrollTop + rect.bottom - bottom + GAP;
  if (next <= floor) return true;
  if (!scrollPort(scroller, doc, win, next)) return false;
  if (siteReply && refreshDock) {
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
export function deepSeekMessage(node) {
  if(!node?.matches('.ds-message'))return null;
  const users=[...node.children].filter(child=>child.matches('.fbb737a4'));
  const replies=[...node.children].filter(child=>child.matches('.ds-assistant-message-main-content'));
  if(users.length+replies.length!==1)return null;
  if(replies.length)return node.matches('.d29f3d7d')?null:{role:'assistant',body:replies[0]};
  return node.matches('.d29f3d7d')?{role:'user',body:users[0]}:null;
}

function conversationTurnRole(node,site) {
  if(site==='gemini')
    return node.localName==='user-query'?'user':node.localName==='model-response'?'assistant':null;
  if(site==='deepseek')return deepSeekMessage(node)?.role??null;
  const roles=new Set();
  const mark=(name,value)=>{
    if(typeof value!=='string')return;
    const clean=value.trim().toLowerCase();
    const match=name===SEARCH_KEY
      ?/(?:^|[:._-])(user|assistant)(?:$|[:._-])/.exec(clean)
      :/^(user|assistant)$/.exec(clean);
    if(match)roles.add(match[1]);
  };
  const markers=['data-turn','data-message-author-role','data-message-role',
    'data-conversation-role','data-role',SEARCH_KEY];
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
  if(!pages.length)return virtual?null:forget();
  const paging={main,scroller,pages};
  if(!history)return paging;
  if(!virtual&&(site!=='chatgpt'||win.location?.origin!=='https://chatgpt.com')) {
    forget();return paging;
  }
  const port=viewport(scroller,doc,win),known=new Map(),live=new Map();
  for(const {target} of pages) {
    const unit=target.getAttribute(SEARCH_KEY);
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
  let index=-1;
  for(const [position,page] of paging.pages.entries()) {
    const top=questionLanding(paging,page,doc,win);
    if(top===null)return -1;
    if(top<=paging.scroller.scrollTop+2)index=position;
    else break;
  }
  const {scroller,pages}=paging;
  const max=scroller.scrollHeight-scroller.clientHeight;
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
    let anchor = copies[0];
    while (anchor.parentElement !== group) anchor = anchor.parentElement;
    return {header: group, anchor};
  }
  return null;
}

function assistantActions(original, main, win) {
  // DIL puts regenerate inside More; bind the outer turn footer.
  const turn = original.closest('[data-talvt-turn-state]');
  if (turn && original.matches(ASSISTANT_KEY)) {
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
        && !node.hasAttribute(MINDMAP)
        && node.querySelector(ASSISTANT_CONTENT));
      if (!viewers.length && contents.some(node => !rendered(node, win))) continue;
      if (viewers.length) {
        if (viewers.length !== 1 || contents.length !== 1
            || contents[0].nextElementSibling !== viewers[0]
            || rendered(contents[0], win) || !rendered(viewers[0], win)
            || viewers[0].querySelector(SEARCH_TURN)) continue;
        target = viewers[0];
      }
    }
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

function writingBindings(main, doc, win) {
  const bindings = [];
  for (const target of main.querySelectorAll(WRITING_BLOCK)) {
    const reply = target.closest(ASSISTANT_OWNER);
    if (!reply || !main.contains(reply) || !rendered(target, win) || !isLong(target, doc, win) ||
        target.parentElement?.closest(WRITING_BLOCK + ',' + EDITOR + ',button,a[href]') ||
        target.closest(BUSY_REPLY) || target.querySelector(WRITING_BLOCK)) continue;
    const headers = [...target.children].filter(node => node.matches('header') && rendered(node, win));
    const header = headers.length === 1 ? headers[0] : null;
    const anchor = header && findHeaderAction(header, win);
    const editors = [...target.querySelectorAll(EDITOR)];
    if (editors.length) {
      const [editor] = editors;
      if (editors.length !== 1 || !anchor?.matches(NATIVE_EDITOR) || header.contains(editor) ||
          !editor.matches('div[role="textbox"][contenteditable="true"]') || !rendered(editor, win) ||
          editor.scrollHeight > editor.clientHeight + 1 ||
          /^(hidden|clip)$/.test(win.getComputedStyle(editor).overflowY) ||
          findConversationScroller(editor, doc, win) !== findConversationScroller(target, doc, win)) continue;
    }
    bindings.push({header: anchor ? header : target, anchor: anchor || target, target, main,
      kind: 'reply', writing: true, beforeTarget: !anchor});
  }
  return bindings;
}
function replyContainsOnlyWriting(target, widget, win) {
  if (!target.contains(widget)) return false;
  for (let child = widget; child !== target; child = child.parentElement) {
    if ([...child.parentElement.childNodes].some(sibling => sibling !== child && (
      sibling.nodeType === 3 ? Boolean(sibling.textContent?.trim()) :
        sibling.nodeType === 1 && !sibling.matches(`[${OWN}][${MODERN_OWN}="reply"]`) && rendered(sibling, win)
    ))) return false;
  }
  return true;
}

export function findRegionBindings(doc, win) {
  const main = findConversationMain(doc, win);
  if (!main) return [];
  const bindings = writingBindings(main, doc, win);
  const used = new Set(bindings.map(binding => binding.target));
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
    const widget = header.closest(WRITING_BLOCK);
    if (widget && !anchor.getAttribute('aria-controls')) continue;
    const target = localTarget(header, anchor, main, idIndex, win);
    if (!target || used.has(target) || !isLong(target, doc, win)) continue;
    let kind = 'region';
    if (target.matches('textarea,[contenteditable="true"]')) {
      if (findConversationScroller(target, doc, win, {includeSelf: true}) === target) {
        kind = 'editor';
      } else {
        if (!target.matches('[contenteditable="true"]') ||
            target.scrollHeight > target.clientHeight + 1 ||
            /^(hidden|clip)$/.test(win.getComputedStyle(target).overflowY)) continue;
      }
    }
    if (widget && (kind !== 'editor' || target.closest(WRITING_BLOCK) !== widget)) continue;
    used.add(target);
    bindings.push({header, anchor, target, main, kind});
  }
  for (const binding of messageBindings(main, doc, win)) {
    if (!used.has(binding.target) && !bindings.some(item => item.header === binding.header)) {
      used.add(binding.target);
      bindings.push(binding);
    }
  }
  for (const marker of main.querySelectorAll(ASSISTANT_ROLE)) {
    const target = marker.closest(ASSISTANT_TURN) || marker;
    const turn = target.closest('[data-testid^="conversation-turn-"],[data-talvt-turn-state]') || target;
    if (used.has(target) || target.parentElement?.closest(ASSISTANT_OWNER + ',' + EDITOR + ',button,a[href]') ||
        [...turn.querySelectorAll(ASSISTANT_OWNER)].some(node => node !== target && !target.contains(node)) ||
        turn.querySelector('.turn-action-controls,button[aria-label="评价回复"],button[aria-label="反馈"]') ||
        target.closest(BUSY_REPLY) || target.querySelector(MINDMAP_VIEWER + ',' + EDITOR) ||
        !rendered(target, win) || !isLong(target, doc, win)) continue;
    if (bindings.some(binding => binding.writing && replyContainsOnlyWriting(target, binding.target, win))) continue;
    used.add(target);
    bindings.push({header:target, anchor:target, target, main, kind:'reply', beforeTarget:true});
  }
  const header = chooseConversationHeader(doc, win, main);
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
    if (groups.length !== 2 || destinations.length !== 1 ||
        previous?.childNodes.length !== 1 || previous.childNodes[0] !== host ||
        ![...destinations[0].children].some(node =>
          node.matches(MINDMAP_BUTTON))) return null;
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
  if (group.style.marginInlineStart !== '0px') group.style.marginInlineStart = '0px';
  if (group.style.marginInlineEnd !== 'auto') group.style.marginInlineEnd = 'auto';
  if (group.style.justifyContent !== 'flex-start') group.style.justifyContent = 'flex-start';
  const previous = host.parentElement;
  if (previous !== group) group.append(host);
  if (previous !== group && previous?.matches(ANSWER_TOOL_GROUPS) && !previous.childNodes.length)
    previous.remove();
  const mindmap = [...group.children].find(node => node.matches(MINDMAP_BUTTON));
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

function newButton(doc, kind, directions, sessionKey, fixed = false) {
  const host = doc.createElement('span');
  if (!fixed) host.setAttribute(OWN, sessionKey === 'default' ? 'host' : sessionKey);
  host.setAttribute(MODERN_OWN, fixed ? 'reply-fixed' : 'reply');
  host.style.cssText = 'display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;color:inherit;';
  if (fixed) host.style.cssText += 'position:fixed;z-index:40;visibility:hidden;padding:4px;gap:2px;'
    + 'border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:13px;'
    + 'box-sizing:border-box;background:Canvas;color:CanvasText;box-shadow:0 2px 10px #0002;';
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
  if (fixed) style.textContent += 'button{width:44px;height:44px}';
  shadow.append(style);
  const controls = directions.map(direction => {
    const button = doc.createElement('button');
    button.type = 'button';
    const label = fixed
      ? (doc.documentElement.lang.startsWith('zh') ?
        (direction === 'top' ? '回到当前回复顶部' : '跳到当前回复底部') :
        (direction === 'top' ? 'Go to current reply top' : 'Go to current reply bottom'))
      : kind === 'conversation'
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

const FIXED_REPLY = `[${MODERN_OWN}="reply-fixed"]`;
const INTERACTIVE = 'button,a[href],input,textarea,select,summary,[role="button"],'
  + '[role="menu"],[role="listbox"],form,[contenteditable="true"],'
  + `[${MODERN_OWN}],[${MINDMAP}]`;
const replyKey = target => target?.closest(SEARCH_TURN)?.getAttribute(SEARCH_KEY);
const isFixedReply = item => item.target &&
  (item.writing || item.beforeTarget || (item.kind === 'reply' && item.answerRoot === item.target));
const TRANSCRIPT_MAIN = 'main,[role="main"]';
const TRANSCRIPT_TURN = TURN + ',[data-turn-id]';
const REPLY_ROLE = ASSISTANT_ROLE + ',[data-message-role="assistant"]';
const REPLY_BODY = REPLY_ROLE + ',' + WRITING_BLOCK;
const ROUTE_MARKER = TRANSCRIPT_TURN + ',' + REPLY_BODY;
const SPEAKER_ATTRIBUTES = ['data-conversation-role','data-message-role','data-message-author-role'];
const DRAFT_USER_TURN = [`[${SEARCH_KEY}$=":user"]`, ...SPEAKER_ATTRIBUTES.map(attr => `[${attr}="user"]`)].join(',');
const isDraftUser = (node, former) => (former === 'user' || node.matches(DRAFT_USER_TURN)) &&
  !node.matches('h1,h2,h3,h4,h5,h6');
const TURN_ATTRIBUTES = new Set([SEARCH_KEY,'data-testid','data-turn-id','data-message-id',
  ...SPEAKER_ATTRIBUTES,'data-client-defined-widget']);
function formerTurnMarker({attributeName, oldValue}) {
  if (oldValue == null) return null;
  if (SPEAKER_ATTRIBUTES.includes(attributeName)) return oldValue === 'assistant' ? 'body' : oldValue === 'user' ? 'user' : 'turn';
  if (attributeName === SEARCH_KEY && oldValue.endsWith(':user')) return 'user';
  if (attributeName === 'data-client-defined-widget') return oldValue === 'writing_block' ? 'body' : null;
  if (attributeName === 'data-testid') return oldValue.startsWith('conversation-turn-') ? 'turn' : null;
  return TURN_ATTRIBUTES.has(attributeName) ? 'turn' : null;
}
const conversationPath = win => win.location?.pathname;

function replyPinPosition(item, doc, win) {
  const {target} = item;
  if (!target?.isConnected || !item.host.isConnected || !item.main.contains(target) ||
      !rendered(target, win) || target.closest(BUSY_REPLY) || replyKey(target) !== item.pinKey) return null;
  const box = target.getBoundingClientRect();
  const visualTop = win.visualViewport?.offsetTop ?? 0;
  if (box.bottom <= visualTop || box.top >= visualTop + (win.visualViewport?.height ?? win.innerHeight)) return null;
  const scroller = findConversationScroller(target, doc, win, {includeSelf: true});
  if (!scroller) return null;
  const port = visibleReplyPort(scroller, doc, win);
  if (box.bottom <= port.top || box.top >= port.top + port.height) return null;
  const width = item.directions.length === 1 ? 54 : 100, height = 54;
  const left = Math.max(port.left, box.left), right = Math.min(port.right, box.right);
  if (right <= left) return null;
  const y = Math.ceil(port.top + obstruction(item, doc, win, port, 8) + 8);
  const readingLine = y + height;
  if (box.top > readingLine || box.bottom <= readingLine || readingLine > port.top + port.height - 8) return null;
  const minX = Math.ceil(port.left + 8), maxX = Math.floor(port.right - width - 8);
  const rightGutter = Math.min(Math.ceil(right + 8), maxX);
  const leftGutter = Math.max(Math.floor(left - width - 8), minX);
  const slots = [rightGutter >= right + 2 ? rightGutter : null,
    leftGutter + width <= left - 2 ? leftGutter : null,
    Math.floor(right - width - 8), Math.ceil(left + 8)]
    .filter(x => x !== null && x >= minX && x <= maxX);
  const maxY = Math.min(box.bottom - height - 1, port.top + port.height - height - 8);
  return {scroller, slots, y, maxY, width, height, port};
}

function inlineReachable(item, {port}, doc) {
  return item.controls.every(({button}) => {
    const rect = button.getBoundingClientRect();
    if (rect.top < port.top || rect.bottom > port.top + port.height ||
        rect.left < port.left || rect.right > port.right || !rect.width || !rect.height) return false;
    return doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === item.host;
  });
}

function clearReplyPinSlot({scroller, x, y, width, height}, doc, interactive) {
  if (interactive.some(box => box.left < x+width && box.right > x && box.top < y+height && box.bottom > y)) return false;
  return [[2,2],[width-2,2],[2,height-2],[width-2,height-2],[width/2,height/2]]
    .every(([dx,dy]) => {
      const hit = doc.elementFromPoint(x+dx,y+dy);
      return hit && scroller.contains(hit) && !hit.closest(INTERACTIVE);
    });
}

function findReplyPinSlot(position, doc, interactive) {
  for (const offset of [0, 24, 56, 88, 120, 152]) {
    const y = position.y + offset;
    if (y > position.maxY) break;
    for (const x of position.slots)
      if (clearReplyPinSlot({...position, x, y}, doc, interactive)) return {x, y};
  }
}

function pinBlocked(doc, win) {
  return [...doc.querySelectorAll(PIN_BLOCKER)].some(node => {
    const box = node.getBoundingClientRect();
    const style = win.getComputedStyle(node);
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < win.innerHeight &&
      style.visibility === 'visible' && !node.closest('[hidden],[inert],[aria-hidden="true"]');
  });
}

export function installJumpToTop({doc, win, owner, resolveBindings = findRegionBindings,
  regionSelector = 'main,[role="main"],header', sessionKey = 'default',
  resolveNavigation = () => ({}), pinReplies = false,
  refreshDock,
  regionDirections = {top: true, bottom: false},
  conversationDirections = {top: true, bottom: false}}) {
  sessions.get(doc)?.get(sessionKey)?.dispose();
  let active = sessions.get(doc);
  if (!active) {active = new Map();sessions.set(doc, active);}
  const mounted = new Map();
  const cleanups = [];
  let pending = false;
  let disposed = false;
  let pinned = null, pinItem = null, pinFrame = null, bindingsPath;
  let pathname = conversationPath(win);
  const pathKey = path => path === '/' ? Symbol() : path;
  let route = pathKey(pathname);
  const replyRoutes = new WeakMap();
  const knownMains = new WeakSet();
  const bornAt = new WeakMap();
  const tracked = new Set();
  let draft = new Set(), carry;
  const findScope = (start, parents, matches) => {
    const pending = [start];
    const seen = new Set();
    while (pending.length) {
      const node = pending.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (matches(node)) return node;
      pending.push(node.parentElement, ...[...(parents?.get(node) ?? [])].reverse());
    }
  };
  const mainOf = (node, parents) => {
    const main = findScope(node, parents, n => knownMains.has(n) || n.matches(TRANSCRIPT_MAIN));
    if (main) knownMains.add(main);
    return main;
  };
  const liveDraftMain = () => {
    const mains = new Set([...draft].filter(n=>n.isConnected).map(n=>mainOf(n)).filter(Boolean));
    if (mains.size === 1) return [...mains][0];
  };
  let foreign = [];
  const updateForeign = () => {
    for (const node of tracked) if (!node.isConnected) tracked.delete(node);
    foreign = [...tracked].filter(node => replyRoutes.get(node).path !== route);
  };
  const replyOnCurrentPath = (item, verifyAttachment = false) => {
    if (!pinReplies || item.kind === 'conversation') return true;
    if (conversationPath(win) !== pathname) return false;
    const root = item.answerRoot || item.target || item.header;
    if (!item.main.contains(root)) return false;
    const stale = foreign.filter(node => item.main.contains(node) && (node.contains(root) || root.contains(node)));
    if (verifyAttachment) {
      // Clicks can precede mutations.
      const idOf = node => replyRoutes.get(node) || node.matches(REPLY_BODY) && bornAt.get(node);
      for (const node of root.querySelectorAll('*')) {
        const id = idOf(node);
        if (id && id.path !== route) return false;
      }
      for (let node = root; node !== item.main; node = node.parentElement) {
        const id = idOf(node);
        if (id && id.path !== route) {
          if (id.body) return false;
          stale.push(node);
        }
      }
    }
    if (!stale.length) return true;
    // Reused shells need new bodies.
    if (stale.some(node => replyRoutes.get(node).body || root.contains(node) && node !== root)) return false;
    return [...root.querySelectorAll(REPLY_BODY), root.closest(REPLY_BODY)]
      .some(node => node && replyRoutes.get(node)?.path === route && replyRoutes.get(node)?.body);
  };
  const rememberTurn = (node, former, parents) => {
    if (node.matches(TRANSCRIPT_MAIN)) return;
    let identity = replyRoutes.get(node);
    if (!identity) replyRoutes.set(node,identity = {...(bornAt.get(node) ?? {path:route})});
    if (carry && identity.path === carry.from && identity.draft === carry.main &&
        carry.main.contains(node)) identity.path = route;
    if (!identity.body && former !== 'body' && node.matches(ASSISTANT_TURN) && node.querySelector(REPLY_ROLE))
      identity.shell = true;
    if ((former === 'body' || node.matches(REPLY_BODY)) && !identity.shell)
      identity.body = true;
    if (pathname === '/' && identity.path === route && draft &&
        (draft.has(node) || isDraftUser(node, former)) &&
        mainOf(node, parents)) {
      const message = node.getAttribute('data-message-id'), search = node.getAttribute(SEARCH_KEY);
      const old = identity.message && message ? identity.message : identity.search;
      const next = identity.message && message ? message : search;
      if (old && next && old !== next) {draft = null; return;}
      identity.message ??= message;
      identity.search ??= search;
      const key = identity.message || identity.search;
      const shell = key && (identity.userShell ??= findScope(node, parents,
        n => n.matches('[data-turn-id],[data-testid^="conversation-turn-"]')));
      if (!draft.size || [...draft].some(user => user.contains(node) || node.contains(user) ||
          shell && replyRoutes.get(user).userShell === shell &&
          (replyRoutes.get(user).message || replyRoutes.get(user).search) === key))
        draft.add(node);
      else draft = null;
    }
    if (node.isConnected) tracked.add(node);
  };
  const rememberTranscript = main => {
    if (!main) return;
    knownMains.add(main);
    for (const node of main.querySelectorAll(ROUTE_MARKER)) rememberTurn(node);
  };
  const carryDraftTurns = (event, path) => {
    carry = null;
    if (!draft?.size || pathname !== '/' || !/^\/c\/[^/]+\/?$/.test(path) ||
        event?.type !== 'currententrychange' || event.navigationType !== 'replace') return;
    const current = liveDraftMain();
    if (!current) return;
    carry = {from:route,main:current};
    for (const node of current.querySelectorAll('*')) {
      const birth = bornAt.get(node);
      if (birth?.path === route && birth.draft) bornAt.set(node,{path});
    }
    for (const turn of tracked) {
      const id = replyRoutes.get(turn);
      if (id.path === route && id.draft && mainOf(turn) === current) id.path = path;
    }
  };
  let undoLandingFocus;
  const focusLanding = (target, direction) => {
    undoLandingFocus?.();
    const {top,bottom} = target.getBoundingClientRect();
    const edge = direction === 'top' ? top + 1 : bottom - 1;
    if (edge < 0 || edge >= win.innerHeight) return;
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex','-1');
      const off = owner.on(target,'blur',() => undoLandingFocus?.());
      undoLandingFocus = () => {
        off();
        if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
        undoLandingFocus = null;
      };
    }
    target.focus({preventScroll:true});
  };
  const dropPin = () => {
    pinItem = null;
    pinned?.unlisten();
    pinned?.host.remove();
    pinned = null;
  };
  const updatePin = () => {
    if (!pinReplies || disposed || resolveNavigation()?.pinReplyNavigation !== true ||
        conversationPath(win) !== bindingsPath || pinBlocked(doc, win)) {
      dropPin();return;
    }
    const incumbent = doc.querySelector(FIXED_REPLY);
    if (incumbent && incumbent !== pinned?.host) {dropPin();return;}
    if (pinned) pinned.host.style.pointerEvents = 'none';
    const replies = [...mounted.values()].filter(item => isFixedReply(item) && item.target.isConnected &&
      item.host.isConnected && replyOnCurrentPath(item));
    const current = replies.filter(item => !replies.some(other =>
      other !== item && other.target.contains(item.target)))
      .map(item => ({item, position: replyPinPosition(item, doc, win)})).filter(entry => entry.position);
    if (current.length !== 1) {dropPin();return;}
    const [{item, position}] = current;
    if (inlineReachable(item, position, doc)) {
      const active = pinned?.host.shadowRoot.activeElement;
      if (pinItem === item && active) item.controls.find(({button}) =>
        button.dataset.scrollNavKey === active.dataset.scrollNavKey)?.button.focus({preventScroll:true});
      dropPin();return;
    }
    const interactive = [...doc.querySelectorAll(INTERACTIVE)].filter(node => node !== pinned?.host)
      .map(node => node.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const slot = findReplyPinSlot(position, doc, interactive);
    if (!slot) {dropPin();return;}
    if (pinItem !== item) {
      dropPin();
      pinned = newButton(doc, 'reply', item.directions, sessionKey, true);
      pinItem = item;
      const off = pinned.controls.map(({button,direction}) => owner.on(button,'click',event => {
        if (!event.isTrusted) return;
        event.preventDefault();event.stopPropagation();
        updatePin();
        if (pinItem !== item || !pinned?.controls.some(control => control.button === button) ||
            resolveNavigation()?.[direction === 'top' ? 'regionTop' : 'regionBottom'] === false ||
            legacyNavigationPresent(doc)) return;
        if (!replyOnCurrentPath(item, true)) {dropPin();schedule();return;}
        const current = resolveBindings(doc, win).find(next => next.target === item.target &&
          next.header === item.header && next.anchor === item.anchor && next.main === item.main &&
          replyKey(next.target) === item.pinKey);
        if (!current) {dropPin();schedule();return;}
        const keyboard = event.detail === 0;
        const jumped = direction === 'bottom' ? jumpRegionEnd(current, doc, win, refreshDock)
          : jumpRegionTop(current, doc, win);
        if (keyboard && jumped) focusLanding(current.target, direction);
        schedulePin();
      }));
      pinned.unlisten = () => off.forEach(fn => fn());
      doc.documentElement.append(pinned.host);
    }
    Object.assign(pinned.host.style, {left:slot.x+'px',top:slot.y+'px',
      colorScheme:win.getComputedStyle(item.main).colorScheme,visibility:'visible',pointerEvents:'auto'});
  };
  function schedulePin() {
    if (!pinReplies || disposed || pinFrame !== null || resolveNavigation()?.pinReplyNavigation !== true) return;
    pinFrame = win.requestAnimationFrame(() => {pinFrame = null;updatePin();});
  }
  function remove(header) {
    const item = mounted.get(header);
    if (item === pinItem) dropPin();
    item?.unlisten();
    unmountAnswerTool(item?.host);
    mounted.delete(header);
  }
  const hostsAt = (binding, selector) => binding.beforeTarget
    ? [binding.anchor.previousElementSibling].filter(node => node?.matches(selector))
    : [...answerToolScope(binding.header).querySelectorAll(selector)];
  function refresh() {
    pending = false;
    if (disposed) return;
    if (legacyNavigationPresent(doc)) {
      for (const header of [...mounted.keys()]) remove(header);
      return;
    }
    advanceRoute();
    bindingsPath = conversationPath(win);
    if (pinReplies) {
      rememberTranscript(findConversationMain(doc, win));
      updateForeign();
    }
    const resolved = resolveBindings(doc, win);
    for (const old of mounted.values()) {
      const root = old.answerRoot;
      if (!root || resolved.some(binding => binding.header === old.header)
          || !old.main.isConnected || !old.main.contains(root)
          || findConversationMain(doc, win) !== old.main || !rendered(root, win)
          || !root.matches(ASSISTANT_TURN)
          || root.getAttribute(SEARCH_KEY) !== old.answerKey) continue;
      const replacing = root.querySelector(MINDMAP_VIEWER) || [...root.children].some(node =>
        node.tagName === 'DIV' && node.querySelector('[data-d-component]') && !rendered(node, win));
      const actions = replacing && assistantActions(root, old.main, win);
      if (actions?.header === old.header && actions.anchor === old.anchor)
        resolved.push({...old, target: null});
    }
    const bindings = resolved.filter(binding => replyOnCurrentPath(binding)).map(binding => {
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
      const incumbent = hostsAt(binding,`[${MODERN_OWN}="reply"]`)
        .find(node => node.isConnected && node.shadowRoot &&
          node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
      if (incumbent && incumbent !== mounted.get(binding.header)?.host) {
        remove(binding.header);
        continue;
      }
      for (const clone of hostsAt(binding,
        `[${OWN}="${sessionKey === 'default' ? 'host' : sessionKey}"]`)) {
        if (!clone.shadowRoot) unmountAnswerTool(clone);
      }
      const old = mounted.get(binding.header);
      if (old?.host.isConnected && old.main === binding.main && old.anchor === binding.anchor
          && (old.answerRoot || old.target) === (binding.answerRoot || binding.target)
          && old.pinKey === replyKey(binding.target || binding.answerRoot)
          && old.directions.join(',') === binding.directions.join(',') &&
          (binding.answerRoot
            ? old.host.parentElement?.matches(ANSWER_TOOL_GROUPS)
              && answerToolScope(binding.header).contains(old.host.parentElement)
            : old.host.nextElementSibling === binding.anchor)) {
        if (binding.answerRoot) mountAnswerTool(binding.header, old.host);
        old.target = binding.target;
        old.kind = binding.kind;
        for (const {button} of old.controls) button.disabled = !binding.target;
        continue;
      }
      remove(binding.header);
      const item = newButton(doc, binding.kind, binding.directions, sessionKey);
      const cleanups = item.controls.map(({button, direction})=>owner.on(button, 'click', event => {
        event.preventDefault();
        event.stopPropagation();
        const active = hostsAt(binding,`[${MODERN_OWN}="reply"]`)
          .find(node => node.isConnected && node.shadowRoot &&
            node.getAttribute(OWN) === (sessionKey === 'default' ? 'host' : sessionKey));
        if (resolveNavigation()?.[(binding.kind === 'conversation' ? 'conversation' : 'region') +
            (direction === 'top' ? 'Top' : 'Bottom')] === false ||
            button.disabled || !replyOnCurrentPath(binding, true) || legacyNavigationPresent(doc) || active !== item.host) {
          schedule();return;
        }
        const current = resolveBindings(doc, win).find(next => next.main === binding.main && next.header === binding.header
          && next.anchor === binding.anchor
          && (next.answerRoot || next.target) === (binding.answerRoot || binding.target)
          && replyKey(next.target || next.answerRoot) === item.pinKey);
        if (current) {
          if (direction === 'bottom') jumpRegionEnd(current, doc, win, refreshDock);
          else jumpRegionTop(current, doc, win);
        } else {
          for (const {button: control} of item.controls) control.disabled = true;
          schedule();
        }
      }));
      if (binding.answerRoot) mountAnswerTool(binding.header, item.host);
      else binding.anchor.before(item.host);
      item.pinKey = replyKey(binding.target || binding.answerRoot);
      mounted.set(binding.header, {...item, ...binding,
        answerKey: binding.answerRoot?.getAttribute(SEARCH_KEY),
        unlisten:()=>cleanups.forEach(off=>off())});
    }
    updatePin();
  }
  function schedule() {
    if (disposed || pending) return;
    pending = true;
    owner.setTimeout(refresh, 120);
  }
  function retirePreviousPath() {
    if (!pinReplies || conversationPath(win) === bindingsPath) return;
    dropPin();
    undoLandingFocus?.();
    for (const [header, item] of mounted) if (!replyOnCurrentPath(item)) remove(header);
  }
  function observeTurnChanges(records) {
    if (!pinReplies) return;
    const parents = new Map(), births = new Map(), nodes = new Map();
    for (const record of records) {
      const {target, addedNodes, removedNodes, attributeName:key, oldValue} = record;
      if (key === 'role' && oldValue === 'main') {
        knownMains.add(target);
        for (const node of target.querySelectorAll(ROUTE_MARKER)) if (!nodes.has(node)) nodes.set(node, null);
      }
      if (TURN_ATTRIBUTES.has(key)) {
        const former = formerTurnMarker(record);
        if (!nodes.get(target) || former === 'user' || former === 'body') nodes.set(target, former);
      }
      for (const node of [...removedNodes, ...addedNodes]) {
        if (node.nodeType !== 1 || node.hasAttribute(OWN)) continue;
        if (!parents.has(node)) {parents.set(node,new Set());births.set(node,record);}
        parents.get(node).add(target);
      }
    }
    for (const root of parents.keys()) {
      if (!nodes.has(root)) nodes.set(root, null);
      for (const node of root.querySelectorAll('*')) if (!nodes.has(node)) nodes.set(node, null);
    }
    if (pathname === '/' && draft) {
      const users = new Set(draft), attrs = new Map(), ids = new Map();
      for (const [node, former] of nodes) if (isDraftUser(node, former)) users.add(node);
      const links = new Map(), unplaced = new Set(), detached = [];
      const parent = n => links.has(n) ? links.get(n) : n.parentElement;
      const native = 'data-message-id';
      let changed = false;
      const attr = (node, key) => attrs.get(node)?.has(key)
        ? attrs.get(node).get(key) : node.getAttribute(key);
      const scope = (node,birth) => {
        let main;
        const ancestors = birth && [];
        for (; node; node = parent(node)) {
          if (node === doc.documentElement) return main;
          if (!main && (knownMains.has(node) || node.matches?.(TRANSCRIPT_MAIN))) main = node;
          ancestors?.push(node);
        }
        if (birth) detached.push([birth,ancestors]);
      };
      for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        const {target, addedNodes, removedNodes, attributeName:key, oldValue} = record;
        const born = [...addedNodes].filter(node => births.get(node) === record && !bornAt.has(node));
        if (born.length) {
          const live = new Set([...users].filter(node => draft.has(node) ||
            attr(node, SEARCH_KEY)?.endsWith(':user') || SPEAKER_ATTRIBUTES.some(key => attr(node,key) === 'user'))
            .map(n=>scope(n)).filter(Boolean));
          for (const node of born) {
            const birth = {path:route}, main = scope(node,birth);
            if (live.size === 1 && live.has(main)) birth.draft = main;
            bornAt.set(node,birth);
          }
          for (const node of unplaced) {
            let n = node;
            while (n && !born.includes(n)) n = parent(n);
            if (n) {bornAt.set(node,bornAt.get(n));unplaced.delete(node);}
          }
        }
        if (key && users.has(target)) {
          if (key === native || key === SEARCH_KEY && !attr(target,native)) {
            if (!ids.has(target)) ids.set(target, {});
            const prior = replyRoutes.get(target);
            const known = ids.get(target)[key] ||= (key === native ? prior?.message : prior?.search) ||
              attr(target,key) || oldValue;
            if (oldValue && known !== oldValue) changed = true;
          }
          if (!attrs.has(target)) attrs.set(target, new Map());
          attrs.get(target).set(key, oldValue);
        }
        for (const node of addedNodes) links.set(node, null);
        for (const node of removedNodes) {
          links.set(node,target);
          if (births.get(node) === record && !bornAt.has(node)) unplaced.add(node);
        }
      }
      for (const [birth,ancestors] of detached.reverse()) {
        let id;
        ancestors.some(node => (id = bornAt.get(node)) && id !== birth);
        if (id?.path === route) birth.draft = id.draft;
      }
      if (changed) draft = null;
    }
    const current = {path:route};
    for (const node of nodes.keys()) if (!bornAt.has(node) && mainOf(node, parents))
      bornAt.set(node,bornAt.get(findScope(node, parents, n => births.has(n))) ?? current);
    for (const [node, former] of nodes)
      if ((former || replyRoutes.has(node) || node.matches(ROUTE_MARKER)) && mainOf(node, parents))
        rememberTurn(node, former, parents);
    if (nodes.size) updateForeign();
  }
  function advanceRoute(event) {
    const path = conversationPath(win);
    if (!pinReplies || path === pathname) return;
    // Flush the departing route.
    if (event?.type === 'currententrychange') observeTurnChanges(observer.takeRecords?.() ?? []);
    carryDraftTurns(event, path);
    draft = new Set();
    pathname = path;
    route = pathKey(path);
    updateForeign();
    retirePreviousPath();
  }
  const observer = owner.observe(doc.documentElement, records => {
    advanceRoute();
    observeTurnChanges(records);
    if (pinReplies && records.some(record =>
      record.target.matches?.(PIN_BLOCKER) ||
      [...record.addedNodes, ...record.removedNodes].some(node =>
        node.matches?.(PIN_BLOCKER) || node.querySelector?.(PIN_BLOCKER)) ||
      ['aria-modal','open'].includes(record.attributeName))) updatePin();
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
  }, {subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: pinReplies,
    attributeFilter: ['hidden', 'aria-hidden', 'aria-controls', 'aria-label', 'id', 'class', 'style',
      ...TURN_ATTRIBUTES, 'data-chatgpt-search-unit-key',
      'data-is-streaming', 'data-talvt-turn-state', 'aria-busy', 'aria-modal', 'inert', 'open',
      'contenteditable', 'role']});
  cleanups.push(() => observer.disconnect());
  const onNavigation = event => {advanceRoute(event);schedule();};
  for (const type of ['popstate', 'hashchange', 'pageshow', 'resize']) cleanups.push(owner.on(win, type, onNavigation));
  if (pinReplies) {
    cleanups.push(owner.on(doc, 'scroll', schedulePin, true));
    if (win.navigation) for (const type of ['currententrychange','navigatesuccess'])
      cleanups.push(owner.on(win.navigation,type,onNavigation));
    for (const type of ['scroll','resize']) if (win.visualViewport)
      cleanups.push(owner.on(win.visualViewport,type,schedulePin));
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    undoLandingFocus?.();
    dropPin();
    if (pinFrame !== null) win.cancelAnimationFrame(pinFrame);
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
  if (pinReplies) for (const main of doc.querySelectorAll(TRANSCRIPT_MAIN)) {
    const birth = {path:route};
    for (const node of main.querySelectorAll('*')) bornAt.set(node,birth);
    rememberTranscript(main);
  }
  refresh();
  return session;
}
