import {BROWSER_MENU_SELECTION_PROTOCOL} from '../framework/sdk/browser-contract.js';
import {cloneVisibleSelection} from '../../examples/shared/markdown/selection.js';
import {domToMarkdown} from '../../examples/shared/markdown/convert.js';

const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const normalize=value=>value.replace(/\s+/g,' ').trim();
// A short-lived, isolated-world snapshot. No content leaves the document until
// the SW verifies an actual installed menu click and targets this documentId.
export function createMenuSelectionSnapshot({window,api,clock=Date,setTimer=setTimeout,clearTimer=clearTimeout}){
  let snapshot=null,timer=null;
  const clear=()=>{snapshot=null;if(timer!==null)clearTimer(timer);timer=null;};
  const capture=()=>{
    clear();
    try{
      const selection=window.getSelection?.(),doc=window.document;
      if(!selection||selection.isCollapsed||selection.rangeCount!==1||!doc)return null;
      const text=selection.toString();
      if(!text.trim()||bytes(text)>16384)return null;
      const range=selection.getRangeAt(0);
      if((range.commonAncestorContainer.ownerDocument||range.commonAncestorContainer)!==doc)return null;
      const fragment=cloneVisibleSelection(range,doc,window);
      // getRandomValues also works on ordinary HTTP documents.
      const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
      snapshot={id,text,fragment,url:window.location.href,at:clock.now()};
      timer=setTimer(clear,60000);
      return id;
    }catch{return null;}
  };
  const receive=(message,sender)=>{
    if(message?.protocol!==BROWSER_MENU_SELECTION_PROTOCOL||
      sender?.id!==api.runtime?.id||sender.tab||sender.url!==api.runtime.getURL?.('sw.js'))return null;
    const saved=snapshot;
    if(!saved||message.snapshotId!==saved.id)return null;
    clear();
    if(message.url!==saved.url||window.location.href!==saved.url||
      clock.now()-saved.at<0||clock.now()-saved.at>=60000||
      typeof message.selection!=='string'||normalize(message.selection)!==normalize(saved.text))return null;
    try{
      const markdown=domToMarkdown(saved.fragment,saved.url);
      if(bytes(markdown)>16384)return null; // same existing selection budget
      return {snapshotId:saved.id,markdown};
    }catch{return null;}
  };
  return {capture,receive,clear,get timerCount(){return timer===null?0:1;}};
}
