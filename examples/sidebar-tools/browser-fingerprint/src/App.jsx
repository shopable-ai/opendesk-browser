import * as React from 'react';
import {Card,CardContent,Button,IconButton} from '@opendesk/ui';
import ReadOnlyDiagnostics from './ReadOnlyDiagnostics.jsx';
import {safeContext} from './model.js';
import {ORIGINAL_CONFIG,BUILTIN_PRESETS,CONFIG_FIELDS,copyConfig,
  validConfig} from './env-config.js';
import {readPresets,savePreset,deletePreset,readRuns,appendRun} from './presets.js';
import {applyEnvironment,verifyEnvironment,restoreEnvironment,
  ACTIVE_STATES,classifyFailure,classifyRestoration,readbackFailureState,sessionActions} from './run-session.js';

const stamp=()=>new Date().toISOString();
const ident=prefix=>prefix+(globalThis.crypto?.randomUUID?.()||
  (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
const labels=Object.freeze({
  idle:'尚未应用',applying:'正在应用并核验',applied_unverified:'已应用 · 核验未完成',
  verified_limited:'已应用 · 网页字段已核验',partial:'已应用 · 核验存在差异',
  blocked:'环境修改未开放',denied:'授权被拒绝',failed:'执行失败',
  unknown:'执行结果未知',invalidated:'目标网页已失效',
  restoring:'正在停止并核验',restore_unknown:'恢复结果未知',
  restored_verified:'已独立核验恢复',
  restored_limited:'已停止 · 网页字段已恢复'
});
const stateDescription=Object.freeze({
  idle:'仅作用于当前授权标签页。选择预设后点击应用。',
  applying:'操作已提交，必须等待可信 Host 回执，不能重复点击。',
  applied_unverified:'已有绑定当前网页的可信执行回执，但还没有独立验证。',
  verified_limited:'可核验的网页字段与配置一致；HTTP 请求头未验证。',
  partial:'至少一项不一致或无法核验，不能报告完整生效。',
  blocked:'当前安装或 Chrome 调试权限不支持修改此网页；配置保存不代表环境已生效。',
  denied:'当前操作未获授权；请核对 Chrome 的网站访问设置。',
  failed:'受信任执行明确失败。',
  unknown:'执行结果不能确认，禁止自动再次应用。',
  invalidated:'导航、关闭或撤权后，旧文档引用不能再用于新网页。',
  restoring:'可信 Host 已受理恢复，仍须独立读回原始值。',
  restore_unknown:'尚不能证明原始环境已经恢复，不得宣称恢复成功。',
  restored_verified:'可信 Host 已按原始基线独立核验所需字段。',
  restored_limited:'调试已解除，网页字段回到基线；HTTP 请求头未验证。'
});
const readableError=error=>{
  const code=String(error?.code||'');
  if(code==='E_SERVICE_UNSUPPORTED'||code==='E_NOT_IMPLEMENTED')
    return '当前 Chrome Host 尚未提供经过审查的指纹环境修改能力；未对网页执行操作。';
  if(code==='E_PRESET_DUPLICATE')return '这个预设名称已存在。';
  if(code==='E_STORAGE_CONFLICT')return '数据被其他窗口更新；请刷新后再编辑，未覆盖新数据。';
  if(code==='E_OUTCOME_UNKNOWN')return '操作或写入结果未知；不能自动再次提交，请独立核对。';
  if(code==='E_UNVERIFIED_READBACK')return '真实来源或网页身份没有通过校验，拒绝展示为已验证。';
  return (String(error?.message||code||'操作失败')).slice(0,180);
};
const sourceLabel=source=>({
  'trusted-browser-host':'可信 Browser Host · 独立读回',
  'page-runtime':'目标网页运行环境',
  network:'可信网络层',
  'client-precheck':'本地预检查','client-unknown':'执行回执未知'
}[source]||'未采集');
const readStatus=status=>({
  match:'一致',mismatch:'不一致',unverifiable:'无法验证',unauthorized:'未授权'
}[status]||'无法验证');
const dateText=value=>{
  const time=Date.parse(value);
  return Number.isFinite(time)?new Date(time).toLocaleString('zh-CN'):'时间未知';
};
function Glyph({name}){
  const paths={
    refresh:<><path d="M20 11a8 8 0 0 0-14-5L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14 5l3-3"/><path d="M21 20v-5h-5"/></>,
    save:<><path d="M5 3h12l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
    trash:<><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/></>,
    copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></>,
    download:<><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
    shield:<><path d="m12 3 8 4v5c0 6-4 8-8 9-4-1-8-3-8-9V7l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>
  };
  return <svg viewBox="0 0 24 24" width="16" height="16"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||null}</svg>;
}
function Notice({notice}){
  return notice?.text?<p className={'fp-notice fp-'+notice.type}
    role="status" aria-live="polite">{notice.text}</p>:null;
}
function Field({fieldKey,value,onChange,disabled,showNote=false}){
  const def=CONFIG_FIELDS[fieldKey];
  return <div className="fp-parameter" key={fieldKey}>
    <label htmlFor={'fp-param-'+fieldKey}>{def.label}</label>
    <select id={'fp-param-'+fieldKey} className="fp-control" value={value}
      onChange={event=>onChange(fieldKey,event.target.value)} disabled={disabled}>
      {def.values.map(([id,label])=><option value={id} key={id}>{label}</option>)}
    </select>
    {showNote?<small className="fp-secondary">{def.note}</small>:null}
  </div>;
}
function Summary({status,origin,presetName,onRefresh,refreshDisabled}){
  return <Card><CardContent className="fp-card fp-summary">
    <div className="fp-status-message" role="status" aria-live="polite" aria-atomic="true">
    <div className="fp-section-head"><strong className="fp-status-title">
      <span className={'fp-dot '+(['verified_limited','restored_verified','restored_limited'].includes(status)?'fp-dot-ok':
        status==='denied'||status==='failed'?'fp-dot-error':
        ['idle','blocked'].includes(status)?'':'fp-dot-warn')}/>
      {labels[status]||'结果未知'}</strong>
      <span className="fp-tag">仅当前 Tab</span></div>
    <p className="fp-status-note">{stateDescription[status]||stateDescription.unknown}</p>
    </div>
    <div className="fp-context">
      <span>当前网页 · {origin||'尚未绑定可用网页'}</span>
      <IconButton label="重新检查当前网页" title="刷新网页身份"
        disabled={refreshDisabled} onClick={onRefresh}><Glyph name="refresh"/></IconButton>
    </div>
    {status!=='idle'?<div className="fp-scope-line"><span>本次配置</span><strong>{presetName}</strong></div>:null}
  </CardContent></Card>;
}
function Modal({title,children,onCancel,actions}){
  const dialogRef=React.useRef(null);
  const cancelRef=React.useRef(onCancel);
  cancelRef.current=onCancel;
  React.useEffect(()=>{
    const previous=document.activeElement;
    const root=dialogRef.current;
    const focusable=()=>[...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
    (root.querySelector('input')||focusable()[0])?.focus();
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();cancelRef.current();}
      if(event.key!=='Tab')return;
      const items=focusable(),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    root.addEventListener('keydown',keydown);
    return ()=>{
      root.removeEventListener('keydown',keydown);
      // Saving may keep its trigger disabled until the audit record settles.
      const target=previous?.isConnected&&!previous.disabled?previous:
        document.querySelector('.fp-tabs [aria-selected="true"]');
      target?.focus();
    };
  },[]);
  return <div className="fp-modal-backdrop" role="presentation">
    <div ref={dialogRef} className="fp-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <strong className="fp-dialog-title">{title}</strong>
      <div className="fp-dialog-body">{children}</div>
      <div className="fp-dialog-actions">
        <button type="button" className="fp-plain" onClick={onCancel}>取消</button>
        {actions}
      </div>
    </div>
  </div>;
}
function Report({verification,preview,onCopy,onExport,onVerify,canRead,busy}){
  const rows=verification?.rows||[];
  return <details className="fp-details">
    <summary>核验详情与报告</summary>
    {verification?<>
      <p className="fp-secondary">{verification.kind==='restore'?'停止后的基线核验':'应用后的独立核验'} · {dateText(verification.capturedAt)}</p>
      <ul className="fp-check-list">
        {rows.map(row=><li key={row.key} className="fp-check">
          <span>{row.label}</span>
          <span className={'fp-tag fp-tag-'+row.status}>{readStatus(row.status)}</span>
        </li>)}
      </ul>
      <p className="fp-secondary">详细前后读数在独立检测页查看；本报告保留可信 Host 的基线、目标、读回值及来源。</p>
    </>:<p className="fp-secondary">应用后自动核验。尚无可信读回，不显示成功数据。</p>}
    <div className="fp-actions fp-report-actions">
      {canRead?<Button variant="secondary" disabled={!!busy} onClick={onVerify}>重新核验</Button>:null}
      <Button variant="secondary" disabled={!verification||preview||!!busy}
        onClick={onCopy}><Glyph name="copy"/>复制报告</Button>
      <Button variant="secondary" disabled={!verification||preview||!!busy}
        onClick={onExport}><Glyph name="download"/>导出 JSON</Button>
    </div>
  </details>;
}
export default function App({adapter,preview=false}){
  const [view,setView]=React.useState('config');
  const [selected,setSelected]=React.useState('us');
  const [config,setConfig]=React.useState(()=>copyConfig(BUILTIN_PRESETS.us.config));
  const [dirty,setDirty]=React.useState(false);
  const [presets,setPresets]=React.useState([]);
  const [runs,setRuns]=React.useState([]);
  const [context,setContext]=React.useState({origin:null});
  const [status,setStatus]=React.useState('idle');
  const [session,setSession]=React.useState(null);
  const [verification,setVerification]=React.useState(null);
  const [notice,setNotice]=React.useState(null);
  const [dialog,setDialog]=React.useState(null);
  const [draftAction,setDraftAction]=React.useState(null);
  const [presetNameInput,setPresetNameInput]=React.useState('');
  const [busy,setBusy]=React.useState('');
  const [legacyOpen,setLegacyOpen]=React.useState(false);
  const busyRef=React.useRef(null);
  const mounted=React.useRef(false);
  const activeSession=React.useRef(null);
  const currentOrigin=React.useRef(null);
  const origin=context.origin;
  const custom=presets.find(row=>row.id===selected);
  const presetName=BUILTIN_PRESETS[selected]?.name||custom?.name||'自定义环境';
  const locked=ACTIVE_STATES.includes(status)||!!activeSession.current;
  const {canRead,canRestore}=sessionActions(status,activeSession.current);

  React.useEffect(()=>{
    mounted.current=true;
    let live=true;
    Promise.allSettled([readPresets(adapter.request),readRuns(adapter.request),adapter.context()])
      .then(results=>{
        if(!live)return;
        if(results[0].status==='fulfilled')setPresets(results[0].value.value.items);
        if(results[1].status==='fulfilled')setRuns(results[1].value.value.items);
        if(results[2].status==='fulfilled'){
          try{const info=safeContext(results[2].value);
            currentOrigin.current=info.origin;
            setContext({origin:info.origin,title:info.title});
          }catch{setContext({origin:null});}
        }
        const failed=results.find(x=>x.status==='rejected');
        if(failed)setNotice({type:'warning',
          text:'部分数据未能读取：'+readableError(failed.reason)+'；写入前请检查授权和存储。'});
      });
    const changed=()=>{
      if(activeSession.current){
        const previous=activeSession.current;
        activeSession.current={...previous,invalidated:true};
        setStatus('invalidated');
        setVerification(null);
        setNotice({type:'warning',
          text:'网页身份或授权已变化；当前会话已失效，不能复用旧文档执行操作。'});
      }
      adapter.context().then(raw=>{
        if(!live)return;
        const ctx=safeContext(raw);
        currentOrigin.current=ctx.origin;
        setContext({origin:ctx.origin,title:ctx.title});
      }).catch(()=>{if(live){currentOrigin.current=null;setContext({origin:null});}});
    };
    globalThis.addEventListener?.('opendesk-page-changed',changed);
    return ()=>{
      live=false;mounted.current=false;
      globalThis.removeEventListener?.('opendesk-page-changed',changed);
    };
  },[adapter]);

  const begin=type=>{
    if(busyRef.current)return false;
    busyRef.current=type;setBusy(type);return true;
  };
  const finish=type=>{
    if(busyRef.current!==type)return;
    busyRef.current=null;
    if(mounted.current)setBusy('');
  };
  const warn=(text,type='error')=>{if(mounted.current)setNotice({type,text});};
  async function record(kind,state,detail,source='client-precheck'){
    const eventOrigin=currentOrigin.current||activeSession.current?.target.origin;
    if(!eventOrigin)return;
    const row={id:ident('r-'),at:stamp(),kind,status:state,origin:eventOrigin,
      presetName:presetName.slice(0,24),detail:String(detail).slice(0,180),source};
    try{
      const items=await appendRun(adapter.request,row);
      if(mounted.current)setRuns(items);
    }catch(error){
      warn('主操作结果已保留，但运行记录写入未确认：'+readableError(error),'warning');
    }
  }
  async function refreshContext(){
    if(!begin('target'))return;
    try{
      const info=safeContext(await adapter.context());
      currentOrigin.current=info.origin;
      setContext({origin:info.origin,title:info.title});
      warn('当前网页身份已重新读取：'+info.origin,'info');
    }catch(error){
      currentOrigin.current=null;setContext({origin:null});
      warn('无法读取当前网页：'+readableError(error));
    }finally{finish('target');}
  }
  function assignPreset(value){
    if(BUILTIN_PRESETS[value]){
      setSelected(value);setConfig(copyConfig(BUILTIN_PRESETS[value].config));
    }else if(value==='custom'){
      setSelected('custom');setConfig(copyConfig(config));
    }else{
      const preset=presets.find(row=>row.id===value);
      if(!preset)return;
      setSelected(value);setConfig(copyConfig(preset.config));
    }
    setDirty(value==='custom');setVerification(null);
  }
  function discardGuard(action){
    if(locked){warn('会话未完成；请先独立核对恢复结果。','warning');return;}
    if(dirty){setDraftAction(()=>action);return;}
    action();
  }
  function editField(key,value){
    if(locked)return;
    setConfig(previous=>({...previous,[key]:value}));
    setDirty(true);setVerification(null);
  }
  function openSave(){
    if(locked)return;
    setPresetNameInput(custom?.name||'');
    setDialog('save');
  }
  async function saveCurrent(){
    const name=presetNameInput.trim();
    if(!name||name.length>24){
      warn('请输入 1–24 字的自定义预设名称。');return;
    }
    if(!begin('preset'))return;
    try{
      const saved=await savePreset(adapter.request,
        {id:custom?.id||null,name,config});
      if(!mounted.current)return;
      setPresets(saved.items);setSelected(saved.id);setDirty(false);
      setDialog(null);warn('已使用条件写入保存预设，并从可信存储读回确认。','success');
      await record('preset','idle','预设已保存并读回','client-precheck');
    }catch(error){warn('保存未确认：'+readableError(error));}
    finally{finish('preset');}
  }
  async function removeCurrent(){
    if(!custom||!begin('preset'))return;
    try{
      const saved=await deletePreset(adapter.request,custom.id);
      if(!mounted.current)return;
      setPresets(saved);setSelected('us');setConfig(copyConfig(BUILTIN_PRESETS.us.config));
      setDirty(false);setDialog(null);
      warn('自定义预设已删除。','success');
      await record('preset','idle','自定义预设已删除','client-precheck');
    }catch(error){warn('删除未确认：'+readableError(error));}
    finally{finish('preset');}
  }
  async function apply(){
    if(!validConfig(config)||locked||selected==='original'||!begin('apply'))return;
    setStatus('applying');setVerification(null);setNotice(null);
    const frozen=copyConfig(config);
    try{
      const checked=await applyEnvironment(adapter,frozen);
      if(!mounted.current)return;
      const next={...checked,config:frozen,presetName,startedAt:stamp()};
      activeSession.current=next;setSession(next);
      setStatus('applied_unverified');
      // Read-only verification follows the one accepted mutation; it never retries apply.
      const native=next.fieldResults||[];
      const applied=native.filter(x=>x.status==='applied').length;
      const uncertain=native.filter(x=>x.status==='unknown').length;
      const unsupported=native.filter(x=>x.status==='unsupported').length;
      await record('apply','applied_unverified',
        '原生已受理 '+applied+' 字段，结果未知 '+uncertain+
        ' 字段，不支持 '+unsupported+' 字段；尚未独立读回',
        'trusted-browser-host');
      await readBack(next,false);
    }catch(error){
      const kind=classifyFailure(error,'apply');
      if(!mounted.current)return;
      setStatus(kind);
      if(kind==='unknown'||kind==='invalidated'){
        // Lost replies are never evidence of a safe rollback or a retryable action.
        activeSession.current={uncertain:true,config:frozen,presetName,
          target:{origin:currentOrigin.current}};
      }
      warn(readableError(error),kind==='blocked'?'warning':'error');
      await record('apply',kind,readableError(error),
        kind==='unknown'||kind==='invalidated'?'client-unknown':'client-precheck');
    }finally{finish('apply');}
  }
  async function readBack(active,restore){
    try{
      const result=await verifyEnvironment(adapter,active,
        restore?ORIGINAL_CONFIG:active.config,{restore});
      if(!mounted.current)return;
      // Target changes win over a late readback, including changes while writing logs.
      if(activeSession.current!==active){
        setStatus('invalidated');setVerification(null);return;
      }
      const outcome=restore?classifyRestoration(result):result.status;
      setStatus(outcome);setVerification(result);
      if(restore&&outcome!=='restore_unknown'){
        activeSession.current=null;setSession(null);
      }
      if(outcome==='partial'||outcome==='restore_unknown')
        warn(restore?'恢复核验仍有差异或未知字段；请核对检测页。':
          '网页核验存在差异或没有可核验字段；请查看核验详情。','warning');
      await record(restore?'restore':'verify',outcome,
        restore?(outcome==='restored_verified'?'原始环境已独立核验':
          outcome==='restored_limited'?'网页字段恢复；HTTP 请求头未验证':'恢复未确认'):
          '独立网页核验完成；未采集字段不算一致','trusted-browser-host');
    }catch(error){
      if(!mounted.current)return;
      const invalidated=activeSession.current!==active||active.invalidated;
      const state=readbackFailureState(error,{restore,invalidated});
      setStatus(state);setVerification(null);
      if(invalidated)return;
      // A read failure does not turn a known apply receipt into an unknown mutation.
      // Keep Stop available for that owned session; do not re-apply automatically.
      warn('核验未完成：'+readableError(error)+'；未重复执行操作。','warning');
      await record(restore?'restore':'verify',state,readableError(error),'client-unknown');
    }
  }
  async function verify(){
    const active=activeSession.current;
    if(!active||!canRead||!begin('verify'))return;
    setNotice(null);
    try{await readBack(active,active.restoreAccepted===true);}
    finally{finish('verify');}
  }
  async function restore(){
    const active=activeSession.current;
    if(!active||!begin('restore'))return;
    try{
      if(['unknown','invalidated','restore_unknown'].includes(status)||
          active.uncertain||active.invalidated){
        setStatus('restore_unknown');
        warn('旧文档或执行结果未知，不能向新网页重放恢复命令；请人工核对原始环境。','warning');
        await record('restore','restore_unknown','目标失效或执行未知，未发送新的副作用',
          'client-unknown');
        return;
      }
      if(!canRestore)return;
      setNotice(null);
      await restoreEnvironment(adapter,active);
      if(!mounted.current)return;
      if(activeSession.current!==active){setStatus('invalidated');setVerification(null);return;}
      const pendingRestore={...active,restoreAccepted:true};
      activeSession.current=pendingRestore;setSession(pendingRestore);
      setStatus('restoring');
      setVerification(null);
      // A detach acknowledgement is never displayed as successful restoration.
      await record('restore','restoring','已受理恢复，尚无基线读回','trusted-browser-host');
      await readBack(pendingRestore,true);
    }catch(error){
      if(!mounted.current)return;
      setStatus('restore_unknown');setVerification(null);
      warn('恢复未确认：'+readableError(error));
      await record('restore','restore_unknown',readableError(error),'client-unknown');
    }finally{finish('restore');}
  }
  function reportText(){
    if(!verification||preview)return null;
    return JSON.stringify({
      format:'opendesk.browser-fingerprint.report.r21.v1',
      source:verification.source,
      generatedAt:stamp(),capturedAt:verification.capturedAt,
      origin:origin||null,mode:verification.kind,status,
      configuration:session?.config||config,
      controlledKeys:verification.controlledKeys||[],
      rows:verification.rows,
      caveat:'仅明确标记的可信独立读回字段被验证；不承诺公网 IP/Profile/反检测。'
    },null,2);
  }
  async function output(kind){
    const report=reportText();
    if(!report||!begin(kind))return;
    try{
      const res=kind==='copy'
        ?await adapter.request('clipboard.writeText',{text:report})
        :await adapter.request('file.download',{text:report,filename:'browser-fingerprint-r21-report.json'});
      if(kind==='copy'&&res?.copied!==true||
        kind==='download'&&!Number.isInteger(res?.downloadId)&&res?.started!==true)
        throw Object.assign(Error('未获得有效导出回执'),{code:'E_OUTCOME_UNKNOWN'});
      warn(kind==='copy'?'报告已提交至剪贴板。':
        '可信 Host 已受理下载请求，尚不证明文件已落盘。','success');
    }catch(error){warn('导出未确认：'+readableError(error));}
    finally{finish(kind);}
  }
  async function copyDiagnosticUrl(){
    if(!begin('copy-url'))return;
    try{
      const reply=await adapter.request('clipboard.writeText',{
        text:'http://127.0.0.1:43111/browser-fingerprint.html'});
      if(reply?.copied!==true)throw Object.assign(Error('复制结果未知'),{code:'E_OUTCOME_UNKNOWN'});
      warn('检测页地址已复制；应用前请在目标标签页打开。','success');
    }catch(error){warn('复制未确认：'+readableError(error));}
    finally{finish('copy-url');}
  }
  return <main className="fp-app">
    <Summary status={status} origin={origin} presetName={session?.presetName||presetName}
      onRefresh={()=>void refreshContext()} refreshDisabled={!!busy}/>
    <nav className="fp-tabs" role="tablist" aria-label="浏览器指纹功能">
      {[['config','环境设置'],['history','运行记录']].map(([key,text])=>
        <button type="button" role="tab" key={key} id={'fp-tab-'+key}
          aria-selected={view===key} aria-controls={'fp-panel-'+key} tabIndex={view===key?0:-1}
          className={view===key?'active':''} onClick={()=>setView(key)}
          onKeyDown={event=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();
            const next=event.key==='Home'?'config':event.key==='End'?'history':view==='config'?'history':'config';
            setView(next);document.getElementById('fp-tab-'+next)?.focus();
          }}>{text}</button>)}
    </nav>
    {preview?<p className="fp-preview-note">离线同源 React 预览：SDK 测试替身不会修改 Chrome，也不能提供真实网页验证。</p>:null}
    <Notice notice={notice}/>
    {view==='config'?<section className="fp-panel" role="tabpanel" id="fp-panel-config" aria-labelledby="fp-tab-config">
      <Card><CardContent className="fp-card">
        <div className="fp-section-head"><strong>环境预设</strong>
          {dirty?<span className="fp-tag fp-tag-warn">未保存</span>:null}</div>
        <div className="fp-preset-row">
          <select className="fp-control" aria-label="选择环境预设" value={selected}
            disabled={locked||!!busy} onChange={event=>{
              const value=event.target.value;
              discardGuard(()=>assignPreset(value));
            }}>
            {Object.entries(BUILTIN_PRESETS).map(([key,item])=>
              <option key={key} value={key}>{item.name}</option>)}
            <option value="custom">自定义环境 · 未保存</option>
            {presets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <IconButton label="新建自定义预设" title="新建自定义预设"
            disabled={locked||!!busy} onClick={()=>
              discardGuard(()=>assignPreset('custom'))}>＋</IconButton>
          <IconButton label="保存当前预设" title="保存预设"
            disabled={locked||!!busy} onClick={openSave}><Glyph name="save"/></IconButton>
          <IconButton label="删除当前自定义预设" title="删除自定义预设"
            disabled={locked||!!busy||!custom} onClick={()=>setDialog('delete')}>
            <Glyph name="trash"/></IconButton>
        </div>

      </CardContent></Card>
      <Card><CardContent className="fp-card">

        {['ua','lang','tz'].map(key=><Field key={key} fieldKey={key}
          value={config[key]} disabled={locked||!!busy} onChange={editField}/>)}
        <details className="fp-advanced">
          <summary>更多参数 · 视口与定位</summary>
          <Field fieldKey="viewport" value={config.viewport} disabled={locked||!!busy} onChange={editField} showNote/>
          <Field fieldKey="geo" value={config.geo} disabled onChange={editField}/>
          <p className="fp-secondary">当前不支持修改地理位置；预设中的定位值不会执行。</p>
        </details>
      </CardContent></Card>
      <Report verification={verification} preview={preview} busy={busy} canRead={canRead}
        onVerify={()=>void verify()} onCopy={()=>void output('copy')} onExport={()=>void output('download')}/>
      <details className="fp-details">
        <summary>网页检测与使用范围</summary>
        <p>详细前后对比请打开浏览器环境诊断页。应用前在目标标签页打开，应用后保持该标签页，停止后核对基线。</p>
        <code className="fp-diagnostic-url">http://127.0.0.1:43111/browser-fingerprint.html</code>
        <Button variant="secondary" disabled={!!busy} onClick={()=>void copyDiagnosticUrl()}>复制检测页地址</Button>
        <p>修改仅限当前授权 Tab；切换标签、导航或撤权会结束原会话。调试权限在 Chrome 安装时审阅，网站权限由原授权入口确认。</p>
        <p>HTTP 请求头未独立验证，定位不支持；不修改公网 IP、代理、物理屏幕或独立 Profile，不保证反检测。</p>
      </details>
    </section>:null}
    {view==='history'?<section className="fp-panel" role="tabpanel" id="fp-panel-history" aria-labelledby="fp-tab-history">
      <Card><CardContent className="fp-card">
        <div className="fp-section-head"><strong>配置运行记录</strong>
          <span className="fp-tag">{runs.length} / 18</span></div>
        {!runs.length?<p className="fp-empty">尚无运行记录。应用或保存预设后会在这里显示。</p>:null}
        {runs.map(item=><div className="fp-log" key={item.id}>
          <div className="fp-section-head"><strong>{({
            apply:'应用配置',verify:'网页验证',restore:'停止 / 恢复',
            target:'目标变化',preset:'预设更新'
          })[item.kind]||item.kind}</strong>
            <span className="fp-tag">{labels[item.status]||item.status}</span></div>
          <small className="fp-secondary">{dateText(item.at)} · {item.presetName}</small>
          <details className="fp-log-detail"><summary>查看详情</summary>
            <p>{item.detail}</p><small className="fp-secondary">{item.origin} · {sourceLabel(item.source)}</small>
          </details>
        </div>)}
        <p className="fp-secondary">这里只存储状态、来源、网站 Origin 和时间；不存储 Cookie、账号、文档引用或 URL 查询参数。</p>
      </CardContent></Card>
      <details className="fp-legacy" onToggle={event=>setLegacyOpen(event.currentTarget.open)}>
        <summary>旧版只读检测、快照及历史对比</summary>
        {legacyOpen?<ReadOnlyDiagnostics adapter={adapter} preview={preview}/>:null}
      </details>
    </section>:null}
    <div className="fp-bottom-actions">
      <Button variant="primary" disabled={!!busy||locked||selected==='original'||!validConfig(config)}
        onClick={()=>void apply()}>
        {busy==='apply'?'应用并核验中…':'应用配置'}</Button>
      <Button variant="secondary" disabled={!!busy||
        (!canRestore&&!['unknown','invalidated','restore_unknown'].includes(status))}
        onClick={()=>void restore()}>{busy==='restore'?'停止并核验中…':'停止 / 恢复'}</Button>
    </div>
    {draftAction?<Modal title="有尚未保存的预设修改"
      onCancel={()=>setDraftAction(null)}
      actions={<button className="fp-danger" type="button" onClick={()=>{
        const action=draftAction;setDraftAction(null);setDirty(false);action?.();
      }}>丢弃修改并继续</button>}>
      <p>更换预设将丢弃当前草稿；已有保存的预设不会被改写。</p>
    </Modal>:null}
    {dialog==='save'?<Modal title="保存环境预设" onCancel={()=>setDialog(null)}
      actions={<button className="fp-primary" type="button" disabled={!!busy}
        onClick={()=>void saveCurrent()}>保存</button>}>
      <label className="fp-label" htmlFor="fp-save-name">预设名称</label>
      <input id="fp-save-name" className="fp-control" maxLength={24}
        value={presetNameInput} placeholder="例如：德国网页测试"
        onChange={event=>setPresetNameInput(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter')void saveCurrent();}}/>
      <p className="fp-secondary">仅保存选定参数，不保存 Cookie、账号、授权或代理凭据。</p>
    </Modal>:null}
    {dialog==='delete'?<Modal title="删除自定义预设" onCancel={()=>setDialog(null)}
      actions={<button className="fp-danger" type="button" disabled={!!busy}
        onClick={()=>void removeCurrent()}>删除预设</button>}>
      <p>将删除「{custom?.name}」，不会删除历史记录或修改网页。</p>
    </Modal>:null}
  </main>;
}
