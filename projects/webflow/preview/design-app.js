// External preview controls only. Product markup, styling and behavior are compiled from source.
(()=>{
 const data=JSON.parse(document.getElementById('webflow-preview-sources').textContent);
 const frame=document.getElementById('candidate'),feedback=document.getElementById('preview-feedback');
 const send=(action,value)=>frame.contentWindow.postMessage({protocol:'webflow.source-preview.v1',action,value},'*');
 frame.srcdoc=data.candidate;
 for(const [id,value]of [['preview-home','overview'],['preview-task','task'],['preview-scope','scope']])
  document.getElementById(id).onclick=()=>{send('view',value);feedback.textContent='已切换视图，模拟草稿仍保留。';};
 const resize=()=>{const width=document.getElementById('preview-width').value,theme=document.getElementById('preview-theme').value;
  document.getElementById('preview-device').style.width=width+'px';
  document.getElementById('preview-size').textContent=width+' px · '+(theme==='dark'?'深色应用':'浅色应用');};
 document.getElementById('preview-width').onchange=resize;
 document.getElementById('preview-theme').onchange=event=>{send('theme',event.currentTarget.value);resize();};
 for(const [id,action]of [['lab-auth','auth'],['lab-task','task'],['lab-listener','listener'],['lab-enabled','enabled']])
  document.getElementById(id).onchange=event=>{send(action,event.currentTarget.value);feedback.textContent='已切换模拟状态，未调用任何真实任务或权限。';};
 document.getElementById('lab-reset').onclick=()=>{
  frame.srcdoc=data.candidate;
  for(const id of ['lab-auth','lab-task','lab-listener','lab-enabled','preview-theme'])document.getElementById(id).selectedIndex=0;
  resize();feedback.textContent='已重置本页模拟数据与草稿，真实数据不受影响。';
 };
})();
