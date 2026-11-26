import {findConversationScroller} from './conversation.js';

// Per-installation visual site adapter. All persistence flows through the
// authenticated Installed Page USER_SCRIPT broker; this module grants nothing.
const OWN='data-opendesk-ai-scroll-navigation';
const EXCLUDE='aside,nav,form,pre,textarea,input,select,[contenteditable],[role="dialog"],[aria-modal="true"],[inert],[aria-hidden="true"]';
function shown(node,win){
  if(!node?.isConnected||node.closest?.('[hidden],[inert],[aria-hidden="true"],[role="dialog"],[aria-modal="true"]'))return false;
  const r=node.getBoundingClientRect?.(),s=r&&win.getComputedStyle(node);
  return Boolean(r&&r.width>1&&r.height>1&&s&&s.display!=='none'&&!['hidden','collapse'].includes(s.visibility));
}
function sole(doc,selector,win){
  if(typeof selector!=='string'||!selector.trim()||selector.length>256)return null;
  try{const nodes=[...doc.querySelectorAll(selector)];return nodes.length===1&&shown(nodes[0],win)?nodes[0]:null;}
  catch{return null;}
}
function allowedNode(node,win) {
  return shown(node,win)&&!node.closest?.(EXCLUDE)&&!node.closest?.('['+OWN+']')&&
    !['HTML','BODY','SCRIPT','STYLE'].includes(node.tagName);
}
export function applicableRule(config,href){
  let url;try{url=new URL(href);}catch{return null;}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  return (config?.sites||[]).filter(r=>r.enabled&&r.origin===url.origin&&
    (r.pathScope==='/'||url.pathname===r.pathScope||
      url.pathname.startsWith(r.pathScope.endsWith('/')?r.pathScope:r.pathScope+'/')))
    .sort((a,b)=>b.pathScope.length-a.pathScope.length)[0]||null;
}
export function resolveConfiguredConversation(rule,doc,win){
  if(!rule?.enabled)return null;
  let url;try{url=new URL(win.location.href);}catch{return null;}
  if(rule.origin!==url.origin||!(rule.pathScope==='/'||url.pathname===rule.pathScope||
    url.pathname.startsWith(rule.pathScope.endsWith('/')?rule.pathScope:rule.pathScope+'/')))return null;
  const main=sole(doc,rule.mainSelector,win),scroller=sole(doc,rule.scrollSelector,win);
  if(!main||!scroller||!allowedNode(main,win)||!shown(scroller,win)||
      scroller.closest?.('aside,nav,form,textarea,pre,[contenteditable]'))return null;
  if(!scroller.contains(main)&&!main.contains(scroller))return null;
  const rootScroller=scroller===doc.scrollingElement||scroller===doc.documentElement;
  const overflow=win.getComputedStyle(scroller).overflowY;
  if(!rootScroller&&!/^(auto|scroll|overlay)$/.test(overflow))return null;
  if(scroller.scrollHeight<scroller.clientHeight||
     !Number.isFinite(scroller.scrollHeight)||!Number.isFinite(scroller.clientHeight))return null;
  let turns=[];
  if(rule.messageSelector){
    try{turns=[...main.querySelectorAll(rule.messageSelector)];}catch{return null;}
    // Group CSS must not hide invalid, excluded or detached matches.
    if(turns.length===0||turns.length>2000||turns.some(n=>!allowedNode(n,win)))return null;
  }else{
    turns=[...main.children].filter(n=>shown(n,win));
  }
  const first=turns[0]||main,last=turns.at(-1)||main;
  if(![...(turns.length?turns:[main])].every(node=>scroller.contains(node)&&
      findConversationScroller(node,doc,win,{includeSelf:true})===scroller))return null;
  const anchor=rule.anchorSelector?sole(doc,rule.anchorSelector,win):null;
  if(rule.anchorSelector&&!anchor)return null;
  return {custom:true,site:'custom',main,scroller,first,last,anchor,selector:rule.messageSelector||'',
    rule:{...rule},href:win.location.href};
}
function sameTargets(a,b){
  return Boolean(a&&b&&['main','scroller','first','last','anchor'].every(key=>a[key]===b[key]));
}
export function scrollConfiguredEdge(binding,direction,doc,win){
  if(!binding?.custom||!['top','bottom'].includes(direction))return false;
  // Resolve everything again at the moment of the click. Never trust a stale
  // element that React or a SPA has detached/replaced since the last frame.
  const fresh=resolveConfiguredConversation(binding.rule,doc,win);
  if(binding.href!==win.location.href||!sameTargets(binding,fresh))return false;
  const {main,scroller,first,last}=fresh;
  if(!main?.isConnected||!scroller?.isConnected||!first?.isConnected||!last?.isConnected||
      !scroller.contains(first)||!scroller.contains(last))return false;
  const max=scroller.scrollHeight-scroller.clientHeight;
  if(!Number.isFinite(max)||max<=1)return false;
  const top=direction==='top'?0:max,left=scroller.scrollLeft||0;
  if(scroller===doc.scrollingElement&&typeof win.scrollTo==='function')
    win.scrollTo({top,left,behavior:'instant'});
  else if(typeof scroller.scrollTo==='function')scroller.scrollTo({top,left,behavior:'instant'});
  else scroller.scrollTop=top;
  return Math.abs(scroller.scrollTop-top)<=3;
}
function safeUniqueSelector(doc,node,{structuralOnly=false}={}){
  const unique=selector=>{try{return doc.querySelectorAll(selector).length===1&&
    doc.querySelector(selector)===node;}catch{return false;}};
  const css=globalThis.CSS?.escape||((value)=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c));
  if(!structuralOnly&&node.id){const s='#'+css(node.id);if(unique(s))return s;}
  for(const attr of structuralOnly?[]:['data-testid','data-id','aria-label']){
    const value=node.getAttribute?.(attr);
    if(value&&value.length<=80&&!/["\\\u0000-\u001f]/.test(value)){
      const s='['+attr+'="'+value+'"]';
      if(unique(s))return s;
    }
  }
  let parts=[],current=node;
  const maxDepth=structuralOnly?64:8;
  for(let depth=0;depth<maxDepth&&current&&current.nodeType===1;depth++,current=current.parentElement){
    let item=current.tagName.toLowerCase();
    const siblings=[...(current.parentElement?.children||[])].filter(n=>n.tagName===current.tagName);
    if(siblings.length>1)item+=':nth-of-type('+([...current.parentElement.children].filter(n=>
      n.tagName===current.tagName).indexOf(current)+1)+')';
    parts.unshift(item);
    const s=parts.join(' > ');
    if(s.length>256)return null;
    if(unique(s))return s;
  }
  return null;
}

