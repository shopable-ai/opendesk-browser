import * as React from 'react';
import {Button} from '../components/ui/button.tsx';

// Call the existing Controller synchronously inside the native user gesture.
// Pairing, authorization, clipboard access and revocation stay with that owner.
function trusted(event,callback,...args){
  if(event.nativeEvent?.isTrusted===true&&typeof callback==='function')
    callback(...args);
}

function closeOnEscape(event,summary,onClose){
  if(event.nativeEvent?.isTrusted!==true||event.key!=='Escape')return false;
  event.preventDefault();
  event.stopPropagation();
  onClose();
  summary.current?.focus({preventScroll:true});
  return true;
}

// Controlled fields are projections of the existing Cloud Controller, including
// the short-lived pairing code. This component has no storage or Host access.
export function CloudPairingSettings({model={},open=false,onOpenChange=()=>{}}){
  const summary=React.useRef(null),busy=Boolean(model.busy);
  const address=React.useRef(null),wasOpen=React.useRef(false);
  React.useLayoutEffect(()=>{
    if(open&&!wasOpen.current)address.current?.focus({preventScroll:true});
    wasOpen.current=open;
  },[open]);
  return <details id="cloud-hosting" className="task-scope-panel od-disclosure"
    open={open} onToggle={event=>{
      const next=event.currentTarget.open;
      if(next!==open)onOpenChange(next);
      if(!next&&model.pairingCode)model.onField?.('pairingCode','');
    }}
    onKeyDown={event=>closeOnEscape(event,summary,()=>onOpenChange(false))}>
    <summary ref={summary}>连接设置与解除配对</summary>
    <p className="hint">当前状态：<span id="cloud-brief" className="cloud-status-brief">
      {model.brief??'未配对'}
    </span></p>
    <label htmlFor="cloud-url">可信提供者 HTTPS 地址
      <input id="cloud-url" ref={address} type="url" placeholder="https://provider.example"
        className="od-field" autoComplete="off" spellCheck={false}
        value={model.url??''} disabled={busy} aria-describedby="cloud-status"
        onChange={event=>trusted(event,model.onField,'url',event.currentTarget.value)}/>
    </label>
    <label htmlFor="cloud-provider-id">提供者身份
      <input id="cloud-provider-id" autoComplete="off" className="od-field"
        spellCheck={false} value={model.providerId??''} disabled={busy}
        onChange={event=>trusted(event,model.onField,'providerId',event.currentTarget.value)}/>
    </label>
    <label htmlFor="cloud-pairing-code">一次性配对码
      <input id="cloud-pairing-code" type="password" autoComplete="off"
        className="od-field" value={model.pairingCode??''} disabled={busy}
        onChange={event=>trusted(event,model.onField,'pairingCode',event.currentTarget.value)}/>
    </label>
    <label htmlFor="cloud-loopback">
      <input id="cloud-loopback" type="checkbox" checked={model.loopback===true}
        disabled={busy}
        onChange={event=>trusted(event,model.onField,'loopback',event.currentTarget.checked)}/>
      {' '}使用本机演示连接（固定 127.0.0.1:43112）
    </label>
    <p className="hint">本机 Provider 为 HTTP/WS 演示。实际远程连接必须使用可信 HTTPS/WSS。</p>
    <Button id="cloud-pair" variant="primary" disabled={busy||!model.canPair}
      onClick={event=>trusted(event,model.onPair)}>完成配对</Button>
    <div className="cloud-action-row">
      <Button id="cloud-unpair" disabled={busy||!model.canUnpair}
        onClick={event=>trusted(event,model.onUnpair)}>解除配对并撤销凭据</Button>
      <Button id="cloud-refresh" disabled={busy}
        onClick={event=>trusted(event,model.onRefresh)}>核对状态</Button>
    </div>
    <p className="hint">停止仅暂停云控并保留配对；解除配对还会请求 Provider 撤销本机凭据。连接中断时先停止，待 Provider 可达后再解除配对。</p>
    <p id="cloud-status" role="status" aria-live="polite" aria-atomic="true">
      {model.status??'尚未配对'}
    </p>
    <p className="hint">云控沿用「我的」任务权限与原 RunHost；关闭 Side Panel 后不保证任务继续运行。</p>
  </details>;
}

