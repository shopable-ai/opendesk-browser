// A Gemini turn has one assistant component. Only read the answer body and
// attach to the copy/action group inside that same component.
const ANSWER='model-response';
const CONTENT='message-content .markdown';
const ACTIONS='message-actions';
export const GEMINI_COPY='copy-button button,button.copy-button,button[aria-label="Copy"],button[aria-label="Copy response"],button[aria-label="复制"],button[aria-label="复制回复"]';
const ACTIVE='[aria-busy="true"],[data-is-streaming="true"],.result-streaming';
const STOP='button.stop-button,button[aria-label="Stop response"],button[aria-label="Stop generating"],button[aria-label="停止生成"],button[aria-label="停止回复"]';
const HIDDEN='[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]';
const blocked=node=>node.closest(HIDDEN);
const concealed=new WeakSet();

// message-actions is a block footer on Gemini. Its copy control identifies the
// actual flex row, including when the footer comes from a saved selector.
export function geminiActionPlacement(footer,copy){
  const row=copy.closest('.buttons-container-v2');
  if(!row||!footer.contains(row)||blocked(row))return {bar:footer};
  // Gemini's trailing spacer grows to fill the row. Stay with the actions.
  const before=[...row.children].find(child=>child.matches('.spacer'));
  return {bar:row,before};
}

export function geminiConversation(location){
  return location?.origin==='https://gemini.google.com'&&
    /^\/app(?:\/[a-z0-9_-]+)?\/?$/i.test(location.pathname);
}

function conversation(doc){
  if(!geminiConversation(doc.defaultView?.location))return null;
  const windows=[...doc.querySelectorAll('chat-window')].filter(node=>!blocked(node));
  return windows.length===1?windows[0]:null;
}

function bodyAndActions(root){
  if(!root?.isConnected||!root.matches(ANSWER)||blocked(root)||
    root.closest('user-query')||root.parentElement?.closest(ANSWER)||root.querySelector(ANSWER))return null;
  const win=conversation(root.ownerDocument);
  if(!win||root.closest('chat-window')!==win)return null;
  const contents=[...root.querySelectorAll(CONTENT)].filter(node=>!blocked(node)||
    (blocked(node)===node&&concealed.has(node)&&!blocked(node.parentElement)));
  const groups=[...root.querySelectorAll(ACTIONS)].filter(node=>!blocked(node));
  if(contents.length!==1||groups.length!==1)return null;
  const [content]=contents,[bar]=groups;
  if(content.contains(bar)||bar.contains(content)||!content.textContent.trim())return null;
  const copies=[...bar.querySelectorAll(GEMINI_COPY)].filter(node=>!blocked(node));
  if(copies.length!==1)return null;
  return {ok:true,root,turn:root,content,...geminiActionPlacement(bar,copies[0]),copy:copies[0]};
}

export function answerRootOf(node){
  return (node?.nodeType===1?node:node?.parentElement)?.closest(ANSWER)||null;
}

export function discoverAnswers(doc,{max=120}={}){
  const win=conversation(doc);
  return win?[...win.querySelectorAll(ANSWER)].slice(0,max):[];
}

export function inspectAnswer(root){
  return bodyAndActions(root)??{ok:false,reason:'unconfirmed-gemini-answer'};
}

export function isStreaming(root){
  const parts=bodyAndActions(root);
  if(!parts||parts.copy.disabled||parts.copy.getAttribute('aria-disabled')==='true'||
    root.matches(ACTIVE)||root.querySelector(ACTIVE))return true;
  const win=root.closest('chat-window');
  const last=[...win.querySelectorAll(ANSWER)].filter(node=>!blocked(node)).at(-1);
  return root===last&&[...win.querySelectorAll(STOP)].some(node=>!blocked(node));
}

// The shared viewer temporarily hides this exact body while the map is open.
// It must not reclassify that hide as a site-hidden or replaced answer.
export function setConcealed(node,value){
  if(value)concealed.add(node);else concealed.delete(node);
}
export const observedAttributes=['hidden','aria-hidden','aria-disabled','disabled','inert'];
