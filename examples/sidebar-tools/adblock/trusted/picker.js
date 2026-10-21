// Manual element selection is a fixed first-party ISOLATED-world page action.
// Only a real user click on the actual page can send a selector to the existing
// trusted AdBlock worker. The worker owns storage and installation authority.
import {ADBLOCK_PAGE_PROTOCOL,adblockHost} from './policy.js';
import {ADBLOCK_COSMETIC_PICK_TTL_MS,validCosmeticSelector} from './cosmetic-policy.js';

const SAFE_ID=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ROOT_ID=/^(?:app|root|__next|__nuxt|main|application|site-root)$/i;
const ROOT_TAG=new Set(['html','body','head','main','nav','form']);
const UI='data-opendesk-adblock-picker';
export function adblockElementSelector(node,doc=globalThis.document){
  if(!node||node.nodeType!==1||node===doc.body||node===doc.documentElement||
     ROOT_TAG.has(node.localName)||ROOT_ID.test(node.id||'')||
     node.getAttribute?.('role')==='main'||node.hasAttribute?.('data-reactroot'))return null;
  const path=[];let current=node;
  while(current&&current!==doc.body&&path.length<12){
    const tag=current.localName;
    if(!/^[a-z][a-z0-9-]{0,31}$/.test(tag)||!current.parentElement)return null;
    if(SAFE_ID.test(current.id||'')&&doc.querySelectorAll('#'+current.id).length===1){
      path.unshift('#'+current.id);
      const selector=path.join(' > ');
      return validCosmeticSelector(selector)?selector:null;
    }
    let index=1;
    for(let sibling=current.previousElementSibling;sibling;sibling=sibling.previousElementSibling)
      if(sibling.localName===tag)index++;
    if(index>999)return null;
    path.unshift(tag+':nth-of-type('+index+')');
    current=current.parentElement;
  }
  if(current!==doc.body)return null;
  const selector=path.join(' > ');
  return validCosmeticSelector(selector)?selector:null;
}
export function createAdblockElementPicker({
  api=globalThis.chrome,doc=globalThis.document,win=globalThis.window,
  onPending=()=>{},onSaved=()=>{},onUndone=()=>{},onRefresh=()=>{},onFeedback=()=>{}
}={}){
  let picking=false,marker=null,hover=null,disposed=false,pending=false,pickTimer=null;
  const guard=node=>Boolean(node?.closest?.('['+UI+']'));
  const request=async(type,selector)=>{
    const body={protocol:ADBLOCK_PAGE_PROTOCOL,type};
    if(selector)body.selector=selector;
    let timer;
    try{
      const response=await Promise.race([
        api.runtime.sendMessage(body),
        new Promise((_,reject)=>{timer=win.setTimeout(()=>reject(Error('后台回执超时')),3000);})
      ]);
      if(response?.ok!==true)throw Error(response?.error?.message||'无法确认网页隐藏规则');
      if(type==='hide'&&(response.data?.saved!==true||response.data.selector!==selector||
         response.data.host!==adblockHost(win.location?.href,{asUrl:true}))||
         type==='undo'&&response.data?.restored!==true)
        throw Error('后台写入回执不完整');
      return response.data;
    }finally{if(timer!==undefined)win.clearTimeout(timer);}
  };
  // A lost acknowledgement says nothing about the committed storage value.
  // Ask the same trusted worker once; never replay hide/undo automatically.
  async function confirm(selector){
    try{
      const value=await request('lookup',selector);
      if(value?.version!==1||value.selector!==selector||
         value.host!==adblockHost(win.location?.href,{asUrl:true})||
         typeof value.present!=='boolean')return null;
      return value.present;
    }catch{return null;}
  }
  async function uncertain(selector,operation){
    const present=await confirm(selector);
    if(disposed)return;
    if(present===true){
      onSaved(selector);
      message(operation==='hide'?'已核对：隐藏规则已保存':'已核对：规则仍存在，尚未撤销');
    }else if(present===false){
      onUndone(selector);
      message(operation==='hide'?'已核对：规则不存在，未保存':'已核对：规则已删除，已撤销');
    }else{
      message('无法确认'+(operation==='hide'?'保存':'撤销')+'结果，请稍后查看屏蔽列表；未自动重试');
    }
  }
  // Feedback is reported out-of-band; the target webpage has NO user-facing
  // status, toast, undo button or cancellation controls.
  function message(text){onFeedback(text);}
  function end(){
    if(pickTimer!==null){win.clearTimeout(pickTimer);pickTimer=null;}
    picking=false;hover=null;marker?.remove();marker=null;
    for(const type of ['pointermove','click','keydown'])doc.removeEventListener(type,event,true);
  }
  function targetOf(value){
    if(!value||value.nodeType!==1||guard(value))return null;
    const fit=el=>{
      if(!el||el===doc.body||el===doc.documentElement||
         ROOT_TAG.has(el.localName)||ROOT_ID.test(el.id||'')||
         el.getAttribute?.('role')==='main'||el.hasAttribute?.('data-reactroot'))
        return false;
      const rect=el.getBoundingClientRect();
      return rect.width>20&&rect.height>10&&
        rect.width*rect.height<win.innerWidth*win.innerHeight*0.66&&
        !(rect.width>win.innerWidth*0.88&&rect.height>win.innerHeight*0.5);
    };
    // Only expand to an explicitly ad-like ancestor. A generic <article>,
    // <section> or application layout must never be auto-selected.
    let el=null,current=value;
    for(let depth=0;current&&depth<4;depth++,current=current.parentElement){
      const hint=((current.id||'')+' '+(typeof current.className==='string'?
        current.className:'')+' '+(current.getAttribute?.('aria-label')||'')).toLowerCase();
      if(/(?:^|[\s_-])(?:ad|ads|advert|advertisement|banner|sponsor|sponsored|promo|promotion)(?:$|[\s_-])/.test(hint)&&
         fit(current)&&adblockElementSelector(current,doc)){el=current;break;}
      if(ROOT_TAG.has(current.localName)||ROOT_ID.test(current.id||''))break;
    }
    if(!el){
      let candidate=value;
      for(let depth=0;candidate&&depth<4;depth++,candidate=candidate.parentElement){
        if((depth===0||['div','li','figure','aside'].includes(candidate.localName))&&
           fit(candidate)&&adblockElementSelector(candidate,doc)){
          el=candidate;
          if(['div','li','figure','aside'].includes(candidate.localName))break;
        }
        if(ROOT_TAG.has(candidate.localName)||ROOT_ID.test(candidate.id||''))break;
      }
    }
    return el;
  }
  function mark(target){
    if(!target){marker?.remove();marker=null;return;}
    if(!marker||!marker.isConnected){
      marker=doc.createElement('div');marker.setAttribute(UI,'');
      marker.style.cssText='position:fixed!important;pointer-events:none!important;z-index:2147483646!important;border:2px solid #3675ef!important;border-radius:5px!important;box-sizing:border-box!important;background:#4a80ed25!important';
      doc.documentElement.append(marker);
    }
    const r=target.getBoundingClientRect();
    marker.style.left=r.left+'px';marker.style.top=r.top+'px';
    marker.style.width=r.width+'px';marker.style.height=r.height+'px';
  }
  async function commit(target){
    const selector=adblockElementSelector(target,doc);
    if(!selector){message('无法定位该区域，请换一个位置');return;}
    end();pending=true;onPending(selector);
    message('正在保存…');
    try{
      await request('hide',selector);
      if(disposed)return;
      onSaved(selector);
      message('已隐藏并保存，下次访问自动隐藏');
      onRefresh();
    }catch{
      await uncertain(selector,'hide');
      onRefresh();
    }finally{
      onPending(null);pending=false;
    }
  }
  function event(e){
    if(!picking||disposed)return;
    if(e.type==='keydown'){
      if(e.key==='Escape'&&e.isTrusted){e.preventDefault();end();
        void request('cancel').catch(()=>{});}
      return;
    }
    const target=targetOf(e.target);
    if(e.type==='pointermove'){
      if(target!==hover){hover=target;mark(target);}
    }else if(e.type==='click'&&e.isTrusted){
      if(guard(e.target))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(target)void commit(target);else message('请选择具体内容，不能隐藏整个网页');
    }
  }
  function begin(){
    if(disposed||pending)return false;
    if(picking)return true;
    if(!doc.documentElement)return false;
    // Selection mode only highlights target elements; instructions live in the Side Panel.
    picking=true;
    pickTimer=win.setTimeout(()=>{
      if(!picking||disposed)return;
      end();void request('cancel').catch(()=>{});
    },ADBLOCK_COSMETIC_PICK_TTL_MS);
    for(const type of ['pointermove','click','keydown'])
      doc.addEventListener(type,event,true);
    return true;
  }
  return Object.freeze({begin,cancel(){if(picking){
      end();void request('cancel').catch(()=>{});
    }},dispose(){disposed=true;end();}});
}
