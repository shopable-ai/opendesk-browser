import * as React from 'react';
import {Card,CardContent,Button,IconButton} from '@opendesk/ui';
import ReadOnlyDiagnostics from './ReadOnlyDiagnostics.jsx';
import {safeContext} from './model.js';
import {ORIGINAL_CONFIG,BUILTIN_PRESETS,CONFIG_FIELDS,copyConfig,
  validConfig} from './env-config.js';
import {readPresets,savePreset,deletePreset,readRuns,appendRun} from './presets.js';
import {applyEnvironment,verifyEnvironment,restoreEnvironment,
  ACTIVE_STATES,classifyFailure,classifyRestoration,readbackFailureState,sessionActions,sameTarget} from './run-session.js';

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
    <label htmlFor={'fp-param-'+fieldKey}>{fieldKey==='ua'?'浏览器标识 / UA、UA-CH':def.label}</label>
    <select id={'fp-param-'+fieldKey} className="fp-control" value={value}
      onChange={event=>onChange(fieldKey,event.target.value)} disabled={disabled}>
      {def.values.map(([id,label])=><option value={id} key={id}>{label}</option>)}
    </select>
    {showNote?<small className="fp-secondary">{def.note}</small>:null}
  </div>;
}
function Summary({status,origin,presetName,onRefresh,refreshDisabled,canRestore,onRestore,busy}){
  const attention=['unknown','invalidated','restore_unknown'].includes(status);
  return <section className="fp-session" aria-label="当前网页执行状态">
    <div className="fp-session-head">
      <strong className="fp-site" title={origin||''}>当前网页 · {origin||'尚未绑定可用网页'}</strong>
      {canRestore?<Button variant="secondary" disabled={!!busy} onClick={onRestore}>
        {busy==='restore'?'停止并核验中…':'停止并恢复网页'}</Button>:null}
    </div>
    <div className="fp-session-state" role="status" aria-live="polite">
      <span className={'fp-dot '+(['verified_limited','restored_verified','restored_limited'].includes(status)?'fp-dot-ok':
        ['unknown','restore_unknown','failed'].includes(status)?'fp-dot-error':
        ['idle','blocked'].includes(status)?'':'fp-dot-warn')}/>
      <span>{labels[status]||'结果未知'} · 仅当前 Tab</span>
      <IconButton label="重新检查当前网页身份" title="刷新网页身份"
        disabled={refreshDisabled} onClick={onRefresh}><Glyph name="refresh"/></IconButton>
    </div>
    <p className="fp-session-note">{stateDescription[status]||stateDescription.unknown}
      {attention?' 请人工核对当前网页；不会自动重放旧会话。':''}</p>
    {status!=='idle'?<small className="fp-secondary">本次会话：{presetName}</small>:null}
  </section>;
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
  const [nameDraft,setNameDraft]=React.useState(BUILTIN_PRESETS.us.name);
  const [page,setPage]=React.useState(null);
  const [deleteTarget,setDeleteTarget]=React.useState(null);
  const [config,setConfig]=React.useState(()=>copyConfig(BUILTIN_PRESETS.us.config));
  const [dirty,setDirty]=React.useState(false);
  const [presets,setPresets]=React.useState([]);
  const [presetBaseline,setPresetBaseline]=React.useState(null);
  const [runs,setRuns]=React.useState([]);
  const [context,setContext]=React.useState({origin:null});
  const [status,setStatus]=React.useState('idle');
  const [session,setSession]=React.useState(null);
  const [verification,setVerification]=React.useState(null);
  const [notice,setNotice]=React.useState(null);
  const [dialog,setDialog]=React.useState(null);
  const [draftAction,setDraftAction]=React.useState(null);
  const [busy,setBusy]=React.useState('');
  const [legacyOpen,setLegacyOpen]=React.useState(false);
  const busyRef=React.useRef(null);
  const mounted=React.useRef(false);
  const activeSession=React.useRef(null);
  const currentOrigin=React.useRef(null);
  const origin=context.origin;
  const custom=presets.find(row=>row.id===selected);
  const presetName=nameDraft.trim()||'未命名环境';
  const locked=ACTIVE_STATES.includes(status)||!!activeSession.current;
  const originalConfig=Object.keys(ORIGINAL_CONFIG).every(key=>config[key]===ORIGINAL_CONFIG[key]);
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
      }else{
        // A completed session must never be advertised as the new document's state.
        setStatus('idle');setSession(null);setVerification(null);
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
      presetName:(activeSession.current?.presetName||presetName).slice(0,24),detail:String(detail).slice(0,180),source};
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
      if(activeSession.current&&!sameTarget(activeSession.current.target,info)){
        activeSession.current={...activeSession.current,invalidated:true};
        setStatus('invalidated');setVerification(null);
        warn('当前网页不再匹配原有 Session；禁止对新文档重放应用或恢复，请人工核对。','warning');
      }else{
        if(!activeSession.current){setStatus('idle');setSession(null);setVerification(null);}
        warn('当前网页身份已重新读取：'+info.origin,'info');
      }
    }catch(error){
      currentOrigin.current=null;setContext({origin:null});
      warn('无法读取当前网页：'+readableError(error));
    }
    try{
      const stored=await readPresets(adapter.request);
      if(mounted.current)setPresets(stored.value.items);
    }catch(error){warn('档案列表未能刷新：'+readableError(error),'warning');}
    finish('target');
  }
  function assignPreset(value){
    const builtIn=BUILTIN_PRESETS[value],saved=presets.find(row=>row.id===value);
    if(!builtIn&&!saved)return;
    setSelected(value);setConfig(copyConfig((builtIn||saved).config));
    setPresetBaseline(saved||null);
    setNameDraft((builtIn||saved).name);setDirty(false);
    setPage(null);setView('config');
    // Reading another form must not erase independent Host verification.
  }
  function discardGuard(action){
    if(busyRef.current){warn('当前操作尚未结束，请完成后再切换草稿。','warning');return;}
    if(dirty){setDraftAction(()=>action);return;}action();
  }
  function editField(key,value){
    if(busyRef.current)return;
    setConfig(previous=>({...previous,[key]:value}));setDirty(true);
  }
  function editName(value){
    if(busyRef.current)return;
    setNameDraft(value);setDirty(true);
  }
  function newEnvironment(){
    discardGuard(()=>{
      setSelected('custom');setConfig(copyConfig(ORIGINAL_CONFIG));
      setPresetBaseline(null);
      setNameDraft('自定义环境');setDirty(true);
      setView('config');setPage(null);
    });
  }
  function duplicateEnvironment(item){
    // Copying the currently edited draft preserves its changes in the new
    // profile; switching to a different saved row still needs a discard guard.
    const source=item||{name:nameDraft,config};
    const action=()=>{
      setSelected('custom');setConfig(copyConfig(source.config));
      setPresetBaseline(null);
      setNameDraft((source.name+' 副本').slice(0,24));setDirty(true);
      setView('config');setPage(null);
    };
    if(item)discardGuard(action);
    else if(!busyRef.current)action();
  }
  function resetForm(){
    if(busyRef.current)return;
    setConfig(copyConfig(ORIGINAL_CONFIG));setDirty(true);
    warn('仅将当前表单恢复原始参数；没有调用 Host，也没有恢复网页。','info');
  }
  async function saveCurrent(){
    let name=nameDraft.trim();
    if(!name||name.length>24){warn('环境名称应为 1–24 个字符。');return;}
    if(!custom&&BUILTIN_PRESETS[selected]?.name===name)
      name=(name+' 副本').slice(0,24);
    if(!begin('preset'))return;
    try{
      const saved=await savePreset(adapter.request,
        {id:presetBaseline?.id||null,name,config:copyConfig(config),
          expectedPreset:presetBaseline||undefined});
      if(!mounted.current)return;
      setPresets(saved.items);setSelected(saved.id);setNameDraft(name);setDirty(false);
      setPresetBaseline(saved.items.find(row=>row.id===saved.id));
      warn('环境已保存，并从可信存储读回确认；未改变当前网页。','success');
      await record('preset','idle','环境档案已保存并读回','client-precheck');
    }catch(error){warn('保存未确认：'+readableError(error));}
    finally{finish('preset');}
  }
  async function removeCurrent(){
    const id=deleteTarget;
    if(!id||!presets.some(row=>row.id===id)||!begin('preset'))return;
    try{
      const saved=await deletePreset(adapter.request,id);
      if(!mounted.current)return;
      setPresets(saved);setDeleteTarget(null);setDialog(null);
      if(selected===id){setSelected('custom');setPresetBaseline(null);setDirty(true);}
      warn('已删除自定义环境档案；当前网页运行状态没有改变。','success');
      await record('preset','idle','自定义环境档案已删除','client-precheck');
    }catch(error){warn('删除未确认：'+readableError(error));}
    finally{finish('preset');}
  }
  function requestDelete(id){
    if(!presets.some(row=>row.id===id))return;
    setDeleteTarget(id);setDialog('delete');
  }
  function selectTab(next){
    if(busyRef.current)return;
    setPage(null);setView(next);
  }
  async function apply(){
    if(!validConfig(config)||locked||originalConfig||!begin('apply'))return;
    setStatus('applying');setSession(null);setVerification(null);setNotice(null);
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
        // Keep the completed receipt bound to its frozen name/config for
        // the summary and report while the next form is edited.
        activeSession.current=null;
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
    <header className="fp-header">
      {page?<button type="button" className="fp-back" onClick={()=>setPage(null)}
        aria-label="返回主页面">‹</button>:<span className="fp-header-logo" aria-hidden="true">◉</span>}
      <span className="fp-header-title"><strong>浏览器指纹</strong>
        <small>Browser Fingerprint · 环境配置</small></span>
      <IconButton label="设置与诊断" title="设置与诊断" onClick={()=>setPage('settings')}>
        <Glyph name="info"/></IconButton>
    </header>
    <Summary status={status} origin={origin}
      presetName={session?.presetName||presetName}
      canRestore={canRestore} onRestore={()=>void restore()}
      busy={busy} onRefresh={()=>void refreshContext()} refreshDisabled={!!busy}/>
    <nav className="fp-tabs" role="tablist" aria-label="浏览器指纹主功能">
      {[['config','配置'],['profiles','我的环境'],['detect','检测']].map(([key,text],index,items)=>
        <button type="button" role="tab" key={key} id={'fp-tab-'+key}
          aria-selected={view===key} aria-controls={'fp-panel-'+key} tabIndex={view===key?0:-1}
          className={view===key?'active':''} onClick={()=>selectTab(key)}
          onKeyDown={event=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();
            const current=items.findIndex(item=>item[0]===view);
            const target=event.key==='Home'?0:event.key==='End'?items.length-1:
              (current+(event.key==='ArrowRight'?1:items.length-1))%items.length;
            selectTab(items[target][0]);
            event.currentTarget.parentElement?.children?.[target]?.focus();
          }}>{text}</button>)}
    </nav>
    {preview?<p className="fp-preview-note">离线 React 预览只使用测试替身，不修改 Chrome，也不产生真实验证结果。</p>:null}
    <Notice notice={notice}/>
    {page==='pro'?<section className="fp-panel fp-pro" aria-label="完整浏览器环境方案">
      <div className="fp-section-head"><strong>专业环境方案</strong>
        <button type="button" className="fp-link" onClick={()=>setPage(null)}>返回配置</button></div>
      <p className="fp-secondary">当前扩展只修改当前获授权网页的部分环境参数，不等于创建独立浏览器身份。此入口为自愿了解，不影响免费功能。</p>
      <table className="fp-pro-table"><thead><tr><th>能力</th><th>本扩展</th><th>专业环境产品</th></tr></thead>
        <tbody>
          <tr><td>UA / 语言 / 时区 / 视口</td><td>部分支持</td><td>通常支持</td></tr>
          <tr><td>独立浏览器 Profile</td><td>不支持</td><td>通常支持</td></tr>
          <tr><td>Cookie / 存储隔离</td><td>不支持</td><td>通常支持</td></tr>
          <tr><td>代理与公网 IP</td><td>不支持</td><td>依产品配置</td></tr>
          <tr><td>Canvas / WebGL 修改</td><td>不支持</td><td>依产品配置</td></tr>
        </tbody></table>
      <a className="fp-external" href="https://gologin.com/" target="_blank" rel="noopener noreferrer">GoLogin 官方网站 <span aria-hidden="true">↗</span></a>
      <a className="fp-external" href="https://www.adspower.com/" target="_blank" rel="noopener noreferrer">AdsPower 官方网站 <span aria-hidden="true">↗</span></a>
      <p className="fp-secondary">本站未与上述厂商声明合作；不收集邮箱或候补申请，不含联盟追踪参数。</p>
    </section>:page==='settings'?<section className="fp-panel fp-settings" aria-label="设置与诊断">
      <div className="fp-section-head"><strong>设置与诊断</strong>
        <button type="button" className="fp-link" onClick={()=>setPage(null)}>返回</button></div>
      <details className="fp-details">
        <summary>运行记录（{runs.length} / 18）</summary>
        {!runs.length?<p className="fp-empty">暂无运行记录。</p>:null}
        {runs.map(item=><div className="fp-log" key={item.id}>
          <div className="fp-section-head"><strong>{({
            apply:'应用配置',verify:'网页验证',restore:'停止 / 恢复',
            target:'目标变化',preset:'环境档案'
          })[item.kind]||item.kind}</strong>
            <span className="fp-tag">{labels[item.status]||item.status}</span></div>
          <small className="fp-secondary">{dateText(item.at)} · {item.presetName}</small>
          <details className="fp-log-detail"><summary>查看详情</summary>
            <p>{item.detail}</p><small className="fp-secondary">{item.origin} · {sourceLabel(item.source)}</small>
          </details>
        </div>)}
        <p className="fp-secondary">记录仅含操作状态、来源、Origin 与时间，不存 Cookie、账号或完整 URL。</p>
      </details>
      <Report verification={verification} preview={preview} busy={busy} canRead={canRead}
        onVerify={()=>void verify()} onCopy={()=>void output('copy')} onExport={()=>void output('download')}/>
      <details className="fp-legacy" onToggle={event=>setLegacyOpen(event.currentTarget.open)}>
        <summary>旧版只读检测、快照与历史对比</summary>
        {legacyOpen?<ReadOnlyDiagnostics adapter={adapter} preview={preview} coreOnly={false}/>:null}
      </details>
      <details className="fp-details"><summary>授权及恢复边界</summary>
        <p>只针对当前授权 Tab 与 Document。执行未知或文档失效时不会自动重试；需要人工独立核对。</p>
        <p>表单重置不等于网页恢复；可信 Host 的停止回执还需要独立读回才能视为已恢复。</p>
      </details>
    </section>:view==='config'?<section className="fp-panel fp-config" role="tabpanel" id="fp-panel-config" aria-labelledby="fp-tab-config">
      <div className="fp-section-head"><strong>环境配置</strong>
        <div className="fp-inline-actions">
          <button type="button" className="fp-mini" disabled={!!busy} onClick={newEnvironment}>＋ 新建</button>
          <IconButton label="复制当前配置" title="复制为新环境" disabled={!!busy}
            onClick={()=>duplicateEnvironment()}><Glyph name="copy"/></IconButton>
        </div>
      </div>
      <p className="fp-pretitle">快速预设 · 选择后可直接修改参数</p>
      <div className="fp-quick-presets" role="group" aria-label="内置环境预设">
        {[['original','原始'],['us','美国'],['de','德国'],['jp','日本']].map(([key,label])=>
          <button type="button" className={selected===key?'active':''} key={key}
            aria-pressed={selected===key} disabled={!!busy}
            onClick={()=>discardGuard(()=>assignPreset(key))}>{label}</button>)}
      </div>
      <div className="fp-editor-caption"><span>当前正在编辑</span>
        <strong title={nameDraft}>{nameDraft||'未命名环境'}</strong>
        {dirty?<span className="fp-tag fp-tag-warn">未保存</span>:null}
      </div>
      <div className="fp-parameter"><label htmlFor="fp-environment-name">环境名称</label>
        <input id="fp-environment-name" className="fp-control" maxLength={24}
          value={nameDraft} disabled={!!busy} onChange={event=>editName(event.target.value)}
          placeholder="例如：日本移动测试"/></div>
      <div className="fp-section-head fp-parameter-title"><strong>网页环境参数</strong>
        <button type="button" className="fp-link" disabled={!!busy} onClick={resetForm}>恢复原始参数</button></div>
      {['ua','lang','tz','viewport'].map(key=><Field key={key} fieldKey={key}
        value={config[key]} disabled={!!busy} onChange={editField}
        showNote={key==='ua'}/>)}
      <details className="fp-details"><summary>地理位置与支持范围</summary>
        <p>预设定位：{CONFIG_FIELDS.geo.values.find(([key])=>key===config.geo)?.[1]||'保持原值'}。当前 Host 不支持定位修改，预设定位值不会执行。</p>
        <p>UA-CH 与 UA、HTTP Accept-Language 与网页语言需要分别独立核验；公网 IP、物理屏幕与 TLS 不由本工具修改。</p>
      </details>
      <p className="fp-reset-note">「恢复原始参数」只重置表单，不会恢复已修改的网页。恢复网页请使用顶部「停止并恢复网页」。</p>
      <button type="button" className="fp-pro-entry" onClick={()=>setPage('pro')}>
        <span><strong>了解完整浏览器环境方案</strong><small>独立 Profile / Cookie 隔离 / 代理 · 自愿了解</small></span>
        <span aria-hidden="true">›</span>
      </button>
    </section>:null}
    {!page&&view==='profiles'?<section className="fp-panel fp-profiles" role="tabpanel" id="fp-panel-profiles" aria-labelledby="fp-tab-profiles">
      <div className="fp-section-head"><strong>我的环境 <small className="fp-secondary">{presets.length}/20</small></strong>
        <button type="button" className="fp-mini" disabled={!!busy} onClick={newEnvironment}>＋ 新建</button></div>
      <p className="fp-secondary">这里只管理已保存的自定义环境。点击档案直接载入「配置」，编辑、保存或应用；内置预设仍在「配置」页。</p>
      <div className="fp-profile-list">
        {!presets.length?<p className="fp-empty">暂无已保存的环境。到「配置」页新建并保存。</p>:null}
        {presets.map(item=><div className="fp-profile-row" key={item.id}>
          <button type="button" className="fp-profile-load" disabled={!!busy}
            onClick={()=>discardGuard(()=>assignPreset(item.id))}>
            <span className="fp-profile-icon" aria-hidden="true">▣</span>
            <span className="fp-profile-text"><strong>{item.name}</strong>
              <small>{item.config.viewport==='mobile'?'手机':'桌面'} · {item.config.lang} · {item.config.tz}</small></span>
            <span aria-hidden="true">›</span>
          </button>
          <IconButton label={'复制环境 '+item.name} title="复制为新环境" disabled={!!busy}
            onClick={()=>duplicateEnvironment(item)}><Glyph name="copy"/></IconButton>
          <IconButton label={'删除环境 '+item.name} title="删除环境" disabled={!!busy}
            onClick={()=>requestDelete(item.id)}><Glyph name="trash"/></IconButton>
        </div>)}
      </div>
      <p className="fp-secondary">档案不包含 Cookie、代理或独立 Profile。编辑和删除只影响档案，不会修改网页的现有会话。</p>
    </section>:null}
    {!page&&view==='detect'?<section className="fp-panel fp-detect" role="tabpanel" id="fp-panel-detect" aria-labelledby="fp-tab-detect">
      <div className="fp-section-head"><strong>基础环境检测</strong></div>
      <p className="fp-secondary">点击检测后才读取目标网页的真实环境字段；未采集字段不会推断为已生效。</p>
      <div className="fp-detect-embedded"><ReadOnlyDiagnostics adapter={adapter} preview={preview} coreOnly/></div>
      <div className="fp-detect-limits">
        <div><span>自动化状态信号</span><strong>未采集 · 不推断</strong></div>
        <div><span>HTTP 请求头 / 公网 IP / TLS</span><strong>未独立验证或不支持</strong></div>
      </div>
      <a className="fp-external" href="http://127.0.0.1:43111/browser-fingerprint.html"
        target="_blank" rel="noopener noreferrer">独立检测网页 <span aria-hidden="true">↗</span></a>
      <small className="fp-secondary">独立检测页需要本地 HTTP 检测服务已启动；不会被当前扩展自动启动。</small>
    </section>:null}
    {!page&&view==='config'?<footer className="fp-bottom-actions">
      <Button variant="secondary" disabled={!!busy} onClick={()=>void saveCurrent()}>
        <Glyph name="save"/>{custom?'保存修改':'保存为环境'}</Button>
      <Button variant="primary" disabled={!!busy||locked||originalConfig||!validConfig(config)}
        onClick={()=>void apply()}>{busy==='apply'?'应用并核验中…':'应用到当前网页'}</Button>
    </footer>:null}
    {draftAction?<Modal title="当前环境有未保存的修改"
      onCancel={()=>setDraftAction(null)}
      actions={<button className="fp-danger" type="button" onClick={()=>{
        const action=draftAction;setDraftAction(null);setDirty(false);action?.();
      }}>丢弃草稿并继续</button>}>
      <p>切换环境会丢弃当前未保存的表单草稿，但不会修改网页或覆盖已保存的档案。</p>
    </Modal>:null}
    {dialog==='delete'?<Modal title="删除自定义环境" onCancel={()=>{
      setDialog(null);setDeleteTarget(null);
    }} actions={<button className="fp-danger" type="button" disabled={!!busy}
      onClick={()=>void removeCurrent()}>删除</button>}>
      <p>确定删除「{presets.find(row=>row.id===deleteTarget)?.name||'该环境'}」？此操作只删除档案，不会停止或恢复当前网页。</p>
    </Modal>:null}
  </main>;
}
