import {newChatDestination,projectDestination,providerFor,requestNewChat} from './destinations.js';

const OWN='data-opendesk-new-chat-window';
const NAV='nav,aside,[role="navigation"]';
const CLICKABLE='a[href],button,[role="button"]';
const PROJECT_LINK='a[href*="/g/g-p-"],a[href*="/project/"]';
const STYLE=`:host{all:initial;display:inline-flex;align-items:center;flex:none;margin-inline:4px;vertical-align:middle}
button{appearance:none;box-sizing:border-box;width:28px;height:28px;display:grid;place-items:center;
  border:1px solid #cbd5e1;border-radius:8px;background:transparent;color:#657389;
  cursor:pointer;transition:background .12s ease,color .12s ease}
button:hover{background:rgba(127,140,160,.15);color:inherit}
button:focus-visible{outline:2px solid #528cff;outline-offset:2px}
svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round}`;
const PATH='M13 4h7v7M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5';
const LABEL=/^(?:(?:new|create(?: a)?(?: new)?|start(?: a)?(?: new)?)\s+(?:chat|conversation)(?:\s+in\s+(?:this\s+)?project)?|新建(?:对话|聊天)|新(?:对话|聊天)|在(?:此|该)?项目(?:中|内)?新建(?:对话|聊天)|开启新对话|建立新对话|nouvelle discussion)$/i;
const PROJECT_NEW=/^(?:project[-_ ]?new[-_ ]?chat|new[-_ ]?chat[-_ ]?project|create[-_ ]?project[-_ ]?chat)$/i;

function inNavigation(node){return Boolean(node.closest(NAV));}
function isNativeNewChat(node){
  if(!node?.matches?.(CLICKABLE)||node.closest(`[${OWN}]`))return false;
  const attrs=['aria-label','title','data-testid','data-test-id'];
  if(attrs.some(name=>LABEL.test((node.getAttribute(name)||'').trim())))return true;
  if(['create-new-chat-button','new-chat-button','new-chat-link'].includes(node.getAttribute('data-testid')))return true;
  const text=(node.textContent||'').trim();
  return text.length<=32&&LABEL.test(text);
}

function isProjectNewChat(node){
  if(isNativeNewChat(node))return true;
  if(!node?.matches?.('button,[role="button"]')||node.closest(`[${OWN}]`))return false;
  const testId=(node.getAttribute('data-testid')||'').trim();
  if(PROJECT_NEW.test(testId))return true;
  // Some site versions render a symbol-only + beside each project title.
  // This is admitted only inside exactly one verified project row.
  return ['+','＋'].includes((node.textContent||'').trim());
}
function findProjectLinks(navRoots,pageHref){
  const links=[],seen=new Set();
  for(const root of navRoots)for(const link of root.querySelectorAll(PROJECT_LINK)){
    if(seen.has(link)||!inNavigation(link)||link.closest(`[${OWN}]`))continue;
    seen.add(link);
    const destination=projectDestination(link.getAttribute('href'),pageHref);
    if(destination)links.push({link,destination});
    if(links.length>=80)return links;
  }
  return links;
}
function nativeProjectAction(link,pageHref){
  // The + action may be mounted only after hover. Never fall back to
  // decorating the project name; wait for the actual native action.
  for(let row=link.parentElement,depth=0;row&&depth<6;row=row.parentElement,depth++){
    if(row.matches(NAV))break;
    const identities=new Set([...row.querySelectorAll(PROJECT_LINK)]
      .map(node=>projectDestination(node.getAttribute('href'),pageHref)?.url).filter(Boolean));
    if(identities.size!==1)break;
    const matches=[...row.querySelectorAll(CLICKABLE)].filter(node=>
      node!==link&&!link.contains(node)&&isProjectNewChat(node));
    if(matches.length===1)return {target:matches[0],row};
    if(matches.length>1)return null; // Ambiguous native action: fail closed.
  }
  return null;
}
function isProjectRowAction(node,pageHref){
  for(let row=node.parentElement,depth=0;row&&depth<6;row=row.parentElement,depth++){
    if(row.matches(NAV))break;
    if([...row.querySelectorAll(PROJECT_LINK)].some(link=>
      Boolean(projectDestination(link.getAttribute('href'),pageHref))))return true;
  }
  return false;
}
function discover(doc,win){
  const found=new Map(),pageHref=win.location.href;
  if(!providerFor(pageHref))return found;
  const navRoots=[...doc.querySelectorAll(NAV)];
  for(const {link,destination} of findProjectLinks(navRoots,pageHref)){
    const action=nativeProjectAction(link,pageHref);
    if(action)found.set(action.target,{destination,row:action.row});
  }
  // Long AI transcripts can have thousands of links and buttons: search only
  // navigation regions rather than rescanning the full page every 1.6s.
  const controls=new Set(navRoots.flatMap(root=>[...root.querySelectorAll(CLICKABLE)]));
  for(const node of controls){
    if(!isNativeNewChat(node)||!inNavigation(node)||found.has(node)||
       isProjectRowAction(node,pageHref))continue;
    const destination=newChatDestination(pageHref);
    if(destination)found.set(node,{destination,row:null});
    if(found.size>=100)break;
  }
  // A project landing page may show its native create button outside the nav.
  const project=newChatDestination(pageHref,{fromProjectPage:true});
  if(project){
    const main=doc.querySelector('main,[role="main"]');
    if(main){
      const native=[...main.querySelectorAll(CLICKABLE)].filter(isNativeNewChat);
      if(native.length===1)found.set(native[0],{destination:project,row:null});
      // Do not invent an action or attach to a transcript heading.
    }
  }
  return found;
}
function newButton(doc,destination,owner,win,row=null){
  const host=doc.createElement('span');
  host.setAttribute(OWN,destination.kind);
  if(row)host.style.setProperty('display','none','important');
  const shadow=host.attachShadow({mode:'open'});
  const style=doc.createElement('style');style.textContent=STYLE;
  const button=doc.createElement('button');
  button.type='button';
  const title=destination.kind==='project'?'在新窗口打开此项目的新对话':'在新窗口打开新对话';
  button.title=title+'（Alt + 点击：新标签页）';
  button.setAttribute('aria-label',title);
  const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',PATH);svg.append(path);button.append(svg);
  const off=owner.on(button,'click',event=>{
    if(event.isTrusted!==true||!host.isConnected)return;
    event.preventDefault();event.stopPropagation();
    try{requestNewChat(win,destination,{mode:event.altKey?'tab':'window'});}
    catch(error){console.warn('OpenDesk new chat window request failed',error);}
  });
  shadow.append(style,button);
  return {host,off,destination,row};
}

