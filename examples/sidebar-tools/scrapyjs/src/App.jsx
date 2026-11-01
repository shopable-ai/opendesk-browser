import * as React from 'react';
import {Button,IconButton,Card,CardContent,Input,Textarea} from '@opendesk/ui';
import {fieldForm,applyInlineField,crawlForm,applyCrawl} from './editor.js';
import Results from './Results.jsx';
import RuleEditor from './RuleEditor.jsx';
import ColumnSettings from './ColumnSettings.jsx';
import AiPanel from './AiPanel.jsx';
import CaptureWorkspace from './CaptureWorkspace.jsx';
import {accessDenied,resultKeys} from './results-model.js';

const freshUI=epoch=>({epoch,json:null,valid:true,error:'',notice:'',exportError:'',field:null,fieldPending:false,fieldError:'',invalidField:'',crawl:null,crawlPending:false,crawlError:'',crawlNotice:'',target:null,targetValid:true,http:null,httpValid:true,jsonHint:'',fieldHelp:'',removeField:false});
const stringify=value=>JSON.stringify(value,null,2);
const httpExample=()=>({executionMode:'http-local',url:'http://127.0.0.1:43121/http-echo',http:{headers:{Accept:'application/json','X-Client-Tag':'scrapyjs-app'}},maxPages:1,itemConfig:{userAgent:'userAgent',accept:'accept',clientTag:'clientTag',requestId:'requestId'}});
const tabs=[['results','采集结果','results-panel'],['rules','采集规则','rules-editor'],['json','配置 JSON','json-panel']];
function Field({id,label,children,...props}){
  return <div className="od-form-field field"><label className="od-field-label" htmlFor={id}>{label}</label>{children||<Input className="od-field" id={id} autoComplete="off" {...props}/>}</div>;
}
function Message({id,children,alert=false,...props}){
  return <p id={id} hidden={!children} role={alert?'alert':'status'} className={alert?'error':'secondary'} {...props}>{children}</p>;
}
// Shared UI has no public Dialog. The native modal owns only this sandbox document;
// React/model state controls its lifetime and the original pending action.
function ProfileConfirmation({open,title,description,acceptLabel,disabled,onCancel,onConfirm}){
  const dialog=React.useRef(null),composing=React.useRef(false);
  React.useLayoutEffect(()=>{
    const node=dialog.current;
    if(open&&!node.open){node.showModal();node.querySelector('#profile-confirm-cancel')?.focus();}
    else if(!open&&node.open)node.close();
  },[open]);
  return <dialog ref={dialog} id="profile-confirm" className="profile-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="profile-confirm-title" aria-describedby="profile-confirm-text" tabIndex={-1}
    onCancel={event=>{event.preventDefault();if(!disabled&&!composing.current)onCancel();}}
    onCompositionStartCapture={()=>{composing.current=true;}} onCompositionEndCapture={()=>{composing.current=false;}}
    onKeyDownCapture={event=>{
      if(composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229){event.preventDefault();event.stopPropagation();return;}
      // Native modal tabbing may leave an iframe for its host toolbar at an edge.
      if(event.key==='Tab'){
        const nodes=[...event.currentTarget.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1),active=event.currentTarget.ownerDocument.activeElement;
        if(!first){event.preventDefault();event.currentTarget.focus();}
        else if(event.shiftKey&&(active===first||!nodes.includes(active))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(active===last||!nodes.includes(active))){event.preventDefault();first.focus();}
      }
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!disabled)onCancel();}
    }} onClickCapture={event=>{if(composing.current){event.preventDefault();event.stopPropagation();}}}>
    <div className="profile-confirm-content"><h2 id="profile-confirm-title" className="od-page-title">{title}</h2><p id="profile-confirm-text">{description}</p>
      <div className="toolbar profile-confirm-actions"><Button base="aria" id="profile-confirm-cancel" variant="outline" disabled={disabled} onClick={onCancel}>取消</Button><Button base="aria" id="profile-confirm-accept" variant="secondary" disabled={disabled} onClick={onConfirm}>{acceptLabel}</Button></div>
    </div>
  </dialog>;
}
function statusOf(state,matches,busy){
  if(accessDenied(state))return '当前访问受限';
  if(state.phase==='unknown')return '运行状态待确认';
  if(state.phase==='starting')return '正在准备采集…';
  if(busy)return state.stopRequested?'正在停止 · 等待原实例退出':'正在采集…';
  if(!state.retired)return matches?'准备采集':'请确认采集目标';
  const host=state.snapshot?.status,engine=state.result?.engine?.status;
  if(engine==='partial'||state.result?.list?.engine?.status==='partial')return '采集结束 · 含部分结果';
  if(host==='completed'&&engine==='completed')return '采集完成';
  if(host==='failed'||engine==='failed')return '采集失败';
  if(['stopped','cancelled'].includes(host)||engine==='cancelled')return '采集已停止';
  return '采集结束 · 请查看运行详情';
}

// Offline presentation only; the installed entry keeps the full AiPanel.
function AiPreviewPlaceholder({open,onClose}){
  return <aside id="ai-preview-placeholder" className="ai-preview-placeholder" hidden={!open} aria-labelledby="ai-preview-heading" onKeyDown={event=>{
    if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();onClose();}
  }}><div className="toolbar"><h2 id="ai-preview-heading" className="od-page-title">AI 助手</h2><IconButton label="收起 AI 占位窗口" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></IconButton></div>
    <p>这里是 AI 对话的预览占位。</p><p className="secondary">实际使用：在 OpenDesk「扩展」中打开「scrapyjs 采集」，点击右上角 AI，使用完整配置助手。</p>
  </aside>;
}

