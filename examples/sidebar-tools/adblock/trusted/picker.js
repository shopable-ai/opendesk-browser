// Manual element selection is a fixed first-party ISOLATED-world page action.
// Only a real user click on the actual page can send a selector to the existing
// trusted AdBlock worker. The worker owns storage and installation authority.
import {ADBLOCK_PAGE_PROTOCOL} from './policy.js';
import {validCosmeticSelector} from './cosmetic-policy.js';

const SAFE_ID=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UI='data-opendesk-adblock-picker';
export function adblockElementSelector(node,doc=globalThis.document){
  if(!node||node.nodeType!==1||node===doc.body||node===doc.documentElement)return null;
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
  onPending=()=>{},onSaved=()=>{},onUndone=()=>{},onRefresh=()=>{}
}={}){
  let picking=false,marker=null,notice=null,hover=null,disposed=false,pending=false;
  const guard=node=>Boolean(node?.closest?.('['+UI+']'));
  const request=async(type,selector)=>{
    const body={protocol:ADBLOCK_PAGE_PROTOCOL,type};
    if(selector)body.selector=selector;
    const response=await api.runtime.sendMessage(body);
    if(response?.ok!==true)throw Error(response?.error?.message||'无法保存网页隐藏规则');
    return response.data;
  };
  function message(text,undo=null){
    if(!doc.documentElement)return;
    if(!notice||!notice.isConnected){
      notice=doc.createElement('div');notice.setAttribute(UI,'');
      notice.setAttribute('role','status');
      notice.style.cssText='position:fixed!important;z-index:2147483647!important;right:16px!important;bottom:16px!important;max-width:min(350px,calc(100vw - 32px))!important;display:flex!important;align-items:center!important;gap:9px!important;background:#20334f!important;color:white!important;padding:10px 12px!important;border-radius:10px!important;box-shadow:0 8px 25px #0005!important;font:13px/1.5 system-ui,sans-serif!important';
      doc.documentElement.append(notice);
    }
    notice.replaceChildren(doc.createTextNode(text));
    if(undo){
      const button=doc.createElement('button');
      button.type='button';button.textContent='撤销';button.setAttribute('aria-label','撤销刚才的隐藏规则');
      button.style.cssText='background:white!important;color:#2758b8!important;border:0!important;border-radius:6px!important;padding:5px 9px!important;font:600 12px system-ui,sans-serif!important;cursor:pointer!important';
      button.addEventListener('click',event=>{if(event.isTrusted)void undo();},{once:true});
      notice.append(button);
    }
  }
  function end(){
    picking=false;hover=null;marker?.remove();marker=null;
    for(const type of ['pointermove','click','keydown'])doc.removeEventListener(type,event,true);
  }
  function targetOf(value){
    if(!value||value.nodeType!==1||guard(value))return null;
    const fit=el=>{
      if(!el||el===doc.body||el===doc.documentElement)return false;
      const rect=el.getBoundingClientRect();
      return rect.width>20&&rect.height>10&&
        rect.width*rect.height<win.innerWidth*win.innerHeight*0.82;
    };
    let el=value.closest?.('section,aside,article,[role="complementary"]')||null;
    if(!fit(el))el=value.closest?.('div,li,figure')||value;
    if(!fit(el))el=fit(value)?value:null;
    return el&&adblockElementSelector(el,doc)?el:null;
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
  async function undo(selector){
    if(disposed||pending)return;
    pending=true;
    try{
      await request('undo',selector);
      onUndone(selector);
      message('已撤销，已删除本地屏蔽规则');
      onRefresh();
    }catch(error){
      message('撤销未成功：'+String(error.message||error).slice(0,90));
      onRefresh();
    }finally{pending=false;}
  }
  async function commit(target){
    const selector=adblockElementSelector(target,doc);
    if(!selector){message('无法定位该区域，请换一个位置');return;}
    end();pending=true;onPending(selector);
    message('正在保存…');
    try{
      await request('hide',selector);
      onSaved(selector);
      message('已隐藏并保存，下次访问自动隐藏',()=>undo(selector));
      onRefresh();
    }catch(error){
      message('未保存，已恢复：'+String(error.message||error).slice(0,85));
      onRefresh();
    }finally{
      onPending(null);pending=false;
    }
  }
  function event(e){
    if(!picking||disposed)return;
    if(e.type==='keydown'){
      if(e.key==='Escape'&&e.isTrusted){e.preventDefault();end();
        void request('cancel').catch(()=>{});message('已退出选择模式');}
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
    picking=true;
    for(const type of ['pointermove','click','keydown'])
      doc.addEventListener(type,event,true);
    message('选择模式：单击目标区域立即隐藏；Esc 取消');
    return true;
  }
  return Object.freeze({begin,cancel(){if(picking){end();void request('cancel').catch(()=>{});}},
    dispose(){disposed=true;end();notice?.remove();notice=null;}});
}
