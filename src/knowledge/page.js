import {SIDEBAR_TOOL_STORE} from '../ui/sidebar-tools/package.js';
import {domToMarkdown} from '../page-clip/convert.js';
import {KNOWLEDGE_TOOL_ID,KNOWLEDGE_PROTOCOL,CAPTURE_SITE_STORE,captureAllowed,
  installedKnowledgeTool,knowledgePackageHash,chatCaptureOrigin} from './policy.js';

const OWN='data-opendesk-capture-root';
const ROLE='[data-message-author-role="assistant"]';
const SINGLETON='__openDeskKnowledgeCaptureV1';
function visible(element,win){
  if(!element?.isConnected||element.closest('[hidden],[aria-hidden="true"],[inert]'))return false;
  const style=win.getComputedStyle(element);
  return style.display!=='none'&&style.visibility!=='hidden'&&element.getClientRects().length>0;
}
export function chatGPTReplies(doc,win){
  return [...doc.querySelectorAll(ROLE)].filter(node=>!node.parentElement?.closest(ROLE)&&visible(node,win)).slice(-120);
}
function replyTurn(reply){return reply.closest('article,[data-testid^="conversation-turn-"]')||reply;}
export function replyIsStreaming(reply,doc){
  const turn=replyTurn(reply);
  const win=doc.defaultView;
  if(reply.matches('.result-streaming,[data-is-streaming="true"],[aria-busy="true"]')||
    [...turn.querySelectorAll('.result-streaming,[data-is-streaming="true"],[aria-busy="true"]')].some(node=>visible(node,win)))return true;
  const last=chatGPTReplies(doc,win).at(-1);
  return reply===last&&[...doc.querySelectorAll('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"]')].some(node=>visible(node,win));
}
export function captureChatGPTReply(reply,{doc=reply.ownerDocument,win=doc.defaultView,selection=false,kind='inbox'}={}){
  if(!chatCaptureOrigin(win.location.href)||!visible(reply,win)||!reply.matches(ROLE)||replyIsStreaming(reply,doc))
    throw new Error('回答正在生成或已不可用，请等待完成');
  // A reply may contain several Markdown blocks, images and code fragments.
  // The shared converter skips controls and hidden branches across all of them.
  let body=reply;
  if(selection){
    const selected=win.getSelection();
    if(!selected||selected.isCollapsed||selected.rangeCount!==1)throw new Error('请先在这一条回答中选中文字');
    const range=selected.getRangeAt(0);
    if(!reply.contains(range.startContainer)||!reply.contains(range.endContainer))throw new Error('选区必须完整位于这一条回答内');
    body=range.cloneContents();
  }
  const markdown=domToMarkdown(body,win.location.href);
  const firstLine=markdown.split('\n').find(line=>line.trim())||doc.title;
  const title=firstLine.replace(/^#{1,6}\s+|^[>*`\s]+/g,'').slice(0,160).trim()||'ChatGPT 回答';
  const id=reply.getAttribute('data-message-id')||replyTurn(reply).getAttribute('data-message-id')||'';
  const messageId=/^[a-zA-Z0-9_-]{1,100}$/.test(id)?id:'';
  const messages=[...doc.querySelectorAll('[data-message-author-role]')];
  let question='';
  for(let i=selection?-1:messages.indexOf(reply)-1;i>=0;i--){
    if(messages[i].getAttribute('data-message-author-role')==='user'&&visible(messages[i],win)){
      question=String(messages[i].textContent||'').trim();break;
    }
  }
  return {markdown,title,messageId,kind,mode:selection?'selection':'reply',
    question:question.slice(0,2000),questionTruncated:question.length>2000,imageCount:body.querySelectorAll?.('img').length||0};
}

// Trusted fixed content controller. No page event bridge, arbitrary selectors,
// remote scripts or automatic content saving are exposed to a tool package.
export function initKnowledgeCapture({api=globalThis.chrome,doc=globalThis.document,win=globalThis.window}={}){
  if(!api?.storage?.local||!api.runtime?.sendMessage||!doc||!win||win.top!==win||!chatCaptureOrigin(win.location.href))return null;
  if(win[SINGLETON])return win[SINGLETON];
  let controller;
  let enabled=false,disposed=false,paused=false,epoch=0,packageHash='',href=win.location.href;
  let observer=null,timer=0,locationTimer=0;
  const entries=new Map();
  const forget=entry=>{entry.host.remove();entries.delete(entry.reply);};
  function stop(){
    enabled=false;observer?.disconnect();observer=null;
    win.clearTimeout(timer);timer=0;win.clearInterval(locationTimer);locationTimer=0;
    for(const entry of [...entries.values()])forget(entry);
  }
  const schedule=()=>{if(enabled&&!timer)timer=win.setTimeout(scan,250);};
  async function send(entry,operation,{kind='inbox',selection=false,imageUrl}={}){
    if(entry.busy||!enabled||disposed||paused)return;
    const token=epoch,expectedUrl=win.location.href;
    entry.busy=true;entry.status.textContent='正在处理…';
    try{
      if(!visible(entry.reply,win)||replyIsStreaming(entry.reply,doc)||Date.now()-entry.lastEdit<700)
        throw new Error('回答还在变化，请稍后重试');
      const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,CAPTURE_SITE_STORE]);
      if(token!==epoch||!enabled||expectedUrl!==win.location.href||
        !captureAllowed(saved[SIDEBAR_TOOL_STORE],saved[CAPTURE_SITE_STORE],expectedUrl))throw new Error('网页或授权已变化');
      if(entries.get(entry.reply)!==entry||!entry.host.isConnected||!visible(entry.reply,win)||
        replyIsStreaming(entry.reply,doc)||Date.now()-entry.lastEdit<700)throw new Error('回答还在变化，请稍后重试');
      const payload=imageUrl?{url:imageUrl}:captureChatGPTReply(entry.reply,{doc,win,selection,kind});
      const response=await api.runtime.sendMessage({protocol:KNOWLEDGE_PROTOCOL,toolId:KNOWLEDGE_TOOL_ID,
        operation,packageHash,expectedUrl,payload});
      if(token!==epoch||!enabled||expectedUrl!==win.location.href)return;
      if(!response?.ok)throw new Error(response?.error?.message||'保存结果未确认，请在收件箱核对后重试');
      entry.status.textContent=operation==='capture.save'?
        (response.data.duplicate?'已在收件箱中，保留原分类和备注':'已存入'+({idea:'灵感',draft:'草稿'}[kind]||'收件箱')):
        '已请求下载，请在 Chrome 确认保存';
    }catch(error){if(token===epoch)entry.status.textContent=String(error?.message||error).slice(0,180);}
    finally{entry.busy=false;}
  }
  function attach(reply){
    const turn=replyTurn(reply);
    // Keep controls associated with exactly one assistant turn. If official
    // actions have not mounted yet, use the bottom of this reply as fallback.
    const official=turn.querySelectorAll(ROLE).length===1?turn.querySelector('[data-testid="copy-turn-action-button"]'):null;
    let anchor=official?.parentElement&&turn.contains(official.parentElement)?official.parentElement:reply;
    if(official)while(anchor.parentElement&&anchor.parentElement!==turn)anchor=anchor.parentElement;
    const host=doc.createElement('div');host.setAttribute(OWN,'');
    host.style.cssText='display:block;position:relative;margin:4px 0 8px;max-width:100%;';
    const shadow=host.attachShadow({mode:'open'});
    const style=doc.createElement('style');
    style.textContent=':host{color-scheme:light dark;font:12px/1.5 system-ui,sans-serif;color:#64748b}.row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}button{font:inherit;color:inherit;background:transparent;border:1px solid transparent;border-radius:6px;padding:3px 7px;cursor:pointer}button:hover,button:focus-visible{background:light-dark(#f1f5f9,#263141);color:light-dark(#172033,#e2e8f0);outline:2px solid transparent}button:focus-visible{outline-color:#3b82f6}button:disabled{opacity:.45;cursor:wait}.brand{font-size:10px;letter-spacing:.03em;margin-right:2px}.menu{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0;padding:6px;border:1px solid light-dark(#e2e8f0,#374151);border-radius:8px}.menu[hidden]{display:none}.status{display:block;font-size:11px;overflow-wrap:anywhere;max-width:38em}';
    const row=doc.createElement('div');row.className='row';
    const brand=doc.createElement('span');brand.className='brand';brand.textContent='OpenDesk';
    const menu=doc.createElement('div');menu.className='menu';menu.hidden=true;
    const status=doc.createElement('span');status.className='status';status.setAttribute('role','status');
    const entry={reply,host,status,menu,busy:false,lastEdit:Date.now(),buttons:[]};
    const action=(parent,label,title,handler)=>{
      const button=doc.createElement('button');button.type='button';button.textContent=label;button.title=title;
      button.setAttribute('aria-label','OpenDesk：'+title);
      button.addEventListener('click',event=>{if(event.isTrusted)handler(event);});
      parent.append(button);return button;
    };
    row.append(brand);
    entry.buttons.push(action(row,'保存','保存这条回答到知识收件箱',()=>void send(entry,'capture.save')));
    entry.buttons.push(action(row,'Markdown','下载这条回答的 Markdown 文件',()=>void send(entry,'capture.download')));
    const more=action(row,'更多','展开灵感、草稿、选区与图片操作',()=>{
      menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));
      if(menu.hidden)return;
      menu.replaceChildren();
      action(menu,'存为灵感','保存为灵感',()=>void send(entry,'capture.save',{kind:'idea'}));
      action(menu,'存为草稿','保存为草稿',()=>void send(entry,'capture.save',{kind:'draft'}));
      action(menu,'保存选中文字','只保存这一条回答中的选区',()=>void send(entry,'capture.save',{selection:true}));
      const images=[...reply.querySelectorAll('img')].filter(image=>visible(image,win)&&image.complete&&image.naturalWidth>32).slice(0,12);
      images.forEach((image,i)=>action(menu,'下载图片 '+(i+1),'下载当前显示的第 '+(i+1)+' 张图片',()=>
        void send(entry,'capture.image',{imageUrl:image.currentSrc||image.src})));
    });
    more.setAttribute('aria-expanded','false');
    shadow.append(style,row,menu,status);anchor.after(host);entries.set(reply,entry);
  }
  function scan(){
    timer=0;if(!enabled||disposed||paused)return;
    if(href!==win.location.href){href=win.location.href;epoch++;stop();void refreshPolicy();return;}
    const replies=chatGPTReplies(doc,win),current=new Set(replies);
    for(const entry of [...entries.values()])if(!current.has(entry.reply)||!entry.host.isConnected)forget(entry);
    for(const reply of replies)if(!entries.has(reply))attach(reply);
    let settling=false;
    for(const entry of entries.values()){
      const waiting=Date.now()-entry.lastEdit<700;
      const streaming=replyIsStreaming(entry.reply,doc);
      entry.buttons.forEach(button=>{button.disabled=streaming||waiting;});
      settling||=waiting;
    }
    if(settling)schedule();
  }
  async function refreshPolicy(){
    const token=++epoch,url=win.location.href;
    try{
      const saved=await api.storage.local.get([SIDEBAR_TOOL_STORE,CAPTURE_SITE_STORE]);
      if(disposed||paused||token!==epoch)return;
      if(url!==win.location.href){void refreshPolicy();return;}
      if(!captureAllowed(saved[SIDEBAR_TOOL_STORE],saved[CAPTURE_SITE_STORE],url)){stop();return;}
      const nextHash=await knowledgePackageHash(installedKnowledgeTool(saved[SIDEBAR_TOOL_STORE]));
      if(disposed||paused||token!==epoch||url!==win.location.href)return;
      if(enabled&&nextHash===packageHash){schedule();return;}
      stop();packageHash=nextHash;enabled=true;href=url;
      observer=new win.MutationObserver(records=>{
        let changed=false;
        for(const mutation of records){
          const nodes=[...(mutation.addedNodes||[]),...(mutation.removedNodes||[])];
          if(nodes.length&&nodes.every(node=>node.nodeType===1&&node.hasAttribute(OWN)))continue;
          const target=mutation.target.nodeType===1?mutation.target:mutation.target.parentElement;
          if(target?.closest('['+OWN+']'))continue;
          changed=true;
          const entry=entries.get(target?.closest(ROLE));if(entry)entry.lastEdit=Date.now();
        }
        if(changed)schedule();
      });
      observer.observe(doc.body,{subtree:true,childList:true,characterData:true,attributes:true,
        attributeFilter:['data-is-streaming','aria-busy','hidden','aria-hidden','data-message-id','class','style']});
      locationTimer=win.setInterval(()=>{if(href!==win.location.href)schedule();},1000);
      scan();
    }catch{if(token===epoch)stop();}
  }
  const storageChanged=(changes,area)=>{
    if(area!=='local'||!Object.hasOwn(changes,SIDEBAR_TOOL_STORE)&&!Object.hasOwn(changes,CAPTURE_SITE_STORE))return;
    epoch++;stop();void refreshPolicy();
  };
  const pageShow=()=>{paused=false;void refreshPolicy();};
  const pageHide=event=>{epoch++;paused=true;stop();if(!event.persisted)dispose();};
  const navigate=()=>schedule();
  function dispose(){
    if(disposed)return;disposed=true;epoch++;stop();
    api.storage.onChanged.removeListener(storageChanged);
    win.removeEventListener('pageshow',pageShow);win.removeEventListener('pagehide',pageHide);
    win.removeEventListener('popstate',navigate);
    if(win[SINGLETON]===controller)delete win[SINGLETON];
  }
  api.storage.onChanged.addListener(storageChanged);
  win.addEventListener('pageshow',pageShow);win.addEventListener('pagehide',pageHide);win.addEventListener('popstate',navigate);
  if(doc.body)void refreshPolicy();else doc.addEventListener('DOMContentLoaded',()=>void refreshPolicy(),{once:true});
  controller=Object.freeze({dispose,refreshPolicy,diagnostics:()=>({enabled,buttons:entries.size,observer:Boolean(observer),timers:Number(Boolean(timer))+Number(Boolean(locationTimer))})});
  Object.defineProperty(win,SINGLETON,{value:controller,configurable:true});
  return controller;
}
