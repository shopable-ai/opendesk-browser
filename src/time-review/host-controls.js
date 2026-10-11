// Browser permission prompts originate in a trusted host click, never sandbox
// postMessage or a forged webpage gesture. Granting idle does not start tracking.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY} from './policy.js';
export function createTimeReviewPermissionControls({api,doc,container,notice}){
  let section=null;
  function render(tool,readOnly=false){
    const visible=!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities.includes(TIME_REVIEW_CAPABILITY);
    if(!visible){if(section)section.hidden=true;return;}
    if(!section){
      section=doc.createElement('section');section.id='time-review-permission-settings';
      const hint=doc.createElement('p');hint.textContent='时间回顾只在你开始后记录聚焦、非空闲网页的域名和时长。空闲检测需浏览器授权；无登录、无上传。';
      const grant=doc.createElement('button');grant.type='button';grant.id='time-review-grant-idle';grant.className='od-button';grant.textContent='授权空闲检测';
      grant.addEventListener('click',event=>{
        if(event.isTrusted!==true){notice('请主动点击授权空闲检测',true);return;}
        // Call request synchronously in the trusted event's gesture stack.
        const pending=api.permissions.request({permissions:['idle']});
        Promise.resolve(pending).then(ok=>notice(ok?'空闲检测已授权。打开 Time Review 后点击开始记录。':'未授予空闲检测；时间追踪未启动。',!ok)).catch(error=>notice(error.message,true));
      });
      const revoke=doc.createElement('button');revoke.type='button';revoke.id='time-review-revoke-idle';revoke.className='od-button';revoke.textContent='撤销空闲检测';
      revoke.addEventListener('click',()=>{void api.permissions.remove({permissions:['idle']}).then(()=>notice('已撤销空闲检测，后台停止记录；历史统计保留。')).catch(error=>notice(error.message,true));});
      section.append(hint,grant,revoke);container.append(section);
    }
    section.hidden=false;
  }
  return {render};
}
