// Offline bridge fixture ONLY. Production SDK never shares these state maps.
(()=>{
  'use strict';
  globalThis.__OpenDeskFingerprintPreview=true;
  const root=document.getElementById('fp-preview-root');
  const key='opendesk.fingerprint.r21.preview-only.v1';
  const sites=[
    {status:'available',url:'https://qa.example.test/cart',title:'QA 购物车',
      tabRef:'preview-tab-aaaaaaaa',documentRef:'preview-document-a'},
    {status:'available',url:'https://shop.example.test/checkout',title:'电商结账页',
      tabRef:'preview-tab-bbbbbbbb',documentRef:'preview-document-b'}
  ];
  const allowed=new Set(['fingerprint.a.history.v1','fingerprint.r21.presets.v1',
    'fingerprint.r21.runs.v1']);
  let current=0,stored={};
  try{
    const data=JSON.parse(localStorage.getItem(key)||'{}');
    if(data&&typeof data==='object'&&!Array.isArray(data))
      for(const [name,value] of Object.entries(data))
        if(allowed.has(name))stored[name]=value;
  }catch{stored={};}
  // Deliberately NOT a cryptographic SHA-256; only a preview CAS fixture.
  const etag=value=>{
    const str=JSON.stringify(value)??'null';
    let h=2166136261;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0').repeat(8);
  };
  document.querySelector('#fp-fixture').addEventListener('change',event=>{
    current=Number(event.target.value)||0;
    document.querySelector('#fp-fixture-status').textContent=
      '演示目标已切换，原文档引用已失效';
    globalThis.dispatchEvent(new Event('opendesk-page-changed'));
  });
  globalThis.OpenDeskTool={
    root,
    async request(operation,args={}){
      if(operation==='browser.page.getContext')return {...sites[current]};
      if(operation==='browser.capabilities.getStatus'){
        if(args.operation==='browser.page.readEnvironment')return {operation:args.operation,
          implementation:'preview_fixture',callableNow:true,reasonCode:null};
        return {operation:args.operation,implementation:'not_implemented',
          callableNow:false,authorization:{tool:'missing'},reasonCode:'E_NOT_IMPLEMENTED'};
      }
      if(operation==='browser.page.readEnvironment')return {
        tabRef:sites[current].tabRef,documentRef:sites[current].documentRef,capturedAt:new Date().toISOString(),
        source:{kind:'target-page-js',world:'MAIN',frameId:0},fields:Object.fromEntries(Object.entries({
          userAgent:'PREVIEW fixture — not a target-page reading',languages:['zh-CN','en'],timeZone:'Asia/Shanghai',
          viewport:{width:1280,height:720},screen:{width:1920,height:1080},devicePixelRatio:2
        }).map(([key,value])=>[key,{status:'available',value,reasonCode:null}]))};
      if(operation==='storage.get'){
        if(!allowed.has(args.key))throw Error('E_PREVIEW_STORAGE_SCOPE');
        const value=Object.hasOwn(stored,args.key)?stored[args.key]:null;
        return {value:structuredClone(value),etag:etag(value),preview:true};
      }
      if(operation==='storage.set'){
        if(!allowed.has(args.key))throw Error('E_PREVIEW_STORAGE_SCOPE');
        const prior=Object.hasOwn(stored,args.key)?stored[args.key]:null;
        if(args.ifMatch!==etag(prior))
          throw Object.assign(Error('预览版本冲突'),{code:'E_STORAGE_CONFLICT'});
        const next=structuredClone(args.value);
        const draft={...stored,[args.key]:next};
        try{localStorage.setItem(key,JSON.stringify(draft));}
        catch{throw Object.assign(Error('离线预览存储不可写，未确认保存'),
          {code:'E_PREVIEW_STORAGE'});}
        stored=draft;
        return {saved:true,preview:true};
      }
      if(operation==='clipboard.writeText'){
        if(typeof navigator?.clipboard?.writeText!=='function')
          throw Error('本地预览未提供剪贴板写入');
        await navigator.clipboard.writeText(args.text);
        return {copied:true,preview:true};
      }
      if(operation==='file.download'){
        const blob=new Blob([args.text],{type:'application/json;charset=utf-8'});
        const url=URL.createObjectURL(blob),a=document.createElement('a');
        try{a.href=url;a.download=args.filename;document.body.appendChild(a);a.click();}
        finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
        return {downloadId:1,preview:true};
      }
      // In particular, browser.fingerprint.* never pretends to touch Chrome.
      throw Object.assign(Error('预览不支持真实浏览器操作：'+operation),
        {code:'E_SERVICE_UNSUPPORTED'});
    }
  };
})();
