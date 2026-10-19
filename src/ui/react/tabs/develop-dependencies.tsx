import * as React from 'react';

// This fragment owns every dependency node. Controllers publish plain snapshots
// and receive values/native click events; they never bind to React's DOM.
export function DevelopDependencies({model,view=model,actions=view.actions}){
  const snapshot=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const dependencies=snapshot.dependencies;
  return <>
    <ClassicDependencies state={dependencies?.classic} actions={actions.pageDependencies}/>
    <NetworkDependencies state={dependencies?.network} actions={actions.pageDependencyReview}/>
  </>;
}

function DependencyIdentity({entry,review=false}){
  return <>
    <p className="identity">{entry.name||'第三方库'}{' · 版本 '}{entry.version||'未识别'}</p>
    <p className="hint">{'来源：'}{entry.url||entry.raw}</p>
    {review&&<>
      <p className="hint">{'实际来源：'}{entry.resolvedUrl}</p>
      <p className="hint">{'获得方式：'}{entry.acquisition||entry.sourceKind}{' · 大小：'}{entry.byteLength}{' bytes'}</p>
      <p className="identity">{'SHA-256：'}{entry.sha256}</p>
    </>}
    <p className="hint">{'许可证：'}{entry.license?.name||'未知，请自行检查来源与许可证'}</p>
    {review&&<>
      <p className="hint">{'验证：'}{entry.integrityResult?.verified?.join('、')||'原始字节 SHA-256'}</p>
      <p className="hint">{'运行世界：'}{entry.world||'USER_SCRIPT'}</p>
      <p className="hint">{'安全风险：'}{entry.risk||'第三方代码可以访问获准页面 DOM 和网页允许的网络渠道'}</p>
    </>}
    {entry.downloadError&&<p className="hint">{entry.downloadError.code}{'：'}{entry.downloadError.message}</p>}
  </>;
}