// Only UI focus is kept in refs. The token and every form/confirmation value
// come from the Controller's memory, never from React state or persistence.
export function CloudClientCredentials({model={}}){
  const [open,setOpen]=React.useState(false);
  const panel=React.useRef(null),summary=React.useRef(null),
    create=React.useRef(null),token=React.useRef(null),once=React.useRef(null),
    refresh=React.useRef(null),list=React.useRef(null),
    hadToken=React.useRef(false),focusedRevoke=React.useRef(null);
  const tasks=Array.isArray(model.tasks)?model.tasks:[],
    rows=Array.isArray(model.rows)?model.rows:[],busy=Boolean(model.busy),
    hasToken=Boolean(model.token),
    selected=tasks.find(task=>task.taskId===model.taskId);
  const focusCreate=()=>{
    const target=create.current&&!create.current.disabled?create.current:summary.current;
    target?.focus({preventScroll:true});
  };
  const dismissToken=event=>{
    if(event.nativeEvent?.isTrusted!==true)return;
    focusCreate();
    trusted(event,model.onDismissToken);
  };
  React.useLayoutEffect(()=>{
    const appeared=hasToken&&!hadToken.current;
    const disappeared=!hasToken&&hadToken.current;
    hadToken.current=hasToken;
    if(appeared&&panel.current?.open){
      token.current?.focus({preventScroll:true});
    }else if(disappeared&&once.current?.contains(once.current.ownerDocument.activeElement)){
      focusCreate();
    }
  },[hasToken]);
  React.useLayoutEffect(()=>{
    const focused=focusedRevoke.current;
    if(!focused||focused.node.isConnected)return;
    focusedRevoke.current=null;
    const doc=list.current?.ownerDocument;
    if(!doc||doc.activeElement!==doc.body)return;
    const buttons=list.current.querySelectorAll('button');
    const target=buttons[Math.min(focused.index,buttons.length-1)];
    if(target&&!target.disabled)target.focus({preventScroll:true});
    else if(refresh.current&&!refresh.current.disabled)refresh.current.focus({preventScroll:true});
    else summary.current?.focus({preventScroll:true});
  },[rows]);
  return <details id="cloud-clients" className="cloud-clients od-disclosure" ref={panel} open={open}
    onToggle={event=>{
      setOpen(event.currentTarget.open);
      // Closing always clears sensitive memory, including programmatic closes.
      if(!event.currentTarget.open)model.onDismissToken?.();
    }}
    onKeyDown={event=>{
      if(closeOnEscape(event,summary,()=>setOpen(false))&&hasToken)trusted(event,model.onDismissToken);
    }}>
    <summary ref={summary}>外部应用授权{' '}
      <span id="cloud-clients-count" className="hint">
        {typeof model.count==='number'?model.count+' 个有效授权':model.count??'按需管理'}
      </span>
    </summary>
    <p id="cloud-client-privacy-note" className="cloud-privacy-note">
      密钥只展示一次，不保存到扩展配置；请仅通过可信渠道交给应用。
    </p>
    <div className="cloud-client-form" aria-busy={busy}>
      <label htmlFor="cloud-client-name">外部应用名称</label>
      <input id="cloud-client-name" className="od-field" maxLength={60}
        autoComplete="off" placeholder="例如：我的自动化服务"
        value={model.name??''} disabled={busy}
        onChange={event=>trusted(event,model.onField,'name',event.currentTarget.value)}/>
      <label htmlFor="cloud-client-task">允许调用的已安装任务</label>
      <select id="cloud-client-task" className="od-field"
        aria-describedby="cloud-clients-status" value={model.taskId??''}
        disabled={busy||!tasks.length}
        onChange={event=>trusted(event,model.onField,'taskId',event.currentTarget.value)}>
        {!tasks.length&&<option value="">先批准并启用云控任务</option>}
        {tasks.length>0&&!selected&&<option value="">请选择已批准的任务</option>}
        {tasks.map(task=><option key={task.taskId} value={task.taskId}>
          {(task.title||task.taskId)+' · v'+task.version}
        </option>)}
      </select>
      <label className="cloud-approval-confirm" htmlFor="cloud-client-result">
        <input id="cloud-client-result" type="checkbox"
          checked={model.resultAllowed===true&&selected?.resultAllowed===true}
          disabled={busy||selected?.resultAllowed!==true}
          onChange={event=>trusted(event,model.onField,'resultAllowed',event.currentTarget.checked)}/>
        {' '}另外允许此应用读取结果正文（仅适用于此前已允许回传的任务）
      </label>
      <Button id="cloud-client-create" variant="primary" ref={create}
        disabled={busy||!model.canCreate||!selected}
        onClick={event=>trusted(event,model.onCreate)}>创建应用凭据</Button>
    </div>
    <div id="cloud-client-once" className="cloud-client-once" ref={once} hidden={!hasToken}
      onKeyDown={event=>{
        if(event.nativeEvent?.isTrusted!==true||event.key!=='Escape')return;
        event.preventDefault();
        event.stopPropagation();
        dismissToken(event);
      }}>
      <label htmlFor="cloud-client-token">一次性客户端密钥（关闭此区域后不再显示）</label>
      <div className="cloud-client-secret-row">
        <input id="cloud-client-token" className="od-field" type="text" readOnly
          ref={token} spellCheck={false} autoComplete="off" value={model.token??''}
          aria-describedby="cloud-client-privacy-note"/>
        <Button id="cloud-client-copy" disabled={!hasToken}
          onClick={event=>trusted(event,model.onCopy)}>复制密钥</Button>
        <Button id="cloud-client-dismiss-token" onClick={dismissToken}>
          关闭并清除密钥
        </Button>
      </div>
    </div>
    <p id="cloud-clients-status" role="status" aria-live="polite" aria-atomic="true" className="hint">
      {model.status??'连接并授权任务后，可以创建、查看和撤销外部应用凭据。'}
    </p>
    <div className="cloud-action-row">
      <Button id="cloud-client-refresh" ref={refresh} disabled={busy||!model.canRefresh}
        onClick={event=>trusted(event,model.onRefresh)}>刷新应用列表</Button>
      <Button id="cloud-client-more" hidden={model.nextOffset==null}
        disabled={busy||!model.canRefresh}
        onClick={event=>trusted(event,model.onMore)}>查看更多</Button>
    </div>
    <ul id="cloud-clients-list" className="cloud-clients-list" ref={list}
      aria-label="已授权的外部应用" aria-busy={busy}>
      {rows.length?rows.map((row,index)=><li key={row.clientId} className="cloud-client-row">
        <span>{(row.label||'外部客户端')+' · '+row.tasksText+' · '+
          (row.allowResult?'允许读取结果':'仅调用任务')}</span>
        <Button disabled={busy}
          aria-label={(row.confirming?'确认撤销':'撤销')+'「'+(row.label||'外部客户端')+'」的凭据'}
          onFocus={event=>{focusedRevoke.current={node:event.currentTarget,index};}}
          onBlur={event=>{if(event.relatedTarget)focusedRevoke.current=null;}}
          onClick={event=>trusted(event,model.onRevoke,row.clientId)}>
          {row.confirming?'确认撤销':'撤销'}
        </Button>
      </li>):<li>暂无有效的外部应用凭据。</li>}
    </ul>
  </details>;
}
