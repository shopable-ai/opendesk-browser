// Fixed, local, non-networked Chrome extension restriction page.
// Never echo original URLs, queries, cookies or request data.
export function installStayFocusBlockedPage({
  doc=globalThis.document,
  api=globalThis.chrome,
  locationRef=globalThis.location,
  historyRef=globalThis.history
}={}){
  const labels={
    quota:['今日娱乐额度已用完','明天本地日期切换后恢复额度。'],
    schedule:['现在处于限制时段','在设定的工作时间结束后恢复浏览。'],
    session:['专注模式正在进行','专注时长结束后恢复浏览。'],
    always:['此网站被设为始终限制','请在 Stay Focus 设置中调整规则。']
  };
  const kind=locationRef.pathname.match(/blocked-(quota|schedule|session|always)\.html$/)?.[1]||'always';
  doc.getElementById('reason').textContent=labels[kind][0];
  doc.getElementById('resume').textContent=labels[kind][1];
  const hint=doc.getElementById('hint');
  let windowId=null;
  // Prefetch while the page is first loaded. sidePanel.open() must run
  // synchronously INSIDE the actual click, not after a Chrome API await.
  Promise.resolve().then(()=>api.windows.getCurrent()).then(info=>{
    if(Number.isSafeInteger(info?.id)&&info.id>=0)windowId=info.id;
  }).catch(()=>{});
  doc.getElementById('back').addEventListener('click',()=>{
    if(historyRef.length>1)historyRef.back();
    else locationRef.replace('about:blank');
  });
  doc.getElementById('settings').addEventListener('click',event=>{
    if(event?.isTrusted!==true)return;
    if(windowId===null||typeof api.sidePanel?.open!=='function'){
      hint.textContent='请点击 OpenDesk 扩展图标，在「工具」打开 Stay Focus 的设置。';
      return;
    }
    let action;
    try{action=api.sidePanel.open({windowId});}
    catch(error){
      hint.textContent='侧边栏暂不可用。请从 OpenDesk 扩展图标打开。';
      return;
    }
    Promise.resolve(action).then(()=>{
      hint.textContent='侧边栏已打开，请进入「工具」→ Stay Focus → 设置。';
    },()=>{
      hint.textContent='侧边栏暂不可用。请从 OpenDesk 扩展图标打开。';
    });
  });
}
