// Presentation adapter for the official ToolHost. The sandboxed production
// notes controller is the only owner of page history and editable content.
const protocol='opendesk.clipper.preview.v1',toolId='web-markdown-clipper';
const pages={home:'网页剪藏',library:'我的摘录',reader:'摘录详情',edit:'编辑摘录',new:'新建便签'};
const actions={library:['new','新建便签'],reader:['edit','编辑摘录'],edit:['save','保存修改'],new:['save','保存便签']};

export function createClipperPreview({view,stage,doc=document}){
  let frame=null,instance='',page='home',dirty=false,busy=false,settings=false;
  const patch=(id,state)=>view.patch('sidebar-tool-'+id,state);
  const notice=text=>patch('status',{hidden:!text,textContent:text});
  function paint(){
    const action=!settings&&actions[page];
    patch('title',{textContent:settings?'工具设置':pages[page]});
    patch('primary-action',{hidden:!action,disabled:busy,data:{action:action?.[0]||''},
      title:action?.[1]||'',attributes:{'aria-label':action?.[1]||'当前页面操作'}});
    patch('back',{disabled:busy,title:settings?'返回网页剪藏':page==='home'?'返回扩展列表':'返回上一页',
      attributes:{'aria-label':settings?'返回网页剪藏':page==='home'?'返回扩展列表':'返回上一页'}});
    patch('settings-open',{hidden:false,disabled:busy,attributes:{'aria-expanded':String(settings)}});
    patch('settings-view',{hidden:!settings});
    view.runtime.frameRoot.hidden=settings;
  }
  function send(kind,values={}){
    frame?.contentWindow?.postMessage({protocol,toolId,instance,kind,...values},'*');
  }
  function receive(event){
    const m=event.data;
    if(!frame||!frame.isConnected||event.source!==frame.contentWindow||event.origin!=='null'||
       m?.protocol!==protocol||m.toolId!==toolId||m.instance!==instance)return;
    if(m.kind==='navigation-state'&&Object.hasOwn(pages,m.page)){page=m.page;paint();}
    if(m.kind==='edit-state'&&typeof m.dirty==='boolean'&&typeof m.busy==='boolean'){
      dirty=m.dirty;busy=m.busy;paint();
    }
    if(m.kind==='status'&&typeof m.message==='string')notice('仅预览 · '+m.message.slice(0,300));
  }
  doc.defaultView.addEventListener('message',receive);
  const unbind=[
    view.bind('sidebar-tool-back','click',()=>{
      if(busy){notice('保存中，请稍候。');return;}
      if(settings){settings=false;paint();return;}
      if(page!=='home'){send('navigation-action',{action:'back'});return;}
      close();
    }),
    view.bind('sidebar-tool-primary-action','click',()=>{if(!busy)send('navigation-action',{action:'primary'});}),
    view.bind('sidebar-tool-settings-open','click',()=>{
      if(dirty||busy){notice('请先保存或取消当前编辑，再打开设置。');return;}
      settings=true;paint();
    }),
    view.bind('sidebar-tool-open-tab','click',()=>notice('仅预览 · 不打开真实工具标签页。'))
  ];
  function close(){
    frame?.remove();frame=null;instance='';
    patch('display',{hidden:true});view.runtime.frameRoot.hidden=false;
    doc.getElementById('extension-center').hidden=false;
    doc.querySelector('[data-extension-key="app:web-markdown-clipper"]')?.focus({preventScroll:true});
  }
  return Object.freeze({
    open(){
      if(frame)return;
      instance=crypto.randomUUID();page='home';dirty=false;busy=false;settings=false;
      frame=doc.createElement('iframe');
      frame.title='网页剪藏正式源码 · 模拟 Host';frame.setAttribute('sandbox','allow-scripts');
      frame.style.cssText='display:block;border:0;width:100%;height:700px';
      const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');
      // Chromium serializes file document message origins as "null" even when
      // location.origin reports "file://". Source + per-mount identity stay bound.
      const parentOrigin=doc.defaultView.location.protocol==='file:'?'null':doc.defaultView.location.origin;
      frame.srcdoc=stage.replace('data-preview-instance=""','data-preview-instance="'+escape(instance)+'"')
        .replace('data-preview-parent-origin=""','data-preview-parent-origin="'+escape(parentOrigin)+'"');
      patch('display',{hidden:false});
      patch('open-tab',{disabled:false});
      // Permission controls are irrelevant to this isolated memory-only stage.
      for(const id of ['cookie-permissions','bookmark-permissions','enable','remove','visibility-settings','menu-settings',
        'generic-site-scope','generic-site-binary','generic-site-advanced'])
        if(view.fields['sidebar-tool-'+id])patch(id,{hidden:true});
      doc.getElementById('extension-center').hidden=true;
      view.runtime.frameRoot.replaceChildren(frame);paint();notice('仅预览 · 正式业务源码，模拟数据，不执行安装或真实权限操作。');
    },
    close,
    dispose(){close();for(const off of unbind)off();doc.defaultView.removeEventListener('message',receive);}
  });
}