export function installNewChatButtons({doc,win,owner}){
  const mounted=new Map();let scheduled=false,disposed=false,keyboardNavigation=false;
  function syncVisibility(){
    for(const item of mounted.values()){
      if(!item.row)continue;
      const showing=item.row.isConnected&&
        (item.row.matches(':hover')||(keyboardNavigation&&item.row.matches(':focus-within')));
      item.host.style.setProperty('display',showing?'inline-flex':'none','important');
    }
  }
  function clear(target){
    const item=mounted.get(target);if(!item)return;
    mounted.delete(target);item.off();item.host.remove();
  }
  function refresh(){
    scheduled=false;
    if(disposed||!doc.documentElement?.isConnected)return;
    const found=discover(doc,win);
    for(const [target,item] of mounted){
      const next=found.get(target);
      if(!target.isConnected||!next||next.destination.url!==item.destination.url||
         next.row!==item.row||!item.host.isConnected)clear(target);
    }
    for(const [target,entry] of found){
      if(!target.isConnected||mounted.has(target))continue;
      const item=newButton(doc,entry.destination,owner,win,entry.row);
      target.insertAdjacentElement('afterend',item.host);
      mounted.set(target,item);
    }
    syncVisibility();
  }
  function schedule(){
    if(disposed||scheduled)return;
    scheduled=true;owner.setTimeout(refresh,50);
  }
  refresh();
  // Follow native hover and keyboard focus without modifying native events.
  const relatedToNav=event=>event.target?.closest?.(NAV);
  owner.on(doc,'keydown',event=>{
    if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
      keyboardNavigation=true;syncVisibility();
    }
  });
  owner.on(doc,'pointerdown',()=>{keyboardNavigation=false;syncVisibility();});
  owner.on(doc,'pointerover',event=>{if(relatedToNav(event))syncVisibility();});
  owner.on(doc,'pointerout',event=>{if(relatedToNav(event))owner.setTimeout(syncVisibility,0);});
  owner.on(doc,'focusin',event=>{if(relatedToNav(event))syncVisibility();});
  owner.on(doc,'focusout',event=>{if(relatedToNav(event))owner.setTimeout(syncVisibility,0);});
  // Keep the observation bounded to nav/header mutations, not AI token streams.
  owner.observe(doc.documentElement,records=>{
    if(records.some(record=>{
      const target=record.target?.nodeType===1?record.target:record.target?.parentElement;
      if(target?.closest?.(`[${OWN}]`))return false;
      return Boolean(target?.closest?.(`${NAV},header`)||[...record.addedNodes||[]]
        .some(node=>node.nodeType===1&&node.matches?.(`${NAV},header,main`)));
    }))schedule();
  },{childList:true,subtree:true});
  // Account for SPA routing which can change project identity without a reload.
  owner.setInterval(refresh,1600);
  owner.onDispose(()=>{disposed=true;for(const target of [...mounted.keys()])clear(target);});
  return {refresh,dispose:()=>{disposed=true;for(const target of [...mounted.keys()])clear(target);}};
}
