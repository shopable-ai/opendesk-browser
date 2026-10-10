// Same compact R3 layout as the official sandbox tool, but implemented only in
// trusted extension code. No untrusted website text is parsed as markup.
const STYLE=String.raw;
const CSS=[
':host{all:initial;position:fixed;right:12px;top:clamp(90px,15vh,190px);width:254px;max-width:calc(100vw - 24px);z-index:2147483000;',
'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20222b;font-size:13px;line-height:1.45}',
'*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}button:focus-visible,select:focus-visible{outline:2px solid #426cff;outline-offset:2px}',
'.panel{background:#fff;border:1px solid #e9e9ef;border-radius:12px;padding:12px;box-shadow:0 3px 13px #10182716}',
'.head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}',
'.heading{font-size:12px;font-weight:650;letter-spacing:.045em;color:#727685}',
'.modes{display:flex;align-items:center;gap:1px;padding:2px;border:1px solid #e9e9ef;border-radius:8px;background:#fafafd}',
'.mode{display:grid;place-items:center;width:27px;height:27px;border:0;border-radius:5px;background:transparent;color:#858996;padding:0}',
'.mode svg{width:14px;height:14px}.mode[aria-pressed=true]{background:#fff;box-shadow:0 1px 3px #171d2a15;color:#303342}',
'.sources{width:100%;margin:0 0 7px;padding:5px;border:1px solid #e9e9ef;border-radius:6px;background:transparent;color:inherit;font-size:12px}',
'.scroll{max-height:min(68dvh,calc(100dvh - 180px));overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}',
'.list{list-style:none;margin:0;padding:0;display:grid;gap:1px}',
'.list li{margin:0;padding-left:calc(var(--depth,0)*12px)}',
'.link{display:block;width:100%;text-align:left;border:0;border-left:2px solid transparent;background:transparent;color:#6b7280;',
'border-radius:0 3px 3px 0;padding:2px 0 2px 10px;line-height:1.45;font-size:13px}',
'.link.child{font-size:12px}.link:hover,.link[aria-current=location]{color:#20222b}',
'.link[aria-current=location]{border-left-color:#426cff}',
'.label{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;max-height:2.9em}',
'.empty{margin:7px 0 0;color:#777b8a;font-size:12px}',
'@media(prefers-color-scheme:dark){:host{color:#e6e8ef}.panel{background:#1b1c24;border-color:#383a48}',
'.heading{color:#a4a7b3}.modes{background:#16171e;border-color:#383a48}',
'.mode{color:#8b90a1}.mode[aria-pressed=true]{background:#2a2d3a;color:#e3e7f4}',
'.sources{border-color:#383a48;color:inherit}.link{color:#a0a5b4}.link:hover,.link[aria-current=location]{color:#f4f5f7}}',
'@media(max-width:1100px){:host{right:8px;top:8px;width:220px;opacity:.95}.scroll{max-height:160px}}',
'@media(max-width:720px){:host{display:none}}',
'@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}'
].join('');
const ICONS=[
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2"/></svg>',
'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 5h13M13 12h8M13 19h8M3 10a2 2 0 0 0 2 2h3M3 5v12a2 2 0 0 0 2 2h3"/></svg>'
];
export function createReadingTocView({doc,onNavigate}) {
  const host=doc.createElement('div');
  host.setAttribute('data-opendesk-toc-root','');
  const root=host.attachShadow({mode:'closed'});
  const sheet=new CSSStyleSheet();
  sheet.replaceSync(CSS);
  root.adoptedStyleSheets=[sheet];
  const make=(tag,cls)=>{const node=doc.createElement(tag);if(cls)node.className=cls;return node;};
  const panel=make('section','panel');panel.setAttribute('aria-label','网页目录');
  const head=make('div','head'),caption=make('strong','heading');
  caption.textContent='CONTENTS';
  const modes=make('div','modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','目录视图');
  const names=['一级目录','当前章节','完整目录'],types=['top','focus','full'],buttons=[];
  let mode='top',selected='',snapshot={items:[],sources:[],activeId:''},lastKey='';
  types.forEach((name,index)=>{
    const button=make('button','mode');button.type='button';button.title=names[index];
    button.setAttribute('aria-label',names[index]);button.dataset.mode=name;
    button.setAttribute('aria-pressed',String(index===0));button.innerHTML=ICONS[index];
    button.addEventListener('click',()=>{mode=name;render();});buttons.push(button);modes.append(button);
  });
  head.append(caption,modes);
  const choose=make('select','sources');choose.setAttribute('aria-label','目录来源');
  choose.addEventListener('change',()=>{selected=choose.value;render();});
  const scroll=make('nav','scroll'),list=make('ul','list'),empty=make('p','empty');
  empty.textContent='暂无章节';scroll.append(list,empty);panel.append(head,choose,scroll);root.append(panel);
  (doc.body||doc.documentElement).append(host);
  function render(next) {
    if(next)snapshot=next;
    const {items,sources,activeId}=snapshot;
    if(!sources.some(s=>s.id===selected))selected=sources.find(s=>s.id===items.find(i=>i.id===activeId)?.sourceId)?.id||sources[0]?.id||'';
    choose.hidden=sources.length<2;
    if(choose.options.length!==sources.length || [...choose.options].some((o,i)=>o.value!==sources[i].id||o.textContent!==sources[i].label)){
      choose.replaceChildren();
      sources.forEach(s=>{const opt=make('option');opt.value=s.id;opt.textContent=s.label;choose.append(opt);});
    }
    choose.value=selected;
    const scoped=items.filter(item=>item.sourceId===selected);
    const active=scoped.find(item=>item.id===activeId)||scoped[0];
    const represented=mode==='top'?scoped.find(item=>item.id===active?.topId):active;
    const show=mode==='full'?scoped:mode==='top'?scoped.filter(item=>item.depth===0):
      scoped.filter(item=>item.depth===0||item.topId===active?.topId);
    const key=mode+'|'+selected+'|'+show.map(i=>i.id+'-'+i.label+'-'+i.depth).join('|');
    if(key!==lastKey){
      const fragment=doc.createDocumentFragment();
      for(const item of show){
        const li=make('li');li.style.setProperty('--depth',String(Math.min(item.depth,3)));
        const button=make('button','link'+(item.depth?' child':''));button.type='button';
        button.dataset.id=item.id;button.title=item.label;button.setAttribute('aria-label',item.label);
        const span=make('span','label');span.textContent=item.label;button.append(span);
        button.addEventListener('click',()=>onNavigate(item.id,item.sourceId));
        li.append(button);fragment.append(li);
      }
      list.replaceChildren(fragment);lastKey=key;
    }
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
    for(const button of list.querySelectorAll('button')){
      if(button.dataset.id===represented?.id)button.setAttribute('aria-current','location');
      else button.removeAttribute('aria-current');
    }
    empty.hidden=show.length>0;
    const current=list.querySelector('[aria-current="location"]');
    if(current){
      const outer=scroll.getBoundingClientRect(),inner=current.getBoundingClientRect();
      if(inner.top<outer.top)scroll.scrollTop-=outer.top-inner.top;
      else if(inner.bottom>outer.bottom)scroll.scrollTop+=inner.bottom-outer.bottom;
    }
  }
  render();
  return Object.freeze({render,dispose(){host.remove();}});
}
