/* Preview-only simulated extension center and trusted host. NEVER packaged by
   tool.config.json. The iframe loads exact generated production HTML/CSS/JS. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const bundle=JSON.parse($('sf-bundle').textContent);
  const policy=bundle.config.backgroundPolicy;
  const source=bundle.source;
  const catalog=()=>policy.suggestions.map(site=>({
    ...site,auto:policy.defaultSites.includes(site.host),minutes:site.suggestLimit?policy.dailyMinutes:0
  }));
  const defaults=()=>policy.defaultSites.map(host=>({host,subdomains:true,enabled:true,
    mode:'limit',minutes:policy.dailyMinutes,group:'entertainment'}));
  const clean=()=>({installed:true,granted:false,enabled:false,configured:false,verified:false,
    sites:[],groups:{},usageMs:0,whitelist:[],schedule:structuredClone(policy.schedule),
    focusUntil:null,previewNewSite:false});
  let model=clean();
  let scenario='first';
  const day=()=>{
    const date=new Date();
    return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),
      String(date.getDate()).padStart(2,'0')].join('-');
  };
  const additional={host:'new-video.example',name:'新视频站（场景示例）',
    category:'视频娱乐',auto:true,quick:false,minutes:policy.dailyMinutes};
  function restoreScene(name){
    scenario=name;model=clean();
    const seed=()=>{model.sites=defaults();model.groups.entertainment=policy.dailyMinutes;
      model.granted=true;model.enabled=true;model.configured=true;model.verified=true;};
    switch(name){
      case 'used':seed();model.usageMs=19*60000;break;
      case 'exhausted':seed();model.usageMs=policy.dailyMinutes*60000;break;
      case 'paused':seed();model.sites[0].enabled=false;model.usageMs=6*60000;break;
      case 'session':seed();model.focusUntil=Date.now()+25*60000;model.usageMs=5*60000;break;
      case 'upgrade':seed();model.previewNewSite=true;model.usageMs=12*60000;break;
      case 'revoked':seed();model.granted=false;model.enabled=false;model.verified=false;break;
      case 'dnr':seed();model.verified=false;break;
      case 'stopped':seed();model.enabled=false;model.focusUntil=null;model.verified=false;break;
      case 'uninstalled':model.installed=false;break;
      default:break;
    }
    $('scenario').value=name;renderAll();
  }
  const publicCatalog=()=>model.previewNewSite?[...catalog(),additional]:catalog();
  const remaining=(site)=>{
    const pool=site.group==='entertainment'?
      Number(model.groups.entertainment??policy.dailyMinutes):Number(site.group?
        model.groups[site.group]??site.minutes:site.minutes);
    const used=site.group==='entertainment'?model.usageMs:0;
    return {budgetMs:pool*60000,usedMs:used,remainingMs:Math.max(0,pool*60000-used)};
  };
  function snapshot(){
    const limit=Number(model.groups.entertainment??policy.dailyMinutes),budget=limit*60000;
    return {
      enabled:model.enabled,authorized:model.granted,day:day(),
      permissions:{idle:model.granted,dnr:true,ready:model.granted},
      ruleReceipt:{verified:model.enabled&&model.verified},
      tabs:{failed:0},schedule:structuredClone(model.schedule),
      focusUntil:model.focusUntil,groups:structuredClone(model.groups),
      whitelist:[...model.whitelist],catalog:publicCatalog(),
      sites:model.sites.map(site=>{
        const usage=remaining(site);
        const reason=!model.enabled||!site.enabled?null:
          model.focusUntil>Date.now()?'session':
          site.mode==='always'?'always':
          usage.remainingMs===0?'quota':null;
        return {...site,...usage,reason};
      }),
      dailyBudget:{minutes:limit,budgetMs:budget,usedMs:model.usageMs,
        remainingMs:Math.max(0,budget-model.usageMs),
        managedCount:model.sites.filter(site=>site.enabled&&site.group==='entertainment').length}
    };
  }
  const fail=(message,code='E_FOCUS_PREVIEW')=>{const error=Error(message);error.code=code;throw error;};
  globalThis.__stayFocusMockRequest=async(op,payload={})=>{
    if(op==='currentPage.info')
      return {status:'available',url:'https://youtube.com/watch?v=preview',
        title:'YouTube · 当前预览标签页'};
    if(!model.installed)fail('示例中尚未安装 Stay Focus');
    if(op==='focus.status')return snapshot();
    if(op==='focus.disable'){
      $('host-feedback').textContent='全局停止仅在外层可信设置执行；这里不模拟沙箱直接撤权。';
      fail('请在外层可信设置中停止所有 Stay Focus 限制','E_FOCUS_TRUSTED_CLICK');
    }
    // These actions model only a local UI response, never a native DNR write.
    switch(op){
      case 'focus.site.put':{
        const site=structuredClone(payload.site);
        const index=model.sites.findIndex(row=>row.host===site.host);
        if(index<0)model.sites.push(site);else model.sites[index]=site;
        break;
      }
      case 'focus.site.remove':model.sites=model.sites.filter(site=>site.host!==payload.host);break;
      case 'focus.group.put':
        if(payload.id==='entertainment'&&!model.configured&&model.sites.length===0)
          model.sites=defaults();
        model.groups[payload.id]=payload.minutes;break;
      case 'focus.group.remove':delete model.groups[payload.id];break;
      case 'focus.schedule.set':model.schedule=structuredClone(payload.schedule);break;
      case 'focus.whitelist.set':model.whitelist=[...payload.hosts];break;
      case 'focus.session.start':
        if(!model.enabled)fail('请先在外层可信设置中开启限制','E_FOCUS_NOT_ENABLED');
        model.focusUntil=Date.now()+payload.minutes*60000;break;
      case 'focus.session.stop':model.focusUntil=null;break;
      default:fail('预览未覆盖该操作：'+op);
    }
    model.configured=true;
    $('host-feedback').textContent='模拟宿主已响应 '+op+'；不是 Chrome DNR 验收证据。';
    renderHost();
    return snapshot();
  };
  function renderFrame(){
    const frame=$('preview-frame');
    $('empty-install').hidden=model.installed;
    frame.hidden=!model.installed;
    if(!model.installed){frame.removeAttribute('srcdoc');return;}
    // Produce valid literal closing tags without slash-escaping ambiguity.
    const closeScript='<'+'/script>';
    const bridge='globalThis.OpenDeskTool={root:document,request:(op,payload)=>parent.__stayFocusMockRequest(op,payload)};';
    const tag=code=>'<script>'+String(code).replaceAll('<'+'/script','<\\'+'/script')+closeScript;
    frame.srcdoc='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<style>html,body{margin:0;background:transparent}'+
      bundle.runtime.css+'\n'+source.css+'</style></head><body>'+
      source.html+tag(bundle.runtime.react)+tag(bundle.runtime.adapter)+
      tag(bridge)+tag(source.js)+'</body></html>';
  }
  function renderHost(){
    $('host-state').textContent=!model.installed?'未安装':!model.granted?'尚未授权':
      !model.enabled?'已停止':!model.verified?'DNR 未核对':'已开启';
    $('host-detail').textContent=!model.installed?'没有安装或后台状态。':
      '模拟权限：'+(model.granted?'已批准':'未批准')+' · 后台：'+
      (model.enabled?'运行':'未运行')+' · DNR 回读：'+(model.enabled&&model.verified?'模拟通过':'未验证');
    $('host-install').hidden=model.installed;
    $('host-enable').hidden=!model.installed||model.enabled;
    $('host-stop').hidden=!model.installed||!model.enabled;
    $('host-revoke').hidden=!model.installed||!model.granted;
    $('host-uninstall').hidden=!model.installed;
    $('host-feedback').dataset.scenario=scenario;
  }
  function renderAll(){renderHost();renderFrame();}
  function hostOperate(action){
    if(action==='install'){model=clean();scenario='first';$('scenario').value='first';}
    if(action==='enable'){
      // Existing custom configuration must not be erased or silently widened.
      if(!model.configured&&model.sites.length===0){
        model.sites=defaults();model.groups.entertainment=policy.dailyMinutes;
      }
      model.granted=true;model.enabled=true;model.configured=true;model.verified=true;
    }
    if(action==='stop'){model.enabled=false;model.focusUntil=null;model.verified=false;}
    if(action==='revoke'){model.granted=false;model.enabled=false;model.verified=false;}
    if(action==='uninstall'){model=clean();model.installed=false;scenario='uninstalled';
      $('scenario').value='uninstalled';}
    $('host-feedback').textContent='已模拟 '+({install:'安装',enable:'授权并开启',
      stop:'停止',revoke:'撤权',uninstall:'卸载'})[action]+'；没有访问真实 Chrome 权限。';
    renderAll();
  }
  for(const width of [320,360,400,440]){
    const button=document.querySelector('[data-width="'+width+'"]');
    button.addEventListener('click',()=>{
      $('device').style.width=width+'px';
      for(const item of document.querySelectorAll('[data-width]'))
        item.setAttribute('aria-pressed',String(item===button));
    });
  }
  $('scenario').addEventListener('change',event=>restoreScene(event.target.value));
  $('theme').addEventListener('change',event=>{
    const dark=event.target.value==='dark';
    $('device').dataset.theme=event.target.value;
    const apply=()=>$('preview-frame').contentDocument?.querySelector('.sf')?.setAttribute(
      'data-preview-theme',dark?'dark':'light');
    apply();$('preview-frame').addEventListener('load',apply,{once:true});
  });
  $('preview-frame').addEventListener('load',()=>{
    const active=$('theme').value;
    $('preview-frame').contentDocument?.querySelector('.sf')?.setAttribute('data-preview-theme',active);
  });
  $('host-install').addEventListener('click',()=>hostOperate('install'));
  $('install-empty').addEventListener('click',()=>hostOperate('install'));
  $('host-enable').addEventListener('click',()=>hostOperate('enable'));
  $('host-stop').addEventListener('click',()=>hostOperate('stop'));
  $('host-revoke').addEventListener('click',()=>hostOperate('revoke'));
  $('host-uninstall').addEventListener('click',()=>hostOperate('uninstall'));
  $('parity').textContent='正式 UI Git blob：'+bundle.hashes.html.slice(0,9)+' / '+
    bundle.hashes.css.slice(0,9)+' / '+bundle.hashes.js.slice(0,9)+' · React 19.2.0 · 非正式预览组件适配器';
  restoreScene('first');
})();
