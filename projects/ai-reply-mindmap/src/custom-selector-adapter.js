import './selector-model.js';
import {GEMINI_COPY,geminiActionPlacement} from './gemini-adapter.js';

const model = globalThis.OpenDeskMindmapSelectors;
const HIDDEN = '[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]';
const OWN = '[data-opendesk-chatgpt-mindmap],[data-ai-answer-tools]';
const CHAT_AUTHOR = '[data-message-author-role="assistant"],[data-message-role="assistant"],[data-content-search-unit-key$=":assistant"]';
const CHAT_TURN = '[data-testid^="conversation-turn"],article,li[data-message-role="assistant"],[data-talvt-turn-state]';
const USER = 'user-query,[data-message-author-role="user"],[data-message-role="user"],[data-conversation-role="user"],[data-content-search-unit-key$=":user"]';
const GEMINI_AUTHOR = 'model-response';
const GEMINI_STOP = 'button.stop-button,button[aria-label="Stop response"],button[aria-label="Stop generating"],button[aria-label="停止生成"],button[aria-label="停止回复"]';
const BUSY = '[aria-busy="true"],[data-is-streaming="true"],.result-streaming';
const visible = node => node?.isConnected && !node.closest(HIDDEN) && !node.closest(OWN) && !node.closest(USER);
const enabled = node => visible(node) && !node.matches(':disabled,[aria-disabled="true"]');
const rejected = {ok:false,reason:'unconfirmed-custom-answer'};

export function createCustomSelectorAdapter(origin, input, builtin) {
  const rule = model.rule(input);
  const gemini = origin === 'https://gemini.google.com';
  const author = gemini ? GEMINI_AUTHOR : CHAT_AUTHOR;
  const concealed = new WeakSet();
  const observedAttributes = [...new Set(['class','hidden','inert','aria-hidden','role','aria-modal','data-is-streaming',
    'data-message-author-role','data-message-role','data-conversation-role','data-testid','aria-label',
    ...(builtin.observedAttributes??[]),...Object.values(rule).flatMap(selector =>
      [...selector.matchAll(/\[([\w-]+)/g)].map(match=>match[1]))])];
  const onSite = doc => model.siteFor(doc.defaultView?.location.href) === origin;
  const trustedRoot = element => element?.matches(author) && builtin.answerRootOf(element) === element &&
    (gemini ? Boolean(element.closest('chat-window')) &&
      [...element.ownerDocument.querySelectorAll('chat-window')].filter(visible).length===1 :
      !element.matches('[data-content-search-unit-key$=":assistant"]') ||
      [...element.children].filter(node=>node.matches('[data-conversation-role="assistant"]')).length===1);
  function inspectAnswer(root) {
    if (!visible(root) || !onSite(root.ownerDocument) || !root.matches(rule.root) || !trustedRoot(root) ||
        root.parentElement?.closest(author) || root.querySelector(author)) return rejected;
    const turn = gemini ? root : root.closest(CHAT_TURN) || root;
    if (turn!==root && turn.querySelectorAll(author).length!==1) return rejected;
    const bodies = [...root.querySelectorAll(rule.body)].filter(node =>
      (visible(node) || concealed.has(node) && visible(node.parentElement) && !node.matches(USER+','+OWN)) && node.closest(author)===root);
    const bars = [...turn.querySelectorAll(rule.actions)].filter(visible);
    if (bodies.length!==1 || bars.length!==1) return rejected;
    const [content]=bodies,[bar]=bars;
    // A selector outside the assistant root can only target a known assistant
    // footer. A sibling user toolbar has no such association.
    if (!root.contains(bar) && !(bar===builtin.inspectAnswer(root).bar ||
        root.matches('[data-content-search-unit-key$=":assistant"]') &&
        bar.parentElement===turn && bar.matches('.turn-action-controls'))) return rejected;
    const native = [...bar.querySelectorAll(gemini ? GEMINI_COPY : 'button,[role="button"]')].filter(visible);
    if (!content.textContent.trim() || !bar.parentElement || bar===content || bar.contains(content) ||
        content.contains(bar) || content.querySelector(USER+',textarea,[contenteditable="true"]') ||
        bar.closest('[contenteditable="true"]') || bar.querySelector('textarea,input,[contenteditable="true"],'+author+','+USER) ||
        (gemini ? native.length!==1 : !native.length)) return rejected;
    return {ok:true,root,turn,content,...(gemini?geminiActionPlacement(bar,native[0]):{bar}),controls:native};
  }
  function discoverAnswers(doc,{max=120}={}) {
    return onSite(doc) ? [...doc.querySelectorAll(rule.root)].filter(node=>visible(node)&&trustedRoot(node)).slice(0,max) : [];
  }
  function isStreaming(root) {
    const parts = inspectAnswer(root);
    if (!parts.ok || !parts.controls.some(enabled)) return true;
    if (!gemini) return builtin.isStreaming(root);
    const chat = root.closest('chat-window');
    return root.matches(BUSY) || Boolean(root.querySelector(BUSY)) ||
      root===[...chat.querySelectorAll(GEMINI_AUTHOR)].filter(visible).at(-1) &&
      [...chat.querySelectorAll(GEMINI_STOP)].some(visible);
  }
  return Object.freeze({discoverAnswers,inspectAnswer,isStreaming,observedAttributes,
    answerRootOf:node=>builtin.answerRootOf(node),
    setConcealed(node,value){if(value)concealed.add(node);else concealed.delete(node);}
  });
}

export function inspectSelectors(doc,adapter,rule) {
  // Validate syntax in the document even if it does not have replies yet.
  try { for (const selector of Object.values(rule??{})) doc.documentElement.querySelector(selector); }
  catch { return {status:'invalid-css',found:0,ready:0}; }
  const roots = adapter.discoverAnswers(doc);
  const ready = roots.filter(root => adapter.inspectAnswer(root).ok && !adapter.isStreaming(root)).length;
  return {status:ready ? 'ready' : roots.length ? 'not-ready' : 'no-replies',found:roots.length,ready};
}
