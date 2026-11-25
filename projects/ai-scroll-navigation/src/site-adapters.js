// Fixed, origin-scoped AI conversation adapters. Never infer a site's DOM from another site.
import {deepSeekMessage,findConversationMain,findConversationNavigation,findRegionBindings,isLong} from './conversation.js';

const CHAT_TURNS='[data-testid^="conversation-turn-"],[data-content-search-unit-key]';
const DEEPSEEK_TURNS='.ds-message';
const GEMINI_TURNS='user-query,model-response';
const GEMINI_COPY='button[aria-label="Copy"],button[aria-label="Copy response"],button[aria-label="复制"],button[aria-label="复制回复"],copy-button button';
const GEMINI_BUSY='[aria-busy="true"],[data-is-streaming="true"],.result-streaming';

export function siteForUrl(href) {
  try {
    const url=new URL(href);
    if (url.username||url.password) return null;
    if (url.origin==='https://chatgpt.com') return 'chatgpt';
    if (url.origin==='https://chat.deepseek.com' &&
        /^\/a\/chat\/s\/[a-f0-9-]+\/?$/i.test(url.pathname)) return 'deepseek';
    if (url.origin==='https://gemini.google.com' &&
        /^\/app(?:\/[a-z0-9_-]+)?\/?$/i.test(url.pathname)) return 'gemini';
  } catch {}
  return null;
}

function visible(node,win) {
  if (!node?.isConnected ||
      node.closest?.('[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]'))
    return false;
  const rect=node.getBoundingClientRect?.();
  const style=rect&&win.getComputedStyle(node);
  return Boolean(rect&&rect.width>1&&rect.height>1&&style?.display!=='none'&&
    !['hidden','collapse'].includes(style?.visibility));
}
function sole(doc,selector,win) {
  const matches=[...doc.querySelectorAll(selector)].filter(node=>visible(node,win));
  return matches.length===1?matches[0]:null;
}
function findDeepSeekMain(doc,win) {
  // DeepSeek's app wrapper can have zero height; its native transcript scrolls.
  const roots=doc.querySelectorAll('#root');
  if(roots.length!==1)return null;
  const lists=[...roots[0].querySelectorAll('.ds-virtual-list.ds-virtual-list--printable')]
    .filter(list=>visible(list,win)&&
      [...list.querySelectorAll(DEEPSEEK_TURNS)].some(message=>visible(message,win)&&deepSeekMessage(message)));
  return lists.length===1?lists[0]:null;
}
export function findSiteConversation(doc,win) {
  const site=siteForUrl(win.location?.href);
  if (!site) return null;
  const main=site==='chatgpt'?findConversationMain(doc,win):
    site==='deepseek'?findDeepSeekMain(doc,win):sole(doc,'chat-window',win);
  const selector=site==='chatgpt'?CHAT_TURNS:
    site==='deepseek'?DEEPSEEK_TURNS:GEMINI_TURNS;
  const navigation=findConversationNavigation(main,selector,doc,win);
  return navigation?{...navigation,site,selector}:null;
}
export function findDeepSeekBindings(doc,win,main) {
  if (siteForUrl(win.location?.href)!=='deepseek'||!visible(main,win)) return [];
  const bindings=[];
  for (const message of main.querySelectorAll(DEEPSEEK_TURNS)) {
    const parsed=deepSeekMessage(message);
    if(parsed?.role!=='assistant')continue;
    const target=parsed.body,turn=message.parentElement;
    // The native action row must be a sibling of exactly this message.
    if (!turn||turn.querySelectorAll(DEEPSEEK_TURNS).length!==1||
        !visible(target,win)||!isLong(target,doc,win)) continue;
    const actions=[...turn.querySelectorAll('.ds-button[role="button"]')]
      .filter(button=>!message.contains(button));
    if (actions.length<2||actions.length>8) continue;
    const header=actions[0].parentElement;
    if (!header||actions.some(button=>button.parentElement!==header)||
        !visible(header,win)||header.querySelector('.ds-message,textarea,[contenteditable="true"]'))
      continue;
    const anchor=actions.at(-1);
    if (!visible(anchor,win)) continue;
    bindings.push({header,anchor,target,main,kind:'reply'});
  }
  return bindings;
}
export function findSiteBindings(doc,win) {
  const site=siteForUrl(win.location?.href);
  if (site==='chatgpt') return findRegionBindings(doc,win);
  if (site==='deepseek') return findDeepSeekBindings(doc,win,findDeepSeekMain(doc,win));
  if (site==='gemini') return findGeminiBindings(doc,win);
  return [];
}

function findGeminiBindings(doc,win) {
  const navigation=findSiteConversation(doc,win);
  if (!navigation) return [];
  const {main,turns}=navigation,bindings=[];
  for (const reply of turns) {
    if (!reply.matches('model-response')||reply.matches(GEMINI_BUSY)||
        reply.querySelector(GEMINI_BUSY+','+GEMINI_TURNS)) continue;
    const bodies=[...reply.querySelectorAll('message-content .markdown')].filter(node=>visible(node,win));
    const footers=[...reply.querySelectorAll('message-actions')].filter(node=>visible(node,win));
    if (bodies.length!==1||footers.length!==1) continue;
    const [target]=bodies,[footer]=footers;
    if (target.contains(footer)||footer.contains(target)||!isLong(target,doc,win)) continue;
    const copies=[...footer.querySelectorAll(GEMINI_COPY)].filter(node=>visible(node,win));
    if (copies.length!==1||copies[0].disabled||copies[0].getAttribute('aria-disabled')==='true') continue;
    // Keep the original copy control and its tooltip together in the action row.
    const header=copies[0].closest('.buttons-container-v2')||footer;
    if (!footer.contains(header)) continue;
    let anchor=copies[0];
    while (anchor.parentElement!==header) anchor=anchor.parentElement;
    bindings.push({header,anchor,target,main,kind:'reply'});
  }
  return bindings;
}
