// Included only by WXT serve, never by a standalone development/production build.
export function installDevelopmentPage({api,prepareReload,document:doc=globalThis.document,location:loc=globalThis.location,onStatus=()=>{}}) {
  let presentation={text:'',title:''};
  const report=values=>{presentation={...presentation,...values};onStatus(presentation);};
  let disposed=false,port,reconnectTimer,activeToken,preparations=Promise.resolve(),attempt=0;
  const showRevision=revision=>{
    const valid=typeof revision==='string'&&/^[a-f0-9]{64}$/.test(revision);
    report({text:'开发服务已连接 · 构建指纹 '+(valid?revision.slice(0,12):'未就绪')+'；保存源码后自动安全更新。'});
    report({title:'扩展 ID：'+(api.runtime.id||'未知')+'；构建 revision：'+(valid?revision:'未知')+'。这不证明已打开的网页重新注入了 SDK。'});
  };
  function invalidate(){activeToken=null;doc.body.inert=false;}
  function connect(){
    if(disposed)return;
    report({text:'正在连接开发服务…'});
    const current=port=api.runtime.connect({name:'opendesk.development.v1'});
    const listener=message=>{
      if(disposed||port!==current)return;
      if(message.type==='connected'){
        attempt=0;showRevision(message.revision);
       } else if(message.type==='revision'){
         showRevision(message.revision);
      } else if(message.type==='css'){
        const link=doc.querySelector('link[href*="tool-shell.css"]');
        if(link){const url=new URL(link.href);url.searchParams.set('opendesk-dev',message.hash);link.href=url.href;}
        doc.documentElement.dataset.developmentCss=message.hash;
        // CSS hot swaps must not interrupt the normal Side Panel with
        // transient success notices. The worker reports the new revision.
      } else if(message.type==='prepare') {
        activeToken=message.token;doc.body.inert=true;
        const token=message.token;
        preparations=preparations.then(async()=>{
          if(disposed||port!==current||activeToken!==token)return;
          let ready=false;
          try {ready=await prepareReload();}catch(error){console.warn('[OpenDesk dev] Draft retained in editor; reload blocked',error);}
          if(disposed||port!==current||activeToken!==token)return;
          current.postMessage({type:'ready',token,ready});
          if(!ready)invalidate();
          report({text:ready?'正在应用源码更新…':'源码已编译；等待任务结束、资源释放和草稿保存后刷新。'});
        }).catch(error=>console.warn('[OpenDesk dev] Preparation failed',error));
      } else if(message.type==='abort'&&activeToken===message.token) {
        invalidate();
      } else if(message.type==='reload-page'&&activeToken===message.token) {
        // New document => new host identity; no old owner is resurrected.
        const url=new URL(loc.href);url.searchParams.delete('hostInstanceId');loc.replace(url.href);
      } else if(message.type==='waiting')report({text:message.reason});
    };
    current.onMessage.addListener(listener);
    current.onDisconnect.addListener(()=>{
      current.onMessage.removeListener(listener);
      if(disposed||port!==current)return;
      invalidate();port=null;report({text:'开发服务连接已关闭；正在重连，任务不会重放。'});
      reconnectTimer=setTimeout(connect,Math.min(5000,250*2**Math.min(attempt++,5)));
    });
  }
  connect();
  return ()=>{disposed=true;clearTimeout(reconnectTimer);invalidate();port?.disconnect();onStatus(null);};
}
