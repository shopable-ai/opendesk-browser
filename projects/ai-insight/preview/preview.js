/* R5 preview controller. Demo state only; no network, storage, permissions or page hooks. */
(() => {
 'use strict';
 const C=globalThis.AIInsightCore;
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const B=(label,action,value='',kind='')=>'<button type="button" data-act="'+action+'" data-val="'+E(value)+'" class="'+kind+'">'+E(label)+'</button>';
 const tag=(v,kind='')=>'<span class="badge '+kind+'">'+E(v)+'</span>';
 const fmt=v=>Number.isFinite(v)?Math.round(v/C.MIN)+' 分钟':'未知';
 let s=C.demoState(),surface='pc',tab='problems',active='prob_bug',theme='light',focusBeforeDialog=null;
 const p=()=>s.problems.find(x=>x.id===active)||s.problems[0]||null;
 const summary=()=>{const x=p(); if(!x)return '<div class="empty">当前没有问题</div>';
   return '<div class="row between"><div><span class="hint">'+E(x.id)+'</span><h2>'+E(x.title)+'</h2></div>'+tag(x.status,x.status==='EVIDENCE_VERIFIED'?'good':'warn')+'</div><hr class="divide"><p class="note">有效结论：'+E(x.result)+'</p><p class="note mt">下一步：'+E(x.next)+'</p><div class="row mt">'+B('查看恢复摘要','tab','restore')+B('查看验收','tab','outcomes')+'</div>';
 };
 const stat=()=>{const x=p();if(!x)return '';const m=C.problemMetrics(s,x.id);
   return '<div class="stat-grid"><div class="surface stat"><strong>'+m.conversationCount+'</strong><span>对话（已确认）</span></div><div class="surface stat"><strong>'+m.platformCount+'</strong><span>AI 平台</span></div><div class="surface stat"><strong>'+fmt(m.sumMs)+'</strong><span>已知执行时长总和</span></div><div class="surface stat"><strong>'+fmt(m.unionMs)+'</strong><span>并行区间并集</span></div></div><p class="note mt">完整样本 '+m.exactSampleCount+'，未知 '+m.unknownSampleCount+'；覆盖率 '+(m.coverage===null?'无数据':Math.round(m.coverage*100)+'%')+'。不估计人工工时。</p>';
 };
 const candidates=()=>{const x=p();if(!x)return '';return s.candidates.filter(c=>c.problemId===x.id&&c.status==='PENDING').map(c=>{
   const v=s.conversations.find(y=>y.id===c.conversationId);return '<div class="item"><div class="row between"><strong>'+E(v.platform)+' · '+E(v.label)+'</strong>'+tag(c.relation==='SIMILAR'?'仅相似':'同问题候选')+'</div><p class="note">支持：'+E(c.evidenceFor.join('、'))+'；反对：'+E(c.evidenceAgainst.join('、'))+'；推断置信 '+Math.round(c.confidence*100)+'%（非准确率）</p><div class="row">'+(c.relation==='SAME_PROBLEM'?B('确认关联','link',c.id,'primary'):'')+B('拒绝错误关联','reject',c.id)+'</div></div>';
 }).join('')||'<div class="note">没有待审候选。</div>'};
 const links=()=>{const x=p();if(!x)return '';return s.links.filter(l=>l.problemId===x.id&&l.status==='CONFIRMED').map(l=>{
   const v=s.conversations.find(y=>y.id===l.conversationId);return '<div class="item"><strong>'+E(v.platform)+' · '+E(v.label)+'</strong><p class="note">'+E(l.evidenceFor?.join('、')||'人工确认')+' · 关联版本 '+E(l.revision)+'</p><div class="row">'+B('撤销合并','undo',l.id)+B('拆分为新问题','split',l.id)+'</div></div>';
 }).join('')||'<div class="note">尚无已确认对话。</div>'};
 const outcome=()=>{const x=p();if(!x)return '';if(x.id!=='prob_bug')return '<p class="note">新问题暂无独立成果与验收记录。</p>';
   const o=s.outcome;return '<div class="item"><div class="row between"><strong>'+E(o.state)+'</strong>'+tag(o.state==='EVIDENCE_VERIFIED'?'模拟证据':'尚无独立验收',o.state==='EVIDENCE_VERIFIED'?'good':'warn')+'</div><p class="note">'+E(o.aiClaim)+'。用户确认不等于测试证明。</p></div><div class="list mt">'+s.evidence.filter(e=>e.validFor.includes(x.id)).map(e=>'<div class="item"><strong>'+E(e.label)+'</strong><span class="hint">'+E(e.kind)+' · DEMO</span></div>').join('')+'</div><div class="row mt">'+B('标记待验收','outcome','NEEDS_VERIFICATION')+B('用户确认','outcome','USER_CONFIRMED','primary')+B('记录模拟测试通过','demo-test')+B('重新开启','outcome','REOPENED')+'</div>';
 };
 const restore=()=>{const x=p();if(!x)return '';return '<div><strong>目标与验收</strong><p class="note">修复保存失败；保存→刷新→读取结果一致。</p></div><div><strong>当前有效结论</strong><p class="note">'+E(x.result)+'</p></div><div><strong>待验收</strong><p class="note">检查真实页面回执，不把 AI 自述当测试成功。</p></div><div><strong>下一步</strong><p class="note">'+E(x.next)+'</p></div>';};
 const weekly=()=>{const x=p();if(!x)return '';return '<p class="note">北极星候选：每周经确认、有可追溯证据的有效问题推进数。不能用提问越多、并发越多或工作越久作为成功指标。</p><div class="item mt"><strong>'+(s.outcome.state==='EVIDENCE_VERIFIED'&&x.id==='prob_bug'?1:0)+' 项模拟有证据推进</strong><p class="note">真实用户注意力：不可观测；真实产出改善：尚未研究验证。</p></div>'; };
 const privacy=()=>s.grants.map(g=>'<div class="item"><div class="row between"><strong>'+E(g.origin)+'</strong>'+tag(g.metadata?'元数据 ON':'已撤销',g.metadata?'good':'bad')+'</div><p class="note">'+E(g.accountId)+' · 正文 OFF · consent v'+g.revision+'</p>'+B(g.metadata?'撤销模拟授权':'重新允许（模拟）',g.metadata?'revoke':'grant',g.origin)+'</div>').join('');
 const timeline=()=>{const x=p();if(!x)return '';const ids=new Set(C.confirmedConversationIds(s,x.id));const rows=s.executions.filter(e=>ids.has(e.conversationId));return rows.map(e=>{
   const v=s.conversations.find(y=>y.id===e.conversationId),beg=e.startMs/C.MIN,end=e.endMs===null?beg+14:e.endMs/C.MIN;
   const left=Math.round(beg/70*100),width=Math.max(2,Math.round((end-beg)/70*100));
   return '<div class="timeline-row"><div><strong>'+E(v.platform)+'</strong><div class="hint">'+E(e.id)+'</div></div><div class="track"><div class="bar '+(e.coverage!=='FULL'?'unknown':v.platform==='Claude'?'claude':'')+'" style="left:'+left+'%;width:'+width+'%"></div></div><div class="hint">'+(e.coverage==='FULL'?fmt(e.endMs-e.startMs):'中断/未知')+'</div></div>';
 }).join('')||'<div class="empty note">没有已关联的执行。</div>'};
 const notice=()=>{if(s.mode==='normal')return '';
   if(s.mode==='empty')return '<div class="surface empty"><h2>暂无观察数据</h2><p class="note">可以手动创建问题；不会抓取历史正文。</p>'+B('创建问题','new','','primary')+'</div>';
   if(s.mode==='privacy')return '<div class="surface empty"><h2>模拟采集已暂停</h2><p class="note">不接受新站点事件，已有数据只在页面内存中。</p>'+B('返回演示','normal')+'</div>';
   return '<div role="'+(s.mode==='error'?'alert':'status')+'" class="notice '+(s.mode==='error'?'error':'')+'">'+(s.mode==='error'?'模拟站点适配异常：完成状态未知，不自动补记。':'数据覆盖不完整：刷新/失联间隔不能当作 0 分钟。')+'</div>';
 };
 function render(){
   document.documentElement.dataset.theme=theme;$('#theme-btn').textContent=theme==='dark'?'切换浅色':'切换暗色';
   $('#scenario').value=s.mode;
   ['pc','panel','site'].forEach(x=>$('#'+x).hidden=surface!==x);
   $$('[data-act=surface]').forEach(b=>b.classList.toggle('selected',b.dataset.val===surface));
   const titles={problems:'问题中心',timeline:'执行与并行',outcomes:'成果与证据',restore:'工作恢复',weekly:'周复盘',privacy:'隐私与数据'};
   $('#page-title').textContent=titles[tab];$$('[data-act=tab]').forEach(b=>b.classList.toggle('selected',b.dataset.val===tab));
   $$('[data-pane]').forEach(el=>el.hidden=el.dataset.pane!==tab);
   $('#pc-message').innerHTML=notice();$('#panel-message').innerHTML=notice();
   const blocked=['empty','privacy'].includes(s.mode);
   $$('[data-pane]').forEach(el=>{if(!blocked)return;el.hidden=true});
   if(blocked){} // render only empty/privacy state + top header
   $('#pc-summary').innerHTML=summary();
   $('#pc-stats').innerHTML='<div class="stack">'+stat()+'</div>';
   $('#pc-candidates').innerHTML=candidates();$('#pc-links').innerHTML=links();
   $('#pc-problems').innerHTML=s.problems.map(x=>'<div class="item"><div class="row between"><div><strong>'+E(x.title)+'</strong><p class="hint">'+E(x.id)+' · '+E(x.status)+'</p></div>'+B('查看问题','select-problem',x.id)+'</div></div>').join('');
   $('#pc-timeline').innerHTML=timeline();$('#pc-metrics').innerHTML=stat();
   $('#pc-outcome').innerHTML=outcome();$('#pc-restore').innerHTML=restore();$('#pc-weekly').innerHTML=weekly();
   $('#pc-privacy').innerHTML=privacy();$('#panel-summary').innerHTML=summary();
   $('#panel-candidates').innerHTML=candidates();$('#panel-links').innerHTML=links();
   $('#panel-metrics').innerHTML=stat();$('#panel-outcome').innerHTML=outcome();$('#panel-privacy').innerHTML=privacy();
   $('#site-summary').textContent=(p()?.title||'未关联')+' · AI 状态未知（模拟）';
   if(blocked)$$('.panel-scroll > section').forEach(el=>el.hidden=true);else $$('.panel-scroll > section').forEach(el=>el.hidden=false);
 }
 const flash=txt=>{$('#live').textContent=txt};
 const close=()=>{const d=$('dialog[open]');if(d)d.close();if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();};
 document.addEventListener('click',event=>{
   const b=event.target.closest('button[data-act]');if(!b)return;const a=b.dataset.act,v=b.dataset.val;
   try{
     if(a==='surface')surface=v;
     else if(a==='tab'){tab=v;surface='pc'}
     else if(a==='theme')theme=theme==='light'?'dark':'light';
     else if(a==='reset'){s=C.demoState();tab='problems';active='prob_bug'}
     else if(a==='new'||a==='delete'){focusBeforeDialog=b;$(a==='new'?'#create-dialog':'#delete-dialog').showModal();if(a==='new')$('#new-name').focus();return;}
     else if(a==='cancel'){close();return}
     else if(a==='confirm-delete'){s=C.applyAction(s,{type:'DELETE_PROBLEM',problemId:p().id});active=p()?.id??'';close();}
     else if(a==='normal')s=C.applyAction(s,{type:'SET_MODE',value:'normal'});
     else if(a==='privacy')s=C.applyAction(s,{type:'SET_MODE',value:'privacy'});
     else if(a==='select-problem'){active=v;tab='problems'}
     else if(a==='link')s=C.applyAction(s,{type:'LINK_CANDIDATE',candidateId:v});
     else if(a==='reject')s=C.applyAction(s,{type:'REJECT_CANDIDATE',candidateId:v});
     else if(a==='undo')s=C.applyAction(s,{type:'UNDO_LINK',linkId:v});
     else if(a==='split')s=C.applyAction(s,{type:'SPLIT_LINK',linkId:v,title:'独立复测问题'});
     else if(a==='outcome')s=C.applyAction(s,{type:'SET_OUTCOME',problemId:p().id,value:v});
     else if(a==='demo-test')s=C.applyAction(s,{type:'RECORD_DEMO_TEST',problemId:p().id});
     else if(a==='revoke')s=C.applyAction(s,{type:'REVOKE_ORIGIN',origin:v});
     else if(a==='grant')s=C.applyAction(s,{type:'GRANT_ORIGIN',origin:v});
     else return;
     render();flash('已执行模拟操作：'+a+'；统计和界面已更新');
   }catch(error){flash('模拟操作失败：'+error.message)}
 });
 $('#scenario').addEventListener('change',e=>{s=C.applyAction(s,{type:'SET_MODE',value:e.target.value});render();flash('已切换 '+e.target.value+' 场景')});
 $('#create-form').addEventListener('submit',e=>{e.preventDefault();try{
   s=C.applyAction(s,{type:'CREATE_PROBLEM',title:$('#new-name').value});
   active=s.problems.at(-1).id;s.mode='normal';surface='pc';tab='problems';$('#new-name').value='';close();render();flash('模拟问题已创建，ID '+active);
 }catch(error){flash('创建失败：'+error.message)}});
 render();
})();
