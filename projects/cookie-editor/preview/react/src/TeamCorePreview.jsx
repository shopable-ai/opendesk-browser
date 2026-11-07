import * as React from 'react';

export function useTeamCorePreview(enabled){
  const [config,setConfig]=React.useState(null),[member,setMember]=React.useState('A');
  const [notice,setNotice]=React.useState(''),[busy,setBusy]=React.useState(false);
  const flight=React.useRef(false);
  React.useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    fetch('/__cookie-team/config',{credentials:'omit',redirect:'error',signal:controller.signal})
      .then(response=>{if(!response.ok)throw Error();return response.json();}).then(setConfig)
      .catch(error=>{if(error.name!=='AbortError')setNotice('隔离团队服务尚未连接，请按开发说明启动专用入口。');});
    return ()=>controller.abort();
  },[enabled]);
  const call=React.useCallback(async(action,argument=null)=>{
    if(!config)throw Object.assign(Error('E_PREVIEW_CONFIG'),{code:'E_PREVIEW_CONFIG'});
    const response=await fetch(config.rpc,{method:'POST',credentials:'omit',redirect:'error',headers:{'content-type':'application/json'},
      body:JSON.stringify({member,action,argument}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();
    if(!response.ok)throw Object.assign(Error(value.error||'E_TEAM_UNKNOWN'),{code:value.error||'E_TEAM_UNKNOWN'});
    return value;
  },[config,member]);
  const client=React.useMemo(()=>config?Object.fromEntries(['list','pair','receive','review','use','reconcile']
    .map(action=>[action,argument=>call(action,argument)])):null,[config,call]);
  const control=async(action,argument)=>{
    if(flight.current)return;flight.current=true;setBusy(true);setNotice('');
    try{const value=await call(action,argument);setNotice(action==='seed'?'已发布两条不同合成会话，仅分配给成员 A。':
      action==='deliver'?'合成发送端已核对接收指纹并加密交付；成员可明确领取。':
      action==='revoke'?'分配已撤销，禁止新的领取和使用授权；本地原账号保留。':
      '合成可信边界观察：'+JSON.stringify(value.members));}
    catch(error){setNotice('开发操作未完成（'+(error.code||'E_TEAM_UNKNOWN')+'）；不自动重试。');}
    finally{flight.current=false;setBusy(false);}
  };
  const controls=enabled?<details className="cookie-team-development" aria-label="合成团队开发控制">
    <summary>合成团队开发控制 · 非生产环境</summary>
    <p>真实业务 UI、团队 HTTP 协议、加密算法和可信账号服务；Chrome Cookie/Document 为隔离测试替身。A/B 有独立服务器凭据、私有库与设备键，浏览器 Profile 仍共享。</p>
    <label>查看成员 <select aria-label="团队预览成员" value={member} disabled={busy} onChange={event=>setMember(event.target.value)}>
      <option value="A">成员 A · 获分配账号</option><option value="B">成员 B · 未获分配</option>
    </select></label>
    <div className="cookie-business-actions">
      <button type="button" className="od-button od-button--secondary" disabled={!config||busy} onClick={()=>void control('seed')}>发布并分配两个合成账号给 A</button>
      {['one','two'].map((id,index)=><React.Fragment key={id}>
        <button type="button" className="od-button od-button--secondary" disabled={!config||busy} onClick={()=>void control('deliver',id)}>核对指纹并交付账号 {index+1}</button>
        <button type="button" className="od-button od-button--quiet" disabled={!config||busy} onClick={()=>void control('revoke',id)}>撤销账号 {index+1} 分配</button>
      </React.Fragment>)}
      <button type="button" className="od-button od-button--quiet" disabled={!config||busy} onClick={()=>void control('inspect')}>读取合成应用观察</button>
    </div>
    {notice&&<p role="status">{notice}</p>}
  </details>:null;
  return {client,member,controls,ready:!enabled||Boolean(config)};
}
