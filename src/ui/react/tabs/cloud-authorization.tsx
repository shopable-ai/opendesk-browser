import * as React from 'react';

// CloudHosting owns the immutable task identities, selections, consent resets
// and authorization lifecycle. This component only renders its projection.
export function CloudTaskAuthorization({model={}}){
  const tasks=Array.isArray(model.tasks)?model.tasks:[],busy=model.busy===true,
    hostingEnabled=model.hostingEnabled===true;
  const selected=tasks.filter(task=>task.eligible&&task.selected===true);
  const resultChecked=task=>hostingEnabled
    ?task.resultAllowed===true:task.resultSelected===true;
  const uploaded=selected.filter(resultChecked).length;
  const consentDisabled=busy||hostingEnabled;
  const canApprove=!busy&&!hostingEnabled&&model.canApprove===true&&
    model.consent===true&&selected.length>0&&selected.length<=32&&
    (uploaded===0||model.resultConsent===true);
  const canStop=!busy&&model.canStop===true;
  const trusted=(event,callback,...args)=>{
    if(event.nativeEvent?.isTrusted===true&&typeof callback==='function')
      callback(...args);
  };

  return <section id="cloud-approval-section"
    className="cloud-approval-section od-surface"
    aria-label="已安装任务的远程授权" aria-busy={busy}>
    <div className="cloud-section-title od-toolbar"><strong>允许远程调用的任务</strong></div>
    <p className="cloud-privacy-note">执行完成或失败的最小状态会回传；网页数据和结果正文默认不回传。</p>
    {model.error&&<p id="cloud-approval-error" className="cloud-task-needs-review"
      role="alert">{String(model.error)}</p>}
    <fieldset className="cloud-task-approvals">
      <legend className="visually-hidden">选择任务，最多 32 项</legend>
      <div id="cloud-task-list" role="group" aria-label="逐任务确认版本、网站及结果权限">
        {tasks.length?tasks.map(task=>{
          const selectionDisabled=busy||!task.eligible||hostingEnabled;
          const resultDisabled=busy||!task.eligible||
            (hostingEnabled&&(!task.approved||task.resultAllowed!==true));
          const schema=task.paramsSchema,
            properties=schema?.properties,
            required=Array.isArray(schema?.required)?schema.required:[],
            origins=Array.isArray(task.siteOrigins)?task.siteOrigins:[];
          const parameters=properties?Object.entries(properties).map(([name,rule])=>
            name+' ('+rule.type+(required.includes(name)?'，必填':'，可选')+
            (Array.isArray(rule.enum)?'，选项 '+rule.enum.join('/'):'')+')').join('；')||'无参数':'不可读取';
          return <section key={task.key} className="cloud-task-choice">
            <label>
              <input type="checkbox" data-cloud-task-key={task.key}
                checked={task.selected===true} disabled={selectionDisabled}
                onChange={event=>{
                  if(!selectionDisabled)
                    trusted(event,model.onSelection,task.key,event.currentTarget.checked);
                }}/>
              <span>{String(task.title??'')} · v{String(task.version??'')}
                {task.eligible?'':task.enabled?' · 需要重新验证':' · 已停用'}
                {task.approved?' · 当前已批准':task.requiresReapproval?' · 需重新批准':''}
              </span>
              {task.description&&<small className="cloud-task-description">{String(task.description)}</small>}
            </label>
            <p className="cloud-task-scope">允许访问：{origins.join('、')||'网站范围尚未验证'}</p>
            {task.requiresReapproval&&<p className="cloud-task-needs-review">
              此任务版本或安装授权已经变化；先停止云控，再核对并重新批准。
            </p>}
            <p className="cloud-task-params">参数许可（固定 Schema）：{parameters}</p>
            <label>
              <input type="checkbox" data-cloud-result-key={task.key}
                checked={resultChecked(task)} disabled={resultDisabled}
                onChange={event=>{
                  if(!resultDisabled&&(!hostingEnabled||!event.currentTarget.checked))
                    trusted(event,model.onResultSelection,task.key,event.currentTarget.checked);
                }}/>
              <span>允许回传结果正文（网页数据、返回值与错误详情）
                {task.resultAllowed?' · 当前已授权':' · 默认关闭'}
              </span>
            </label>
            <details className="od-disclosure od-disclosure--flat">
              <summary>查看参数约束</summary>
              <pre>{JSON.stringify(schema??{},null,2)}</pre>
            </details>
            <details className="od-disclosure od-disclosure--flat">
              <summary>查看授权状态与固定版本详情</summary>
              <p className="cloud-task-authorization">{task.approved
                ?'当前安装身份已与批准的任务版本一致。结果正文：'+(task.resultAllowed?'已允许回传':'不回传')
                :task.requiresReapproval
                  ?'旧云控批准不再匹配当前安装身份。请停止当前托管，重新检查任务的网站和参数后批准。'
                  :task.eligible?'该任务可供选择，但尚未批准远程执行。'
                    :'该任务尚不可批准，请先在「我的」启用并完成版本验证。'}</p>
              <pre>{JSON.stringify({taskId:task.taskId,version:task.version,
                installationId:task.installationId,generation:task.generation,
                manifestHash:task.manifestHash,sourceHash:task.sourceHash},null,2)}</pre>
            </details>
          </section>;
        }):busy?<p className="hint">正在读取已安装任务…</p>:<>
          {!model.error&&<p className="hint">暂无已安装任务。请先在「我的」验证并安装 Controller Task。</p>}
          <button type="button" className="od-button od-button--secondary" disabled={busy}
            onClick={event=>{if(!busy)trusted(event,model.onManageTasks);}}>
            前往「我的」安装任务
          </button>
        </>}
      </div>
      <p id="cloud-approval-summary" role="status" aria-live="polite" className="hint">
        {selected.length+' 项已选 · '+uploaded+' 项允许回传结果正文；未勾选的任务仅回传最小执行状态。'}
      </p>
    </fieldset>
    <div id="cloud-approval-review" className="cloud-approval-review" role="group"
      aria-label="批准前核对所选任务" hidden={selected.length===0}>
      <strong>批准前核对</strong>
      <ul id="cloud-review-items" className="cloud-review-items">
        {selected.map(task=>{
          const schema=task.paramsSchema,required=Array.isArray(schema?.required)?schema.required:[];
          const parameters=schema?.properties?Object.keys(schema.properties).map(name=>
            name+(required.includes(name)?'（必填）':'（可选）')).join('、'):'待核对';
          return <li key={task.key}>{String(task.title??'')+' · v'+String(task.version??'')+
            ' · 网站：'+(Array.isArray(task.siteOrigins)?task.siteOrigins.join('、'):'')+
            ' · 参数：'+(parameters||'无')+
            ' · 结果正文：'+(resultChecked(task)?'允许':'不回传')}</li>;
        })}
      </ul>
      <p className="hint">以下版本、网站与结果许可一旦改变，需要重新确认。</p>
    </div>
    <label className="cloud-approval-confirm">
      <input id="cloud-consent" type="checkbox" checked={model.consent===true}
        disabled={consentDisabled}
        onChange={event=>{
          if(!consentDisabled)trusted(event,model.onConsent,event.currentTarget.checked);
        }}/> 我已核对所选任务的网站和固定安装版本
    </label>
    <label className="cloud-approval-confirm">
      <input id="cloud-result-consent" type="checkbox" checked={model.resultConsent===true}
        disabled={consentDisabled}
        onChange={event=>{
          if(!consentDisabled)trusted(event,model.onResultConsent,event.currentTarget.checked);
        }}/> 我另外同意所勾选任务向 Provider 回传结果正文
    </label>
    <div className="cloud-action-row">
      <button id="cloud-approve" type="button" className="od-button" disabled={!canApprove}
        onClick={event=>{if(canApprove)trusted(event,model.onApprove);}}>批准并启用</button>
      <button id="cloud-stop" type="button" className="od-button od-button--secondary"
        disabled={!canStop}
        onClick={event=>{if(canStop)trusted(event,model.onStop);}}>停止远程调用</button>
    </div>
  </section>;
}
