// Fixed, origin-scoped AI conversation adapters. Never infer a site's DOM from another site.
import {findConversationMain,findConversationNavigation,findRegionBindings,isLong} from './conversation.js';

const CHAT_TURNS='[data-testid^="conversation-turn-"],[data-content-search-unit-key]';
const DEEPSEEK_TURNS='.ds-message';
const GEMINI_TURNS='user-query,model-response';

export function siteForUrl(href) {
  try {
    const url=new URL(href);
    if (url.username||url.password) return null;
    if (url.origin==='https://chatgpt.com') return 'chatgpt';
    if (url.origin==='https://chat.deepseek.com' &&
        /^\/a\/chat\/s\/[a-f0-9-]+\/?$/i.test(url.pathname)) return 'deepseek';
    if (url.origin==='https://gemini.google.com' &&
        /^\/app(?:\/|$)/.test(url.pathname)) return 'gemini';
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
export function findSiteConversation(doc,win) {
  const site=siteForUrl(win.location?.href);
  if (!site) return null;
  const main=site==='chatgpt'?findConversationMain(doc,win):
    site==='deepseek'?sole(doc,'#root',win):sole(doc,'chat-window',win);
  const selector=site==='chatgpt'?CHAT_TURNS:
    site==='deepseek'?DEEPSEEK_TURNS:GEMINI_TURNS;
  const navigation=findConversationNavigation(main,selector,doc,win);
  return navigation?{...navigation,site,selector}:null;
}
export function findDeepSeekBindings(doc,win,main) {
  if (siteForUrl(win.location?.href)!=='deepseek'||!visible(main,win)) return [];
  const bindings=[];
  for (const target of main.querySelectorAll(DEEPSEEK_TURNS)) {
    const turn=target.parentElement;
    // The native action row must be a sibling of exactly this message.
    if (!turn||turn.querySelectorAll(DEEPSEEK_TURNS).length!==1||
        !visible(target,win)||!isLong(target,doc,win)) continue;
    const actions=[...turn.querySelectorAll('.ds-button[role="button"]')]
      .filter(button=>!target.contains(button));
    if (actions.length<2||actions.length>8) continue;
    const header=actions[0].parentElement;
    if (!header||actions.some(button=>button.parentElement!==header)||
        !visible(header,win)||header.querySelector('.ds-message,textarea,[contenteditable="true"]'))
      continue;
    const anchor=actions.at(-1);
    if (!visible(anchor,win)) continue;
    bindings.push({header,anchor,target,main,kind:'region'});
  }
  return bindings;
}
export function findSiteBindings(doc,win) {
  const site=siteForUrl(win.location?.href);
  if (site==='chatgpt') return findRegionBindings(doc,win);
  if (site==='deepseek') return findDeepSeekBindings(doc,win,sole(doc,'#root',win));
  // Gemini conversation navigation is supported, but a verified per-reply
  // action toolbar relation is not. Never guess a reply binding.
  return [];
}