function ClassicDependencies({state,actions}){
  if(!state)return null;
  return <details id="page-dependency-panel" className="od-stack od-disclosure od-disclosure--flat"
    aria-label="第三方 Classic JS 依赖固定详情" hidden={!state.visible}>
    <summary>第三方 JS 依赖 · 自动固定与缓存（高级详情）</summary>
    <p id="page-dependency-status" role="status" aria-live="polite" data-state={state.statusState}>{state.status}</p>
    <div id="page-dependency-list" className="od-stack" role="group" aria-label="每项依赖来源与下载方式">
      {state.entries.map(entry=><div key={entry.order} className="od-surface od-stack">
        <DependencyIdentity entry={entry}/>
        <p className="hint">{entry.sourceKind==='packaged'?'扩展预装固定资源':
          entry.cacheChoices?.length?'本程序已有固定缓存':
            entry.sharedCacheChoices?.length?'可跨程序复用固定字节；程序锁与站点权限独立':'运行时自动获取、固定并校验'}</p>
        <select className="od-field" data-dependency-order={entry.order}
          aria-label={'第 '+(entry.order+1)+' 项依赖的获取方式'} disabled={entry.disabled} value={entry.value}
          onChange={event=>actions.chooseAcquisition(entry.order,event.currentTarget.value)}>
          {entry.options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>)}
    </div>
    <label htmlFor="page-dependency-lock" className="visually-hidden">已固定依赖锁版本</label>
    <select id="page-dependency-lock" className="od-field" hidden={state.locks.length<=1}
      disabled={state.lockDisabled} value={state.selectedLockId}
      onChange={event=>actions.chooseLock(event.currentTarget.value)}>
      <option value="">多份固定版本：请选择本次执行的锁</option>
      {state.locks.map(lock=><option key={lock.value} value={lock.value}>{lock.label}</option>)}
    </select>
    <div className="od-toolbar">
      <button id="page-dependency-prepare" type="button" className="od-button od-button--secondary"
        disabled={state.prepareDisabled} onClick={event=>actions.prepare(event.nativeEvent)}>{state.prepareLabel}</button>
    </div>
    <details id="page-dependency-review" key={state.review?.reviewId||'none'} open={!!state.review}
      hidden={!state.review} className="od-disclosure od-disclosure--flat">
      <summary>可选：审核实际字节、SHA-256、许可证及风险</summary>
      <p className="hint">第三方 JavaScript 可读取和修改获准网站的 DOM；USER_SCRIPT 不等于网络隔离。本步骤不授予网页访问权、不安装、不执行。</p>
      <div id="page-dependency-review-list" className="od-stack">
        {state.review?.entries.map(entry=><div key={entry.order} className="od-stack">
          <DependencyIdentity entry={entry} review/>
          <label>
            <input type="checkbox" checked={entry.checked} disabled={state.busy}
              onChange={event=>actions.checkReview(entry.order,event.currentTarget.checked,state.review.reviewId)}/>
            {' 已核对这份代码的来源、完整 SHA 与风险，允许为当前程序建立依赖锁'}
          </label>
        </div>)}
      </div>
      <button id="page-dependency-approve" type="button" className="od-button od-button--secondary"
        disabled={state.approveDisabled} onClick={event=>actions.approve(event.nativeEvent)}>批准当前程序的固定 SHA 锁（不运行）</button>
    </details>
    <p className="hint">点击 Run 会自动校验、获取及固定当前程序的依赖。高级手动流程不是运行前置步骤；不同程序共享 SHA 字节但不共享站点权限。</p>
  </details>;
}

function NetworkDependencies({state,actions}){
  if(!state)return null;
  return <details id="network-js-review" className="od-stack od-disclosure od-disclosure--flat" hidden={!state.visible}>
    <summary>网络 JS：下载准备与审核（高级详情）</summary>
    <p id="network-js-status" role="status" aria-live="polite">{state.status}</p>
    <label hidden={!state.isESM}>
      <span>依赖用途</span>
      <select id="network-js-world" className="od-field" aria-label="静态 import 的运行世界"
        value={state.world} disabled={state.worldDisabled}
        onChange={event=>actions.chooseWorld(event.currentTarget.value)}>
        <option value="esm-page">用于网页 Page</option>
        <option value="esm-controller">用于 Controller</option>
      </select>
    </label>
    <button id="network-js-prepare" type="button" className="od-button od-button--secondary"
      disabled={state.prepareDisabled} onClick={event=>actions.prepare(event.nativeEvent)}>{state.prepareLabel}</button>
    <div id="network-js-sources" className="od-stack">
      {state.review?.entries.map(entry=><div key={entry.order} className="od-stack">
        <DependencyIdentity entry={entry} review/>
        <button type="button" className="od-button od-button--secondary" disabled={state.busy}
          onClick={event=>actions.readSource(event.nativeEvent,entry.order,state.review.reviewId)}>
          {'查看缓存源码 '+(entry.order+1)}
        </button>
        {entry.code!==undefined&&<textarea readOnly rows={8} className="od-field" value={entry.code}
          aria-label={'依赖 '+(entry.order+1)+' 的完整缓存源码'}/>}
      </div>)}
    </div>
    {state.review&&<>
      <label>
        <input id="network-js-consent" type="checkbox" checked={state.review.accepted} disabled={state.busy}
          onChange={event=>actions.accept(event.currentTarget.checked,state.review.reviewId)}/>
        {' 我已审核来源、源码、SHA-256 和许可证信息'}
      </label>
      <button id="network-js-approve" type="button" className="od-button od-button--secondary"
        disabled={state.approveDisabled} onClick={event=>actions.approve(event.nativeEvent)}>批准这些固定字节（不运行）</button>
    </>}
    <p className="hint">Run 自动固定安全依赖；高级审阅仅按需使用。此处的下载、查看和批准均不执行程序，也不扩大网页权限。</p>
  </details>;
}
