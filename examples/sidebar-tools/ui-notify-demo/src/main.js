// Standalone unprivileged Sidebar Tool. No Chrome API, network, Installer or HTML injection.
(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool,root=tool?.root;
  if(!root||typeof root.querySelector!=='function')throw Error('E_NOTIFY_DEMO_TOOL');
  const output=root.querySelector('#notify-demo-result');
  const position=root.querySelector('#notify-demo-position');
  const duration=root.querySelector('#notify-demo-timeout');
  if(!output||!position||!duration)throw Error('E_NOTIFY_DEMO_VIEW');
  let activeHandle=null,displayRevision=0;
  const samples=Object.freeze({
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
    if(!receipt||receipt.status==='unknown')return '未收到可信宿主回执（可能是旧版本或工具已失效），不能证明展示；保留正文状态。';
    if(receipt.status==='accepted')return 'Host 已接纳并写入通知状态；请在界面目视确认真正呈现。';
    if(receipt.reason==='rate_limited')
      return 'Host 限频拒绝；距离当前额度恢复约 '+Math.ceil(receipt.retryAfterMs/1000)+' 秒。';
    return 'Host 未接纳：'+String(receipt.reason||receipt.status)+'；没有展示成功的证据。';
  };
  const publish=(token,text)=>{if(token===displayRevision)output.textContent=text;};
  async function runSample(which,token){
    const notify=tool.ui?.notify;
    if(typeof notify!=='function'){
      publish(token,'当前 Browser 不支持 ui.notify；本页正文状态可用，不会尝试安装或提权。');return;
    }
    if(which==='handle-close'){
      const previous=activeHandle;
      if(!previous){publish(token,'当前没有可关闭的长任务句柄；长期普通通知仍可点击 × 关闭。');return;}
      activeHandle=null;
      publish(token,'已请求关闭既有通知，等待 Host 回执。');
      publish(token,resultText(await previous.dismiss()));return;
    }
    if(which==='loading-success'||which==='loading-fail'){
      if(typeof notify.open!=='function'){
        publish(token,'当前 Browser 无通知句柄能力，回退到工具正文显示进度；不谎称 Host 已展示。');
        return;
      }
      if(activeHandle){publish(token,'请先关闭上一条任务通知，再开始新的生命周期演示。');return;}
      const handle=notify.open({message:'模拟任务执行中…',type:'info',timeout:0,
        caption:'演示任务，不会写文件',position:position.value,group:false});
      if(!handle){publish(token,'本地参数无效或 Bridge 不可用，任务未开始。');return;}
      activeHandle=handle;
      publish(token,'已提交 Loading 句柄创建请求，等待 Host 回执。');
      const start=await handle.ready;
      if(start.status!=='accepted'){
        if(activeHandle===handle)activeHandle=null;
        publish(token,resultText(start)+' 演示不继续伪装已展示的 Loading。');
        return;
      }
      publish(token,resultText(start)+' 演示任务运行中。');
      await new Promise(resolve=>setTimeout(resolve,1200));
      if(activeHandle!==handle)return; // manual close beats a late simulated result
      const failed=which==='loading-fail';
      // This explicit deterministic demo result stands in for a real business receipt.
      const business={ok:!failed,error:failed?'模拟任务拒绝执行':''};
      const next=business.ok?
        {message:'模拟任务已完成',type:'success',caption:'模拟回执确认完成',timeout:3000,position:position.value}:
        {message:'模拟任务失败',type:'error',caption:business.error,timeout:0,position:position.value};
      publish(token,'模拟业务已返回'+(business.ok?'成功':'失败')+'，已请求更新原通知；等待 Host 回执。');
      const changed=await handle.update(next);
      publish(token,resultText(changed)+' '+(business.ok?'演示完成。':'失败原因：'+business.error+'；请手动关闭。'));
      if(business.ok&&activeHandle===handle)activeHandle=null;
      return;
    }
    if(which==='rate-probe'){
      if(typeof notify.open!=='function'){
        publish(token,'此 Host/Bridge 没有句柄回执；无法可靠计算剩余等待，请阅读正文而不是猜测限频。');
        return;
      }
      const handles=Array.from({length:4},(_,i)=>notify.open({
        message:'限频测试 '+(i+1),type:'info',timeout:3000,position:position.value,group:false
      }));
      publish(token,'已提交四次创建请求；等待 Host 逐条给出接纳／拒绝回执。');
      const receipts=await Promise.all(handles.map(handle=>handle?.ready||Promise.resolve({status:'rejected',reason:'invalid'})));
      publish(token,receipts.map((row,i)=>'#'+(i+1)+' '+resultText(row)).join(' '));
      return;
    }
    const factory=Object.hasOwn(samples,which)?samples[which]:null;
    if(!factory)return;
    const values=factory();
    const results=values.map(value=>{
      if(typeof value==='string')return notify(value);
      if(Object.hasOwn(value,'action'))return notify(value);
      return notify({...selected(),...value});
    });
    const submitted=results.filter(Boolean).length;
    if(which==='invalid'){
      publish(token,submitted===0?'PASS：非法动作参数在沙箱本地拒绝，没有发送安装指令。':
        'FAIL：非法动作参数竟被本地接受，请停止测试并检查版本。');
    }else{
      publish(token,'沙箱已提交 '+submitted+'/'+values.length+' 条；不代表 Host 接纳或真实渲染。'+
        (values.length>1?'每条均消耗创建配额；如受限请等待一分钟或重新打开工具。':''));
    }
  }
  root.addEventListener('click',event=>{
    const button=event.target.closest?.('button[data-sample]');
    if(!button||!root.contains(button))return;
    const token=++displayRevision;
    void runSample(button.dataset.sample,token).catch(error=>
      publish(token,'演示发生异常：'+String(error?.message||error).slice(0,160)));
  });
})();
