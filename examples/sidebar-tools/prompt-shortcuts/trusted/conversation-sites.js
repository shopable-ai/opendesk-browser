// Fixed site structure only. Permissions and lifecycle remain in page.js.
// Reuse the sole scroll/occlusion/long-content implementation.
import {isLong} from '../../../programs/chatgpt-jump-top/src/conversation.js';

export function deepSeekConversation(url){
  try{
    const value=new URL(url);
    return value.origin==='https://chat.deepseek.com'&&!value.username&&!value.password&&
      /^\/a\/chat\/s\/[a-f0-9-]+\/?$/i.test(value.pathname);
  }catch{return false;}
}
function visible(node,win){
  if(!node?.isConnected||node.closest('[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]'))return false;
  const box=node.getBoundingClientRect(),style=win.getComputedStyle(node);
  return box.width>1&&box.height>1&&style.display!=='none'&&
    !['hidden','collapse'].includes(style.visibility);
}
export function findDeepSeekBindings(doc,win,main){
  if(!deepSeekConversation(win.location.href)||!visible(main,win))return [];
  const bindings=[];
  for(const target of main.querySelectorAll('.ds-message')){
    const turn=target.parentElement;
    // A native action row must belong to exactly this message, as a sibling.
    // Never search upward into a second turn or bind code-block copy controls.
    if(!turn||turn.querySelectorAll('.ds-message').length!==1||!visible(target,win)||
      !isLong(target,doc,win))continue;
    const actions=[...turn.querySelectorAll('.ds-button[role="button"]')]
      .filter(button=>!target.contains(button));
    if(actions.length<2||actions.length>8)continue;
    const header=actions[0].parentElement;
    if(!header||actions.some(button=>button.parentElement!==header)||!visible(header,win)||
      header.querySelector('.ds-message,textarea,[contenteditable="true"]'))continue;
    const anchor=actions.at(-1);
    if(!visible(anchor,win))continue;
    bindings.push({header,anchor,target,main,kind:'region'});
  }
  return bindings;
}
