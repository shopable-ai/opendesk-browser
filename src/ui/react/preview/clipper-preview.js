// UI_PREVIEW_ONLY: presentation fixtures for the SAME installed React ToolHost.
// Only the web clipper uses the real sandboxed preview stage. All management
// operations below stay in memory and never touch Chrome or an installer.
const protocol='opendesk.clipper.preview.v1',toolId='web-markdown-clipper';
const pages={home:'网页剪藏',library:'我的摘录',reader:'摘录详情',edit:'编辑摘录',new:'新建便签'};
const actions={library:['new','新建便签'],reader:['edit','编辑摘录'],edit:['save','保存修改'],new:['save','保存便签']};
const scenarios=Object.freeze({
  'bookmark-manager':{title:'书签管理',kind:'bookmarks'},
  'cookie-editor':{title:'Cookie Editor',kind:'cookies'},
  'prompt-shortcuts':{title:'提示词快捷按钮',kind:'prompt'},
  'demo-generic':{title:'普通扩展',kind:'generic'}
});

export function createClipperPreview({view,stage,doc=document,onUninstall=()=>{}}){
  let frame=null,instance='',page='home',dirty=false,busy=false,settings=false,scenario=null,review=false;
  const states=new Map(),initial=()=>({enabled:true,grant:false,web:true,native:true});
  let memory=initial();
  const patch=(id,state)=>view.patch('sidebar-tool-'+id,state);
  const notice=text=>patch('status',{hidden:!text,textContent:text});
  const currentTitle=()=>scenario?scenarios[scenario].title:'网页剪藏';
  const valid=event=>event?.isTrusted===true;
  function drawSettings(){
    const kind=scenario?scenarios[scenario].kind:'generic';
    const bookmark=kind==='bookmarks',cookie=kind==='cookies',prompt=kind==='prompt';
    const firstUse=cookie&&!memory.grant&&!settings;
    patch('bookmark-permissions',{hidden:!bookmark||!settings});
    patch('bookmark-heading',{textContent:'书签访问'});
    patch('bookmark-info',{hidden:true,textContent:''});
    patch('bookmark-grant',{textContent:memory.grant?'撤销授权':'授权访问',disabled:!memory.enabled,
      attributes:{'aria-pressed':String(memory.grant)}});
    patch('cookie-permissions',{hidden:!cookie||!(settings||firstUse),
      data:{mode:firstUse?'first-use':'settings',isCookieEditor:cookie}});
    patch('cookie-heading',{textContent:firstUse?'Cookie 访问授权':'Cookie 访问'});
    patch('cookie-target',{hidden:firstUse,textContent:'当前网站：example.invalid · '+(memory.grant?'已授权':'未授权')});
    patch('cookie-help',{hidden:memory.grant,textContent:!memory.grant?
      '仅预览：允许管理所有普通 HTTP/HTTPS 网站的 Cookie，包括读取 Cookie 元数据、查看 Cookie 值、新建、编辑及删除、短时观察变化、清理当前主机。全站授权适用于所有普通 HTTP/HTTPS 网站；单站授权仅适用于明确选择的网站。真实授权仍需通过 Chrome 及原有权限审阅。':''});
    patch('cookie-first-use',{hidden:false});
    patch('cookie-site-toggle',{disabled:!memory.enabled,
      textContent:memory.grant?'撤销授权':firstUse?'允许管理网站 Cookie':'授权访问'});
    patch('cookie-values-toggle',{hidden:true});
    patch('prompt-web-row',{hidden:!settings||!prompt});
    patch('prompt-native-row',{hidden:!settings||!prompt});
    patch('prompt-nav-advanced',{hidden:true});
    patch('prompt-web-action',{disabled:!memory.enabled,
      attributes:{'aria-checked':String(memory.web)}});
    patch('prompt-native-action',{disabled:!memory.enabled,textContent:'',
      attributes:{role:'switch','aria-checked':String(memory.native),'aria-pressed':null}});
    patch('prompt-enable-label',{textContent:'启用工具'});
    patch('prompt-enable-description',{hidden:true});
    patch('toc-language',{hidden:true});
    patch('settings-hint',{hidden:true,textContent:''});
    for(const field of ['generic-site-scope','generic-site-binary','generic-site-advanced',
      'visibility-settings','page-exceptions','visibility','context-menu','retired-draft'])
      if(view.fields['sidebar-tool-'+field])patch(field,{hidden:true});
    patch('enable',{disabled:false,textContent:'',title:memory.enabled?'停用工具':'启用工具',
      attributes:{role:'switch','aria-label':'启用工具','aria-checked':String(memory.enabled),'aria-pressed':null}});
    patch('enable-hint',{hidden:true,textContent:''});
    patch('enable-retry',{hidden:true});
  }
  function paint(){
    const action=!scenario&&!settings&&actions[page];
    const title=currentTitle();
    patch('title',{textContent:scenario?title:pages[page]});
    patch('primary-action',{hidden:!action,disabled:busy,data:{action:action?.[0]||''},
      title:action?.[1]||'',attributes:{'aria-label':action?.[1]||'当前页面操作'}});
    patch('secondary-action',{hidden:true});
    const backText=settings?'返回工具':!scenario&&page!=='home'?'返回上一页':'返回扩展列表';
    patch('back',{disabled:busy,title:backText,attributes:{'aria-label':backText}});
    patch('settings-open',{hidden:false,disabled:busy,attributes:{'aria-expanded':String(settings)}});
    patch('settings-view',{hidden:!settings,data:{tool:scenario||toolId}});
    patch('remove',{hidden:false,disabled:busy,title:'卸载「'+title+'」及本地数据',
      attributes:{'aria-label':'卸载「'+title+'」及本地数据'}});
    patch('inline-remove',{hidden:!review,data:{title}});
    patch('inline-remove-text',{textContent:'仅预览：确认后从演示列表移除，不会卸载扩展、清理数据或更改权限。'});
    patch('inline-remove-confirm',{disabled:false});
    patch('open-tab',{hidden:false,disabled:false});
    drawSettings();
    view.runtime.frameRoot.hidden=settings||(scenario==='cookie-editor'&&!memory.grant);
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
    view.bind('sidebar-tool-back','click',event=>{
      if(!valid(event))return;
      if(busy){notice('请先完成当前编辑。');return;}
      if(review){review=false;paint();return;}
      if(settings){settings=false;paint();return;}
      if(!scenario&&page!=='home'){send('navigation-action',{action:'back'});return;}
      close();
    }),
    view.bind('sidebar-tool-primary-action','click',event=>{if(valid(event)&&!busy)send('navigation-action',{action:'primary'});}),
    view.bind('sidebar-tool-settings-open','click',event=>{
      if(!valid(event))return;
      if(dirty||busy){notice('请先保存或取消当前编辑，再打开设置。');return;}
      settings=!settings;paint();
    }),
    view.bind('sidebar-tool-enable','click',event=>{
      if(!valid(event)||busy)return;
      if(dirty){notice('请先保存或取消未保存的编辑，再停用工具。');return;}
      memory.enabled=!memory.enabled;if(scenario)states.set(scenario,{...memory});
      paint();notice('仅预览 · 已在内存中'+(memory.enabled?'恢复':'停用')+'工具。');
    }),
    view.bind('sidebar-tool-bookmark-grant','click',event=>{
      if(!valid(event)||!scenario||scenario!=='bookmark-manager'||!memory.enabled)return;
      memory.grant=!memory.grant;states.set(scenario,{...memory});
      paint();notice('仅预览 · 书签权限状态只在内存变化，未请求 Chrome 权限。');
    }),
    view.bind('sidebar-tool-cookie-site-toggle','click',event=>{
      if(!valid(event)||scenario!=='cookie-editor'||!memory.enabled)return;
      memory.grant=!memory.grant;states.set(scenario,{...memory});
      paint();notice('仅预览 · Cookie 权限状态只在内存变化。');
    }),
    view.bind('sidebar-tool-prompt-web-action','click',event=>{
      if(!valid(event)||scenario!=='prompt-shortcuts'||!memory.enabled)return;
      memory.web=!memory.web;states.set(scenario,{...memory});paint();
      notice('仅预览 · 未注入真实网页按钮。');
    }),
    view.bind('sidebar-tool-prompt-native-action','click',event=>{
      if(!valid(event)||scenario!=='prompt-shortcuts'||!memory.enabled)return;
      memory.native=!memory.native;states.set(scenario,{...memory});paint();
      notice('仅预览 · 未注册 Chrome 右键菜单。');
    }),
    view.bind('sidebar-tool-remove','click',event=>{
      if(!valid(event))return;
      if(dirty||busy){notice('先保存或取消当前编辑，再执行卸载确认。');return;}
      review=true;paint();
    }),
    view.bind('sidebar-tool-inline-remove-cancel','click',event=>{
      if(!valid(event))return;
      review=false;paint();notice('仅预览 · 已取消，数据未改变。');
    }),
    view.bind('sidebar-tool-inline-remove-confirm','click',event=>{
      if(!valid(event)||!review)return;
      const id=scenario||toolId;
      review=false;close();onUninstall(id);
    }),
    view.bind('sidebar-tool-open-tab','click',event=>{
      if(valid(event))notice('UI_PREVIEW_ONLY · 不会打开真实浏览器标签页。');
    })
  ];
  function close(){
    const key='app:'+(scenario||toolId);
    frame?.remove();frame=null;instance='';scenario=null;settings=false;review=false;dirty=false;busy=false;
    view.runtime.frameRoot.replaceChildren();
    patch('display',{hidden:true});patch('settings-view',{hidden:true});patch('cookie-permissions',{hidden:true});
    view.runtime.frameRoot.hidden=false;
    doc.getElementById('extension-center').hidden=false;
    doc.querySelector('[data-extension-key="'+key+'"]')?.focus({preventScroll:true});
  }
  return Object.freeze({
    open(){
      if(frame||scenario)close();
      instance=crypto.randomUUID();page='home';dirty=false;busy=false;settings=false;review=false;
      memory=initial();
      frame=doc.createElement('iframe');
      frame.title='网页剪藏正式源码 · 模拟 Host';frame.setAttribute('sandbox','allow-scripts');
      frame.style.cssText='display:block;border:0;width:100%;height:700px';
      const escape=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');
      const parentOrigin=doc.defaultView.location.protocol==='file:'?'null':doc.defaultView.location.origin;
      frame.srcdoc=stage.replace('data-preview-instance=""','data-preview-instance="'+escape(instance)+'"')
        .replace('data-preview-parent-origin=""','data-preview-parent-origin="'+escape(parentOrigin)+'"');
      patch('display',{hidden:false});
      doc.getElementById('extension-center').hidden=true;
      view.runtime.frameRoot.replaceChildren(frame);paint();
      notice('UI_PREVIEW_ONLY · 正式网页剪藏业务源码，模拟 Host 与数据。');
    },
    openScenario(id){
      if(!Object.hasOwn(scenarios,id))return false;
      if(frame||scenario)close();
      scenario=id;page='home';dirty=false;busy=false;settings=false;review=false;
      memory={...(states.get(id)||initial())};
      const placeholder=doc.createElement('section');
      placeholder.className='od-surface';
      placeholder.style.cssText='padding:15px;line-height:1.6';
      placeholder.setAttribute('aria-label','仅预览业务区域');
      placeholder.textContent='UI_PREVIEW_ONLY · '+scenarios[id].title+' 的业务页面不在此模拟。点击右上角设置，审阅正式 ToolHost 的统一管理界面。';
      patch('display',{hidden:false});doc.getElementById('extension-center').hidden=true;
      view.runtime.frameRoot.replaceChildren(placeholder);
      paint();notice('UI_PREVIEW_ONLY · 权限、启停及卸载仅修改本页内存状态。');
      return true;
    },
    close,
    dispose(){close();for(const off of unbind)off();doc.defaultView.removeEventListener('message',receive);}
  });
}