export default function App({previewAiPlaceholder=false,RuleAssistant,ListScopeAssistant}={}){
  const tool=globalThis.OpenDeskTool;
  const hostNavigation=typeof tool.setNavigation==='function';
  const [snapshot,setSnapshot]=React.useState(null);
  const [ui,setUI]=React.useState(()=>freshUI(0));
  const [app]=React.useState(()=>globalThis.ScrapyAppModel.createApp(
    globalThis.ScrapyAppSdk.createSdk((operation,payload)=>tool.request(operation,payload)),state=>{
      setSnapshot({...state});
      setUI(previous=>previous.epoch===state.profileEpoch?previous:freshUI(state.profileEpoch));
    }));
  const state=snapshot||app.state;
  const [view,setView]=React.useState('results');
  const [contextOpen,setContextOpen]=React.useState(false);
  React.useEffect(()=>setContextOpen(false),[view]);
  const showContext=view==='results'||contextOpen;
  const [naming,setNaming]=React.useState(null);
  const [managementOpen,setManagementOpen]=React.useState(false);
  const [profileSearch,setProfileSearch]=React.useState('');
  const businessScroll=React.useRef(null);
  const scrollPositions=React.useRef({workspace:0,library:0});
  React.useLayoutEffect(()=>{
    if(businessScroll.current)businessScroll.current.scrollTop=scrollPositions.current[managementOpen?'library':'workspace'];
  },[managementOpen]);
  function navigateManagement(open){
    if(businessScroll.current)scrollPositions.current[managementOpen?'library':'workspace']=businessScroll.current.scrollTop;
    setManagementOpen(open);
  }
  const [modeChange,setModeChange]=React.useState(null);
  const [aiOpen,setAiOpen]=React.useState(false);
  const [workspaceAiBusy,setWorkspaceAiBusy]=React.useState(false);
  const [workspaceOpen,setWorkspaceOpen]=React.useState(false);
  const [localBusy,setLocalBusy]=React.useState(false);
  const [ruleAssistOpen,setRuleAssistOpen]=React.useState(false);
  const [localDirty,setLocalDirty]=React.useState(false);
  const [aiBusy,setAiBusy]=React.useState(false);
  const [aiDirty,setAiDirty]=React.useState(false);
  const [savedAiRequestId,setSavedAiRequestId]=React.useState(null);
  const aiApplication=React.useRef(null);
  const onAiDirty=React.useCallback(value=>setAiDirty(value),[]);
  const [aiGenerating,setAiGenerating]=React.useState(false);
  const actionFocus=React.useRef('profile-list');
  const inlineCheckpoint=React.useRef(null);
  const jsonDetails=React.useRef(null);
  const exportPending=React.useRef(false);
  const [exporting,setExporting]=React.useState(false);
  const update=change=>setUI(previous=>({...previous,...change}));
  const focusLater=(id,options)=>requestAnimationFrame(()=>{
    const node=tool.root.querySelector('#'+id);
    const folded=node?.closest('details:not([open])');
    (folded?.querySelector('summary')||node)?.focus(options);
  });
  const closeAi=()=>setAiOpen(false);
  function closeManagement(){navigateManagement(false);focusLater('manage-profiles',{preventScroll:true});}
  function toggleManagement(){if(managementOpen)closeManagement();else{navigateManagement(true);focusLater('profile-search',{preventScroll:true});}}
  React.useEffect(()=>{
    tool.setNavigation?.({page:managementOpen?'library':'home',title:managementOpen?'配置库':'scrapyjs 采集',canBack:managementOpen,primary:null});
    const navigate=event=>{
      if(event.detail?.action==='back'&&managementOpen&&!naming&&!state.pendingAction&&!state.saving)closeManagement();
    };
    tool.root.addEventListener('opendesk-tool-navigation',navigate);
    return ()=>tool.root.removeEventListener('opendesk-tool-navigation',navigate);
  },[tool,managementOpen,naming,state.pendingAction,state.saving]);
  React.useEffect(()=>{
    const toggle=event=>{if(event.detail?.action==='toggle')setAiOpen(value=>!value);};
    tool.root.addEventListener('opendesk:conversation-action',toggle);
    return ()=>{tool.root.removeEventListener('opendesk:conversation-action',toggle);tool.setConversationState?.({visible:false,open:false});};
  },[tool]);
  React.useEffect(()=>{tool.setConversationState?.({visible:true,open:aiOpen});},[tool,aiOpen]);
  React.useEffect(()=>{
    app.load();app.refreshTarget();
    const changed=()=>app.refreshTarget();
    tool.root.addEventListener('opendesk-page-changed',changed);
    const timer=setInterval(()=>app.refresh(),1000);
    return ()=>{clearInterval(timer);tool.root.removeEventListener('opendesk-page-changed',changed);app.dispose();};
  },[app,tool]);
  const busy=state.phase==='starting'||Boolean(state.clientRequestId)&&!state.retired;
  const baseLocked=busy||state.saving||Boolean(naming)||Boolean(state.pendingAction)||Boolean(modeChange)||state.phase==='unknown';
  const assistantLocked=baseLocked||aiGenerating||aiBusy||localBusy;
  const locked=assistantLocked||ruleAssistOpen;
  const managementLocked=locked||!state.storageReady||Boolean(state.conflict);
  const pending=ui.fieldPending||ui.crawlPending;
  const valid=ui.valid&&ui.targetValid&&ui.httpValid;
  const httpLocal=state.config.executionMode==='http-local';
  const httpForm=ui.http||{userAgent:state.config.http?.userAgent??'',headers:stringify(state.config.http?.headers??{}),fields:stringify(state.config.itemConfig),maxPages:String(state.config.maxPages??1)};
  const current=state.records.find(row=>row.id===state.selectedId);
  const profileWebsite=row=>{try{return new URL(row.config.url).host;}catch{return '未设置网站';}};
  const searchTerm=profileSearch.trim().toLocaleLowerCase();
  const visibleProfiles=state.records.filter(row=>!searchTerm||(row.name+' '+profileWebsite(row)).toLocaleLowerCase().includes(searchTerm));
  const currentInResults=visibleProfiles.some(row=>row.id===state.selectedId);
  const configuredFields=Object.entries(state.config.itemConfig).filter(([key])=>!key.startsWith('_'));
  const [outputError,setOutputError]=React.useState('');
  const [displayOrder,setDisplayOrder]=React.useState({epoch:-1,keys:[]});
  const resultFields=resultKeys(state.result?.data||[]);
  const preferred=displayOrder.epoch===state.profileEpoch?displayOrder.keys:[];
  const displayKeys=[...preferred.filter(key=>resultFields.includes(key)),...resultFields.filter(key=>!preferred.includes(key))];
  const fields=configuredFields;
  const form=ui.field||{key:'',originalKey:'',rule:'',selector:'',read:'text',attr:'',container:state.config.itemConfig._listContainer||'',item:state.config.itemConfig._listItem||''};
  const crawl=ui.crawl||crawlForm(state.config);
  let matches=false;
  try{matches=Boolean(state.target)&&new URL(state.config.url).origin===new URL(state.target.url).origin;}catch{}
  const help=state.phase==='unknown'?'开始结果未知，请刷新原实例状态；不要重复开始。':
    accessDenied(state)?'权限受限；当前草稿保留。恢复方法见上方读取提示。':
    !valid?'配置草稿有误，请修正规则、Headers JSON 或目标网址后再运行或保存。':
    pending?ui.fieldPending?'请补全或修正字段与列表范围；按 Esc 可恢复当前输入。':'分页与详情有未应用编辑，请先应用或取消。':
    !state.target?(state.targetError?'网页信息读取失败，请检查上方原因后刷新当前网页。':'请先打开目标网页，再刷新当前网页。'):!busy&&!matches?'目标网址与当前网页不同源，请切换到目标网站后刷新当前网页。':
    state.saving?'正在保存配置，请稍候。':naming||state.pendingAction?'请先完成或取消配置操作。':'';
  React.useEffect(()=>{tool.setState?.({dirty:state.dirty||!valid||pending||Boolean(naming)||Boolean(modeChange)||localDirty||aiDirty,busy:busy||state.saving||aiGenerating||aiBusy||workspaceAiBusy||localBusy||ruleAssistOpen});},[tool,state.dirty,valid,pending,naming,modeChange,busy,state.saving,aiGenerating,aiBusy,workspaceAiBusy,localBusy,localDirty,aiDirty,ruleAssistOpen]);
  function guarded(action){try{action();}catch(error){update({error:error.message});}}
  function touch(change){guarded(()=>{app.touch();update({...change,error:'',...(change.field?{fieldError:'',invalidField:''}:{}),...(change.crawl?{crawlError:'',crawlNotice:''}:{})});});}
  function editJSON(text){
    try{app.edit(JSON.parse(text));update({json:text,valid:true,target:null,targetValid:true,http:null,httpValid:true,error:'',field:null,crawl:null,removeField:false});}
    catch(error){guarded(()=>app.touch());update({json:text,valid:false,error:error.message});}
  }
  function loadMode(config,source='execution-mode'){
    if(stringify(config)===stringify(state.config))return;
    setModeChange({config,source});focusLater('mode-cancel');
  }
  function cancelMode(){const source=modeChange.source;setModeChange(null);focusLater(source);}
  function confirmMode(){
    try{app.edit(modeChange.config);update({...freshUI(state.profileEpoch)});cancelMode();}
    catch(error){update({error:error.message});}
  }
  function editHTTP(change){
    const draft={...httpForm,...change};
    try{
      const http={headers:JSON.parse(draft.headers)};
      if(draft.userAgent)http.userAgent=draft.userAgent;
      app.edit({...state.config,http,itemConfig:JSON.parse(draft.fields),maxPages:Number(draft.maxPages)});
      update({http:draft,httpValid:true,json:null,error:''});
    }catch(error){guarded(()=>app.touch());update({http:draft,httpValid:false,error:error.message});}
  }
  function apply(which,create){
    try{
      app.edit(create());
      update({[which+'Pending']:false,[which+'Error']:'',crawlNotice:'已应用分页与详情到配置草稿。',json:null,valid:true,error:'',removeField:false});
    }
    catch(error){update({[which+'Error']:error.message,...(which==='field'?{invalidField:error.fieldId||''}:{})});focusLater(error.fieldId||which+'-error');}
  }
  function openFieldJSON(key){
    setView('json');focusLater('config-json');update({jsonHint:'字段「'+key+'」使用复杂规则，请在完整 JSON 中编辑；原规则已保留。'});
  }
  function editRow(key,rule,change,isNew=false){
    const selected=isNew||(!form.scopeOnly&&form.originalKey===key);
    const draft=selected?form:{...form,...fieldForm(key,rule),rule,isNew:false,scopeOnly:false};
    touchField({...draft,...change});
  }
  function touchField(field,showError=true){
    if(!ui.fieldPending)inlineCheckpoint.current=app.checkpointDraft();
    try{
      if(field.scopeOnly)for(const [name,label,id] of [['container','列表容器','list-container'],['item','列表项','list-item']]){
        if(!field[name].trim())continue;
        try{document.createDocumentFragment().querySelector(field[name].trim());}
        catch{throw Object.assign(Error(label+'选择器格式有误，请检查括号或使用点选。'),{fieldId:id});}
      }
      const next=applyInlineField(app.state.config,field);
      if(stringify(next)!==stringify(app.state.config))app.edit(next);
      else if(ui.fieldPending)app.cancelDraft(inlineCheckpoint.current,{keepDirty:ui.crawlPending||!valid||localDirty||aiDirty});
      inlineCheckpoint.current=null;
      update({field:{...field,isNew:false,originalKey:field.scopeOnly?'':field.key.trim()},fieldPending:false,fieldError:'',invalidField:'',fieldHelp:'',json:null,removeField:false,error:''});
    }catch(error){
      guarded(()=>app.touch());
      update({field,fieldPending:true,fieldError:showError?error.message:'',invalidField:showError?(error.fieldId||(field.scopeOnly?'list-container':field.key.trim()!==field.originalKey?'field-key':'field-rule')):'',fieldHelp:'',removeField:false});
    }
  }
  function cancelField(){
    const id=form.scopeOnly?'list-container':form.originalKey?'rule-'+fields.findIndex(([key])=>key===form.originalKey)+'-rule':'new-field';
    app.cancelDraft(inlineCheckpoint.current,{keepDirty:ui.crawlPending||!valid||localDirty||aiDirty});inlineCheckpoint.current=null;
    update({field:null,fieldPending:false,fieldError:'',invalidField:'',fieldHelp:'',removeField:false});focusLater(id);
  }
  function removeField(key,rule){
    update({field:{...form,...fieldForm(key,rule),rule,isNew:false,scopeOnly:false},fieldHelp:'',fieldError:'',removeField:true});focusLater('cancel-remove-field');
  }
  function requestAction(method,id){actionFocus.current=id;app[method]();if(app.state.pendingAction)focusLater('profile-confirm-cancel');else focusLater(managementOpen?'library-current':'profile-current');}
  async function selectConfiguration(id,source){
    actionFocus.current=source;
    const selection=app.selectProfile(id);
    if(app.state.pendingAction){focusLater('profile-confirm-cancel');return;}
    if(!await selection)return;
    requestAnimationFrame(()=>{
      const node=tool.root.querySelector('#'+source),doc=tool.root.ownerDocument;
      // Saving disables its trigger. Restore lost focus without taking it from another control.
      if(node?.getClientRects().length&&!node.disabled&&(doc.activeElement===doc.body||doc.activeElement===node))node.focus();
    });
  }
  function editConfiguration(){navigateManagement(false);setView('rules');focusLater('tab-rules');}
  async function exportConfiguration(){
    if(exportPending.current)return;
    exportPending.current=true;setExporting(true);update({exportError:'',notice:''});
    try{
      const result=await tool.request('browser.downloads.text',{text:stringify(state.config),filename:'scrapyjs-config.json'});
      if(result?.started!==true)throw Error('下载结果未知');
      update({exportError:'',notice:'已请求下载完整配置，请在下载列表确认。'});
    }catch(error){update({exportError:error.message,notice:''});}
    finally{exportPending.current=false;setExporting(false);}
  }
  function cancelAction(){if(state.saving||busy||aiBusy||state.phase==='unknown')return;app.cancelAction();focusLater(actionFocus.current);}
  function openName(type,source){setNaming({type,source,value:type==='rename'?current.name:type==='copy'?(current?.name||'配置')+' 副本':'',error:''});focusLater('profile-name');}
  function closeName(){const source=naming.source;setNaming(null);focusLater(source);}
  async function saveConfiguration(method,name){
    const receipt=aiApplication.current,config=JSON.stringify(app.state.config);
    const ok=await app[method](name);
    // Only a successful write of this applied proposal acknowledges its save.
    // Selecting a profile, renaming it or saving another draft cannot do so.
    if(ok&&method!=='renameProfile'&&receipt&&aiApplication.current===receipt&&receipt.config===config){
      setSavedAiRequestId(receipt.requestId);aiApplication.current=null;
    }
    return ok;
  }
  async function submitName(){
    if(!naming||state.saving)return;
    const ok=await saveConfiguration({save:'save',copy:'copyProfile',rename:'renameProfile'}[naming.type],naming.value);
    if(ok)closeName();else{setNaming(previous=>({...previous,error:app.state.error}));focusLater('profile-name');}
  }
  function tabKey(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=tabs.findIndex(([name])=>name===view);const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length][0];
    setView(next);focusLater('tab-'+next);
  }
  const confirmation=state.pendingAction?.type==='delete'?'确认删除「'+current?.name+'」？删除后无法恢复。'+(state.dirty?'未保存的编辑也将丢弃。':''):
    state.pendingAction?.type==='select'?'切换到「'+(state.records.find(row=>row.id===state.pendingAction.id)?.name||'所选配置')+'」将丢弃当前未保存的更改和未应用的编辑。取消可继续编辑当前草稿。':
    '未保存的 JSON 或未应用编辑将丢弃。确认'+({new:'新建配置',select:'切换配置',saved:'用远端完整列表替换草稿'}[state.pendingAction?.type]||'')+'？';
  return <div className="od-conversation-workspace scrapyjs-workspace od-theme-shadcn" data-theme="light"><div className="od-conversation-business capture-business" ref={businessScroll}><main className="capture-app" aria-label="scrapyjs 采集" onKeyDown={event=>{
    if(event.key!=='Escape'||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||state.saving)return;
    if(naming){event.preventDefault();closeName();}else if(state.pendingAction){event.preventDefault();cancelAction();}
    else if(managementOpen){event.preventDefault();closeManagement();}
    else if(modeChange){event.preventDefault();cancelMode();}
    else if(ui.removeField){event.preventDefault();update({removeField:false});focusLater('remove-field');}
  }}>
    <section className="config-section" aria-labelledby="config-heading" hidden={workspaceOpen}>
      <h2 className="sr-only" id="config-heading">采集配置</h2>
      <p id="ai-toggle-status" className="od-note secondary" role="status" hidden={!aiBusy}>AI 请求待处理；收起对话不会停止请求。展开后可查询或停止。</p>
      <div className="profile-choice" hidden={managementOpen}><label className="sr-only" htmlFor="profile-list">已保存配置</label>
        <select className="od-field" id="profile-list" aria-label="已保存配置" value={state.selectedId||''} disabled={managementLocked||!state.records.length} onChange={event=>{
          selectConfiguration(event.target.value,'profile-list');
        }}><option value="" disabled>未保存配置</option>{state.records.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <div className="profile-actions">
          <IconButton id="new-profile" label="新建配置" disabled={managementLocked} onClick={()=>requestAction('newProfile','new-profile')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></IconButton>
          <IconButton id="save-config" label={state.saving?'保存中…':'保存配置'} disabled={managementLocked||!valid||pending} onClick={()=>state.selectedId?saveConfiguration('save'):openName('save','save-config')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h9"/></svg></IconButton>
          <IconButton id="manage-profiles" label="配置库" aria-expanded={managementOpen} aria-controls="profile-management" disabled={Boolean(naming)||Boolean(state.pendingAction)||state.saving} onClick={toggleManagement}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></IconButton>
        </div>
      </div>
      <div className="config-meta" hidden={managementOpen}><p id="profile-current" className="od-note secondary" data-dirty={state.dirty} role="status" tabIndex={-1}><span className="state-dot" aria-hidden="true"/>{state.saving?'正在保存配置…':state.dirty?'有未保存更改':current?'配置已保存':'未保存配置'}</p><Button base="aria" id="open-local-runner" hidden={managementOpen} disabled={baseLocked||aiBusy} onClick={()=>{setWorkspaceOpen(true);focusLater('capture-heading');}}>本机试采 / 任务</Button></div>
      <div id="profile-management" className="profile-management" role="region" aria-label="配置库" hidden={!managementOpen}>
        {!hostNavigation&&<Button base="aria" id="profile-management-close" variant="quiet" disabled={Boolean(naming)||Boolean(state.pendingAction)||state.saving} onClick={closeManagement}>返回采集</Button>}
        <div className="library-heading"><span className="secondary">{state.records.length} 份配置</span><Button base="aria" id="library-new-profile" variant="secondary" disabled={managementLocked} onClick={()=>requestAction('newProfile','library-new-profile')}><svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>新建配置</Button></div>
        <div className="library-search"><label className="sr-only" htmlFor="profile-search">搜索配置名称或网站</label><svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><Input id="profile-search" className="od-field" placeholder="搜索配置名称或网站" autoComplete="off" value={profileSearch} aria-controls="profile-library-list" onChange={event=>setProfileSearch(event.target.value)} onKeyDown={event=>{
          if(event.key==='Escape'&&profileSearch&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();setProfileSearch('');}
        }}/><IconButton id="profile-search-clear" label="清空搜索" hidden={!profileSearch} onClick={()=>{setProfileSearch('');focusLater('profile-search');}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></IconButton></div>
        <p className="sr-only" role="status" aria-live="polite">{searchTerm?'找到 '+visibleProfiles.length+' 份配置':''}</p>
        <ul id="profile-library-list" className="profile-library" aria-label="配置列表">{visibleProfiles.map(row=>{
          const selected=row.id===state.selectedId;
          return <li key={row.id}><Button base="aria" id={'profile-entry-'+row.id} variant="quiet" className="profile-entry" aria-pressed={selected} disabled={managementLocked} onClick={()=>selectConfiguration(row.id,'profile-entry-'+row.id)}><span className="profile-entry-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3h7l4 4v14H6V3Z M13 3v5h5M9 12h6M9 16h6"/></svg></span><span className="profile-entry-main"><span className="profile-entry-name">{row.name}</span><span className="profile-entry-meta">{selected&&state.dirty&&<span className="profile-entry-version">保存版 ·</span>}<span className="profile-entry-site" title={profileWebsite(row)}>{profileWebsite(row)}</span><span className="profile-entry-count"> · {Object.keys(row.config.itemConfig).filter(key=>!key.startsWith('_')).length} 个字段</span></span></span><span className="profile-entry-state">{selected?<><svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>当前使用</>:<>切换<svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></>}</span></Button></li>;
        })}</ul>
        {state.records.length>0&&!visibleProfiles.length&&<div id="library-no-results" className="library-empty"><strong>没有找到匹配的配置</strong><p className="secondary">试试其他名称或网站，或清空搜索查看全部。</p><Button base="aria" variant="outline" onClick={()=>{setProfileSearch('');focusLater('profile-search');}}>查看全部配置</Button></div>}
        {!state.records.length&&<div className="library-empty"><strong>还没有保存的配置</strong><p className="secondary">新建配置，或编辑当前草稿后保存，下次直接使用。</p></div>}
        <div className="profile-tools" role="group" aria-labelledby="profile-tools-heading">
          <div className="library-current-heading"><h3 id="profile-tools-heading" className={currentInResults&&!state.dirty?'sr-only':undefined}>{currentInResults&&!state.dirty?'当前配置操作':current?.name||'未命名配置'}</h3><span className="library-save-state" data-dirty={state.dirty||!current} id="library-current" tabIndex={-1} role="status">{state.saving?'正在保存…':state.dirty?'待保存':current?'配置已保存':'尚未保存'}</span></div>
          <p className="secondary library-draft-summary" hidden={!state.dirty&&currentInResults}><span>{state.dirty?'草稿 · ':''}{fields.length} 个采集字段</span>{state.dirty&&current&&<span>保存版 · {Object.keys(current.config.itemConfig).filter(key=>!key.startsWith('_')).length} 个采集字段</span>}</p>
          {current&&!currentInResults&&searchTerm&&<p className="secondary">当前使用配置不受搜索筛选影响。</p>}
          <div className="library-primary-actions" data-saved={Boolean(current)&&!state.dirty}>
            <Button base="aria" id="edit-profile-rules" variant="secondary" disabled={locked} onClick={editConfiguration}>编辑采集规则<svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></Button>
            <Button base="aria" id="library-save-config" variant="outline" hidden={Boolean(current)&&!state.dirty} disabled={managementLocked||!valid||pending||(!state.dirty&&Boolean(current))} onClick={()=>state.selectedId?saveConfiguration('save'):openName('save','library-save-config')}>{state.saving?'保存中…':'保存配置'}</Button>
          </div>
          {(managementLocked||!valid||pending)&&<p className="secondary" role="status">{state.phase==='unknown'?'原运行状态待确认，请返回采集查询；当前草稿保留。':state.conflict||!state.storageReady?'保存版本尚未就绪，请在下方读取或处理冲突。':help||'当前操作进行中，配置管理暂不可用。'}</p>}
          <details id="profile-more-actions" className="library-more"><summary>更多操作</summary><div className="library-more-body">
            <Button base="aria" id="copy-profile" variant="outline" disabled={managementLocked||!valid||pending} onClick={()=>openName('copy','copy-profile')}>复制为新配置</Button>
            <Button base="aria" id="rename-profile" variant="outline" disabled={managementLocked||!current||state.dirty} onClick={()=>openName('rename','rename-profile')}>重命名</Button>
            <Button base="aria" id="export-profile" variant="outline" disabled={locked||!valid||pending||exporting} onClick={exportConfiguration}>{exporting?'导出中…':'导出 JSON'}</Button>
            <p className="secondary">复制与导出包含当前已应用的更改。{state.dirty?'重命名前请先保存更改。':''}</p>
            <div className="profile-danger"><Button base="aria" id="delete-profile" variant="quiet" disabled={managementLocked||!current} onClick={()=>requestAction('deleteProfile','delete-profile')}>删除配置…</Button><p className="secondary">删除后无法恢复，建议先导出备份。</p></div>
          </div></details>
        </div>
        <Message alert>{state.error}</Message><Message>{state.notice==='已读取保存配置'?'':state.notice}</Message>
      </div>
      {managementOpen&&<><Message id="library-export-status">{ui.notice}</Message><Message id="library-export-error" alert>{ui.exportError}</Message></>}
      <div id="profile-naming" className="confirmation" role="group" aria-label="配置名称" hidden={!naming}>
        <Field id="profile-name" label={naming?.type==='rename'?'重命名配置':naming?.type==='copy'?'保存独立副本':'保存新配置'}>
          <Input className="od-field" id="profile-name" autoComplete="off" maxLength={120} disabled={state.saving} value={naming?.value||''} aria-describedby="profile-name-error" onChange={event=>setNaming({...naming,value:event.target.value})} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();submitName();}}}/>
        </Field>
        <Message id="profile-name-error" alert>{naming?.error}</Message>
        <div className="toolbar"><Button base="aria" id="profile-name-submit" disabled={state.saving} onClick={submitName}>{naming?.type==='copy'?'保存副本':naming?.type==='rename'?'保存新名称':'创建配置'}</Button><Button base="aria" id="profile-name-cancel" disabled={state.saving} onClick={closeName}>取消</Button></div>
      </div>
      <ProfileConfirmation open={Boolean(state.pendingAction)} title={state.pendingAction?.type==='delete'?'删除配置？':state.pendingAction?.type==='new'?'新建配置？':'丢弃当前草稿？'} description={confirmation}
        acceptLabel={{new:'丢弃并新建',select:'丢弃并切换',delete:'确认删除',saved:'丢弃并替换'}[state.pendingAction?.type]||'确认'} disabled={state.saving||busy||aiBusy||state.phase==='unknown'} onCancel={cancelAction}
        onConfirm={async()=>{if(state.saving||busy||aiBusy||state.phase==='unknown')return;const type=state.pendingAction?.type;await app.confirmAction();focusLater(type==='new'?actionFocus.current:managementOpen?'library-current':'profile-current');}}/>
      <div id="conflict" className="confirmation" hidden={state.storageReady&&!state.conflict}>
        <p>{state.conflict?'保存版本与当前草稿不同。替换将采用远端完整配置列表，请先复制需要的草稿。':state.storageError?.code==='E_PERMISSION_DENIED'?'配置读取被权限拒绝。当前草稿保留；请在扩展详情检查已批准的权限，恢复后重新读取。':'尚未读取保存配置，当前草稿保留；读取成功后才能保存或切换配置。'}</p>
        <Button base="aria" id="load-config" disabled={locked} onClick={()=>app.load()}>读取保存版本</Button>
        <Button base="aria" id="use-saved" hidden={!state.conflict} disabled={locked} onClick={()=>{actionFocus.current='use-saved';app.useSaved();if(app.state.pendingAction)focusLater('profile-confirm-cancel');}}>用保存版本替换草稿</Button>
      </div>
    </section>
    <div hidden={!workspaceOpen}><CaptureWorkspace open={workspaceOpen} state={state} locked={baseLocked||aiBusy} pending={pending} valid={valid} onBusy={setLocalBusy} onDirty={setLocalDirty} onAiGenerating={setAiGenerating} onAiBusy={setWorkspaceAiBusy} onClose={()=>{setWorkspaceOpen(false);focusLater('open-local-runner');}}/></div>

    <div className="capture-workspace" hidden={managementOpen||workspaceOpen}>
    <Card className="target-section" data-expanded={showContext} role="region" aria-labelledby="target-heading"><CardContent className="target-content">
      <div className="toolbar target-head"><div className="target-heading"><h2 className="od-page-title" id="target-heading">采集目标</h2><p id="page-title" className="target-title" title={state.target?.title||state.host}>{state.target?.title||(state.targetError?'当前网页信息不可用':state.host)}</p></div><Button base="aria" id="toggle-target" hidden={view==='results'} variant="quiet" aria-expanded={contextOpen} aria-controls="target-body" onClick={()=>setContextOpen(!contextOpen)}>{contextOpen?'收起操作':'网址与运行'}</Button><IconButton id="refresh-target" label="刷新当前网页" hidden={!showContext} disabled={busy||state.saving} onClick={()=>app.refreshTarget()}><svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17"/></svg></IconButton></div>
      <p hidden={showContext} className="od-note secondary" role="status">{statusOf(state,matches,busy)}</p>
      <div id="target-body" className="stack" hidden={!showContext}>
      <div id="target-settings" className="stack">
        <Input className="od-field" id="target-url" aria-label="目标网址" placeholder="输入目标网址" autoComplete="off" type="url" disabled={locked||pending||!ui.valid} value={ui.target??state.config.url} aria-describedby="target-help target-error" onChange={event=>{
          const url=event.target.value;try{app.edit({...state.config,url});update({target:url,targetValid:true,json:null,error:''});}catch(error){guarded(()=>app.touch());update({target:url,targetValid:false,error:error.message});}
        }} aria-invalid={!ui.targetValid}/><Message id="target-error" alert>{!ui.targetValid?ui.error:''}</Message><p id="target-help" className="sr-only">在目标网页打开此 App；{httpLocal?'本机自有 JSON 回显：仅 http://127.0.0.1:43121；公网未开放。':'仅采集当前网页同源地址。'}</p>
      </div>
      <Message id="config-error" alert>{valid?ui.error:''}</Message>
      <div className="capture-meta"><div className="capture-context"><span>{httpLocal?'本机 HTTP':'DOM 网页'}</span><span>{fields.length} 个字段</span><span>{state.config.nextPageSelector?'最多 '+(state.config.maxPages||1)+' 页':'当前页'}{state.config.detail?' · 含详情':''}</span></div>
      <p id="run-summary" className="run-summary" data-phase={busy?'running':state.phase} data-completed={state.retired&&state.snapshot?.status==='completed'&&state.result?.engine?.status==='completed'} role="status"><span className="state-dot" aria-hidden="true"/>{statusOf(state,matches,busy)}</p></div>
      <div className="toolbar actions" role="group" aria-label="采集操作"><Button base="aria" id="start" variant="secondary" title="开始采集" aria-label="开始采集" aria-describedby="run-summary run-help" disabled={locked||!matches||!valid||pending} onClick={()=>{app.start(state.config.url);setView('results');}}><svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" fill="currentColor"/></svg>{busy?'正在采集…':'开始采集'}</Button><IconButton id="stop" label="停止采集" aria-describedby="run-summary run-help" disabled={!busy||(state.phase!=='starting'&&(state.retired||state.stopAccepted))} onClick={()=>app.stop()}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/></svg></IconButton></div>
      <Message id="run-help">{help}</Message>
      </div>
      <Message id="app-error" alert>{state.error}</Message><Message id="app-notice" className={state.notice==='已读取保存配置'?'sr-only':'secondary'}>{(view==='results'&&state.result!=null)||state.notice==='已读取保存配置'||state.notice.startsWith('已请求下载完整 ')||state.notice.startsWith('配置已保存')?'':state.notice}</Message>
    </CardContent></Card>

    <div className="view-tabs" role="tablist" aria-label="采集工作区">{tabs.map(([name,label,panel])=><Button key={name} id={'tab-'+name} role="tab" variant="quiet" aria-selected={view===name} aria-controls={panel} tabIndex={view===name?0:-1} onClick={()=>setView(name)} onKeyDown={tabKey}>{label}</Button>)}</div>
    <section id="rules-editor" role="tabpanel" aria-labelledby="tab-rules" tabIndex={0} hidden={view!=='rules'}>
      <div className="toolbar" hidden={!httpLocal}><h2 className="od-page-title">采集规则</h2><p id="config-summary" className="od-note secondary">{fields.length} 个字段 · {state.config.nextPageSelector?'分页':'当前页'}{state.config.detail?' + 详情':''}</p></div>
      <Message id="editor-help">{ui.crawlPending||!valid?help:''}</Message>
      {httpLocal&&<fieldset disabled={locked||pending||!ui.valid||!ui.targetValid}>
        <p className="od-note secondary">通过本机 Node 仅 GET 自有回显 JSON；最多 3 页共享 15 秒，公网未开放。不执行 DOM 选择器。</p>
        <Field id="http-user-agent" label="User-Agent（留空使用 OpenDesk-NativeHTTP/1.0，最多 512 个可打印 ASCII 字符）" value={httpForm.userAgent} aria-describedby="http-error" onChange={event=>editHTTP({userAgent:event.target.value})}/>
        <Field id="http-headers" label="Headers JSON（普通请求头，值仅可打印 ASCII）"><Textarea className="od-field scrapy-code" id="http-headers" rows={4} spellCheck={false} value={httpForm.headers} placeholder={'{"Accept":"application/json","X-Client-Tag":"scrapyjs-app"}'} aria-invalid={!ui.httpValid} aria-describedby="http-error" onChange={event=>editHTTP({headers:event.target.value})}/></Field>
        <Field id="http-fields" label="JSON 字段点路径 itemConfig（最多 32 字段，每路径 4 段 / 128 字符）"><Textarea className="od-field scrapy-code" id="http-fields" rows={5} spellCheck={false} value={httpForm.fields} aria-invalid={!ui.httpValid} aria-describedby="http-error" onChange={event=>editHTTP({fields:event.target.value})}/></Field>
        <Field id="http-max-pages" label="页数安全上限（1–3）" type="number" min={1} max={3} value={httpForm.maxPages} aria-describedby="http-error" onChange={event=>editHTTP({maxPages:event.target.value})}/>
        <Message id="http-error" alert>{!ui.httpValid?ui.error:''}</Message>
      </fieldset>}
      {!httpLocal&&<RuleEditor key={state.profileEpoch} fields={fields} form={form} pending={ui.fieldPending} locked={locked||!valid||ui.crawlPending} error={ui.fieldError} invalidField={ui.invalidField} notice={ui.fieldHelp}
        Picker={RuleAssistant} ScopePicker={ListScopeAssistant} pickerLocked={assistantLocked||!valid||ui.crawlPending} onPickerOpenChange={setRuleAssistOpen} config={state.config}
        onOrderChange={fieldOrder=>guarded(()=>{app.edit({...state.config,output:{...state.config.output,fieldOrder}});update({field:null,json:null,fieldHelp:'已更新字段顺序；保存配置后保留。'});})} active={view==='rules'&&!managementOpen&&!workspaceOpen}
        editRow={editRow} openJSON={openFieldJSON} cancel={cancelField}
        newRow={()=>{touchField({...form,key:'',originalKey:'',rule:'',isNew:true,scopeOnly:false},false);focusLater('field-key');}}
        editScope={change=>touchField({...form,...change,key:'',originalKey:'',rule:'',isNew:false,scopeOnly:true})}
        remove={removeField} removePending={ui.removeField} cancelRemove={()=>{update({removeField:false});focusLater('remove-field');}}
        confirmRemove={()=>{
          const itemConfig={...state.config.itemConfig};delete itemConfig[form.originalKey];
          try{app.edit({...state.config,itemConfig});update({field:null,json:null,removeField:false,error:'',fieldError:'',fieldHelp:'已从配置草稿删除字段「'+form.originalKey+'」。'});focusLater('new-field');}
          catch(error){update({fieldError:error.message,removeField:false});focusLater('field-error');}
        }}/>}
      <details className="od-disclosure" id="csv-preset"><summary>CSV 表头（可选）</summary><div className="disclosure-body csv-export-settings">
        <p className="secondary">提前填写常用名称，保存配置后自动带入「自定义 CSV 表头」。普通 CSV 和 JSON 仍使用原字段名。</p>
        <ColumnSettings keys={[...new Set([...fields.map(([key])=>key),...Object.keys(state.config.detail?.itemConfig||{}).filter(key=>!key.startsWith('_'))])]} names={state.config.output?.fieldNames} idPrefix="preset-csv" locked={locked||!valid||pending||ui.removeField}
          onNamesChange={fieldNames=>{try{app.edit({...state.config,output:{...state.config.output,fieldNames}});setOutputError('');}catch(error){setOutputError(error.message);}}}/>
        {outputError&&<p className="error" role="alert">{outputError}</p>}
        <p className="secondary">预览按配置字段排列；下载以实际结果字段为准，新增字段使用原名。</p>
      </div></details>
      <details className="od-disclosure" id="crawl-editor" hidden={httpLocal}><summary>分页与列表详情</summary><fieldset className="disclosure-body" disabled={locked||!valid||ui.fieldPending} aria-describedby="crawl-error">
        {[['next-selector','下一页 CSS 选择器（留空为单页）','next'],['max-pages','页数安全上限','maxPages'],['dedupe-key','去重字段（留空保留全部）','dedupe']].map(([id,label,key])=><Field key={id} id={id} label={label} type={key==='maxPages'?'number':'text'} min={key==='maxPages'?1:undefined} max={key==='maxPages'?10:undefined} value={crawl[key]} onChange={event=>touch({crawl:{...crawl,[key]:event.target.value},crawlPending:true})}/>)}
        <label className="check"><input id="detail-enabled" type="checkbox" checked={crawl.enabled} onChange={event=>touch({crawl:{...crawl,enabled:event.target.checked},crawlPending:true})}/>采集列表对应详情</label>
        <div hidden={!crawl.enabled} className="stack">
          <Field id="detail-url-field" label="列表中的详情 URL 字段" value={crawl.urlField} onChange={event=>touch({crawl:{...crawl,urlField:event.target.value},crawlPending:true})}/>
          <Field id="detail-id-field" label="列表与详情共同的身份字段" value={crawl.identity} onChange={event=>touch({crawl:{...crawl,identity:event.target.value},crawlPending:true})}/>
          <Field id="detail-fields" label="详情 itemConfig JSON"><Textarea className="od-field scrapy-code" id="detail-fields" rows={5} spellCheck={false} value={crawl.fields} onChange={event=>touch({crawl:{...crawl,fields:event.target.value},crawlPending:true})}/></Field>
          <Field id="detail-numbers" label="按严格小数转换的详情字段（逗号分隔）" value={crawl.numbers} onChange={event=>touch({crawl:{...crawl,numbers:event.target.value},crawlPending:true})}/>
        </div><Message id="crawl-error" alert tabIndex={-1}>{ui.crawlError}</Message><Button base="aria" id="apply-crawl" aria-describedby="crawl-error crawl-feedback" onClick={()=>apply('crawl',()=>applyCrawl(state.config,crawl))}>应用分页与详情</Button><Message id="crawl-feedback">{ui.crawlNotice}</Message>
        <p className="od-note secondary">沿原导航授权，最多 10 页、100 条详情；身份不符或内容冲突会报错。</p>
      </fieldset></details>
      <details id="mode-settings" className="od-disclosure" ><summary>高级设置 · 采集方式与示例</summary><fieldset className="disclosure-body" disabled={locked||pending||!valid}>
        <Field id="execution-mode" label="采集方式"><select className="od-field" id="execution-mode" value={httpLocal?'http-local':'dom'} onChange={event=>loadMode(event.target.value==='http-local'?httpExample():globalThis.ScrapyAppModel.DEFAULT_CONFIG)}><option value="dom">DOM 网页采集</option><option value="http-local">本机 HTTP（自有回显）</option></select></Field>
        <p className="od-note secondary">切换方式会载入示例配置；确认前保留当前规则。</p>
        <Button base="aria" id="load-http-example" variant="quiet" onClick={()=>loadMode(httpExample(),'load-http-example')}>载入本机 HTTP 示例</Button>
      </fieldset></details>
      {modeChange&&<div className="confirmation" role="group" aria-labelledby="mode-confirm-text"><p id="mode-confirm-text">载入示例将替换当前完整规则{state.dirty?'，未保存的更改将丢失':''}。已保存版本保留，是否继续？</p><div className="toolbar"><Button base="aria" id="mode-confirm" onClick={confirmMode}>确认替换</Button><Button base="aria" id="mode-cancel" onClick={cancelMode}>取消</Button></div></div>}
    </section>
    <section id="json-panel" role="tabpanel" aria-labelledby="tab-json" tabIndex={0} hidden={view!=='json'}>
      <div id="json-editor" className="stack" ref={jsonDetails}>
        <div className="json-heading"><div className="related-note"><h2 id="config-json-heading" className="od-page-title">完整 JSON 配置</h2><p id="json-intro" className="od-note secondary">长行可横向滚动；导出当前已应用的配置。</p></div><Button base="aria" id="export-config" variant="quiet" title="导出完整配置 JSON" aria-label="导出完整配置 JSON" disabled={locked||!valid||pending||exporting} onClick={exportConfiguration}><svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" strokeLinecap="round" strokeLinejoin="round"/></svg>{exporting?'导出中…':'导出'}</Button></div>
        <Message id="config-export-status">{ui.notice}</Message><Message id="config-export-error" alert>{ui.exportError}</Message>
        <Message id="json-field-help">{ui.jsonHint}</Message>
        <div className="od-form-field field"><Textarea className="od-field scrapy-code" id="config-json" rows={12} wrap="off" spellCheck={false} disabled={locked||pending} value={ui.json??stringify(state.config)} aria-labelledby="config-json-heading" aria-invalid={!ui.valid} aria-describedby="json-intro config-help json-error json-field-help" onChange={event=>editJSON(event.target.value)}/></div>
        <Message id="json-error" alert>{!ui.valid?ui.error:''}</Message>
        <details className="json-reference"><summary>规则语法与限制</summary><p id="config-help" className="od-note secondary">{httpLocal?'本机 HTTP：itemConfig 每个字段为 JSON 点路径字符串，maxPages 最多 3；UA 留空继承，Headers 为普通字符串对象。':'保留复杂规则、validation / fieldRequirements / processing。_listContainer / _listItem 定义列表；.::text 读取当前项文本。'} itemConfig 最多 4096 字节，其他选项最多 4096 字节，配置总计最多 8192 字节。</p></details>
      </div>
    </section>
    <section id="results-panel" role="tabpanel" aria-labelledby="tab-results" tabIndex={0} hidden={workspaceOpen||view!=='results'}>
      <Results state={state} busy={busy} app={app} displayKeys={displayKeys} onOrderChange={keys=>setDisplayOrder({epoch:state.profileEpoch,keys})} columnsLocked={locked||!valid||pending||ui.removeField} active={view==='results'&&!managementOpen&&!workspaceOpen}/>
    </section>
    </div>
  </main></div>
    {previewAiPlaceholder?<AiPreviewPlaceholder open={aiOpen} onClose={closeAi}/>:<AiPanel open={aiOpen} state={state} savedRequestId={savedAiRequestId} locked={baseLocked||localBusy||aiGenerating} pending={pending} valid={valid} onBusy={setAiBusy} onDirty={onAiDirty} onClose={closeAi} onApply={(config,base,epoch,page,requestId)=>{if(app.state.profileEpoch!==epoch||JSON.stringify(app.state.config)!==JSON.stringify(base)||app.state.target?.url!==page.url)throw Error('配置或网页已变化，请重新生成。');app.edit(config);aiApplication.current={requestId,config:JSON.stringify(config)};update({...freshUI(state.profileEpoch)});openName(current?'copy':'save',managementOpen?'library-current':'profile-current');}}/>}
  </div>;
}
