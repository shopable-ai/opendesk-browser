// Standalone HTML Sidebar Tool; the only bridge is public OpenDeskTool.
// No Chrome APIs, host hooks, page injection, installation, or network calls.
(() => {
  'use strict';
  const tool=globalThis.OpenDeskTool;
  const root=tool?.root;
  if(!root||typeof root.querySelector!=='function')throw Error('E_NOTIFY_DEMO_TOOL');
  const readback=root.querySelector('#notify-demo-result');
  const position=root.querySelector('#notify-demo-position');
  if(!readback||!position)throw Error('E_NOTIFY_DEMO_VIEW');

  const samples=Object.freeze({
    info:()=>[{message:'这是一条信息通知',type:'info',caption:'不会中断当前操作'}],
    success:()=>[{message:'设置已经保存',type:'success',caption:'此处仅演示提示样式'}],
    warning:()=>[{message:'请先检查输入',type:'warning',caption:'不会自动发起修改'}],
    error:()=>[{message:'演示中的错误信息',type:'error',caption:'真实错误还需在原页面保留恢复入口'}],
    group:()=>[
      {message:'重复的消息',type:'info',group:true},
      {message:'重复的消息',type:'info',group:true}
    ],
    separate:()=>[
      {message:'不合并的消息',type:'info',group:false},
      {message:'不合并的消息',type:'info',group:false}
    ],
    persistent:()=>[{message:'这条消息需要手动关闭',type:'warning',timeout:0}],
    duration:()=>[{message:'这条消息显示十秒',type:'success',timeout:10000}],
    legacy:()=>[{message:'旧版单参数调用仍可用'}],
    invalid:()=>[{message:'拒绝伪造安装操作',action:'install'}]
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest?.('button[data-sample]');
    if(!button||!root.contains(button))return;
    const which=button.dataset.sample;
    const create=Object.hasOwn(samples,which)?samples[which]:null;
    if(!create)return;
    const notify=tool.ui?.notify;
    if(typeof notify!=='function'){
      readback.textContent='当前已安装的 Browser Host 没有 ui.notify，请更新 Browser 后再用此演示。';
      return;
    }
    const values=create();
    const results=values.map(value=>notify(Object.hasOwn(value,'action')?value:
      {...value,position:position.value}));
    const accepted=results.filter(value=>value===true).length;
    readback.textContent=which==='invalid'?
      (accepted===0?'PASS：非法动作参数已被拒绝，没有安装权限。':
        'FAIL：宿主接受了不允许的动作参数，请停止测试并检查版本。'):
      ('已向 Host 提交 '+accepted+'/'+values.length+' 条展示请求；实际显示仍受实例限频和权限状态限制。');
  });
})();
