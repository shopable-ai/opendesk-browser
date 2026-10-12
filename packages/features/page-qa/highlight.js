// Called only after an explicit user click in the popup. No persistent content script.
export function highlightPageElement({selector,expectedUrl,tag}) {
  const url=new URL(globalThis.location.href);
  if(url.origin+url.pathname!==expectedUrl)return {ok:false,reason:'页面已导航，请重新检查'};
  if(typeof selector!=='string'||selector.length>400)return {ok:false,reason:'无效定位表达式'};
  let target;
  try {target=globalThis.document.querySelector(selector);}
  catch {return {ok:false,reason:'定位表达式已失效'};}
  if(!target||tag&&target.tagName.toLowerCase()!==tag)
    return {ok:false,reason:'页面结构已改变，请重新检查'};
  target.scrollIntoView({block:'center',behavior:'auto'});
  const prior=globalThis.document.querySelector('[data-page-qa-overlay="true"]');
  if(prior)prior.remove();
  const box=target.getBoundingClientRect();
  const overlay=globalThis.document.createElement('div');
  overlay.setAttribute('data-page-qa-overlay','true');
  overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{
    position:'fixed',left:Math.max(0,box.left-3)+'px',top:Math.max(0,box.top-3)+'px',
    width:Math.max(4,box.width+6)+'px',height:Math.max(4,box.height+6)+'px',
    boxSizing:'border-box',border:'3px solid #365eda',background:'rgba(54,94,218,.08)',
    zIndex:'2147483647',pointerEvents:'none',borderRadius:'3px'
  });
  globalThis.document.documentElement.append(overlay);
  globalThis.setTimeout(()=>overlay.remove(),3000);
  return {ok:true};
}
