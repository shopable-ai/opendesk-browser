// DOM-only ChatGPT adapter. Selector candidates MUST be verified against a
// logged-in current ChatGPT build before declaring native acceptance.
const ANSWER='[data-message-author-role="assistant"]';
const CONTENT=['.markdown','.prose','[data-testid="message-content"]'];
const COPY=['button[data-testid="copy-turn-action-button"]',
  'button[data-testid="copy-button"]',
  'button[aria-label="Copy"]','button[aria-label="Copy response"]',
  'button[aria-label="复制"]','button[aria-label="复制回复"]'];
const TURN='[data-testid^="conversation-turn-"], [data-testid="conversation-turn"], article';
const own=element=>element?.closest?.('[data-opendesk-chatgpt-mindmap]');

export function answerRootOf(node) {
  const element=node?.nodeType===1?node:node?.parentElement;
  return element?.closest?.(ANSWER)||null;
}

function cleanCandidates(root,selector){
  return [...root.querySelectorAll(selector)].filter(el=>
    el.closest(ANSWER)===root&&!own(el)&&el.isConnected);
}

function turnFor(root) {
  const candidate=root.closest(TURN)||root;
  // A turn containing another answer cannot securely assign a footer to one.
  const count=candidate.querySelectorAll(ANSWER).length+(candidate.matches(ANSWER)?1:0);
  if(count!==1)return null;
  return candidate;
}

function actionBar(turn,content){
  const copyButtons=COPY.flatMap(selector=>[...turn.querySelectorAll(selector)])
    .filter(node=>!own(node)&&!content.contains(node));
  const unique=[...new Set(copyButtons)];
  if(unique.length!==1)return null;
  const copy=unique[0];
  // Prefer a semantic action group; otherwise find the tightest shallow
  // container with peer buttons. Never select the entire conversation turn.
  let bar=copy.closest('[data-testid="message-actions"],[role="toolbar"]');
  if(!bar){
    bar=copy.parentElement;
    for(let p=copy.parentElement,n=0;p&&p!==turn&&n<4;p=p.parentElement,n++){
      if(content.contains(p))break;
      const buttons=[...p.querySelectorAll('button')].filter(node=>!own(node));
      if(buttons.length>=2&&buttons.length<=10){bar=p;break;}
    }
  }
  if(!bar||content.contains(bar)||own(bar)||!turn.contains(bar))return null;
  return bar;
}

export function discoverAnswers(doc,{max=120}={}) {
  return [...doc.querySelectorAll(ANSWER)].slice(0,max);
}

export function inspectAnswer(root) {
  if(!root?.isConnected||!root.matches(ANSWER))return {ok:false,reason:'detached'};
  if(root.closest('[hidden],[aria-hidden="true"],[inert]'))return {ok:false,reason:'hidden-answer'};
  const turn=turnFor(root);
  if(!turn)return {ok:false,reason:'ambiguous-turn'};
  const contentHits=CONTENT.flatMap(selector=>cleanCandidates(root,selector));
  const unique=[...new Set(contentHits)];
  // Class overlap .markdown.prose refers to the *same* element. Nested
  // markdown regions or multiple versions need explicit DOM verification.
  const top=unique.filter(el=>!unique.some(other=>other!==el&&other.contains(el)));
  if(top.length!==1)return {ok:false,reason:top.length?'ambiguous-content':'missing-content'};
  const content=top[0];
  const bar=actionBar(turn,content);
  if(!bar)return {ok:false,reason:'missing-or-ambiguous-actions'};
  if(!bar.parentElement||content.contains(bar.parentElement))return {ok:false,reason:'unsafe-actions'};
  return {ok:true,root,turn,content,bar};
}

export function isStreaming(root){
  return Boolean(root.matches('[data-is-streaming="true"],[aria-busy="true"],.result-streaming')||
    root.querySelector('[data-is-streaming="true"],[aria-busy="true"],.result-streaming'));
}
