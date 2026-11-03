// Only comparison controls live here. All application controls render from
// the actual source in the existing isolated component fixture.
(()=>{
 const data=JSON.parse(document.getElementById('webflow-preview-sources').textContent);
 const frames=['baseline','candidate'].map(id=>document.getElementById(id));
 frames.forEach(frame=>{frame.srcdoc=data[frame.id];});
 const feedback=document.getElementById('compare-feedback');
 const send=(action,value)=>frames.forEach(frame=>frame.contentWindow.postMessage({protocol:'webflow.source-preview.v1',action,value},'*'));
 document.getElementById('compare-home').onclick=()=>{send('view','overview');feedback.textContent='两侧回到相同主界面。应用与业务样式完全相同；草稿仍保留。';};
 document.getElementById('compare-scope').onclick=()=>{send('view','scope');feedback.textContent='仅比较运行与授权：页签停留、摘要对齐、按钮层级与审核可访问性。请在面板内滚动查看。';};
 document.getElementById('compare-mode').onclick=event=>{
  const figure=document.getElementById('baseline-figure');figure.hidden=!figure.hidden;
  event.currentTarget.setAttribute('aria-pressed',String(figure.hidden));
  event.currentTarget.textContent=figure.hidden?'显示前后对照':'仅看调整后';
 };
 for(const [id,action]of [['lab-auth','auth'],['lab-task','task'],['lab-copy','copy']])
  document.getElementById(id).onchange=event=>{send(action,event.currentTarget.value);feedback.textContent='已切换两侧内存场景；真实任务、授权和系统剪贴板不受影响。';};
 document.getElementById('lab-reset').onclick=()=>{
  frames.forEach(frame=>{frame.srcdoc=data[frame.id];});
  for(const id of ['lab-auth','lab-task','lab-copy'])document.getElementById(id).selectedIndex=0;
  feedback.textContent='已重置两侧模拟数据与草稿；真实数据不受影响。';
 };
})();
