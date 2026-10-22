import * as React from 'react';

import {useSettingsEffect} from '../use-settings-effect.ts';

export {StayFocusQuickAdd,StayFocusSettings} from '../../../../examples/sidebar-tools/stay-focus/trusted/react-controls.tsx';
export {AiAccessSettings} from '../../../../examples/sidebar-tools/ai-vip-share/trusted/react-controls.tsx';

export function TimeReviewSettings({model,actions}){
  const ref=useSettingsEffect(model);
  if(!model)return null;
  return <section id="time-review-permission-settings" className="time-review-trusted-actions" aria-label="时间回顾采集权限" hidden={!model.visible} ref={ref}>
<p>
{"安装不等于授权采集。先单独同意记录的网站，再主动开始；仅记录前台非空闲网页的域名和时长，默认只保存在本机。"}
</p>
<button onClick={event=>actions?.['time-review-grant-idle']?.(event.nativeEvent)} disabled={model.busy} hidden={model.idleGranted} id="time-review-grant-idle" type="button" className="od-button od-button--secondary">
{"授权空闲检测"}
</button>
<button onClick={event=>actions?.['time-review-revoke-idle']?.(event.nativeEvent)} disabled={model.busy} hidden={!model.idleGranted} id="time-review-revoke-idle" type="button" className="od-button od-button--secondary">
{"撤销空闲检测"}
</button>
<p>
{"网站采集授权与 Chrome 权限相互独立；撤权停止未来的记录，已有合法统计保留。"}
</p>
<button onClick={event=>actions?.['time-review-site-current-open']?.(event.nativeEvent)} disabled={model.busy} hidden={model.currentGrantHidden} id="time-review-site-current-open" type="button" className="od-button od-button--secondary">
{"授权当前网站…"}
</button>
<section id="time-review-site-confirm" className="time-review-inline-clear-review" aria-label="确认当前网站统计权限" hidden={!model.siteReview}>
<p id="time-review-site-confirm-text">{model.confirmText}</p>
<button onClick={event=>actions?.['time-review-site-current-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-current-approve" type="button" className="od-button od-button--secondary">
{"确认授权该网站"}
</button>
<button onClick={event=>actions?.['time-review-site-current-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-current-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<button onClick={event=>actions?.['time-review-site-all-open']?.(event.nativeEvent)} disabled={model.busy} hidden={model.allGrantHidden} id="time-review-site-all-open" type="button" className="od-button od-button--secondary">
{"授权全部普通网站…"}
</button>
<section id="time-review-site-all-confirm" className="time-review-inline-clear-review" aria-label="确认全部网站统计权限" hidden={!model.allReview}>
<p>
{"确认允许 Time Review 统计全部普通 HTTP(S) 网站（不含浏览器内部与隐身页面）？该授权独立于主扩展权限。"}
</p>
<button onClick={event=>actions?.['time-review-site-all-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-all-approve" type="button" className="od-button od-button--secondary">
{"我同意记录全部普通网站"}
</button>
<button onClick={event=>actions?.['time-review-site-all-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-site-all-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<button onClick={event=>actions?.['time-review-site-all-revoke']?.(event.nativeEvent)} disabled={model.busy} hidden={model.revokeAllHidden} id="time-review-site-all-revoke" type="button" className="od-button od-button--secondary">
{"撤销全部网站授权"}
</button>
<p id="time-review-site-grants-status" role="status">
{model.siteStatus}
</p>
<div id="time-review-site-grants-list" aria-label="已经授权的网站">
{model.origins.map(origin=><div key={origin} className="time-review-site-grant-row"><span>{origin}</span><button type="button" className="od-button od-button--secondary" disabled={model.busy} aria-label={'撤销 '+origin+' 的时间统计授权'} onClick={event=>actions?.revokeSite(origin,event.nativeEvent)}>撤销</button></div>)}
</div>
<button onClick={event=>actions?.['time-review-trusted-start']?.(event.nativeEvent)} disabled={model.busy} hidden={model.nativeStart} id="time-review-trusted-start" type="button" className="od-button od-button--secondary">
{"开始／恢复记录"}
</button>
<button onClick={event=>actions?.['time-review-clear-open']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-open" type="button" className="od-button od-button--secondary">
{"清空时间统计…"}
</button>
<section id="time-review-inline-clear-review" className="time-review-inline-clear-review" aria-label="确认清空时间统计" hidden={!model.clearReview}>
<p>
{"确定清空所有本机时间统计？请先导出备份，清空后无法恢复。"}
</p>
<button onClick={event=>actions?.['time-review-clear-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-approve" type="button" className="od-button od-button--secondary">
{"确认清空全部记录"}
</button>
<button onClick={event=>actions?.['time-review-clear-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-clear-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<p>
{"可选分钟明细：仅保存未来真实结算的分钟数据，不记录标题、路径或正文；不会根据旧记录补造分钟。"}
</p>
<button onClick={event=>actions?.['time-review-minute-enable']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-enable" type="button" className="od-button od-button--secondary">
{"开启分钟明细"}
</button>
<button onClick={event=>actions?.['time-review-minute-disable']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-disable" type="button" className="od-button od-button--secondary">
{"关闭并删除分钟明细…"}
</button>
<section id="time-review-minute-delete-review" className="time-review-inline-clear-review" aria-label="确认删除分钟明细" hidden={!model.minuteReview}>
<p>
{"确定关闭未来分钟采集并永久删除已有分钟明细？日汇总和分类保持不变。"}
</p>
<button onClick={event=>actions?.['time-review-minute-delete-approve']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-delete-approve" type="button" className="od-button od-button--secondary">
{"确认关闭并删除"}
</button>
<button onClick={event=>actions?.['time-review-minute-delete-cancel']?.(event.nativeEvent)} disabled={model.busy} id="time-review-minute-delete-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>

</section>;
}
