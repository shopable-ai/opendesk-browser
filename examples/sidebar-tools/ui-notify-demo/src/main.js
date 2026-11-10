// Standalone unprivileged Sidebar Tool. All Toasts belong to the existing Host.
(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool,root=tool?.root;
  if(!root||typeof root.querySelector!=='function')throw Error('E_NOTIFY_DEMO_TOOL');
  const output=root.querySelector('#notify-demo-result');
  const budget=root.querySelector('#notify-demo-budget');
  const history=root.querySelector('#notify-demo-history');
  const position=root.querySelector('#notify-demo-position');
  const duration=root.querySelector('#notify-demo-timeout');
  if(!output||!budget||!history||!position||!duration)throw Error('E_NOTIFY_DEMO_VIEW');
  let activeHandle=null,activeRecord=null,displayRevision=0,sequence=0,retryAt=0,alive=true;
  const records=[];
  const samples=Object.freeze({
    add:()=>[{message:'独立消息',type:'info',group:false}],
    stack:()=>Array.from({length:3},()=>({message:'堆叠消息',type:'info',timeout:0,group:false})),
    info:()=>[{message:'这是一条信息通知',type:'info',caption:'不会中断当前操作'}],
    success:()=>[{message:'演示保存成功',type:'success',caption:'此处仅演示样式'}],
    warning:()=>[{message:'请先检查输入',type:'warning',caption:'不会自动修改任何数据'}],
    error:()=>[{message:'演示错误信息',type:'error',caption:'真实错误还应保留在工具正文'}],
    group:()=>[{message:'重复消息',type:'info',group:true},{message:'重复消息',type:'info',group:true}],
    separate:()=>[{message:'独立消息',group:false},{message:'独立消息',group:false}],
    persistent:()=>[{message:'请点击右侧 × 手动关闭',type:'warning',timeout:0}],
    duration:()=>[{message:'按所选时长展示',type:'info'}],
    legacy:()=>['字符串简写通知'],
    invalid:()=>[{message:'禁止伪造安装操作',action:'install'}]
  });
  const selected=()=>({position:position.value,timeout:Number(duration.value)});
  const resultText=receipt=>{
    if(!receipt||receipt.status==='unknown')return '结果未知：未收到可信 Host 回执；不自动重试。';
    if(receipt.status==='accepted')return 'Host 已接纳（不代表此刻可见或业务成功）。';
    if(receipt.reason==='rate_limited')
      return '限频拒绝；回执等待 '+Math.ceil(receipt.retryAfterMs/1000)+' 秒，不排队、不补发。';
    if(receipt.reason==='overflow')return '容量拒绝：当前通知优先级更高；未加入等待队列。';
    if(receipt.reason==='not_found')return '已不在 Host 通知状态（可能已到期、关闭或被替换）。';
    return 'Host 未接纳：'+String(receipt.reason||receipt.status)+'。';
  };
  function renderHistory(){
    if(!alive)return;
    const nodes=records.map(record=>{
      const li=root.ownerDocument.createElement('li');
      const text=root.ownerDocument.createElement('span');
      text.textContent='#'+record.id+' '+record.message+' — '+record.text;
      li.append(text);
      if(record.handle&&record.accepted&&!record.closeAttempted){
        const button=root.ownerDocument.createElement('button');
        button.type='button';button.dataset.close=String(record.id);
        button.textContent='关闭 #'+record.id;
        li.append(button);
      }
      return li;
    });
    history.replaceChildren(...nodes);
  }
  function recordRequest(message){
    const record={id:++sequence,message,text:'已提交，等待 Host 回执。',handle:null,accepted:false,closeAttempted:false};
    records.unshift(record);
    records.length=Math.min(records.length,12);
    renderHistory();
    return record;
  }
  function renderBudget(){
    if(!alive)return;
    budget.textContent=retryAt?Date.now()<retryAt?
      'Host 限频：约 '+Math.ceil((retryAt-Date.now())/1000)+' 秒后可手动再试；不会自动发送。':
      '上次 Host 等待值已倒计时结束；可手动再试，最终以新回执为准。':
      '每实例 60 秒内最多创建 3 次；关闭不返还额度。尚无 Host 限频回执。';
  }
  function settle(record,receipt,operation='创建'){
    record.text=operation+'：'+resultText(receipt);
    if(operation==='创建')record.accepted=receipt?.status==='accepted';
    if(receipt?.reason==='rate_limited'&&Number.isFinite(receipt.retryAfterMs)&&receipt.retryAfterMs>0){
      retryAt=Math.max(retryAt,Date.now()+receipt.retryAfterMs);
      renderBudget();
    }
    renderHistory();
    return record.text;
  }
  const publish=(token,text)=>{if(alive&&token===displayRevision)output.textContent=text;};
  async function createNotice(options){
    const record=recordRequest(options.message);
    const value={...options,message:options.message+' #'+record.id,group:false};
    if(typeof tool.ui.notify.open!=='function'){
      const submitted=tool.ui.notify(value);
      record.text=submitted?'沙箱已提交；旧 Bridge 无 Host 回执。':'本地拒绝，未提交。';
      renderHistory();return record;
    }
    record.handle=tool.ui.notify.open(value);
    if(!record.handle){record.text='本地拒绝，未提交。';renderHistory();return record;}
    try{settle(record,await record.handle.ready);}
    catch{settle(record,{status:'unknown'});}
    return record;
  }
  async function closeRecord(record,token){
    if(!record?.handle||record.closeAttempted)return;
    record.closeAttempted=true;
    if(activeHandle===record.handle){activeHandle=null;activeRecord=null;}
    record.text='关闭：等待 Host 回执。';renderHistory();
    let receipt;
    try{receipt=await record.handle.dismiss();}catch{receipt={status:'unknown'};}
    publish(token,settle(record,receipt,'关闭'));
  }
  async function runSample(which,token){
    const notify=tool.ui?.notify;
    if(typeof notify!=='function'){
      publish(token,'当前 Browser 不支持 ui.notify；本页正文状态可用。');return;
    }
    if(which==='handle-close'){
      const record=activeRecord;
      if(!record){publish(token,'当前没有可关闭的任务句柄；通知仍可点击 × 关闭。');return;}
      await closeRecord(record,token);return;
    }
    if(which==='loading-success'||which==='loading-fail'){
      if(typeof notify.open!=='function'){
        publish(token,'当前 Browser 无通知句柄能力，进度保留正文；不伪装已展示。');return;
      }
      if(activeHandle){publish(token,'请先关闭上一条任务通知，再开始新的生命周期演示。');return;}
      // Lock before awaiting ready, so a second click cannot start another task.
      const pending=createNotice({message:'模拟任务执行中…',type:'info',timeout:0,
        caption:'演示任务，不会写文件',position:position.value});
      const record=records[0],handle=record.handle;
      activeHandle=handle;activeRecord=record;
      publish(token,'已提交 Loading，等待 Host 回执。');
      await pending;
      if(!record.accepted){
        if(activeHandle===handle){activeHandle=null;activeRecord=null;}
        publish(token,record.text+' 演示不继续伪装已展示的 Loading。');return;
      }
      publish(token,record.text+' 演示任务运行中。');
      await new Promise(resolve=>setTimeout(resolve,1200));
      if(!alive||activeHandle!==handle||record.closeAttempted)return;
      const failed=which==='loading-fail';
      // Explicit demo business result, never inferred from Toast acceptance.
      const business={ok:!failed,error:failed?'模拟任务拒绝执行':''};
      const next=business.ok?
        {message:'模拟任务已完成',type:'success',caption:'模拟回执确认完成',timeout:3000,position:position.value}:
        {message:'模拟任务失败',type:'error',caption:business.error,timeout:0,position:position.value};
      const changed=await handle.update(next);
      if(record.closeAttempted||!alive)return;
      publish(token,settle(record,changed,'更新为'+(business.ok?'成功':'失败'))+
        (business.ok?' 演示完成。':' 失败原因：'+business.error+'；请手动关闭。'));
      if(business.ok&&activeHandle===handle){activeHandle=null;activeRecord=null;}
      return;
    }
    if(which==='rate-probe'||which==='stack'||which==='separate'||which==='add'){
      const values=which==='rate-probe'?Array.from({length:4},()=>({message:'限频测试',type:'info',timeout:3000})):
        samples[which]();
      publish(token,'提交 '+values.length+' 次创建，逐条结果保留在请求记录。');
      const rows=await Promise.all(values.map(value=>createNotice({...selected(),...value})));
      publish(token,rows.map(row=>'#'+row.id+' '+row.text).join(' '));return;
    }
    const factory=Object.hasOwn(samples,which)?samples[which]:null;
    if(!factory)return;
    if(which==='group'||which==='legacy'||which==='invalid'){
      for(const value of factory()){
        const record=recordRequest(typeof value==='string'?value:value.message);
        const submitted=notify(typeof value==='string'||which==='invalid'?value:{...selected(),...value});
        record.text=submitted?'沙箱已提交，无 Host 回执；相同内容默认合并，每次仍占额度。':
          which==='invalid'?'PASS：非法动作参数已在本地拒绝，未发送。':'本地拒绝，未提交。';
        renderHistory();publish(token,record.text);
      }
      return;
    }
    const record=await createNotice({...selected(),...factory()[0]});
    publish(token,'#'+record.id+' '+record.text);
  }
  const onClick=event=>{
    const button=event.target.closest?.('button[data-sample],button[data-close]');
    if(!button||!root.contains(button))return;
    const token=++displayRevision;
    const operation=button.dataset.close?
      closeRecord(records.find(row=>row.id===Number(button.dataset.close)),token):runSample(button.dataset.sample,token);
    void operation.catch(error=>publish(token,'演示发生异常：'+String(error?.message||error).slice(0,160)));
  };
  root.addEventListener('click',onClick);
  const ticker=setInterval(renderBudget,1000); // Display only; never resends a rejected request.
  globalThis.addEventListener('pagehide',()=>{
    alive=false;activeHandle=null;activeRecord=null;clearInterval(ticker);root.removeEventListener('click',onClick);
    records.length=0;
  },{once:true});
})();
