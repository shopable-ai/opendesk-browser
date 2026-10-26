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
    try{turns=[...main.querySelectorAll(rule.messageSelector)].filter(n=>shown(n,win)&&
      !n.closest?.('pre,textarea,[contenteditable]'));}catch{return null;}
    if(turns.length===0||turns.length>2000)return null;
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
const html=`<style>
:host{all:initial;color-scheme:light;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#213045}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}
.launch{position:fixed;right:16px;bottom:18px;width:34px;height:34px;border:1px solid #c9d3e2;border-radius:11px;background:#fff;color:#3c536e;box-shadow:0 3px 12px #0002;z-index:2147483598}
.launch:focus-visible,.panel button:focus-visible,.panel input:focus-visible{outline:3px solid #4c82ff;outline-offset:2px}
.panel{position:fixed;right:12px;bottom:60px;width:min(380px,calc(100vw - 24px));max-height:min(80vh,680px);overflow:auto;background:#fff;border:1px solid #d3dbe6;border-radius:16px;box-shadow:0 14px 48px #0c1a3040;padding:16px;z-index:2147483605}
.panel[hidden]{display:none}header{display:flex;align-items:center;justify-content:space-between;gap:12px}
h2{font:600 16px/1.4 inherit;margin:0}p{color:#607083;margin:7px 0 14px}
label{display:grid;gap:5px;margin:10px 0;font-weight:600}input[type=text]{width:100%;border:1px solid #c6d0df;border-radius:9px;padding:8px;color:#253449;background:#fff}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.actions button,header button{min-height:34px;border:1px solid #c9d3e2;background:#f7f9fc;border-radius:9px;color:#263750;padding:6px 10px}
.actions button.primary{background:#315fd5;color:white;border-color:#315fd5}
.actions button:disabled{opacity:.5;cursor:not-allowed}.status{min-height:22px;white-space:pre-wrap;color:#52657b}
.status[data-error="true"]{color:#b52e31}
.pick{position:fixed;inset:0;z-index:2147483610;pointer-events:none;border:0}
.pick[hidden]{display:none}.outline{position:fixed;border:3px solid #3677e5;background:#3677e522;pointer-events:none}
.check{display:flex;align-items:center;gap:8px;margin:12px 0}.check input{accent-color:#315fd5}
</style>
<button class="launch" id="launch" aria-label="打开 AI 滚动导航的网站适配设置" title="网站适配">⚙</button>
<section class="panel" id="panel" role="dialog" aria-modal="false" aria-label="AI 对话滚动导航 · 网站适配" hidden>
<header><h2>网站适配</h2><button id="close" aria-label="关闭网站适配">✕</button></header>
<p id="scope">仅在已安装且批准的网站范围中运行。保存规则不授予新网站权限。</p>
<label>路径范围<input type="text" id="path" value="/" autocomplete="off"></label>
<label>对话区域选择器<input type="text" id="main" placeholder="点击下方按钮选取" autocomplete="off"></label>
<div class="actions"><button id="pick-main">选择对话区域</button></div>
<label>滚动容器选择器<input type="text" id="scroller" placeholder="点击下方按钮选取" autocomplete="off"></label>
<div class="actions"><button id="pick-scroll">选择滚动容器</button></div>
<label>消息节点（可选）<input type="text" id="messages" placeholder="例如：article.message" autocomplete="off"></label>
<label>按钮锚点（可选）<input type="text" id="anchor" placeholder="不填则自动定位" autocomplete="off"></label>
<label class="check"><input type="checkbox" id="enabled" checked><span>启用此规则</span></label>
<div class="actions"><button id="test-top">测试顶部</button><button id="test-bottom">测试底部</button></div>
<div class="actions"><button class="primary" id="save">保存规则</button><button id="reset">删除本站规则</button><button id="reload">重新读取</button></div>
<div class="status" id="status" role="status" aria-live="polite"></div>
</section>
<div class="pick" id="pick" hidden><div class="outline" id="outline"></div></div>`;
export function installVisualSiteConfiguration({doc,win,owner,api,onChange}){
  let current={version:1,sites:[]},etag='0',busy=false,closed=false,loaded=false,testing={top:false,bottom:false},selecting=null,resetArmed=false;
  let operationEpoch=0,readFlight=null,readRequired=false;
  const host=doc.createElement('div');
  host.setAttribute(OWN,'settings');
  host.style.cssText='position:fixed;z-index:2147483604;pointer-events:none';
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=html;
  const el=id=>shadow.getElementById(id);
  el('launch').style.pointerEvents='auto';
  el('panel').style.pointerEvents='auto';
  const say=(message,error=false)=>{el('status').textContent=message;el('status').dataset.error=String(error);};
  const invalidate=()=>{testing={top:false,bottom:false};resetArmed=false;};
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
    el('enabled').checked=r?.enabled??true;invalidate();
  };
  const lock=()=>{for(const id of [...fields,'save','reset','reload','test-top','test-bottom','pick-main','pick-scroll'])
    el(id).disabled=busy;};
  function read({repaint=true}={}){
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
        current=reply.value;etag=reply.etag;loaded=true;readRequired=false;
        if(repaint)fill();
        say('已从可信 Host 读取 · '+current.sites.length+' 条规则');
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
    const existing=current.sites.find(item=>item.origin===rule.origin&&item.pathScope===rule.pathScope);
    const disablingExisting=!rule.enabled&&existing&&
      ['mainSelector','scrollSelector','messageSelector','anchorSelector'].every(key=>existing[key]===rule[key]);
    if(!remove&&!disablingExisting&&(!testing.top||!testing.bottom)){say('保存前请分别测试顶部和底部。',true);return;}
    if(!remove&&!disablingExisting){
      const binding=resolveConfiguredConversation({...rule,enabled:true},doc,win);
      if(!['top','bottom'].every(edge=>testing[edge].href===win.location.href&&
          testing[edge].draft===JSON.stringify(rule)&&sameTargets(testing[edge].binding,binding))){
        invalidate();say('页面或目标已变化，请重新测试顶部和底部。',true);return;
      }
    }
    const candidate={version:1,sites:current.sites.filter(r=>
      !(r.origin===rule.origin&&r.pathScope===rule.pathScope))};
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
    el('scope').textContent='当前网站：'+win.location.origin+
      '。规则仅在原安装批准的网站执行；其他网站必须先经过扩权升级审阅。';
  };
  let guide=null,block=null,move=null,keys=null,releaseClick=null;
  function stopPick({consumeClick=false}={}){
    releaseClick?.();
    if(!selecting)return;
    for(const event of ['pointerdown','click','contextmenu'])doc.removeEventListener(event,block,true);
    doc.removeEventListener('pointermove',move,true);
    doc.removeEventListener('keydown',keys,true);
    selecting=null;guide=null;el('pick').hidden=true;
    // The pointerdown that selected a DOM node can still produce a click.
    // Consume it so a website button/link never activates while picking.
    if(consumeClick){
      const eat=event=>{event.preventDefault();event.stopImmediatePropagation();releaseClick?.();};
      releaseClick=()=>{
        doc.removeEventListener('click',eat,true);
        doc.removeEventListener('pointerdown',release,true);
        doc.removeEventListener('keydown',releaseKey,true);
        releaseClick=null;
      };
      const release=()=>releaseClick?.();
      const releaseKey=event=>{
        if(['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock'].includes(event.key))return;
        release();
      };
      doc.addEventListener('click',eat,true);
      // A held pointer may release after an arbitrary delay. Keep capture
      // until its click, a new intentional gesture, or lifecycle disposal.
      doc.addEventListener('pointerdown',release,true);
      doc.addEventListener('keydown',releaseKey,true);
    }
  }
  function beginPick(field){
    if(busy||selecting)return;
    el('panel').hidden=true;
    selecting=field;el('pick').hidden=false;
    const identify=event=>{
      const node=doc.elementFromPoint?.(event.clientX,event.clientY);
      if(!node||!allowedNode(node,win))return null;
      if(field==='scroller'){
        const main=sole(doc,el('main').value,win);
        if(!main||!allowedNode(main,win)||(!node.contains(main)&&!main.contains(node)))return null;
        const scroller=findConversationScroller(node,doc,win,{includeSelf:true});
        // Roots are valid only when the browser identifies the real document
        // scrollport. Never turn an arbitrary body into a fallback selection.
        if(!scroller||(scroller!==doc.scrollingElement&&!allowedNode(scroller,win)))return null;
        const selector=safeUniqueSelector(doc,scroller);
        if(!selector)return null;
        const binding=resolveConfiguredConversation({...draft(),enabled:true,scrollSelector:selector},doc,win);
        return binding?.scroller===scroller?scroller:null;
      }
      return node;
    };
    move=event=>{
      guide=identify(event);
      const r=guide?.getBoundingClientRect?.();
      const outline=el('outline');
      outline.style.display=r?'block':'none';
      if(r){outline.style.left=r.left+'px';outline.style.top=r.top+'px';
        outline.style.width=r.width+'px';outline.style.height=r.height+'px';}
    };
    block=event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(event.type!=='pointerdown'||event.isTrusted!==true)return;
      const node=identify(event),selector=node&&safeUniqueSelector(doc,node);
      stopPick({consumeClick:true});el('panel').hidden=false;
      if(!selector){say('未找到唯一且可见的目标；请重新选择。',true);return;}
      el(field).value=selector;invalidate();say('已选取目标：'+selector);
    };
    keys=event=>{if(event.key==='Escape'){event.preventDefault();stopPick();
      el('panel').hidden=false;el('pick-'+(field==='main'?'main':'scroll')).focus();}};
    doc.addEventListener('pointermove',move,true);
    for(const event of ['pointerdown','click','contextmenu'])doc.addEventListener(event,block,true);
    doc.addEventListener('keydown',keys,true);
  }
  function testEdge(direction){
    if(busy)return;
    const binding=resolveConfiguredConversation({...draft(),enabled:true},doc,win);
    if(!binding){invalidate();say('当前选择器无法唯一匹配真实对话区域与滚动容器。',true);return;}
    const valid=scrollConfiguredEdge(binding,direction,doc,win);
    if(!valid){invalidate();say('滚动未确认或当前没有有效滚动距离；不得保存未经测试的规则。',true);return;}
    testing[direction]={binding,href:win.location.href,draft:JSON.stringify(draft())};say((direction==='top'?'顶部':'底部')+'已执行并确认滚动位置。'+
      (testing.top&&testing.bottom?' 可以保存。':' 请继续测试另一个方向。'));
  }
  owner.on(el('launch'),'click',event=>{if(event.isTrusted!==true)return;
    statusScope();el('panel').hidden=false;el('close').focus();if(!loaded&&!readRequired)void read();});
  owner.on(el('close'),'click',event=>{if(!event.isTrusted)return;stopPick();el('panel').hidden=true;el('launch').focus();});
  for(const id of fields)owner.on(el(id),'input',invalidate);
  owner.on(el('pick-main'),'click',e=>{if(e.isTrusted)beginPick('main');});
  owner.on(el('pick-scroll'),'click',e=>{if(e.isTrusted)beginPick('scroller');});
  owner.on(el('test-top'),'click',e=>{if(e.isTrusted)testEdge('top');});
  owner.on(el('test-bottom'),'click',e=>{if(e.isTrusted)testEdge('bottom');});
  owner.on(el('save'),'click',e=>{if(e.isTrusted)void save();});
  owner.on(el('reset'),'click',e=>{if(!e.isTrusted)return;
    if(!resetArmed){resetArmed=true;say('再次点击「删除本站规则」以确认；其他规则保留。');return;}
    void save(true);
  });
  owner.on(el('reload'),'click',e=>{if(e.isTrusted&&!busy)void read();});
  owner.on(doc,'keydown',event=>{if(event.key==='Escape'&&!selecting&&!el('panel').hidden){
    el('panel').hidden=true;el('launch').focus();}});
  owner.onDispose(()=>{closed=true;++operationEpoch;stopPick();host.remove();});
  if(!closed)doc.documentElement?.append(host);
  void read();
  return Object.freeze({activeRule,read});
}
