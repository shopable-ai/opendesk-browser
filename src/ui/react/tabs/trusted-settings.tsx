import * as React from 'react';

// Only focus/scroll effects touch real nodes. All visible state is rendered here.
function useSettingsEffect(model){
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    if(!model?.visible||!model.effect)return;
    const {target,kind}=model.effect;
    const node=ref.current?.querySelector('[id="'+target+'"]');
    if(kind==='focus')node?.focus({preventScroll:true});
    else node?.scrollIntoView?.({block:'nearest'});
  },[model?.effect]);
  return ref;
}

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

export function StayFocusSettings({model,actions}){
  const ref=useSettingsEffect(model);
  if(!model)return null;
  return <section id="stay-focus-trusted-settings" className="time-review-trusted-actions" hidden={!model.visible} ref={ref}>
    <p>{model.intro}</p>
    <button type="button" id="stay-focus-enable-native" className="od-button od-button--secondary" disabled={model.busy||!model.canGrant} title={model.canGrant?'授权并开启本机限制':'请先在工具设置中启用 Stay Focus'} onClick={event=>actions?.grant(event.nativeEvent)}>授权并开启每日娱乐总额度</button>
    <button type="button" id="stay-focus-disable" className="od-button od-button--secondary" disabled={model.busy} onClick={event=>actions?.stop(event.nativeEvent)}>停止所有 Stay Focus 限制</button>
    <button type="button" id="stay-focus-clear-open" className="od-button od-button--secondary" disabled={model.busy} onClick={event=>actions?.openClear(event.nativeEvent)}>清空所有专注设置与记录…</button>
    <section id="stay-focus-clear-confirm" className="time-review-inline-clear-review" hidden={!model.clearReview}>
      <p>确认删除全部 Stay Focus 网站清单、今日额度及时间段？此操作不会清除 Time Review 数据。</p>
      <button type="button" id="stay-focus-clear-approve" className="od-button od-button--secondary" disabled={model.busy} onClick={event=>actions?.approveClear(event.nativeEvent)}>确认删除并解除限制</button>
      <button type="button" id="stay-focus-clear-cancel" className="od-button od-button--secondary" disabled={model.busy} onClick={event=>actions?.cancelClear(event.nativeEvent)}>取消</button>
    </section>
  </section>;
}

export function AiAccessSettings({model,actions}){
  if(!model)return null;
  return <section id="ai-access-trusted-controls" className="od-surface od-surface--padded" aria-label="AI 网站访问" hidden={!model.visible}>
    <div className="ai-access-proxy-head"><h2 className="od-title">AI 网站访问</h2><span className="od-note" role="status" aria-live="polite">{model.badge}</span></div>
    <p id="ai-access-status" className="od-note">{model.status}</p>
    <button type="button" id="ai-access-toggle" className="od-button" disabled={model.actionDisabled} aria-busy={model.busy} aria-pressed={model.pressed} onClick={event=>actions?.toggle(event.nativeEvent)}>{model.actionLabel}</button>
    <p id="ai-access-error" className="od-field-error" role="alert" hidden={!model.error}>{model.error}</p>
    <p className="od-note">仅控制本工具的 AI 网站代理，不修改系统 VPN 或其他扩展；会员有效期与代理启停互不影响。</p>
    {model.localTestEnabled&&<><p className="od-note">本地开发测试 · 模拟租约 127.0.0.1:7898 / HTTP 代理 127.0.0.1:7897；不代表生产会员授权。</p><button type="button" id="ai-access-local-activate" className="od-button" disabled={model.activateDisabled} onClick={event=>actions?.activate(event.nativeEvent)}>激活本地测试服务</button></>}
  </section>;
}
