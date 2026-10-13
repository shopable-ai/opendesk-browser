// Fixed extension page. Never echo the original URL, queries or page data.
export function installStayFocusBlockedPage(){
  const labels={quota:['今日娱乐额度已用完','明天本地日期切换后恢复额度。'],
    schedule:['现在处于限制时段','在设定的工作时间结束后恢复浏览。'],
    session:['专注模式正在进行','专注时长结束后恢复浏览。'],
    always:['此网站被设为始终限制','请在 Stay Focus 设置中调整规则。']};
  const kind=location.pathname.match(/blocked-(quota|schedule|session|always)\.html$/)?.[1]||'always';
  document.getElementById('reason').textContent=labels[kind][0];
  document.getElementById('resume').textContent=labels[kind][1];
  document.getElementById('back').addEventListener('click',()=>history.back());
  document.getElementById('settings').addEventListener('click',()=>{
    chrome.sidePanel.open({windowId:chrome.windows.WINDOW_ID_CURRENT}).catch(()=>{
      document.getElementById('hint').textContent='请点击 OpenDesk 扩展图标，在「工具」打开 Stay Focus。';
    });
  });
}