function safeMessageGroupSelector(main,hit,win,{structuralOnly=false}={}){
  if(!main?.contains(hit))return null;
  const escape=globalThis.CSS?.escape||((value)=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c));
  let best=null;
  const depth=node=>{let n=0;while(node&&node!==main){node=node.parentElement;n++;}return n;};
  for(let node=hit,level=0;node&&node!==main&&level<9;node=node.parentElement,level++){
    if(!allowedNode(node,win))continue;
    const tag=node.tagName?.toLowerCase();
    if(!tag)continue;
    const probes=[];
    if(node.hasAttribute?.('data-message-id'))probes.push(['[data-message-id]',140]);
    if(structuralOnly)for(const attr of ['data-turn-key','data-turn-id','data-message-key','data-response-id'])
      if(node.hasAttribute?.(attr))probes.push(['['+attr+']',135]);
    for(const [name,weight] of [['data-testid',125],['data-role',120],['role',115]]){
      const value=node.getAttribute?.(name);
      if(value&&value.length<=80&&!/["\\\u0000-\u001f]/.test(value)&&
          (!structuralOnly||/^(message|turn|chat|response|assistant|user|article|bubble|reply|listitem)$/.test(value))&&
          /(message|turn|chat|response|assistant|user|article|bubble|reply|listitem)/i.test(value))
        probes.push(['['+name+'="'+value+'"]',weight]);
    }
    if(tag==='article')probes.push(['article',130]);
    if(tag==='li'&&!structuralOnly)probes.push(['li',65]);
    for(const cls of [...(node.classList||[])].slice(0,6)){
      if(!/^[a-zA-Z_][a-zA-Z0-9_-]{1,63}$/.test(cls)||
          (structuralOnly&&!/^(message|turn|chat|response|assistant|bubble|reply)$/.test(cls)))continue;
      const semantic=/(message|turn|chat|response|assistant|bubble|reply)/i.test(cls);
      if(semantic||node.parentElement===main)probes.push([tag+'.'+escape(cls),semantic?110:35]);
    }
    for(const [selector,weight] of probes){
      if(selector.length>256)continue;
      let nodes;
      try{nodes=[...main.querySelectorAll(selector)];}catch{continue;}
      if(nodes.length<1||nodes.length>2000||!nodes.includes(node)||
          nodes.some(item=>!allowedNode(item,win)))continue;
      const d=depth(nodes[0]);
      if(nodes.some(item=>depth(item)!==d||
          nodes.some(other=>other!==item&&other.contains(item))))continue;
      const score=(nodes.length>=2?300:0)+weight-level*6+Math.min(nodes.length,10);
      if(!best||score>best.score)best={selector,node,count:nodes.length,score};
    }
  }
  return best;
}
function validateLiveRule(rule,doc,win){
  let page,url;
  try{page=new URL(win.location.href);url=new URL(rule.origin);}catch{return '当前网页地址无效，无法保存。';}
  if(!['http:','https:'].includes(page.protocol)||page.username||page.password||
      rule.origin!==page.origin||url.origin!==rule.origin||url.pathname!=='/'||
      url.search||url.hash)return '只能保存当前已授权的 HTTP(S) 网站；其他网站请先申请访问权限。';
  const scope=rule.pathScope;
  if(typeof scope!=='string'||scope.length<1||scope.length>512||
      !scope.startsWith('/')||scope.startsWith('//')||
      /[?#\\\u0000-\u001f\u007f]/.test(scope)||
      scope.includes('/../')||scope.endsWith('/..')||scope.includes('/./'))
    return '适用路径需要是有效的绝对路径前缀，例如 /chat。';
  if(!(scope==='/'||page.pathname===scope||
      page.pathname.startsWith(scope.endsWith('/')?scope:scope+'/')))
    return '当前页面不在所填适用路径中，请在目标页面保存。';
  for(const [field,label,required] of [
    ['mainSelector','对话主区域',true],['scrollSelector','滚动容器',true],
    ['messageSelector','消息节点',false],['anchorSelector','按钮锚点',false]]){
    const value=rule[field];
    if(typeof value!=='string'||value.length>256||(required&&!value)||
        /[\u0000-\u001f\u007f{};]/.test(value))
      return label+'选择器为空、过长或含无效字符。';
    if(value)try{doc.querySelectorAll(value);}catch{return label+' CSS 语法无效，请修改后保存。';}
  }
  const matches=field=>field?[...doc.querySelectorAll(field)]:[];
  const mainMatches=matches(rule.mainSelector);
  if(mainMatches.length===0)return '对话主区域在当前页面无匹配；请检查 CSS 或重新点选。';
  if(mainMatches.length>1)return '对话主区域匹配多个节点；请使用更精确的 CSS。';
  const scrollers=matches(rule.scrollSelector);
  if(scrollers.length===0)return '滚动容器在当前页面无匹配；请检查 CSS 或重新点选。';
  if(scrollers.length>1)return '滚动容器匹配多个节点；请使用更精确的 CSS。';
  const main=mainMatches[0],scroller=scrollers[0];
  if(!shown(main,win)||!shown(scroller,win))
    return '页面结构或可见性已变化，主要节点已隐藏或脱离页面。';
  if(!scroller.contains(main)&&!main.contains(scroller))
    return '对话主区域与滚动容器没有正确的包含关系。';
  const rootScroller=scroller===doc.scrollingElement||scroller===doc.documentElement;
  if(!rootScroller&&!/^(auto|scroll|overlay)$/.test(win.getComputedStyle(scroller).overflowY))
    return '滚动容器没有可滚动的 overflow-y，请重新点选。';
  if(!Number.isFinite(scroller.scrollHeight)||!Number.isFinite(scroller.clientHeight)||
    scroller.scrollHeight-scroller.clientHeight<=1)
    return '滚动容器目前不可滚动，请在较长对话中核对。';
  if(rule.messageSelector){
    const messages=[...main.querySelectorAll(rule.messageSelector)];
    if(messages.length===0)return '消息节点在主区域内无匹配；可清空此可选字段。';
    if(messages.length>2000)return '消息节点匹配过多，请缩小选择范围。';
  }
  if(rule.anchorSelector){
    const anchors=matches(rule.anchorSelector);
    if(anchors.length!==1)return anchors.length===0?
      '按钮锚点无匹配；可清空此可选字段。':
      '按钮锚点匹配多个节点，请选择唯一目标。';
  }
  const binding=resolveConfiguredConversation({...rule,enabled:true},doc,win);
  if(!binding)return '页面结构已变化或选取节点不符合对话滚动关系，请重新点选并核对。';
  return null;
}

// Count the whole document before selector queries. Excluded controls never
// become candidates; their internal depth must not hide a valid conversation.
export function observeScrollSiteStructure({doc,win}={}){
  const unavailable=()=>({state:'unavailable',reason:'NO_STRUCTURE'});
  try{
    if(!doc?.documentElement||!win)return unavailable();
    const nodes=[],excluded=new Set();
    let node=doc.documentElement,depth=0;
    while(node){
      if(nodes.length>=12000)return unavailable();
      if(excluded.has(node.parentElement)||node.matches(EXCLUDE))excluded.add(node);
      if(depth>64&&!excluded.has(node))return unavailable();
      nodes.push(node);
      if(node.firstElementChild){node=node.firstElementChild;depth++;continue;}
      while(node&&!node.nextElementSibling){node=node.parentElement;depth--;}
      if(node)node=node.nextElementSibling;
    }
    const visible=new Set();
    for(const node of nodes){
      if(excluded.has(node)||node.hasAttribute('hidden')||
          (node.parentElement&&!visible.has(node.parentElement)))continue;
      const style=win.getComputedStyle(node);
      // display:contents has no box but can contain visible messages. Hidden
      // ancestors still block descendants, even when a child overrides CSS.
      if(style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&
          (style.display==='contents'||shown(node,win)))
        visible.add(node);
    }
    const mains=nodes.filter(node=>node.matches('main,[role="main"],[role="log"],[role="feed"],section,[role="region"]')&&
      visible.has(node)&&allowedNode(node,win));
    if(mains.length>24)return unavailable();
    const candidates=[],seen=new Set();
    for(const main of mains){
      if(candidates.length===8)break;
      const hits=nodes.filter(node=>node!==main&&main.contains(node)&&visible.has(node)&&
        node.matches('article,[data-message-id],[data-turn-key],[data-turn-id],[data-message-key],[data-response-id],[role="listitem"],.message,.turn,.response,.assistant,.bubble,.reply')&&
        allowedNode(node,win)).slice(0,8);
      for(const hit of hits){
        const group=safeMessageGroupSelector(main,hit,win,{structuralOnly:true});
        if(!group||group.count<2)continue;
        const messages=[...main.querySelectorAll(group.selector)];
        if(messages.some(node=>!visible.has(node)))continue;
        const scroller=findConversationScroller(messages[0],doc,win,{includeSelf:true});
        if(!scroller||!visible.has(scroller))continue;
        const mainSelector=safeUniqueSelector(doc,main,{structuralOnly:true});
        const scrollSelector=safeUniqueSelector(doc,scroller,{structuralOnly:true});
        if(!mainSelector||!scrollSelector)continue;
        const rule={origin:win.location.origin,pathScope:'/',enabled:true,
          mainSelector,scrollSelector,messageSelector:group.selector,anchorSelector:''};
        if(validateLiveRule(rule,doc,win))continue;
        const binding=resolveConfiguredConversation(rule,doc,win);
        if(!binding)continue;
        const identity=mainSelector+'\n'+scrollSelector+'\n'+group.selector;
        if(!seen.has(identity)){
          seen.add(identity);
          candidates.push({id:'candidate-'+(candidates.length+1),mainSelector,scrollSelector,
            messageSelector:group.selector,anchorSelector:'',
            metrics:{messageCount:messages.length,scrollable:scroller.scrollHeight-scroller.clientHeight>1}});
        }
        break;
      }
    }
    return candidates.length?{state:'observed',candidates}:unavailable();
  }catch{return unavailable();}
}

export {OWN,sole,allowedNode,safeUniqueSelector,safeMessageGroupSelector,validateLiveRule};

// The installed Page Program retains a read-only config consumer and a
// bounded structural observer and one-shot document-scoped selector picker.
// It never mounts website settings,
// never grants a site Origin, and never writes rule storage from the webpage.
const NAVIGATION_PENDING=Object.freeze({regionTop:false,regionBottom:false,
  conversationTop:false,conversationBottom:false,floatingTop:false,
  turnPaging:false,showTurnCount:false,pinReplyNavigation:false});
export function installScrollSiteRuntime({doc,win,owner,api,onChange}){
  let current={version:1,sites:[]},loaded=false,disposed=false,flight=null,picking=null;
  let block=null,move=null,keyHandler=null,releaseClick=null,pickDone=null;
  let timeout=null,host=null,outline=null;
  const activeRule=()=>applicableRule(current,win.location.href);
  // Missing flags mean legacy defaults only after a trusted read succeeds.
  const navigation=()=>loaded?(current.navigation||{}):NAVIGATION_PENDING;
  const read=()=>{
    if(disposed||!api)return Promise.resolve(null);
    if(flight)return flight;
    flight=Promise.resolve().then(()=>api.read()).then(result=>{
      if(disposed)return null;
      if(result?.value?.version!==1||!Array.isArray(result.value.sites)||
        typeof result.etag!=='string')throw Error('可信网站配置读回格式错误');
      const changed=!loaded||JSON.stringify(current)!==JSON.stringify(result.value);
      current=result.value;loaded=true;
      if(changed)onChange?.();
      return result;
    }).finally(()=>{flight=null;});
    return flight;
  };
  if(!api||win!==win.top){
    return Object.freeze({activeRule,navigation,read});
  }
  const ensureOverlay=()=>{
    if(host)return;
    host=doc.createElement('div');
    host.setAttribute(OWN,'picker');
    host.style.cssText='position:fixed;inset:0;z-index:2147483610;pointer-events:none';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{all:initial;pointer-events:none}' +
      '.outline{position:fixed;border:3px solid #3677e5;' +
      'background:#3677e522;box-sizing:border-box;pointer-events:none}</style>' +
      '<div class="outline" hidden></div>';
    outline=shadow.querySelector('.outline');
    doc.documentElement?.append(host);
  };
  const clearOverlay=()=>{host?.remove();host=null;outline=null;};
  function stopPick({consumeClick=false,gesture=null}={}){
    releaseClick?.();
    if(picking!==null){
      for(const type of ['pointerdown','click','contextmenu'])
        doc.removeEventListener(type,block,true);
      doc.removeEventListener('pointermove',move,true);
      doc.removeEventListener('keydown',keyHandler,true);
      picking=null;block=null;move=null;keyHandler=null;
    }
    clearOverlay();
    if(timeout!==null){win.clearTimeout(timeout);timeout=null;}
    // Consume only the selected pointer's release + compatibility mouse
    // events. A new gesture or lifecycle disposal releases the guard.
    if(consumeClick){
      const pointerId=gesture?.pointerId,otherPointers=new Set();
      let compatibility=true;
      const matches=event=>event.pointerId===undefined?
        compatibility:event.pointerId===pointerId;
      const eat=event=>{
        if(!matches(event)){
          if(['pointerup','pointercancel'].includes(event.type))
            otherPointers.delete(event.pointerId);
          return;
        }
        event.preventDefault();event.stopImmediatePropagation();
        if(['pointerup','pointercancel'].includes(event.type))
          compatibility=otherPointers.size===0;
        if(event.type==='click')releaseClick?.();
      };
      const tail=['pointerup','pointercancel','mouseup','click'];
      releaseClick=()=>{
        for(const type of tail)doc.removeEventListener(type,eat,true);
        doc.removeEventListener('pointerdown',release,true);
        doc.removeEventListener('keydown',releaseKey,true);
        releaseClick=null;
      };
      const release=event=>{
        if(event===gesture)return;
        if(!event||event.pointerId===pointerId)releaseClick?.();
        else{otherPointers.add(event.pointerId);compatibility=false;}
      };
      const releaseKey=event=>{
        if(['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock'].includes(event.key))return;
        release();
      };
      for(const type of tail)doc.addEventListener(type,eat,true);
      doc.addEventListener('pointerdown',release,true);
      doc.addEventListener('keydown',releaseKey,true);
    }
  }
  function beginPick(field,mainSelector){
    if(disposed||picking!==null)return false;
    ensureOverlay();picking=field;
    const identify=event=>{
      const hit=doc.elementFromPoint?.(event.clientX,event.clientY);
      if(!hit||!allowedNode(hit,win))return null;
      if(field==='messages'){
        const main=sole(doc,mainSelector,win);
        if(!main||!allowedNode(main,win)||!main.contains(hit))return null;
        const group=safeMessageGroupSelector(main,hit,win);
        return group?{node:group.node,selector:group.selector,count:group.count}:null;
      }
      if(field==='scroller'){
        const main=sole(doc,mainSelector,win);
        if(!main||!allowedNode(main,win)||(!hit.contains(main)&&!main.contains(hit)))return null;
        const scroller=findConversationScroller(hit,doc,win,{includeSelf:true});
        if(!scroller||(scroller!==doc.scrollingElement&&!allowedNode(scroller,win)))
          return null;
        const selector=safeUniqueSelector(doc,scroller);
        if(!selector)return null;
        const binding=resolveConfiguredConversation({
          origin:win.location.origin,pathScope:'/',mainSelector,
          scrollSelector:selector,messageSelector:'',anchorSelector:'',enabled:true
        },doc,win);
        return binding?.scroller===scroller?{node:scroller,selector}:null;
      }
      const selector=safeUniqueSelector(doc,hit);
      return selector?{node:hit,selector}:null;
    };
    move=event=>{
      const found=identify(event),r=found?.node?.getBoundingClientRect?.();
      if(outline){outline.hidden=!r;
        if(r){outline.style.left=r.left+'px';outline.style.top=r.top+'px';
          outline.style.width=r.width+'px';outline.style.height=r.height+'px';}}
    };
    block=event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type!=='pointerdown'||event.isTrusted!==true)return;
      const selected=identify(event),done=pickDone;
      pickDone=null;
      stopPick({consumeClick:true,gesture:event});
      done?.(selected?.selector?{state:'selected',field,selector:selected.selector,
        count:selected.count||1}:{state:'invalid'});
    };
    keyHandler=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();
        const done=pickDone;pickDone=null;
        stopPick();done?.({state:'cancelled'});
      }
    };
    doc.addEventListener('pointermove',move,true);
    for(const type of ['pointerdown','click','contextmenu'])
      doc.addEventListener(type,block,true);
    doc.addEventListener('keydown',keyHandler,true);
    return true;
  }
  const editor=Object.freeze({
    observe(){
      if(disposed)return {state:'closed'};
      if(pickDone||picking!==null)return {state:'busy'};
      return observeScrollSiteStructure({doc,win});
    },
    validate(rule){
      const error=validateLiveRule(rule,doc,win);
      return error?{ok:false,error}:{ok:true};
    },
    pick({field,mainSelector}={}){
      if(typeof mainSelector!=='string'||mainSelector.length>256||
        /[\u0000-\u001f\u007f{};]/.test(mainSelector)||
        !['main','scroller','messages','anchor'].includes(field))
        return Promise.resolve({state:'invalid'});
      if(disposed||pickDone||picking!==null)return Promise.resolve({state:'busy'});
      return new Promise(resolve=>{
        pickDone=resolve;
        if(!beginPick(field,mainSelector)){
          pickDone=null;resolve({state:'busy'});return;
        }
        timeout=win.setTimeout(()=>{
          if(pickDone!==resolve)return;
          pickDone=null;stopPick();resolve({state:'timeout'});
        },30000);
      });
    }
  });
  Object.defineProperty(globalThis,'__opendeskAiScrollEditorV1',
    {configurable:true,value:editor});
  owner.onDispose(()=>{
    disposed=true;
    if(globalThis.__opendeskAiScrollEditorV1===editor)
      delete globalThis.__opendeskAiScrollEditorV1;
    const done=pickDone;pickDone=null;
    stopPick();done?.({state:'closed'});
  });
  // Read the same authorized snapshot after Side Panel writes; no DOM bridge
  // or second store. Owner timers stop with the installed Page lifecycle.
  function poll(){
    if(disposed)return;
    void read().catch(()=>{}).finally(()=>{
      if(!disposed)owner.setTimeout(poll,1100);
    });
  }
  poll();
  return Object.freeze({activeRule,navigation,read});
}
