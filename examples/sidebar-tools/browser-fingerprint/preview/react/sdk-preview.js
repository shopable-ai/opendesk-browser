// Offline bridge fixture ONLY. The production JSX and model are unchanged.
(()=>{
  'use strict';
  globalThis.__OpenDeskFingerprintPreview=true;
  const root=document.getElementById('fp-preview-root');
  const key='opendesk.fingerprint.a.preview-only.v1';
  const sites=[
    {status:'available',url:'https://qa.example.test/cart',title:'QA 购物车',
      tabRef:'preview-tab-a',documentRef:'preview-document-a'},
    {status:'available',url:'https://shop.example.test/checkout',title:'电商结账页',
      tabRef:'preview-tab-b',documentRef:'preview-document-b'}
  ];
  let current=0,stored=null;
  try{stored=JSON.parse(localStorage.getItem(key)||'null');}catch{stored=null;}
  // Deliberately fixture-only ETag. Not a replacement for Host SHA-256.
  const etag=value=>{
    const str=JSON.stringify(value)??'null';
    let h=2166136261;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0').repeat(8);
  };
  document.querySelector('#fp-fixture').addEventListener('change',event=>{
    current=Number(event.target.value)||0;
    document.querySelector('#fp-fixture-status').textContent='演示目标已切换，请重新检测';
  });
  globalThis.OpenDeskTool={
    root,
    async request(operation,args={}){
      if(operation==='browser.page.getContext')return {...sites[current]};
      if(operation==='storage.get'){
        if(args.key!=='fingerprint.a.history.v1')throw Error('E_PREVIEW_STORAGE_SCOPE');
        return {value:structuredClone(stored),etag:etag(stored)};
      }
      if(operation==='storage.set'){
        if(args.key!=='fingerprint.a.history.v1'||args.ifMatch!==etag(stored))
          throw Object.assign(Error('预览版本冲突'),{code:'E_STORAGE_CONFLICT'});
        const next=structuredClone(args.value);
        try{localStorage.setItem(key,JSON.stringify(next));}
        catch{throw Object.assign(Error('离线预览存储不可写，未确认保存'),{code:'E_PREVIEW_STORAGE'});}
        stored=next;
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
      throw Error('E_PREVIEW_OPERATION_UNSUPPORTED: '+operation);
    }
  };
})();
