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
function safeUniqueSelector(doc,node){
  const unique=selector=>{try{return doc.querySelectorAll(selector).length===1&&
    doc.querySelector(selector)===node;}catch{return false;}};
  const css=globalThis.CSS?.escape||((value)=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c));
  if(node.id){const s='#'+css(node.id);if(unique(s))return s;}
  for(const attr of ['data-testid','data-id','aria-label']){
    const value=node.getAttribute?.(attr);
    if(value&&value.length<=80&&!/["\\\u0000-\u001f]/.test(value)){
      const s='['+attr+'="'+value+'"]';
      if(unique(s))return s;
    }
  }
  let parts=[],current=node;
  for(let depth=0;depth<8&&current&&current.nodeType===1;depth++,current=current.parentElement){
    let item=current.tagName.toLowerCase();
    const siblings=[...(current.parentElement?.children||[])].filter(n=>n.tagName===current.tagName);
    if(siblings.length>1)item+=':nth-of-type('+([...current.parentElement.children].filter(n=>
      n.tagName===current.tagName).indexOf(current)+1)+')';
    parts.unshift(item);
    const s=parts.join(' > ');
    if(unique(s))return s;
  }
  return null;
}

function safeMessageGroupSelector(main,hit,win){
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
    for(const [name,weight] of [['data-testid',125],['data-role',120],['role',115]]){
      const value=node.getAttribute?.(name);
      if(value&&value.length<=80&&!/["\\\u0000-\u001f]/.test(value)&&
          /(message|turn|chat|response|assistant|user|article|bubble|reply|listitem)/i.test(value))
        probes.push(['['+name+'="'+value+'"]',weight]);
    }
    if(tag==='article')probes.push(['article',130]);
    if(tag==='li')probes.push(['li',65]);
    for(const cls of [...(node.classList||[])].slice(0,6)){
      if(!/^[a-zA-Z_][a-zA-Z0-9_-]{1,63}$/.test(cls))continue;
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
  const binding=resolveConfiguredConversation({...rule,enabled:true},doc,win);
  if(!binding)return '选择器未匹配到唯一、可见且共用滚动区域的真实对话；请检查四项 CSS。';
  if(!(binding.scroller.scrollHeight-binding.scroller.clientHeight>1))
    return '滚动容器没有实际可滚动距离，请在较长对话中核对后保存。';
  return null;
}

const html=`<style>
:host{all:initial;color-scheme:light;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#213045}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
.launch{position:fixed;right:16px;bottom:18px;width:34px;height:34px;border:1px solid #c9d3e2;border-radius:11px;background:#fff;color:#3c536e;box-shadow:0 3px 12px #0002;z-index:2147483598}
.launch:focus-visible,.panel button:focus-visible,.panel input:focus-visible{outline:3px solid #4c82ff;outline-offset:2px}
.panel{position:fixed;right:12px;bottom:60px;width:min(380px,calc(100vw - 24px));max-height:min(80vh,680px);overflow:auto;background:#fff;border:1px solid #d3dbe6;border-radius:16px;box-shadow:0 14px 48px #0c1a3040;padding:16px;z-index:2147483605}
.panel[hidden]{display:none}header{display:flex;align-items:center;justify-content:space-between;gap:12px}
h2{font:600 16px/1.4 inherit;margin:0}p{color:#607083;margin:7px 0 10px}
label{display:grid;gap:5px;margin:10px 0;font-weight:600}input[type=text]{width:100%;border:1px solid #c6d0df;border-radius:9px;padding:8px;color:#253449;background:#fff}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.selector-line,.url-line,.header-actions{display:flex;align-items:center;gap:8px}
.selector-line input,.url-line input{min-width:0;flex:1}
.pick-btn,.header-actions button{width:36px;min-width:36px;height:36px;min-height:36px;padding:0;display:grid;place-items:center;border:1px solid #c9d3e2;border-radius:9px;background:#f7f9fc;color:#263750}
.pick-btn svg,.header-actions svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8;fill:none}
.header-actions button{border-color:transparent;background:transparent}
.current-tag{color:#607083;font-size:12px}
input[readonly]{background:#f4f6f9;color:#64738b}
.footer{display:flex;justify-content:flex-end;border-top:1px solid #e3e8ef;padding-top:10px}
.footer .primary{min-height:36px;padding:7px 18px;border:1px solid #315fd5;border-radius:9px;background:#315fd5;color:#fff;font-weight:650}
.status:empty{display:none}
@media(pointer:coarse){.pick-btn,.header-actions button{width:44px;min-width:44px;height:44px;min-height:44px}}
@media(prefers-color-scheme:dark){
:host{color-scheme:dark;color:#e5ebf4}.panel,.launch{background:#1a2636;color:#e5ebf4;border-color:#485971}
.panel input[type=text]{background:#1d2b3b;color:#e5ebf4;border-color:#52627a}
.panel input[readonly],.panel button:not(.primary){background:#293a50;color:#dce5f3;border-color:#51617a}
.panel p,.current-tag{color:#a9b7cb}.footer{border-color:#40516a}.status{color:#bbcadc}
.status[data-error="true"]{color:#ff9b9f}
}.actions button,header button{min-height:34px;border:1px solid #c9d3e2;background:#f7f9fc;border-radius:9px;color:#263750;padding:6px 10px}
.actions button.primary{background:#315fd5;color:white;border-color:#315fd5}
.actions button:disabled{opacity:.5;cursor:not-allowed}.status{min-height:22px;white-space:pre-wrap;color:#52657b}
.status[data-error="true"]{color:#b52e31}
.pick{position:fixed;inset:0;z-index:2147483610;pointer-events:none;border:0}
.pick[hidden]{display:none}.outline{position:fixed;border:3px solid #3677e5;background:#3677e522;pointer-events:none}
.check{display:flex;align-items:center;gap:8px;margin:12px 0}.check input{accent-color:#315fd5}
</style>
<button class="launch" id="launch" aria-label="打开 AI 滚动导航的网站适配设置" title="网站适配">⚙</button>
<section class="panel" id="panel" role="dialog" aria-modal="false" aria-label="AI 对话滚动导航 · 网站适配" hidden>
<header><h2>网站适配</h2><div class="header-actions">
<button id="reload" aria-label="重新读取网站规则" title="重新读取">↻</button>
<button id="reset" aria-label="删除本站规则" title="删除本站规则"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M5 6l1 14h12l1-14M10 9v7M14 9v7"/></svg></button>
<button id="close" aria-label="关闭网站适配" title="关闭">×</button></div></header>
<p id="scope">其他网站请先在扩展中心审阅权限。</p>
<label>网站地址<div class="url-line"><input type="text" id="site-url" readonly aria-label="当前已授权网站地址"><span class="current-tag">当前页</span></div></label>
<label>路径范围<input type="text" id="path" value="/" autocomplete="off"></label>
<label>对话主区域<div class="selector-line"><input type="text" id="main" placeholder="CSS 或点选" autocomplete="off" spellcheck="false" aria-required="true"><button class="pick-btn" type="button" id="pick-main" aria-label="在网页点选对话主区域" title="点选对话主区域"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg></button></div></label>
<label>滚动容器<div class="selector-line"><input type="text" id="scroller" placeholder="CSS 或点选" autocomplete="off" spellcheck="false" aria-required="true"><button class="pick-btn" type="button" id="pick-scroll" aria-label="在网页点选滚动容器" title="点选滚动容器"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg></button></div></label>
<label>消息节点（可选）<div class="selector-line"><input type="text" id="messages" placeholder="CSS 或点选" autocomplete="off" spellcheck="false"><button class="pick-btn" type="button" id="pick-messages" aria-label="在网页点选消息节点" title="点选消息节点"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg></button></div></label>
<label>按钮锚点（可选）<div class="selector-line"><input type="text" id="anchor" placeholder="不填则自动定位" autocomplete="off" spellcheck="false"><button class="pick-btn" type="button" id="pick-anchor" aria-label="在网页点选按钮锚点" title="点选按钮锚点"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/></svg></button></div></label>
<label class="check"><input type="checkbox" id="enabled" checked><span>启用此规则</span></label>
<div class="footer"><button class="primary" id="save">保存网站</button></div>
<div class="status" id="status" role="status" aria-live="polite"></div>
</section>
<div class="pick" id="pick" hidden><div class="outline" id="outline"></div></div>`;
export function installVisualSiteConfiguration({doc,win,owner,api,onChange}){
  let current={version:1,sites:[]},etag='0',busy=false,closed=false,loaded=false,selecting=null,resetArmed=false,editingKey=null;
  let operationEpoch=0,readFlight=null,readRequired=false;
  // A one-shot selection response is visible only to the installed USER_SCRIPT
  // world. The page and React never receive a general messaging capability.
  let sidebarPickDone=null;
  const host=doc.createElement('div');
  host.setAttribute(OWN,'settings');
  host.style.cssText='position:fixed;z-index:2147483604;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=html;
  const el=id=>shadow.getElementById(id);
  el('launch').style.pointerEvents='auto';
  el('panel').style.pointerEvents='auto';
  el('site-url').value=win.location.origin;
  const say=(message,error=false)=>{el('status').textContent=message;el('status').dataset.error=String(error);};
  const invalidate=()=>{resetArmed=false;};
  const activeRule=()=>applicableRule(current,win.location.href);
  const draft=()=>({origin:win.location.origin,pathScope:el('path').value.trim()||'/',
    mainSelector:el('main').value.trim(),scrollSelector:el('scroller').value.trim(),
    messageSelector:el('messages').value.trim(),anchorSelector:el('anchor').value.trim(),
    enabled:el('enabled').checked});
  const fields=['path','main','scroller','messages','anchor','enabled'];
  const fill=()=>{
    let url;try{url=new URL(win.location.href);}catch{}
    const r=current.sites.filter(item=>item.origin===url?.origin&&
      (item.pathScope==='/'||url.pathname===item.pathScope||
        url.pathname.startsWith(item.pathScope.endsWith('/')?item.pathScope:item.pathScope+'/')))
      .sort((a,b)=>b.pathScope.length-a.pathScope.length)[0];
    el('path').value=r?.pathScope||'/';
    el('main').value=r?.mainSelector||'';
    el('scroller').value=r?.scrollSelector||'';
    el('messages').value=r?.messageSelector||'';
    el('anchor').value=r?.anchorSelector||'';
    el('enabled').checked=r?.enabled??true;
    editingKey=r?r.origin+'\n'+r.pathScope:null;invalidate();
  };
  const lock=()=>{for(const id of [...fields,'save','reset','reload','pick-main','pick-scroll','pick-messages','pick-anchor'])
    el(id).disabled=busy;};
  function read({repaint=true,notice=false}={}){
    if(readFlight)return readFlight;
    if(closed||busy)return Promise.resolve();
    if(!api){say('当前安装没有配置能力。请通过原扩展中心审阅升级。',true);return Promise.resolve();}
    const epoch=++operationEpoch;
    busy=true;loaded=false;lock();
    readFlight=Promise.resolve().then(async()=>{
      try{
        const reply=await api.read();
        if(closed||epoch!==operationEpoch)return;
        if(!reply||reply.value?.version!==1||!Array.isArray(reply.value.sites)||
            typeof reply.etag!=='string')throw Error('可信配置读回格式错误');
        const preserveDraft=readRequired;
        current=reply.value;etag=reply.etag;loaded=true;readRequired=false;
        if(repaint&&!preserveDraft)fill();
        say(preserveDraft?'已从可信 Host 读取；草稿已保留，请核对后决定是否保存。':
          notice?'已从可信 Host 读取 · '+current.sites.length+' 条规则':'');
        onChange?.();
      }catch(e){
        if(!closed&&epoch===operationEpoch)say('读取失败：'+(e.code||e.message)+'。未修改已有规则。',true);
      }finally{
        if(epoch===operationEpoch){readFlight=null;busy=false;if(!closed)lock();}
      }
    });
    return readFlight;
  }
  async function save(remove=false){
    if(busy||!loaded)return;
    const rule=draft();
    const key=rule.origin+'\n'+rule.pathScope;
    const source=editingKey?current.sites.find(r=>r.origin+'\n'+r.pathScope===editingKey):null;
    const target=current.sites.find(r=>r.origin===rule.origin&&r.pathScope===rule.pathScope);
    if(editingKey&&!source){say('原网站规则已发生变化，请重新读取核对。',true);return;}
    if(!remove&&source&&editingKey!==key&&target){
      say('适用路径已经存在另一条规则，不能直接覆盖。',true);return;
    }
    const disablingExisting=!rule.enabled&&source&&
      ['mainSelector','scrollSelector','messageSelector','anchorSelector'].every(name=>source[name]===rule[name]);
    if(remove&&!source&&!target){say('当前路径没有已保存的网站规则。',true);return;}
    if(!remove&&!disablingExisting){
      // Validation never scrolls the page; existing trusted CAS remains below.
      const error=validateLiveRule(rule,doc,win);
      if(error){say(error,true);return;}
    }
    const candidate={version:1,sites:current.sites.filter(r=>{
      const storedKey=r.origin+'\n'+r.pathScope;
      return remove?storedKey!==(editingKey||key):
        storedKey!==key&&storedKey!==editingKey;
    })};
    if(!remove)candidate.sites.push(rule);
    const epoch=++operationEpoch;
    busy=true;loaded=false;readRequired=true;lock();
    // A lost write/confirmation may already have persisted. Require an explicit
    // read before another attempt rather than replaying an unknown effect.
    try{
      const reply=await api.write(candidate,etag);
      if(closed||epoch!==operationEpoch)return;
      if(typeof reply?.etag!=='string'||JSON.stringify(reply.value)!==JSON.stringify(candidate))
        throw Object.assign(Error('写入回执不完整'),{code:'E_CONFIG_UNKNOWN'});
      const confirmed=await api.read();
      if(closed||epoch!==operationEpoch)return;
      if(confirmed?.etag!==reply.etag||JSON.stringify(confirmed.value)!==JSON.stringify(reply.value))
        throw Object.assign(Error('保存后的真实读回不一致；请重新读取核对'),{code:'E_CONFIG_UNKNOWN'});
      if(closed)return;
      current=confirmed.value;etag=confirmed.etag;loaded=true;readRequired=false;
      fill();say(remove?'已删除本站规则并确认持久化。':'已保存并从可信 Host 确认，刷新后仍可恢复。');
      onChange?.();
    }catch(e){if(!closed&&epoch===operationEpoch)say('未确认保存：'+(e.code||e.message)+
      '。当前草稿保留；请先重新读取核对，再决定是否保存。',true);}
    finally{if(epoch===operationEpoch){busy=false;if(!closed)lock();}}
  }
  const statusScope=()=>{
    el('site-url').value=win.location.origin;
    el('scope').textContent='仅配置当前已授权网站；其他网站请先在扩展中心审阅权限。';
  };
  let guide=null,block=null,move=null,keys=null,releaseClick=null;
  function stopPick({consumeClick=false,gesture=null}={}){
    releaseClick?.();
    if(!selecting)return;
    for(const event of ['pointerdown','click','contextmenu'])doc.removeEventListener(event,block,true);
    doc.removeEventListener('pointermove',move,true);
    doc.removeEventListener('keydown',keys,true);
    selecting=null;guide=null;el('pick').hidden=true;
    // Keep the selected pointer's release and compatibility tail out of the
    // page, without swallowing another pointer's independent gesture.
    if(consumeClick){
      const pointerId=gesture?.pointerId;
      const otherPointers=new Set();
      let compatibility=true;
      const matches=event=>event.pointerId===undefined
        ? compatibility : event.pointerId===pointerId;
      const eat=event=>{
        if(!matches(event)){
          if(event.type==='pointerup'||event.type==='pointercancel')otherPointers.delete(event.pointerId);
          return;
        }
        event.preventDefault();event.stopImmediatePropagation();
        if(event.type==='pointerup'||event.type==='pointercancel')compatibility=otherPointers.size===0;
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
        else {otherPointers.add(event.pointerId);compatibility=false;}
      };
      const releaseKey=event=>{
        if(['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock'].includes(event.key))return;
        release();
      };
      for(const type of tail)doc.addEventListener(type,eat,true);
      // A held pointer may release after an arbitrary delay. Keep capture
      // until its click, a new intentional gesture, or lifecycle disposal.
      doc.addEventListener('pointerdown',release,true);
      doc.addEventListener('keydown',releaseKey,true);
    }
  }
  function beginPick(field,{external=false,mainSelector=''}={}){
    if(busy||selecting||!['main','scroller','messages','anchor'].includes(field))return false;
    if(external&&typeof mainSelector==='string')el('main').value=mainSelector;
    el('panel').hidden=true;selecting=field;el('pick').hidden=false;
    const identify=event=>{
      const hit=doc.elementFromPoint?.(event.clientX,event.clientY);
      if(!hit||!allowedNode(hit,win))return null;
      if(field==='messages'){
        const main=sole(doc,el('main').value,win);
        if(!main||!allowedNode(main,win)||!main.contains(hit))return null;
        const group=safeMessageGroupSelector(main,hit,win);
        return group?{node:group.node,selector:group.selector,count:group.count}:null;
      }
      if(field==='scroller'){
        const main=sole(doc,el('main').value,win);
        if(!main||!allowedNode(main,win)||(!hit.contains(main)&&!main.contains(hit)))return null;
        const scroller=findConversationScroller(hit,doc,win,{includeSelf:true});
        if(!scroller||(scroller!==doc.scrollingElement&&!allowedNode(scroller,win)))return null;
        const selector=safeUniqueSelector(doc,scroller);
        if(!selector)return null;
        const binding=resolveConfiguredConversation({...draft(),enabled:true,scrollSelector:selector,
          messageSelector:'',anchorSelector:''},doc,win);
        return binding?.scroller===scroller?{node:scroller,selector}:null;
      }
      const selector=safeUniqueSelector(doc,hit);
      return selector?{node:hit,selector}:null;
    };
    move=event=>{
      guide=identify(event);
      const r=guide?.node?.getBoundingClientRect?.();
      const outline=el('outline');
      outline.style.display=r?'block':'none';
      if(r){outline.style.left=r.left+'px';outline.style.top=r.top+'px';
        outline.style.width=r.width+'px';outline.style.height=r.height+'px';}
    };
    block=event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type!=='pointerdown'||event.isTrusted!==true)return;
      const selected=identify(event);
      const done=sidebarPickDone;sidebarPickDone=null;
      stopPick({consumeClick:true,gesture:event});el('panel').hidden=Boolean(done);
      if(!selected?.selector){
        say('未找到符合要求的可见目标；请重新选择。',true);
        done?.({state:'invalid'});return;
      }
      el(field).value=selected.selector;invalidate();
      say(field==='messages'?'已选取 '+selected.count+' 个消息节点；保存时会验证滚动范围。':
        '已选取目标：'+selected.selector);
      done?.({state:'selected',field,selector:selected.selector,count:selected.count||1});
    };
    keys=event=>{if(event.key==='Escape'){
      event.preventDefault();
      const done=sidebarPickDone;sidebarPickDone=null;
      stopPick();el('panel').hidden=Boolean(done);
      done?.({state:'cancelled'});
      if(!done)el(field==='scroller'?'pick-scroll':'pick-'+field).focus();
    }};
    doc.addEventListener('pointermove',move,true);
    for(const event of ['pointerdown','click','contextmenu'])doc.addEventListener(event,block,true);
    doc.addEventListener('keydown',keys,true);
    return true;
  }
  // Only the original exact-document Installed Page executor can access this
  // object in its isolated USER_SCRIPT world. No window.postMessage or DOM
  // bridge is introduced and the original picker owns the pointer listeners.
  if(api&&win===win.top){
    const editor=Object.freeze({
      validate(rule){
        const error=validateLiveRule(rule,doc,win);
        return error?{ok:false,error}:{ok:true};
      },
      pick({field,mainSelector}={}){
        if(typeof mainSelector!=='string'||mainSelector.length>256||
            /[\u0000-\u001f\u007f{};]/.test(mainSelector)||
            !['main','scroller','messages','anchor'].includes(field))
          return Promise.resolve({state:'invalid'});
        if(closed||sidebarPickDone||busy||selecting)
          return Promise.resolve({state:'busy'});
        return new Promise(resolve=>{
          let timeout=null;
          const finish=value=>{
            if(timeout!==null)win.clearTimeout(timeout);
            resolve(value);
          };
          sidebarPickDone=finish;
          if(!beginPick(field,{external:true,mainSelector})){
            sidebarPickDone=null;finish({state:'busy'});return;
          }
          timeout=win.setTimeout(()=>{
            if(sidebarPickDone!==finish)return;
            sidebarPickDone=null;stopPick();el('panel').hidden=true;
            finish({state:'timeout'});
          },30000);
        });
      }
    });
    Object.defineProperty(globalThis,'__opendeskAiScrollEditorV1',
      {configurable:true,value:editor});
    owner.onDispose(()=>{
      if(globalThis.__opendeskAiScrollEditorV1===editor)
        delete globalThis.__opendeskAiScrollEditorV1;
      const done=sidebarPickDone;sidebarPickDone=null;
      done?.({state:'closed'});
    });
  }
  owner.on(el('launch'),'click',event=>{if(event.isTrusted!==true)return;
    statusScope();el('panel').hidden=false;el('close').focus();if(!loaded&&!readRequired)void read();});
  owner.on(el('close'),'click',event=>{if(!event.isTrusted)return;stopPick();el('panel').hidden=true;el('launch').focus();});
  for(const id of fields)owner.on(el(id),'input',invalidate);
  owner.on(el('pick-main'),'click',e=>{if(e.isTrusted)beginPick('main');});
  owner.on(el('pick-scroll'),'click',e=>{if(e.isTrusted)beginPick('scroller');});
  owner.on(el('pick-messages'),'click',e=>{if(e.isTrusted)beginPick('messages');});
  owner.on(el('pick-anchor'),'click',e=>{if(e.isTrusted)beginPick('anchor');});
  owner.on(el('save'),'click',e=>{if(e.isTrusted)void save();});
  owner.on(el('reset'),'click',e=>{if(!e.isTrusted)return;
    if(!resetArmed){resetArmed=true;say('再次点击「删除本站规则」以确认；其他规则保留。');return;}
    void save(true);
  });
  owner.on(el('reload'),'click',e=>{if(e.isTrusted&&!busy)void read({notice:true});});
  owner.on(doc,'keydown',event=>{if(event.key==='Escape'&&!selecting&&!el('panel').hidden){
    el('panel').hidden=true;el('launch').focus();}});
  owner.onDispose(()=>{closed=true;++operationEpoch;stopPick();host.remove();});
  if(!closed)doc.documentElement?.append(host);
  void read();
  return Object.freeze({activeRule,read});
}
