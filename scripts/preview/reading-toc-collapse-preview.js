/* Preview-only toggle for the real Reading TOC overlay; production logic is untouched. */
(() => {
  'use strict';
  let attempts=0;
  function mount(){
    const host=document.querySelector('[data-opendesk-toc-root]');
    if(!host){if(++attempts<40)requestAnimationFrame(mount);return;}
    if(document.getElementById('od-toc-edge-preview-toggle'))return;
    const style=document.createElement('style');
    style.id='od-toc-edge-preview-style';
    style.textContent=[
      '#od-toc-edge-preview-toggle{position:fixed;z-index:2147483100;width:38px;height:46px;display:grid;place-items:center;border:0;padding:0;background:transparent;color:#4268bf;cursor:pointer;touch-action:manipulation}',
      '#od-toc-edge-preview-toggle .od-edge-skin{position:absolute;right:0;top:0;width:12px;height:46px;background:#dce8fa;border:1px solid #b1c5e7;border-right:0;border-radius:9px 0 0 9px;box-shadow:-2px 2px 5px #243a6012;transition:width .14s ease,background .14s ease}',
      '#od-toc-edge-preview-toggle[data-dock="left"] .od-edge-skin{left:0;right:auto;border:1px solid #b1c5e7;border-left:0;border-radius:0 9px 9px 0}',
      '#od-toc-edge-preview-toggle svg{position:relative;width:19px;height:19px;opacity:0;transition:opacity .1s ease;pointer-events:none}',
      '#od-toc-edge-preview-toggle:hover .od-edge-skin,#od-toc-edge-preview-toggle:focus-visible .od-edge-skin{width:38px;background:#ecf3ff}',
      '#od-toc-edge-preview-toggle:hover svg,#od-toc-edge-preview-toggle:focus-visible svg{opacity:1}',
      '#od-toc-edge-preview-toggle:focus-visible{outline:2px solid #426cff;outline-offset:2px;border-radius:9px}',
      '@media(hover:none){#od-toc-edge-preview-toggle .od-edge-skin{width:38px}#od-toc-edge-preview-toggle svg{opacity:1}}',
      '@media(prefers-reduced-motion:reduce){#od-toc-edge-preview-toggle .od-edge-skin,#od-toc-edge-preview-toggle svg{transition:none}}'
    ].join('');
    document.head.append(style);
    const toggle=document.createElement('button');
    toggle.type='button';toggle.id='od-toc-edge-preview-toggle';toggle.dataset.dock='right';
    toggle.innerHTML='<span class="od-edge-skin" aria-hidden="true"></span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    document.body.append(toggle);
    const arrow=toggle.querySelector('path');
    let collapsed=false;
    function updatePosition(){
      if(!host.isConnected){toggle.remove();style.remove();return;}
      const rect=host.getBoundingClientRect();
      if(!Number.isFinite(rect.left)||rect.width===0)return;
      const width=document.documentElement.clientWidth||innerWidth;
      const rightDock=width-rect.right<=rect.left;
      toggle.dataset.dock=rightDock?'right':'left';
      const x=rightDock?rect.right-38:rect.left;
      toggle.style.left=Math.max(0,Math.min(width-38,x))+'px';
      toggle.style.top=Math.max(6,Math.min(innerHeight-52,rect.top+rect.height/2-23))+'px';
      arrow.setAttribute('d',rightDock?(collapsed?'M15 5l-7 7 7 7':'M9 5l7 7-7 7'):(collapsed?'M9 5l7 7-7 7':'M15 5l-7 7 7 7'));
      toggle.hidden=host.hidden;
    }
    function render(){
      host.style.visibility=collapsed?'hidden':'';
      toggle.setAttribute('aria-expanded',String(!collapsed));
      toggle.setAttribute('aria-label',collapsed?'展开目录':'收起目录');
      updatePosition();
    }
    toggle.addEventListener('click',()=>{collapsed=!collapsed;render();});
    let pending=false;
    function schedule(){
      if(pending)return;pending=true;
      requestAnimationFrame(()=>{pending=false;updatePosition();});
    }
    addEventListener('resize',schedule);
    document.addEventListener('pointermove',schedule,{passive:true});
    document.addEventListener('pointerup',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    if(typeof ResizeObserver==='function')new ResizeObserver(schedule).observe(host);
    new MutationObserver(schedule).observe(host,{attributes:true,attributeFilter:['style','hidden','data-toc-custom']});
    render();
  }
  mount();
})();
