import * as React from 'react';

import {useSettingsEffect} from '../../../../src/ui/react/use-settings-effect.ts';

// This button is in the fixed extension-owned React tree above the sandbox.
// It is intentionally not an iframe approval or a second confirmation dialog.
export function StayFocusQuickAdd({model,actions}){
  if(!model?.visible||!model.canGrant||
    !['active','unverified','stopped'].includes(model.phase))return null;
  const action=model.currentAction;
  const canChange=action==='add'||action==='paused';
  return <section id="stay-focus-current-trusted" className="od-surface od-surface--padded"
    aria-label="当前网站一键管理"
    style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
    <span className="od-note" style={{minWidth:0,overflowWrap:'anywhere'}}>
      当前网页 <strong>{model.currentPageHost||'当前网页不可管理'}</strong>
    </span>
    {action==='managed'
      ?<span style={{display:'flex',alignItems:'center',gap:8}}>
        <span className="od-note" role="status">✓ 已管理</span>
        <button type="button" id="stay-focus-current-pause" className="od-button od-button--secondary"
          disabled={model.busy} onClick={event=>actions?.quickAdd(event.nativeEvent)}>暂停</button>
      </span>
      :action==='error'
      ?<button type="button" id="stay-focus-current-retry" className="od-button od-button--secondary"
        disabled={model.busy} onClick={()=>actions?.refreshQuick()}>重试读取</button>
      :<button type="button" id="stay-focus-current-add" className="od-button"
        disabled={model.busy||!canChange}
        onClick={event=>actions?.quickAdd(event.nativeEvent)}>
        {action==='paused'?'恢复':action==='loading'?'正在核对':'加入'}
      </button>}
  </section>;
}

export function StayFocusSettings({model,actions}){
  const ref=useSettingsEffect(model);
  if(!model)return null;
  const phase=model.phase||'checking';
  const needsStart=['first','reauthorize','needs-permission','stopped'].includes(phase);
  const running=phase==='active'||phase==='unverified';
  return <section id="stay-focus-trusted-settings" className="time-review-trusted-actions"
    hidden={!model.visible} ref={ref} aria-label="Stay Focus 可信运行状态">
    <p id="stay-focus-native-status" role="status" aria-live="polite">{model.statusText||'正在核对 Chrome 状态…'}</p>
    {needsStart&&<p className="od-note">{model.intro}</p>}
    {needsStart&&<button type="button" id="stay-focus-enable-native" className="od-button"
      disabled={model.busy||!model.canGrant} aria-busy={model.busy}
      onClick={event=>actions?.grant(event.nativeEvent)}>
      {model.busy?'正在开启…':phase==='stopped'?'重新开启 Stay Focus':
        phase==='reauthorize'?'重新开启 Stay Focus':'开启 Stay Focus'}
    </button>}
    {(phase==='error'||phase==='unverified')&&<button type="button"
      id="stay-focus-status-retry" className="od-button od-button--secondary"
      disabled={model.busy} onClick={()=>actions?.refreshQuick()}>重新核对状态</button>}
    {model.canGrant&&<details id="stay-focus-more-actions">
      <summary>更多操作</summary>
      {running&&<button type="button" id="stay-focus-disable"
        className="od-button od-button--secondary" disabled={model.busy}
        onClick={event=>actions?.stop(event.nativeEvent)}>停止限制</button>}
      <p className="od-note">停止后保留网站、额度与 Chrome 权限；重新开启不需要重复授权。</p>
      <button type="button" id="stay-focus-clear-open" className="od-button od-button--secondary"
        disabled={model.busy} onClick={event=>actions?.openClear(event.nativeEvent)}>
        清空所有设置与记录…
      </button>
      <section id="stay-focus-clear-confirm" className="time-review-inline-clear-review"
        hidden={!model.clearReview}>
        <p>确认删除 Stay Focus 网站清单、额度与使用记录？此操作不影响 Time Review。</p>
        <button type="button" id="stay-focus-clear-approve"
          className="od-button od-button--secondary" disabled={model.busy}
          onClick={event=>actions?.approveClear(event.nativeEvent)}>确认清空</button>
        <button type="button" id="stay-focus-clear-cancel"
          className="od-button od-button--secondary" disabled={model.busy}
          onClick={event=>actions?.cancelClear(event.nativeEvent)}>取消</button>
      </section>
    </details>}
  </section>;
}
