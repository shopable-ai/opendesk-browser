// This opaque sandbox only displays status. There is no privileged toggle here:
// a sandbox click is not a Chrome permission gesture.
(function(){
  var root=window.OpenDeskTool&&window.OpenDeskTool.root;
  var hint=root&&root.querySelector('#ai-access-help');
  if(!hint)return;
  async function refresh(){
    try{
      var state=await window.OpenDeskTool.request('aiAccess.status',{});
      var labels={enabled:'已启用',disabled:'未启用',activation_required:'需要激活',
        unavailable:'不可用',conflict:'代理由其他扩展管理'};
      hint.textContent=labels[state.state]||'状态待确认';
    }catch(error){hint.textContent='无法确认代理状态，请重新打开工具';}
  }
  root.addEventListener('opendesk-tool-state-changed',refresh);
  refresh();
})();
