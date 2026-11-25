const LIST='#root .ds-virtual-list.ds-virtual-list--printable';
const MESSAGE='.ds-message';
const BODY='.ds-assistant-message-main-content';
const ACTION='.ds-button.ds-button--icon[role="button"]';
const HIDDEN='[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]';
const BUSY='[aria-busy="true"],[data-is-streaming="true"]';
const concealed=new WeakSet();
const visible=node=>node.isConnected&&!node.closest(HIDDEN);

export function deepseekConversation(location){
  return location?.origin==='https://chat.deepseek.com'&&
    /^\/a\/chat\/s\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/i.test(location.pathname);
}

export function deepseekEntry(location){
  return deepseekConversation(location)||
    (location?.origin==='https://chat.deepseek.com'&&location.pathname==='/');
}

function conversation(doc){
  if(!deepseekConversation(doc.defaultView?.location))return null;
  const lists=[...doc.querySelectorAll(LIST)].filter(visible);
  return lists.length===1?lists[0]:null;
}

export function answerRootOf(node){
  return (node?.nodeType===1?node:node?.parentElement)?.closest(MESSAGE)||null;
}

export function discoverAnswers(doc,{max=120}={}){
  const list=conversation(doc);
  return list?[...list.querySelectorAll(MESSAGE)].filter(node=>
    !node.matches('.d29f3d7d')&&[...node.children].some(child=>child.matches(BODY))).slice(0,max):[];
}

function partsOf(root){
  if(!root?.matches(MESSAGE)||!visible(root)||root.matches('.d29f3d7d'))return null;
  const turn=root.parentElement,list=conversation(root.ownerDocument);
  if(!list?.contains(turn)||turn.querySelectorAll(MESSAGE).length!==1)return null;
  const bodies=[...root.children].filter(node=>node.matches(BODY));
  if(bodies.length!==1||root.querySelector(':scope > .fbb737a4'))return null;
  const [content]=bodies;
  if((!visible(content)&&!concealed.has(content))||!content.textContent.trim())return null;

  // Native icon actions share one row in a sibling footer of this message.
  // The footer can include a separate group of text actions (e.g. Continue).
  const actions=[...turn.querySelectorAll(ACTION)].filter(node=>!root.contains(node)&&visible(node));
  const rows=[...new Set(actions.map(node=>node.parentElement))].filter(row=>
    actions.filter(node=>node.parentElement===row).length>=2);
  if(rows.length!==1)return null;
  const [bar]=rows;
  const copies=actions.filter(node=>node.parentElement===bar&&
    [...node.querySelectorAll('svg path')].some(path=>path.ownerSVGElement?.getAttribute('viewBox')==='0 0 16 16'&&
      path.getAttribute('d')?.startsWith('M6.14929 4.02032')));
  if(copies.length!==1)return null;
  return {ok:true,root,turn,content,bar,copy:copies[0],after:copies[0]};
}

export function inspectAnswer(root){
  return partsOf(root)??{ok:false,reason:'unconfirmed-deepseek-answer'};
}

export function isStreaming(root){
  const parts=partsOf(root);
  return !parts||parts.turn.matches(BUSY)||root.matches(BUSY)||Boolean(root.querySelector(BUSY))||
    parts.copy.matches('.ds-button--disabled,[aria-disabled="true"]');
}

export function setConcealed(node,value){
  if(value)concealed.add(node);else concealed.delete(node);
}

export const completedOnly=true;
export const observedAttributes=['class','hidden','aria-hidden','aria-disabled','inert'];
