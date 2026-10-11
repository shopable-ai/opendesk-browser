import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolLifecycleChanged} from '../ui/sidebar-tools/lifecycle.js';
import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {isReadingTocToolSender} from '../reading-toc/page.js';
import {CLIP_SITE_STORE,CLIP_PROTOCOL,CLIP_OPERATIONS,clipGrantAllowed} from './policy.js';
import {chooseArticle,domToMarkdown,safeClipSource} from './convert.js';

export function initPageClip({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!api?.runtime?.onMessage||!api?.storage?.local||!doc||!win||win.top!==win)return null;
  let disposed=false;const policyEpochs=new Map();
  const handle=async(message,sender)=>{
    if(!isReadingTocToolSender(api,sender,message?.toolId)||message?.protocol!==CLIP_PROTOCOL||
      !CLIP_OPERATIONS.includes(message.operation)||typeof message.toolId!=='string'||
      message.expectedUrl!==win.location.href)
      return {ok:false,error:'剪藏来源或文档已变化'};
    if(!policyEpochs.has(message.toolId))policyEpochs.set(message.toolId,0);
    const currentUrl=win.location.href,epoch=policyEpochs.get(message.toolId);
    const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,CLIP_SITE_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    if(disposed||epoch!==policyEpochs.get(message.toolId)||currentUrl!==win.location.href||
      !clipGrantAllowed(saved[SIDEBAR_TOOL_STORE],saved[CLIP_SITE_STORE],message.toolId,currentUrl,saved[SIDEBAR_TOOL_ENABLE_STORE]))
      return {ok:false,error:'剪藏工具或网站未授权'};
    if((message.installEpoch??null)!==(saved[TOOL_REVOCATION_EPOCHS_STORE]?.[message.toolId]??null))
      return {ok:false,error:'剪藏请求已撤销'};
    const title=String(doc.title||win.location.hostname).slice(0,500);
    const site=String(win.location.hostname).slice(0,250);
    const canonical=safeClipSource(currentUrl);
    if(!canonical)return {ok:false,error:'当前网页地址不支持剪藏'};
    let markdown;
    try{
      if(message.operation==='clip.link')
        markdown='['+title.replace(/[\[\]\\]/g,'\\$&')+']('+canonical+')\n';
      else if(message.operation==='clip.selection'){
        const selection=win.getSelection();
        if(!selection||selection.isCollapsed||!selection.rangeCount||
           (selection.getRangeAt(0).commonAncestorContainer.ownerDocument||selection.getRangeAt(0).commonAncestorContainer)!==doc)
          throw new Error('没有选中网页文字，请在网页选中内容后重试');
        markdown=domToMarkdown(selection.getRangeAt(0).cloneContents(),canonical);
      }else markdown=domToMarkdown(chooseArticle(doc),canonical);
    }catch(error){return {ok:false,error:String(error?.message||error).slice(0,200)};}
    const confirmed=await api.storage.local.get([SIDEBAR_TOOL_STORE,CLIP_SITE_STORE,SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE]);
    if(disposed||epoch!==policyEpochs.get(message.toolId)||win.location.href!==currentUrl||
      !clipGrantAllowed(confirmed[SIDEBAR_TOOL_STORE],confirmed[CLIP_SITE_STORE],message.toolId,currentUrl,confirmed[SIDEBAR_TOOL_ENABLE_STORE]))
      return {ok:false,error:'读取期间文档或授权已失效'};
    if((saved[TOOL_REVOCATION_EPOCHS_STORE]?.[message.toolId]??null)!==(confirmed[TOOL_REVOCATION_EPOCHS_STORE]?.[message.toolId]??null))
      return {ok:false,error:'读取期间工具实例已撤销'};
    return {ok:true,data:{markdown,title,source:canonical,site,capturedAt:new Date().toISOString(),mode:message.operation}};
  };
  const listener=(message,sender,reply)=>{
    if(message?.protocol!==CLIP_PROTOCOL)return false;
    void handle(message,sender).then(reply,e=>reply({ok:false,error:String(e?.message||e).slice(0,150)}));
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  const storageChanged=(changes,area)=>{
    if(area!=='local')return;
    for(const [id,epoch] of policyEpochs)if([SIDEBAR_TOOL_STORE,CLIP_SITE_STORE].some(key=>Object.hasOwn(changes,key))||sidebarToolLifecycleChanged(changes,id))policyEpochs.set(id,epoch+1);
  };
  api.storage.onChanged?.addListener(storageChanged);
  const dispose=()=>{if(disposed)return;disposed=true;api.runtime.onMessage.removeListener(listener);api.storage.onChanged?.removeListener(storageChanged);};
  win.addEventListener('pagehide',dispose,{once:true});
  return Object.freeze({dispose});
}
