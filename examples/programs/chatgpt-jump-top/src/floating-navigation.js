// One standalone conversation dock per installed Page Program.
// The five navigation behaviors share two physical buttons (one top, one bottom).
import {findSiteConversation} from './site-adapters.js';
import {jumpConversationEdge,legacyNavigationPresent} from './conversation.js';

const OWN='data-opendesk-ai-scroll-navigation';
const sessions=new WeakMap();
const LEGACY='[data-opendesk-prompts-floating]';
const GAP=6;
const SIZE=42;
const INSET=20;
const TOP_LABEL=/^(?:scroll to top|back to top|return to top|回到顶部|返回顶部|回到对话顶部|回到对话开头)$/i;

function nativeTopVisible(doc,win) {
  return [...doc.querySelectorAll('button[aria-label],button[title]')].some(button=>{
    if (button.closest?.(`[${OWN}],${LEGACY}`)) return false;
    if (!TOP_LABEL.test((button.getAttribute('aria-label')||
      button.getAttribute('title')||'').trim())) return false;
    const rect=button.getBoundingClientRect(),style=win.getComputedStyle(button);
    return rect.width>8&&rect.height>8&&rect.bottom>0&&rect.top<win.innerHeight&&
      style.display!=='none'&&style.visibility!=='hidden';
  });
}
const between=(value,min,max)=>Math.max(min,Math.min(max,value));

export function installFloatingNavigation({doc,win,owner}) {
  sessions.get(doc)?.dispose();
  let disposed=false,pending=false,observedRoot=null,observer=null,host=null,buttons=null;
  let binding=null,lastHref=win.location.href;
  const context=()=>findSiteConversation(doc,win);
  const isCurrent=()=>!disposed&&binding&&host?.isConnected&&
    binding.root===doc.documentElement&&binding.href===win.location.href;
  function click(direction,event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.isTrusted!==true||!isCurrent()) return;
    // A legacy Page may mount after our last refresh. Do not race it.
    const active=[...doc.querySelectorAll(`[${OWN}="dock"]`)]
      .find(node=>node.isConnected&&node.shadowRoot);
    if (doc.querySelector(LEGACY)||legacyNavigationPresent(doc)||active!==host) {
      schedule();return;
    }
    // Invalidate stale buttons before navigation/React reconciliation finishes.
    const next=context();
    if (!next||next.main!==binding.main||next.scroller!==binding.scroller) return;
    jumpConversationEdge(next.main,next.selector,direction,doc,win);
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
        stroke-linecap:round;stroke-linejoin:round}`;
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
    buttons={
      stack,
      top:make('top','回到对话顶部','M17 11l-5-5-5 5m10 7-5-5-5 5'),
      bottom:make('bottom','跳到对话底部','M7 6l5 5 5-5M7 13l5 5 5-5')
    };
    shadow.append(style,stack);
  }
  function refresh() {
    pending=false;
    if (disposed) return;
    const next=context();
    // Existing old trusted-page navigation wins during extension upgrade.
    // Once that owner is removed, its DOM mutation permits standalone mounting.
    if (!next||doc.querySelector(LEGACY)||legacyNavigationPresent(doc)) {
      host?.remove();binding=null;return;
    }
    // One visible dock across independently installed script instances, even
    // when the modules do not share their in-memory WeakMap. Keep the first
    // connected live ShadowRoot, never retire a peer's host.
    const existing=[...doc.querySelectorAll(`[${OWN}="dock"]`)]
      .find(node=>node.isConnected&&node.shadowRoot);
    if (existing&&existing!==host) {
      host?.remove();binding=null;return;
    }
    prepare();
    const top=!nativeTopVisible(doc,win);
    const options=top?[buttons.top,buttons.bottom]:[buttons.bottom];
    if (options.length!==buttons.stack.children.length||
        options.some((button,index)=>buttons.stack.children[index]!==button))
      buttons.stack.replaceChildren(...options);
    const scroller=next.scroller;
    const max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
    const floating=scroller.scrollTop>Math.max(320,Math.min(win.innerHeight,scroller.clientHeight)*.65);
    // A visible conversationTop and scroll-triggered floatingTop reuse the
    // same physical top control; no second arrow is created.
    buttons.top.dataset.scrollNavKey=floating?'floatingTop':'conversationTop';
    buttons.bottom.dataset.scrollNavKey='conversationBottom';
    buttons.top.disabled=scroller.scrollTop<=2;
    buttons.bottom.disabled=scroller.scrollTop>=max-2;
    const rect=next.main.getBoundingClientRect();
    const first=next.first.getBoundingClientRect();
    const last=next.last.getBoundingClientRect();
    const compact=win.innerWidth<600;
    buttons.stack.classList.toggle('compact',compact);
    const count=options.length,width=compact?count*SIZE+(count-1)*GAP:SIZE;
    const height=compact?SIZE:count*SIZE+(count-1)*GAP;
    const left=between(Math.max(rect.left,Math.min(first.left,last.left))+12,
      8,Math.max(8,win.innerWidth-width-8));
    const topPos=Math.round(Math.min(win.innerHeight,rect.bottom)-INSET-height);
    if (!Number.isFinite(topPos)||topPos<Math.max(8,rect.top+8)||left+width>win.innerWidth-8) {
      host.style.visibility='hidden';binding=null;return;
    }
    const blocked=[...doc.querySelectorAll('button,[role="button"],input,textarea,[contenteditable="true"]')]
      .some(node=>{
        if (node.hidden||node.closest?.(`[${OWN}],${LEGACY}`)) return false;
        const r=node.getBoundingClientRect(),style=win.getComputedStyle(node);
        return style.display!=='none'&&style.visibility!=='hidden'&&
          r.width>0&&r.height>0&&r.left<left+width&&r.right>left&&
          r.top<topPos+height&&r.bottom>topPos;
      });
    if (blocked) {host.style.visibility='hidden';binding=null;return;}
    host.classList.toggle('dark',doc.documentElement?.classList?.contains('dark')||
      doc.documentElement?.getAttribute('data-theme')==='dark');
    if (!host.isConnected) doc.documentElement?.append(host);
    host.style.left=Math.round(left)+'px';
    host.style.top=topPos+'px';
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
    observer=owner.observe(observedRoot,records=>{
      if (records.every(record=>{
        const node=record.target;
        if (node===host||host?.contains(node)) return true;
        if (record.type==='childList'&&[...record.addedNodes,...record.removedNodes].length)
          return [...record.addedNodes,...record.removedNodes].every(n=>n===host||host?.contains(n));
        return false;
      })) return;
      schedule();
    },{subtree:true,childList:true,attributes:true,
      attributeFilter:['hidden','aria-hidden','class','style']});
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
    disposed=true;observer?.disconnect();observer=null;
    host?.remove();binding=null;
    if (sessions.get(doc)?.dispose===dispose) sessions.delete(doc);
  }
  owner.onDispose(dispose);
  for (const type of ['popstate','hashchange','pageshow','resize','scroll'])
    owner.on(win,type,schedule,type==='scroll');
  win.navigation&&owner.on(win.navigation,'navigatesuccess',schedule);
  const session={dispose,refresh};
  sessions.set(doc,session);
  observeRoot();refresh();owner.setTimeout(poll,1100);
  return session;
}
