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
const LABEL=/^(?:new[ -]?chat|start[ -]?(?:a[ -]?)?new[ -]?chat|新建(?:对话|聊天)|新(?:对话|聊天)|开启新对话|建立新对话|nouvelle discussion)$/i;

function inNavigation(node){return Boolean(node.closest(NAV));}
function isNativeNewChat(node){
  if(!node?.matches?.(CLICKABLE)||node.closest(`[${OWN}]`))return false;
  const attrs=['aria-label','title','data-testid','data-test-id'];
  if(attrs.some(name=>LABEL.test((node.getAttribute(name)||'').trim())))return true;
  if(['create-new-chat-button','new-chat-button','new-chat-link'].includes(node.getAttribute('data-testid')))return true;
  const text=(node.textContent||'').trim();
  return text.length<=32&&LABEL.test(text);
}

function findProjectLinks(navRoots,pageHref){
  const links=[];
  for(const link of navRoots.flatMap(root=>[...root.querySelectorAll(PROJECT_LINK)])){
    if(!inNavigation(link)||link.closest(`[${OWN}]`))continue;
    const destination=projectDestination(link.getAttribute('href'),pageHref);
    if(destination)links.push({link,destination});
    if(links.length>=80)break;
  }
  return links;
}
function projectRow(link){
  return link.closest('li,[role="listitem"],[data-testid*="project-item"]')||link.parentElement;
}
function nativeProjectAction(link){
  const row=projectRow(link);
  if(!row)return null;
  const matches=[...row.querySelectorAll('button,a,[role="button"]')]
    .filter(node=>node!==link&&isNativeNewChat(node));
  // Never infer a target if the row contains multiple plausible actions.
  return matches.length===1?matches[0]:null;
}
function isProjectRowAction(node,pageHref){
  const row=node.closest('li,[role="listitem"],[data-testid*="project-item"]');
  if(!row)return false;
  return [...row.querySelectorAll(PROJECT_LINK)]
    .some(link=>Boolean(projectDestination(link.getAttribute('href'),pageHref)));
}
function discover(doc,win){
  const found=new Map(),pageHref=win.location.href;
  if(!providerFor(pageHref))return found;
  const navRoots=[...doc.querySelectorAll(NAV)];
  for(const {link,destination} of findProjectLinks(navRoots,pageHref)){
    const target=nativeProjectAction(link)||link;
    found.set(target,destination);
  }
  // Long AI transcripts can have thousands of links and buttons: search only
  // navigation regions rather than rescanning the full page every 1.6s.
  const controls=new Set(navRoots.flatMap(root=>[...root.querySelectorAll(CLICKABLE)]));
  for(const node of controls){
    if(!isNativeNewChat(node)||!inNavigation(node)||found.has(node)||
       isProjectRowAction(node,pageHref))continue;
    const destination=newChatDestination(pageHref);
    if(destination)found.set(node,destination);
    if(found.size>=100)break;
  }
  // A project landing page may show its native create button outside the nav.
  const project=newChatDestination(pageHref,{fromProjectPage:true});
  if(project){
    const main=doc.querySelector('main,[role="main"]');
    if(main){
      const native=[...main.querySelectorAll(CLICKABLE)].filter(isNativeNewChat);
      if(native.length===1)found.set(native[0],project);
      // Do not invent an action or attach to a transcript heading.
    }
  }
  return found;
}
function newButton(doc,destination,owner,win){
  const host=doc.createElement('span');
  host.setAttribute(OWN,destination.kind);
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
  return {host,off,destination};
}

export function installNewChatButtons({doc,win,owner}){
  const mounted=new Map();let scheduled=false,disposed=false;
  function clear(target){
    const item=mounted.get(target);if(!item)return;
    mounted.delete(target);item.off();item.host.remove();
  }
  function refresh(){
    scheduled=false;
    if(disposed||!doc.documentElement?.isConnected)return;
    const found=discover(doc,win);
    for(const [target,item] of mounted){
      if(!target.isConnected||!found.has(target)||
         found.get(target).url!==item.destination.url||!item.host.isConnected)clear(target);
    }
    for(const [target,destination] of found){
      if(!target.isConnected||mounted.has(target))continue;
      const item=newButton(doc,destination,owner,win);
      target.insertAdjacentElement('afterend',item.host);
      mounted.set(target,item);
    }
  }
  function schedule(){
    if(disposed||scheduled)return;
    scheduled=true;owner.setTimeout(refresh,250);
  }
  refresh();
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
