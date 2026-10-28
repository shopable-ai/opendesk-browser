/* Standalone CUSTOMER SITE fixture. No OpenDesk imports, AI calls or hidden reply generator.
 * Only real DOM customer messages trigger observers. Replies must enter through
 * the visible agent form and survive a DOM read-back by the outside adapter. */
(() => {
  'use strict';
  if(location.origin!=='http://127.0.0.1:43111'||location.pathname!=='/ai-knowledge-chat-demo.html')return;
  const root=document.querySelector('[data-kb-demo="v1"]');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const threads=new Map([['thread_demo_01',[]],['thread_demo_02',[]]]);
  const scenarios=[
    {text:'几天内可以退款',scope:''},
    {text:'退款需要几天',scope:''},
    {text:'客服上班时间',scope:''},
    {text:'周末有客服吗',scope:''},
    {text:'订单通常几天发货',scope:''},
    {text:'数字商品不退款吗',scope:''},
    {text:'A 方案支持几名成员',scope:'A 方案'},
    {text:'B 方案支持几名成员',scope:'B 方案'},
    {text:'快递到哪里了',scope:''},
    {text:'我想修改地址但已经发货',scope:''},
    {text:'优惠券能叠加吗',scope:''},
    {text:'我能驾驶飞船去月球吗',scope:''}
  ];  let active='thread_demo_01',sequence=0,received=0,errors=0,eventCount=0;
  let timer=null,timerMode='idle',budget=0,generated=0,scenarioIndex=0;
  const now=()=>new Date().toISOString();
  const uid=()=>crypto.randomUUID();
  function log(type,detail){
    const item=document.createElement('li');
    const stamp=document.createElement('time');
    stamp.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});
    const content=document.createElement('span');
    content.textContent=type+' · '+String(detail||'').slice(0,160);
    item.append(stamp,content);
    $('kb-demo-events').prepend(item);
    while($('kb-demo-events').children.length>60)$('kb-demo-events').lastElementChild.remove();
    $('kb-demo-event-count').textContent=String(++eventCount);
  }
  function updateNumbers(){
    $('kb-demo-generated').textContent=String(generated);
    $('kb-demo-received').textContent=String(received);
    $('kb-demo-errors').textContent=String(errors);
  }
  function display(message){
    const card=document.createElement('article');
    card.className='message message--'+message.direction;
    card.dataset.messageId=message.id;
    card.dataset.threadId=message.threadId;
    card.dataset.direction=message.direction;
    card.dataset.createdAt=message.createdAt;
    card.dataset.scope=message.scope||'';
    if(message.replyTo)card.dataset.replyTo=message.replyTo;
    const avatar=document.createElement('span');avatar.className='message-avatar';
    avatar.setAttribute('aria-hidden','true');
    avatar.textContent=message.direction==='customer'?'客':'我';
    const body=document.createElement('div');body.className='message-body';
    const meta=document.createElement('div');meta.className='message-meta';
    const origin=document.createElement('span');
    origin.textContent=message.direction==='customer'
      ?'客户 '+(message.threadId==='thread_demo_01'?'A':'B'):'我 · 客服';
    const time=document.createElement('time');
    time.dateTime=message.createdAt;
    time.textContent=new Date(message.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
    meta.append(origin,time);
    const bubble=document.createElement('p');
    bubble.setAttribute('data-message-text','');
    bubble.textContent=message.text;
    body.append(meta,bubble);
    card.append(avatar,body);
    if(message.direction==='customer'){
      card.tabIndex=0;
      card.setAttribute('role','button');
      card.setAttribute('aria-label','选择客户消息供客服回复');
      card.title='点击选择要回复的消息';
      card.addEventListener('click',()=>selectQuestion(message));
      card.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();selectQuestion(message);}
      });
    }
    $('kb-demo-message-list').append(card);
    $('kb-demo-empty')?.remove();
    $('kb-demo-message-list').scrollTop=$('kb-demo-message-list').scrollHeight;
  }
  function redraw(){
    const list=$('kb-demo-message-list');
    list.replaceChildren();
    for(const msg of threads.get(active))display(msg);
    if(!list.children.length){
      const empty=document.createElement('div');
      empty.id='kb-demo-empty';empty.className='empty-state';
      const title=document.createElement('strong');
      title.textContent='当前会话还没有消息';
      const note=document.createElement('p');
      note.textContent='发送客户问题或启动定时模式。';
      empty.append(title,note);list.append(empty);
    }
    const draft=$('kb-demo-agent-draft');
    draft.dataset.replyTo='';draft.dataset.threadId='';
    $('kb-demo-agent-target').textContent='未选择客户消息';
    $('kb-demo-agent-status').textContent='';
  }
  function chooseThread(id){
    if(!threads.has(id)||id===active)return;
    stopTimer('已切换会话，定时发送停止');
    active=id;
    root.dataset.activeThread=id;
    $('kb-demo-thread-label').textContent=id.endsWith('01')?'会话 A · 本地示例政策':'会话 B · 本地示例政策';
    for(const button of root.querySelectorAll('[data-kb-thread]')){
      const selected=button.dataset.kbThread===id;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    redraw();log('会话切换',id);
  }
  function addMessage(direction,text,{scope='',replyTo=''}={}){
    if(!text||!text.trim()||text.length>(direction==='customer'?300:3000))return null;
    const message={id:'kb_msg_'+uid(),threadId:active,direction,text:text.trim(),
      scope,replyTo,createdAt:now(),order:++sequence};
    threads.get(active).push(message);
    display(message);
    log(direction==='customer'?'客户新消息':'客服表单发送',message.id+(replyTo?' → '+replyTo:''));
    return message;
  }
  function addCustomer(text,scope=''){
    const message=addMessage('customer',text,{scope});
    if(message){generated++;updateNumbers();}
    return message;
  }
  function selectQuestion(message){
    if(message.threadId!==active)return;
    $('kb-demo-agent-draft').dataset.replyTo=message.id;
    $('kb-demo-agent-draft').dataset.threadId=message.threadId;
    $('kb-demo-agent-target').textContent='回复 '+message.id.slice(-8);
    $('kb-demo-agent-status').textContent='';
  }
  function rejectAgent(message){
    errors++;updateNumbers();
    $('kb-demo-agent-status').textContent=message;log('页面拒绝',message);return false;
  }
  function sendAgent(){
    const draft=$('kb-demo-agent-draft');
    const replyTo=draft.dataset.replyTo,threadId=draft.dataset.threadId;
    if(!replyTo||threadId!==active)return rejectAgent('缺少当前会话的客户消息身份');
    const all=threads.get(active);
    if(!all.some(x=>x.id===replyTo&&x.direction==='customer'))return rejectAgent('客户消息已失效');
    if(all.some(x=>x.direction==='agent'&&x.replyTo===replyTo))return rejectAgent('该客户消息已有客服回复，禁止重复发送');
    if(!draft.value.trim())return rejectAgent('客服草稿不能为空');
    const answer=addMessage('agent',draft.value,{replyTo});
    if(!answer)return rejectAgent('客服草稿长度无效');
    draft.value='';draft.dataset.replyTo='';draft.dataset.threadId='';
    received++;updateNumbers();
    $('kb-demo-agent-target').textContent='未选择客户消息';
    $('kb-demo-agent-status').textContent='已由网页表单发送，等待扩展独立读回 DOM 确认';
    return true;
  }
  function clearTimer(){if(timer!==null){clearInterval(timer);timer=null;}}
  function timerState(message){
    $('kb-demo-timer-state').textContent=message;
    $('kb-demo-start').textContent=timerMode==='paused'?'继续':'开始';
    $('kb-demo-start').disabled=timerMode==='running';
    $('kb-demo-pause').disabled=timerMode!=='running';
    $('kb-demo-stop').disabled=!['running','paused'].includes(timerMode);
    $('kb-demo-interval').disabled=['running','paused'].includes(timerMode);
    $('kb-demo-limit').disabled=['running','paused'].includes(timerMode);
  }
  function stopTimer(message='已停止'){
    clearTimer();timerMode='idle';timerState(message);
  }
  function tick(){
    if(timerMode!=='running')return;
    if(generated>=budget){stopTimer('已完成本轮 '+budget+' 条客户消息');return;}
    const item=scenarios[scenarioIndex++%scenarios.length];
    addCustomer(item.text,item.scope);
    timerState('运行中 · 已产生 '+generated+' / '+budget+' 条');
    if(generated>=budget)stopTimer('已完成本轮 '+budget+' 条客户消息');
  }
  function startTimer(){
    if(timerMode==='running')return;
    if(timerMode!=='paused'){
      generated=0;received=0;errors=0;scenarioIndex=0;
      budget=Number($('kb-demo-limit').value);
      updateNumbers();
    }
    timerMode='running';timerState('运行中 · 已产生 '+generated+' / '+budget+' 条');
    clearTimer();timer=setInterval(tick,Number($('kb-demo-interval').value));
    log('定时模式','开始 / 继续，最多 '+budget+' 条');
  }
  function pauseTimer(){
    if(timerMode!=='running')return;
    clearTimer();timerMode='paused';timerState('已暂停 · '+generated+' / '+budget+' 条');
    log('定时模式','暂停');
  }
  $('kb-demo-customer-form').addEventListener('submit',event=>{
    event.preventDefault();
    const text=$('kb-demo-customer-input').value.trim();
    if(!text)return;
    if(addCustomer(text,$('kb-demo-customer-scope').value))$('kb-demo-customer-input').value='';
  });
  for(const button of root.querySelectorAll('[data-kb-quick]')){
    button.addEventListener('click',()=>{$('kb-demo-customer-input').value=button.dataset.kbQuick;$('kb-demo-customer-input').focus();});
  }
  for(const button of root.querySelectorAll('[data-kb-thread]')){
    button.addEventListener('click',()=>chooseThread(button.dataset.kbThread));
  }
  $('kb-demo-agent-send').addEventListener('click',sendAgent);
  $('kb-demo-start').addEventListener('click',startTimer);
  $('kb-demo-pause').addEventListener('click',pauseTimer);
  $('kb-demo-stop').addEventListener('click',()=>{stopTimer();log('定时模式','停止');});
  $('kb-demo-reset').addEventListener('click',()=>{
    stopTimer('已重置');threads.set(active,[]);
    generated=0;received=0;errors=0;eventCount=0;
    $('kb-demo-events').replaceChildren();$('kb-demo-event-count').textContent='0';
    updateNumbers();redraw();log('重置','当前会话消息已清空');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&timerMode==='running')pauseTimer();});
  window.addEventListener('pagehide',()=>stopTimer('页面离开，定时器已清理'),{once:true});
  new MutationObserver(()=>{
    $('kb-demo-site-status').textContent=root.dataset.kbExtensionObserved==='true'
      ?'OpenDesk 已读取测试页 DOM · 是否授权请看侧栏'
      :'网页就绪 · 等待 OpenDesk 监听';
  }).observe(root,{attributes:true,attributeFilter:['data-kb-extension-observed']});
  root.dataset.activeThread=active;
  redraw();timerState('尚未开始');
  log('网页加载','模拟站点未连接任何回答模型');
})();
