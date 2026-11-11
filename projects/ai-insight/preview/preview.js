/* R5.5 demo-only preview: no network, storage, page hooks, or real AI access. */
(() => {
 'use strict';
 const C=globalThis.AIInsightCore;
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const B=(label,action,value='',kind='')=>'<button type="button" data-act="'+action+'" data-val="'+E(value)+'" class="'+kind+'">'+E(label)+'</button>';
 const tag=(v,kind='')=>'<span class="badge '+kind+'">'+E(v)+'</span>';
 const fmt=v=>Number.isFinite(v)?Math.round(v/C.MIN)+' 分钟':'未知';
 let s=C.demoState(),surface='pc',tab='problems',active='prob_bug',theme='light',focusBeforeDialog=null;
 let panelView='current',siteExpanded=false,siteShown=true,siteConversation='conv_a';
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
 const restore=()=>{const x=p();if(!x)return '';return '<div><strong>目标与验收</strong><p class="note">'+(x.id==='prob_bug'?'修复保存失败；保存→刷新→读取结果一致。':'尚待用户明确填写目标和验收条件。')+'</p></div><div><strong>当前有效结论</strong><p class="note">'+E(x.result)+'</p></div><div><strong>待验收</strong><p class="note">检查真实页面回执，不把 AI 自述当测试成功。</p></div><div><strong>下一步</strong><p class="note">'+E(x.next)+'</p></div>';};
 const weekly=()=>{const x=p();if(!x)return '';return '<p class="note">北极星候选：每周经确认、有可追溯证据的有效问题推进数。不能用提问越多、并发越多或工作越久作为成功指标。</p><div class="item mt"><strong>'+(s.outcome.state==='EVIDENCE_VERIFIED'&&x.id==='prob_bug'?1:0)+' 项模拟有证据推进</strong><p class="note">真实用户注意力：不可观测；真实产出改善：尚未研究验证。</p></div>'; };
 const privacy=()=>s.grants.map(g=>'<div class="item"><div class="row between"><strong>'+E(g.origin)+'</strong>'+tag(g.metadata?'元数据 ON':'已撤销',g.metadata?'good':'bad')+'</div><p class="note">'+E(g.accountId)+' · 正文 OFF · consent v'+g.revision+'</p>'+B(g.metadata?'撤销模拟授权':'重新允许（模拟）',g.metadata?'revoke':'grant',g.origin)+'</div>').join('');

 const timeline=()=>{const x=p();if(!x)return '';
   const ids=new Set(C.confirmedConversationIds(s,x.id));
   return s.executions.filter(e=>ids.has(e.conversationId)).map(e=>{
     const c=s.conversations.find(v=>v.id===e.conversationId),exact=e.coverage==='FULL'&&e.status==='COMPLETION_OBSERVED'&&Number.isFinite(e.endMs);
     const left=Math.max(0,Math.min(98,Math.round(e.startMs/(70*C.MIN)*100)));
     const width=exact?Math.max(2,Math.min(100-left,Math.round((e.endMs-e.startMs)/(70*C.MIN)*100))):2;
     // An unknown terminal event is a 2% start MARKER, never a fabricated 14-minute interval.
     return '<div class="timeline-row"><div><strong>'+E(c?.platform||'来源未知')+'</strong><div class="hint">'+E(e.id)+'</div></div><div class="track"><div class="bar '+(!exact?'unknown':c.platform==='Claude'?'claude':'')+'" style="left:'+left+'%;width:'+width+'%" title="'+(exact?'完整观察区间':'仅观察到起点；终点未知')+'"></div></div><div class="hint">'+(exact?fmt(e.endMs-e.startMs):'终点未知')+'</div></div>';
   }).join('')||'<p class="note">没有已确认的执行观察。</p>';
 };
 const siteConv=()=>s.conversations.find(c=>c.id===siteConversation)||null;
 const siteGrant=()=>{const c=siteConv();return s.grants.find(g=>g.origin===c?.origin&&g.accountId===c?.accountId)||null};
 const siteObservation=()=>{
   if(s.mode==='privacy')return '已暂停观察（演示）';
   if(s.mode==='empty')return '未观察到数据';
   if(s.mode==='error')return '适配异常 · 状态未知';
   if(s.mode==='partial')return '覆盖不完整';
   if(!siteGrant()?.metadata)return '站点未授权或已暂停';
   const rows=s.executions.filter(e=>e.conversationId===siteConversation);
   if(!rows.length)return '没有执行样本';
   return rows.some(e=>e.status!=='COMPLETION_OBSERVED'||e.coverage!=='FULL')?'请求结束未知':'已观察页面完成（模拟）';
 };
 const stateLabel=x=>!x?'尚未创建问题':x.status==='EVIDENCE_VERIFIED'?'模拟证据已记录':x.status==='NEEDS_VERIFICATION'?'待验收':x.status==='USER_CONFIRMED'?'用户已确认':x.status==='OPEN'?'进行中':x.status;
 const panelFocus=()=>{const x=p();if(!x)return '<p class="note">请主动创建问题。</p>';const m=C.problemMetrics(s,x.id);
   return '<div class="row">'+tag(stateLabel(x),x.status==='EVIDENCE_VERIFIED'?'good':'warn')+tag('完整样本 '+m.exactSampleCount)+tag('未知 '+m.unknownSampleCount,m.unknownSampleCount?'warn':'')+'</div><p class="note mt">AI 页面观察不等于服务端计算或人工工时。'+(m.unknownSampleCount?' 未知样本不补零。':'')+'</p>';
 };
 const drill=()=>{const x=p();if(!x)return '<p class="note">暂无问题。</p>';
   const related=s.links.filter(l=>l.problemId===x.id&&l.status==='CONFIRMED');
   const steps=related.map(l=>{const c=s.conversations.find(v=>v.id===l.conversationId),items=s.executions.filter(e=>e.conversationId===l.conversationId);
     return '<div><strong>Conversation · '+E(c?.platform||'未知')+' / '+E(c?.label||l.conversationId)+'</strong><p class="note">'+(items.map(e=>e.coverage==='FULL'&&Number.isFinite(e.endMs)?'完整观察 '+fmt(e.endMs-e.startMs):'终点未知/覆盖缺口').join('；')||'无执行样本')+' · 关系经用户确认</p></div>';
   }).join('')||'<div><p class="note">尚未关联会话。</p></div>';
   return '<div><strong>Problem · '+E(x.title)+'</strong><p class="note">验收条件：'+(x.id==='prob_bug'?'保存→刷新→读回一致':'需要用户明确填写')+' · '+E(stateLabel(x))+'</p></div>'+
     '<div><strong>Attempt · 尚无独立持久化演示记录</strong><p class="note">以下是 Conversation/Execution，不将对话数量当作尝试次数。</p></div>'+steps+
     '<div><strong>Evidence / Outcome</strong><p class="note">'+(x.id==='prob_bug'?'Outcome '+E(s.outcome.state)+'；模拟证据 '+s.evidence.filter(e=>e.validFor.includes(x.id)).length+' 条（均为 DEMO）':'尚无独立 Outcome / Evidence')+'</p></div>';
 };
 const siteMini=()=>{
   const x=p(),c=siteConv(),g=siteGrant(),m=x?C.problemMetrics(s,x.id):null;
   if(s.mode==='empty')return '<h2>暂无观察数据</h2><p class="note mt">这里没有历史聊天读取；可以手动创建问题。</p>'+B('手动创建问题','new','','primary');
   if(!x)return '<h2>没有当前问题</h2>'+B('手动创建问题','new','','primary');
   const allowed=Boolean(g?.metadata)&&s.mode!=='privacy';
   const linked=s.links.find(l=>l.problemId===x.id&&l.conversationId===siteConversation&&l.status==='CONFIRMED');
   const candidate=s.candidates.find(z=>z.problemId===x.id&&z.conversationId===siteConversation&&z.status==='PENDING');
   let action='<p class="note">当前没有待审关联，或站点未授权。相似标题不会自动合并。</p>';
   if(allowed&&candidate){
     action='<div class="item"><strong>'+E(candidate.relation==='SIMILAR'?'仅相似标题':'待确认同一问题')+'</strong><p class="note">支持：'+E(candidate.evidenceFor.join('、'))+'；反对：'+E(candidate.evidenceAgainst.join('、'))+'</p><div class="row">'+
       (candidate.relation==='SAME_PROBLEM'?B('确认关联','link',candidate.id,'primary'):'')+B('拒绝错误关联','reject',candidate.id)+'</div></div>';
   }else if(linked)action='<div class="row">'+tag('此会话已人工关联','good')+B('撤销关联','undo',linked.id)+'</div>';
   const validation=x.id==='prob_bug'?'<div class="row">'+B('标记待验收','outcome','NEEDS_VERIFICATION')+B('记录模拟测试通过','demo-test')+'</div>':'';
   return '<div class="row between"><h2>'+E(x.title)+'</h2>'+tag(stateLabel(x),x.status==='EVIDENCE_VERIFIED'?'good':'warn')+'</div>'+
      '<p class="note mt">模拟会话：'+E(c?.platform||'未知')+' · '+E(c?.label||'无身份')+'</p>'+
      '<p class="note">执行：'+E(siteObservation())+'。不是服务端权威回执。</p>'+
      '<p class="note">已确认 '+(m?.conversationCount??0)+' 对话 / '+(m?.platformCount??0)+' 平台；完整 '+(m?.exactSampleCount??0)+'，未知 '+(m?.unknownSampleCount??0)+'</p>'+
      '<div class="item mt"><strong>当前有效结论</strong><p class="note">'+E(x.result)+'</p><strong>下一步</strong><p class="note">'+E(x.next)+'</p></div>'+
      '<div class="mt">'+action+'</div>'+validation+
      '<hr class="divide"><div class="row">'+B('Side Panel','surface','panel','primary')+B('PC 问题详情','tab','problems')+B('收起','site-expand')+'</div>'+
      '<div class="row">'+(g?.metadata?B('暂停观察（模拟撤权）','site-pause',g.origin,'danger'):g?B('模拟重新授权','site-regrant',g.origin):tag('站点未授权','warn'))+B('隐藏提示','site-visibility')+'</div>'+
      '<p class="hint mt">隐藏提示仅改变 UI；暂停将修改模拟授权版本并阻断后续观察。真实授权需用户另行批准。</p>';
 };

 const notice=()=>{if(s.mode==='normal')return '';
   if(s.mode==='empty')return '<div class="surface empty"><h2>暂无观察数据</h2><p class="note">可以手动创建问题；不会抓取历史正文。</p>'+B('创建问题','new','','primary')+'</div>';
   if(s.mode==='privacy')return '<div class="surface empty"><h2>模拟采集已暂停</h2><p class="note">不接受新站点事件，已有数据只在页面内存中。</p>'+B('返回演示','normal')+'</div>';
   return '<div role="'+(s.mode==='error'?'alert':'status')+'" class="notice '+(s.mode==='error'?'error':'')+'">'+(s.mode==='error'?'模拟站点适配异常：完成状态未知，不自动补记。':'数据覆盖不完整：刷新/失联间隔不能当作 0 分钟。')+'</div>';
 };

 function render(){
   document.documentElement.dataset.theme=theme;
   $('#theme-btn').textContent=theme==='dark'?'切换浅色':'切换暗色';
   $('#scenario').value=s.mode;
   ['pc','panel','site'].forEach(id=>$('#'+id).hidden=surface!==id);
   $$('[data-act=surface]').forEach(b=>b.classList.toggle('selected',b.dataset.val===surface));
   const titles={problems:'问题中心',timeline:'执行与并行',outcomes:'成果与证据',restore:'工作恢复',weekly:'周复盘',privacy:'隐私与数据'};
   $('#page-title').textContent=titles[tab];
   $$('[data-act=tab]').forEach(b=>b.classList.toggle('selected',b.dataset.val===tab));
   const blocked=['empty','privacy'].includes(s.mode);
   $$('[data-pane]').forEach(el=>el.hidden=blocked||el.dataset.pane!==tab);
   $('#pc-message').innerHTML=notice();$('#panel-message').innerHTML=notice();
   $('#pc-summary').innerHTML=summary();$('#pc-stats').innerHTML='<div class="stack">'+stat()+'</div>';
   $('#pc-candidates').innerHTML=candidates();$('#pc-links').innerHTML=links();$('#pc-drill').innerHTML=drill();
   $('#pc-problems').innerHTML=s.problems.map(x=>'<div class="item"><div class="row between"><div><strong>'+E(x.title)+'</strong><p class="hint">'+E(x.id)+' · '+E(x.status)+'</p></div>'+B('查看问题','select-problem',x.id)+'</div></div>').join('');
   $('#pc-timeline').innerHTML=timeline();$('#pc-metrics').innerHTML=stat();
   $('#pc-outcome').innerHTML=outcome();$('#pc-restore').innerHTML=restore();$('#pc-weekly').innerHTML=weekly();
   $('#pc-privacy').innerHTML=privacy();$('#panel-summary').innerHTML=summary();
   $('#panel-candidates').innerHTML=candidates();$('#panel-links').innerHTML=links();
   $('#panel-metrics').innerHTML=stat();$('#panel-outcome').innerHTML=outcome();$('#panel-privacy').innerHTML=privacy();
   $('#panel-focus').innerHTML=panelFocus();
   $('#panel-next').textContent=p()?'下一步：'+p().next:'请先创建或选择一个问题';
   $('#panel-problems').innerHTML=s.problems.map(x=>'<div class="item"><strong>'+E(x.title)+'</strong><span class="note">'+E(stateLabel(x))+'</span>'+B('继续此问题','select-problem',x.id)+'</div>').join('')||'<p class="note">当前无问题。</p>';
   $$('[data-act=panel-view]').forEach(b=>b.classList.toggle('selected',b.dataset.val===panelView));
   $('#panel-current').hidden=!blocked&&panelView==='all';
   $('#panel-all').hidden=blocked||panelView!=='all';
   $$('#panel-current > section, #panel-current > details').forEach(el=>el.hidden=blocked);
   const c=siteConv();$('#site-conversation').value=siteConversation;
   $('#site-context-label').textContent=(c?.platform||'未知')+' · '+(c?.label||'未知');
   $('#site-chip-label').textContent=s.mode==='privacy'?'◈ AI Insight · 观察已暂停':'◈ '+(p()?.title||'尚未创建问题')+' · '+stateLabel(p())+' · '+siteObservation();
   $('#site-chip').setAttribute('aria-expanded',String(siteExpanded&&siteShown));
   $('#site-dock').hidden=!siteShown;$('#site-hidden-note').hidden=siteShown;
   $('#site-mini').hidden=!siteExpanded||!siteShown;
   if(siteExpanded&&siteShown)$('#site-mini').innerHTML=siteMini();
   $('#site-visibility-btn').textContent=siteShown?'隐藏网页提示':'显示网页提示';
 }

 const flash=txt=>{$('#live').textContent=txt;$('#feedback').textContent=txt};
 const close=()=>{const d=$('dialog[open]');if(d)d.close();if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();};

 document.addEventListener('click',event=>{
   const b=event.target.closest('button[data-act]');if(!b)return;
   const a=b.dataset.act,v=b.dataset.val;
   try{
     if(a==='surface')surface=v;
     else if(a==='panel-view')panelView=v;
     else if(a==='site-expand')siteExpanded=!siteExpanded;
     else if(a==='site-visibility'){siteShown=!siteShown;if(!siteShown)siteExpanded=false;}
     else if(a==='site-pause')s=C.applyAction(s,{type:'REVOKE_ORIGIN',origin:v});
     else if(a==='site-regrant')s=C.applyAction(s,{type:'GRANT_ORIGIN',origin:v});
     else if(a==='tab'){tab=v;surface='pc';}
     else if(a==='theme')theme=theme==='light'?'dark':'light';
     else if(a==='reset'){s=C.demoState();tab='problems';active='prob_bug';panelView='current';siteExpanded=false;siteShown=true;siteConversation='conv_a';}
     else if(a==='new'||a==='delete'){focusBeforeDialog=b;$(a==='new'?'#create-dialog':'#delete-dialog').showModal();if(a==='new')$('#new-name').focus();return;}
     else if(a==='cancel'){close();return;}
     else if(a==='confirm-delete'){s=C.applyAction(s,{type:'DELETE_PROBLEM',problemId:p().id});active=p()?.id??'';close();}
     else if(a==='normal')s=C.applyAction(s,{type:'SET_MODE',value:'normal'});
     else if(a==='privacy')s=C.applyAction(s,{type:'SET_MODE',value:'privacy'});
     else if(a==='select-problem'){active=v;tab='problems';panelView='current';}
     else if(a==='link')s=C.applyAction(s,{type:'LINK_CANDIDATE',candidateId:v});
     else if(a==='reject')s=C.applyAction(s,{type:'REJECT_CANDIDATE',candidateId:v});
     else if(a==='undo')s=C.applyAction(s,{type:'UNDO_LINK',linkId:v});
     else if(a==='split')s=C.applyAction(s,{type:'SPLIT_LINK',linkId:v,title:'独立复测问题'});
     else if(a==='outcome')s=C.applyAction(s,{type:'SET_OUTCOME',problemId:p().id,value:v});
     else if(a==='demo-test')s=C.applyAction(s,{type:'RECORD_DEMO_TEST',problemId:p().id});
     else if(a==='revoke')s=C.applyAction(s,{type:'REVOKE_ORIGIN',origin:v});
     else if(a==='grant')s=C.applyAction(s,{type:'GRANT_ORIGIN',origin:v});
     else return;
     render();flash('演示操作：'+(b.textContent?.trim()||a)+'；三端使用同一模拟数据。未操作真实 AI 网站。');
   }catch(error){flash('模拟操作失败：'+error.message);}
 });
 $('#scenario').addEventListener('change',e=>{s=C.applyAction(s,{type:'SET_MODE',value:e.target.value});render();flash('已切换 '+e.target.value+' 模拟场景');});
 $('#site-conversation').addEventListener('change',e=>{if(!s.conversations.some(c=>c.id===e.target.value))return;siteConversation=e.target.value;render();flash('已切换模拟 AI 对话；不读取真实网站');});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&siteExpanded&&!$('dialog[open]')){siteExpanded=false;render();$('#site-chip').focus();flash('迷你信息卡已收起');}});

 $('#create-form').addEventListener('submit',e=>{e.preventDefault();try{
   s=C.applyAction(s,{type:'CREATE_PROBLEM',title:$('#new-name').value});
   active=s.problems.at(-1).id;s.mode='normal';surface='pc';tab='problems';$('#new-name').value='';close();render();flash('模拟问题已创建，ID '+active);
 }catch(error){flash('创建失败：'+error.message)}});
 render();
})();
