import * as React from 'react';
import {Button} from '../../../src/ui/react/components/ui/button.tsx';
import {Switch} from '../../../src/ui/react/components/ui/switch.tsx';
import {WEBFLOW_TASK_INTENT_PROTOCOL} from '../../../src/native-agent/chatgpt-task-request.js';
import {WebflowCurrentTask} from './CurrentTask.tsx';
import {WebflowRuntimePanel} from './RuntimePanel.tsx';

type Installation=Record<string,unknown>;
type ParamsSchema={type?:string;default?:unknown;const?:unknown;enum?:unknown[];
 required?:string[];properties?:Record<string,ParamsSchema>;minimum?:number};
export type WebflowAutoScope={taskId:string;args:Record<string,unknown>;targetUrl:string;installation:Installation};
export type WebflowAutoReview=WebflowAutoScope&{taskName:string};
type AutoTask={taskId:string;name:string;description?:string;version:string;
 siteOrigins:string[];paramsSchema:ParamsSchema;installation:Installation};
export type WebflowAutoSnapshot={enabled:boolean;epoch:number;
 diagnostic?:string;
 catalogVerified?:boolean;
 grants:{taskId:string;grantId:string;state:string;approvedAt:number|string;scope:WebflowAutoScope}[];
 tasks:AutoTask[];unavailable?:{taskId:string;code?:string;reason:string}[]|string|boolean};
export type WebflowAutoController={
 readBridgeState?:()=>Promise<unknown>;
 controlBridge?:(value:unknown,nativeEvent:Event)=>Promise<unknown>;
 readAutoSettings:()=>Promise<WebflowAutoSnapshot>;
 prepareAutoGrant:(scope:WebflowAutoScope)=>Promise<WebflowAutoReview>;
 approveAutoTask:(review:WebflowAutoReview,nativeEvent:Event)=>Promise<WebflowAutoSnapshot>;
 setAutoEnabled:(enabled:boolean,nativeEvent:Event)=>Promise<WebflowAutoSnapshot>;
 revokeAutoTask:(taskId:string,nativeEvent:Event)=>Promise<WebflowAutoSnapshot>;
};

// Fixed shell composition only. Display facts come from the installed-tool
// controller, not from the sandbox or its navigation messages. This exposes
// no authority to the package, including a package reusing the Web Flow ID.
export function WebflowAutoControls({webflowAuto,display,visible=true}){
 if(!visible||display?.hidden!==false||display.data?.toolId!=='webflow'||
  display.data.enabled!==true||display.data.preview!==false||display.data.settingsOpen!==false||!webflowAuto)return null;
 return <WebflowAutoSettings compact webflowAuto={webflowAuto}/>;
}

function initialValue(schema:ParamsSchema={},depth=0):unknown{
 if(depth>8)return null;
 if(Object.hasOwn(schema,'default'))return schema.default;
 if(Object.hasOwn(schema,'const'))return schema.const;
 if(schema.enum?.length)return schema.enum[0];
 if(schema.type==='object'||schema.properties){
  return Object.fromEntries(Object.entries(schema.properties??{})
   .filter(([key,value])=>schema.required?.includes(key)||Object.hasOwn(value,'default')||Object.hasOwn(value,'const'))
   .map(([key,value])=>[key,initialValue(value,depth+1)]));
 }
 if(schema.type==='array')return [];
 if(schema.type==='boolean')return false;
 if(schema.type==='integer'||schema.type==='number')return schema.minimum??0;
 return '';
}
function initialDraft(task?:AutoTask){
 return {taskId:task?.taskId??'',targetUrl:task?.siteOrigins?.[0]?task.siteOrigins[0].replace(/\/$/,'')+'/':'',
  argsText:JSON.stringify(task?initialValue(task.paramsSchema):{},null,2)};
}
function ScopeSummary({scope}:{scope:WebflowAutoScope}){
 return <div className="od-stack">
  <div className="od-form-field">
   <strong className="od-field-label">精确地址</strong>
   <p className="od-body" style={{overflowWrap:'anywhere'}}>{scope.targetUrl}</p>
  </div>
  <div className="od-form-field">
   <strong className="od-field-label">参数 JSON</strong>
   <pre className="od-result" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(scope.args,null,2)}</pre>
  </div>
  <details className="od-disclosure od-disclosure--flat">
   <summary>安装身份 · SHA / installation / generation</summary>
   <pre className="od-result od-technical" style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(scope.installation,null,2)}</pre>
  </details>
 </div>;
}

function ScopeSection({compact,children}){
 return compact?<div className="od-stack">{children}</div>:
  <details className="od-disclosure od-disclosure--flat" open>
   <summary>任务范围与授权</summary><div className="od-stack">{children}</div>
  </details>;
}

// A copyable request only. The original Bridge still parses the assistant's
// complete reply and rechecks the current approval, installation and site.
function ApprovedTaskPrompt({scope,enabled}:{scope:WebflowAutoScope;enabled:boolean}){
 const [prompt,setPrompt]=React.useState('');
 const [notice,setNotice]=React.useState('');
 const field=React.useRef<HTMLTextAreaElement>(null);
 const select=()=>{field.current?.focus();field.current?.select?.();};
 const generate=()=>{
  setNotice('');
  try{
   const intent={protocol:WEBFLOW_TASK_INTENT_PROTOCOL,candidateId:'wf-'+globalThis.crypto.randomUUID(),
    taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args};
   // One plain paragraph survives the official user-message renderer exactly.
   // Fences in the input are rendered away and cannot witness the same send.
   // JSON escapes prevent URL autolinks and parameter Markdown in the composer.
   const json=JSON.stringify(intent).replaceAll('/',String.raw`\u002f`).replace(/`/g,'\\u0060');
   setPrompt('请仅回复一个语言标记为 opendesk-task 的 JSON 代码块，完整保留下面 JSON 的五个字段及其值，不添加说明、引用、Markdown 链接或其他代码块。将以下 JSON 原样放入该代码块：'+json);
  }catch{setPrompt('');setNotice('本次指令未生成，请重新打开应用后重试。');}
 };
 const copy=async()=>{
  select();
  try{
   if(!globalThis.navigator?.clipboard?.writeText)throw Error('clipboard unavailable');
   await globalThis.navigator.clipboard.writeText(prompt);
   setNotice('指令已复制。请在 ChatGPT 原对话粘贴并发送。');
  }catch{setNotice('请选中下方指令，按 ⌘C / Ctrl+C 复制，再到 ChatGPT 粘贴并发送。');}
 };
 return <div className="od-stack">
  <Button onClick={generate}>{prompt?'生成下一次指令':'生成 ChatGPT 指令'}</Button>
  {prompt&&<div className="od-form-field">
   <label className="od-field-label">本次 ChatGPT 指令
    <textarea ref={field} className="od-field od-technical" value={prompt} readOnly rows={8} spellCheck={false}/>
   </label>
   <div className="od-toolbar"><Button onClick={()=>{void copy();}}>复制指令</Button>
    <Button variant="quiet" onClick={select}>选中指令</Button></div>
   <p className="od-field-help">{enabled?'保持侧栏打开，将指令发送给 ChatGPT。':'总开关已关闭：请先在上方开启自动运行，再发送指令。'}
    每次新任务先生成新指令；重复候选不会重新执行。生成或复制本身不会运行任务。</p>
  </div>}
  {notice&&<p role="status" className="od-note">{notice}</p>}
 </div>;
}

// Static trusted UI only. ToolShell supplies the narrow controller; no private
// capability or executable review is exported to the installed sandbox.
export function WebflowAutoSettings({webflowAuto=null,compact=false}:{webflowAuto?:WebflowAutoController|null;compact?:boolean}){
 const [panelOpen,setPanelOpen]=React.useState(false);
 const [tab,setTab]=React.useState('task');
 const [summary,setSummary]=React.useState('正在读取任务状态…');
 const closePanel=React.useCallback(()=>setPanelOpen(false),[]);
 const [snapshot,setSnapshot]=React.useState<WebflowAutoSnapshot|null>(null);
 const [draft,setDraft]=React.useState(()=>initialDraft());
 const [prepared,setPrepared]=React.useState<{review:WebflowAutoReview;edit:number}|null>(null);
 const [work,setWork]=React.useState('');
 const [error,setError]=React.useState('');
 const [notice,setNotice]=React.useState('');
 const lastSnapshot=React.useRef<WebflowAutoSnapshot|null>(null);
 const request=React.useRef(0),edits=React.useRef(0),locked=React.useRef(false);
 const invalidate=React.useCallback(()=>{edits.current++;setPrepared(null);setNotice('');},[]);
 const acceptSnapshot=React.useCallback((next:WebflowAutoSnapshot)=>{
  if(typeof next?.enabled!=='boolean'||!Array.isArray(next.tasks)||!Array.isArray(next.grants))
   throw Error('自动准入状态不完整，请诊断刷新');
  lastSnapshot.current=next;setSnapshot(next);
  setDraft(current=>next.tasks.some(task=>task.taskId===current.taskId)?current:initialDraft(next.tasks[0]));
 },[]);
 const run=React.useCallback(async <T,>(kind:string,operation:()=>Promise<T>,accept:(next:T)=>void)=>{
  if(locked.current)return;
  const ticket=++request.current;
  locked.current=true;setWork(kind);setError('');
  try{
   // Invoke before awaiting: the Host receives the original event in its gesture.
   const next=await operation();
   if(ticket===request.current)accept(next);
  }catch(ex){
   if(ticket===request.current){
    edits.current++;setPrepared(null);
    if(kind!=='prepare')setSnapshot(null);
    setError(String(ex?.message||ex)+'；请核对状态，不会自动重试。');
   }
  }finally{
   if(ticket===request.current){locked.current=false;setWork('');}
  }
 },[]);
 const refresh=React.useCallback(()=>{
  invalidate();
  if(webflowAuto?.readAutoSettings)void run('read',()=>webflowAuto.readAutoSettings(),acceptSnapshot);
 },[webflowAuto,invalidate,run,acceptSnapshot]);
 React.useEffect(()=>{
  setSnapshot(null);setDraft(initialDraft());setError('');setWork('');
  refresh();
  return ()=>{request.current++;edits.current++;locked.current=false;};
 },[refresh]);
 const task=snapshot?.tasks.find(row=>row.taskId===draft.taskId);
 const edit=(patch:Partial<typeof draft>)=>{
  invalidate();setError('');setDraft(current=>({...current,...patch}));
 };
 const prepare=()=>{
  if(locked.current||!task||!webflowAuto)return;
  invalidate();setError('');
  try{
   let args:unknown;
   try{args=JSON.parse(draft.argsText);}catch{throw Error('参数 JSON 格式无效');}
   if(!args||typeof args!=='object'||Array.isArray(args))throw Error('参数 JSON 必须是对象');
   if(!draft.targetUrl)throw Error('请输入精确目标地址');
   const edit=edits.current;
   void run('prepare',()=>webflowAuto.prepareAutoGrant({taskId:task.taskId,
    args:args as Record<string,unknown>,targetUrl:draft.targetUrl,installation:task.installation}),review=>{
    if(edit===edits.current)setPrepared({review,edit});
    else setNotice('输入已改变，请重新准备审核。');
   });
  }catch(ex){setError(String(ex?.message||ex));}
 };
 const trusted=(event:Event)=>{
  if(event?.isTrusted===true)return true;
  setError('请在可信设置中亲自点击此按钮完成授权。');return false;
 };
 const approve=(event:Event)=>{
  if(locked.current||!prepared||prepared.edit!==edits.current||!webflowAuto||!trusted(event))return;
  const review=prepared.review;
  invalidate();
  void run('write',()=>webflowAuto.approveAutoTask(review,event),next=>{
   acceptSnapshot(next);setNotice(next.enabled?'任务的持续自动准入批准已保存。':'任务批准已保存；总开关关闭时不会自动准入。');
  });
 };
 const toggle=(event:Event)=>{
  if(locked.current||!snapshot||!webflowAuto||!trusted(event))return;
  const enabled=!snapshot.enabled;
  invalidate();
  void run('write',()=>webflowAuto.setAutoEnabled(enabled,event),next=>{
   acceptSnapshot(next);setNotice(next.enabled?'自动准入已开启，仅限已批准的精确范围。':'自动准入已关闭；不会回滚已经开始的动作。');
  });
 };
 const revoke=(taskId:string,event:Event)=>{
  if(work==='write'||!webflowAuto||!trusted(event))return;
  request.current++;locked.current=false;
  invalidate();
  void run('write',()=>webflowAuto.revokeAutoTask(taskId,event),next=>{
   acceptSnapshot(next);setNotice('已撤销此任务的自动准入；不会回滚已经开始的动作。');
  });
 };
 const disable=(event:Event)=>{
  if(!webflowAuto||!trusted(event))return;
  // Deny-only action remains available if a catalog read or preparation hangs.
  // Ignore their late UI replies; never cancel or retry an actual browser run.
  request.current++;locked.current=false;invalidate();
  void run('write',()=>webflowAuto.setAutoEnabled(false,event),next=>{
   acceptSnapshot(next);setNotice('未来自动准入已关闭；已经开始的动作不承诺回滚。');
  });
 };
 const grantSnapshot=snapshot??lastSnapshot.current;
 const grantUsable=grant=>{
  if(!snapshot||snapshot.catalogVerified===false||grant.state!=='active')return false;
  const current=snapshot.tasks.find(row=>row.taskId===grant.taskId);
  const keys=['version','manifestHash','contentHash','scriptId','revision','installationId','generation'];
  return Boolean(current&&keys.every(key=>current.installation[key]===grant.scope.installation[key]));
 };
 const grantLabel=grant=>{
  if(!snapshot)return '当前状态未确认（下列为上次已知批准，可直接撤销）';
  if(grant.state==='revoked')return '已撤销';
  if(snapshot.catalogVerified===false)return '安装状态待核验，请诊断刷新';
  if(Array.isArray(snapshot.unavailable)&&snapshot.unavailable.some(row=>row.taskId===grant.taskId&&
   row.code==='E_BUILTIN_VERSION_UNAVAILABLE'))
   return '任务运行时已更新，需先验证并升级任务。原批准保留；升级后需重新审核同一精确范围。';
  return grantUsable(grant)
   ?'授权有效（仍需逐次核验网站权限）':'安装已变化或不可用，需重新批准';
 };
 const busy=Boolean(work),editable=Boolean(snapshot)&&work!=='read'&&work!=='write';
 const unavailable=snapshot?.unavailable;
 const scopeRules=<>
  <p className="od-field-help">
   默认关闭。批准后，匹配任务、精确地址、参数和安装身份的请求可持续自动提交，无需逐次确认；不会增加 Controller 权限。
   保持可信 OpenDesk 侧栏打开的窗口中，ChatGPT 官方网页的各对话均可在批准范围内触发；真实结果将自动发送至触发任务的原聊天。
   关闭总开关或撤销任务只阻止未来准入，不会回滚已经开始的动作。未知结果不会自动重放。
  </p>
  <p className="od-field-help">{compact?'开关和授权即时保存。':'批准、开关和撤销即时保存，不受「保存 AI 设置」或「取消」影响。'}</p>
 </>;
 const switchControl=snapshot?<Switch id="webflow-auto-enabled" aria-label="Web Flow 自动运行"
   isSelected={snapshot.enabled} isDisabled={busy||!webflowAuto?.setAutoEnabled}
   aria-describedby="webflow-auto-risk"
   // Forward the original pointer/keyboard gesture synchronously. toggle/run
   // prevent the label and native input click from writing twice.
   onClickCapture={event=>toggle(event.nativeEvent)}/>:<span id="webflow-auto-enabled" role="status">
    {work==='read'?'正在读取…':'状态未确认'}</span>;
 const feedback=<>
  {(!snapshot||error||busy)&&<Button id="webflow-auto-disable" variant="danger"
   disabled={!webflowAuto?.setAutoEnabled} onClick={event=>disable(event.nativeEvent)}>关闭未来自动准入</Button>}
  {notice&&<p role="status" className="od-note">{notice}</p>}
  {error&&<p id="webflow-auto-error" role="alert" className="od-field-error">{error}</p>}
 </>;
 const tabs=[['task','当前任务'],['scope','任务授权'],['help','使用说明']];
 const content=<section className="od-stack" aria-labelledby="webflow-auto-title" aria-busy={busy}
  onKeyDown={event=>{
   // This section shares the AI settings form. Enter in a scope input must not
   // submit/save that unrelated form; textarea and button keyboard actions remain native.
   if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229&&
    (event.target as HTMLElement).tagName==='INPUT')event.preventDefault();
  }}>
  <div className="od-toolbar">
   <strong id="webflow-auto-title" className="od-title">自动运行</strong>
   {(!compact||panelOpen)&&switchControl}
   <span role="status">{snapshot?(snapshot.enabled?'已开启':'已关闭'):''}</span>
  </div>
  <p id="webflow-auto-risk" className="od-field-help">
   {compact?'仅自动运行已批准范围内的任务；关闭开关只阻止新任务。保持侧栏打开。':
    '开启后，新消息后的完整 ChatGPT 回复若包含已批准范围的任务协议，将自动运行已安装脚本。保持 OpenDesk 侧栏打开。'}
  </p>
  {(!compact||panelOpen)&&feedback}
  {compact&&<div className="od-toolbar" role="tablist" aria-label="运行管理"
   onKeyDown={event=>{
    if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
    const index=tabs.findIndex(([key])=>key===tab);
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?
     (index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
    if(next===null)return;
    event.preventDefault();setTab(tabs[next][0]);
    event.currentTarget.querySelector<HTMLButtonElement>('#webflow-runtime-tab-'+tabs[next][0])?.focus();
   }}>
   {tabs.map(([key,label])=><Button key={key} id={'webflow-runtime-tab-'+key} role="tab"
    aria-selected={tab===key} aria-controls={'webflow-runtime-'+key} tabIndex={tab===key?0:-1}
    variant={tab===key?'secondary':'quiet'} onClick={()=>setTab(key)}>{label}</Button>)}
  </div>}
  {compact&&<div id="webflow-runtime-task" role="tabpanel" aria-labelledby="webflow-runtime-tab-task"
   hidden={tab!=='task'} tabIndex={0}>
   {webflowAuto?.readBridgeState&&webflowAuto?.controlBridge?
    <WebflowCurrentTask controller={webflowAuto} onSummary={setSummary}/>:
    <p role="status" className="od-note">当前任务状态暂不可用，请在原聊天查看。</p>}
  </div>}
  <div id={compact?'webflow-runtime-help':undefined} role={compact?'tabpanel':undefined}
   aria-labelledby={compact?'webflow-runtime-tab-help':undefined} hidden={compact&&tab!=='help'} tabIndex={compact?0:undefined}>
  <details className="od-disclosure od-disclosure--flat" open={compact?true:undefined}>
   <summary>如何触发与查看结果</summary>
   <div className="od-stack">
    <p className="od-field-help">在“任务范围与授权”中核对已有批准，生成并复制本次指令；开启上方滑块后，在 ChatGPT 对话中粘贴并发送。只有随后完整助手回复里的固定协议会触发。</p>
    <p className="od-field-help">本次进度、结果或具体失败显示在侧栏“当前任务”；持久结果仍回到触发任务的原聊天。沙箱“记录”仅显示手动运行，空记录不代表自动任务未执行。</p>
    <p className="od-field-help">没有触发时先核对开关、已批准的精确地址与参数，以及“当前任务”提示。结果未知时查询原请求，不重新发送同一候选或切换入口补跑。关闭自动运行只阻止新任务；已开始的任务在“当前任务”停止。</p>
   </div>
  </details>
  </div>
  <div id={compact?'webflow-runtime-scope':undefined} role={compact?'tabpanel':undefined}
   aria-labelledby={compact?'webflow-runtime-tab-scope':undefined} hidden={compact&&tab!=='scope'} tabIndex={compact?0:undefined}>
  <ScopeSection compact={compact}>
   <Button id="webflow-auto-refresh" disabled={busy||!webflowAuto?.readAutoSettings} onClick={refresh}>刷新授权状态</Button>
  {compact?<details className="od-disclosure od-disclosure--flat"><summary>授权规则与数据去向</summary>{scopeRules}</details>:scopeRules}
  {!webflowAuto&&<p role="status" className="od-note">自动准入设置暂不可用。</p>}
  {snapshot&&!snapshot.tasks.length&&<p role="status" className="od-note">暂无可审核的已安装任务，请诊断刷新查看原因。</p>}
  {grantSnapshot&&<div id="webflow-auto-grants" className="od-stack" role="group" aria-label="已批准任务">
   <strong className="od-field-label">逐任务授权</strong>
   {!grantSnapshot.grants.length&&<p className="od-note">尚未批准任何任务。</p>}
   {grantSnapshot.grants.map(grant=><div key={grant.grantId} className="od-surface od-surface--padded od-stack">
    <strong>{grantSnapshot.tasks.find(row=>row.taskId===grant.taskId)?.name||grant.taskId}（{grant.taskId}）</strong>
    <p className="od-note">{grantLabel(grant)}</p>
    <ScopeSummary scope={grant.scope}/>
    <p className="od-technical">批准时间：{typeof grant.approvedAt==='number'
     ?new Date(grant.approvedAt).toLocaleString('zh-CN'):grant.approvedAt}</p>
    <Button variant="danger" disabled={work==='write'||grant.state==='revoked'||!webflowAuto?.revokeAutoTask}
     aria-label={'撤销 '+grant.taskId+' 的自动准入'} onClick={event=>revoke(grant.taskId,event.nativeEvent)}>撤销此任务</Button>
    {!busy&&snapshot&&grantUsable(grant)&&
     <ApprovedTaskPrompt key={snapshot.epoch+':'+grant.grantId} scope={grant.scope} enabled={snapshot.enabled}/>}
   </div>)}
  </div>}
  <details className="od-disclosure od-disclosure--flat" open={grantSnapshot?.grants.some(grantUsable)?undefined:true}>
  <summary>新增或修改批准范围</summary>
  <div className="od-stack">
  <div className="od-form-field">
   <label className="od-field-label" htmlFor="webflow-auto-task">任务</label>
   <select id="webflow-auto-task" className="od-field" value={draft.taskId}
    disabled={!editable||!snapshot?.tasks.length} onChange={event=>{
     invalidate();setError('');
     setDraft(initialDraft(snapshot?.tasks.find(row=>row.taskId===event.currentTarget.value)));
    }}>
    {!snapshot?.tasks.length&&<option value="">暂无可用任务</option>}
    {snapshot?.tasks.map(row=><option key={row.taskId} value={row.taskId}>{row.name} · {row.version} · {row.taskId}</option>)}
   </select>
   {task?.description&&<p className="od-field-help">{task.description}</p>}
  </div>
  <div className="od-form-field">
   <label className="od-field-label" htmlFor="webflow-auto-target">精确目标地址</label>
   <input id="webflow-auto-target" className="od-field" type="url" value={draft.targetUrl}
    autoComplete="off" spellCheck={false} disabled={!editable||!task}
    onChange={event=>edit({targetUrl:event.currentTarget.value})}/>
  </div>
  <div className="od-form-field">
   <label className="od-field-label" htmlFor="webflow-auto-args">参数 JSON（高级批准）</label>
   <textarea id="webflow-auto-args" className="od-field" value={draft.argsText} rows={6}
    spellCheck={false} disabled={!editable||!task} onChange={event=>edit({argsText:event.currentTarget.value})}/>
   <p className="od-field-help">初值来自任务公开 Schema；可精确编辑。参数和地址须与未来请求匹配，Host 会重新核验任务安装及权限。</p>
  </div>
  <Button id="webflow-auto-prepare" disabled={busy||!task||!webflowAuto?.prepareAutoGrant}
   onClick={prepare}>{work==='prepare'?'正在核验…':'准备任务审核'}</Button>
  {prepared&&<div id="webflow-auto-review" className="od-surface od-surface--padded od-stack" role="group"
   aria-labelledby="webflow-auto-review-title">
   <strong id="webflow-auto-review-title">批准前审核：{prepared.review.taskName}（{prepared.review.taskId}）</strong>
   <ScopeSummary scope={prepared.review}/>
   <p className="od-field-help">本次批准会持久保存上述精确范围，允许同一窗口中各 ChatGPT 对话的匹配请求持续自动提交；结果返回触发任务的原聊天。任何输入改变都需重新审核。</p>
   <Button id="webflow-auto-approve" variant="primary" disabled={busy||!webflowAuto?.approveAutoTask}
    aria-describedby="webflow-auto-risk" onClick={event=>approve(event.nativeEvent)}>批准此任务持续自动准入</Button>
  </div>}
  </div>
  </details>
  {snapshot&&<details className="od-disclosure od-disclosure--flat">
   <summary>诊断 · 任务可用性与授权代次</summary>
   <p className="od-technical">授权代次（epoch）：{snapshot.epoch}</p>
   {snapshot.diagnostic&&<p className="od-note">{snapshot.diagnostic}</p>}
   {Array.isArray(unavailable)?unavailable.length
    ?<ul>{unavailable.map((row,index)=><li className="od-note" key={row.taskId+':'+index}>{row.taskId}：{row.code&&row.code+'：'}{row.reason}</li>)}</ul>
    :<p className="od-note">没有不可用任务的诊断记录。</p>
    :unavailable&&<p className="od-note">{typeof unavailable==='string'?unavailable:'任务目录暂不可用'}</p>}
  </details>}
  </ScopeSection>
  </div>
 </section>;
 if(!compact)return content;
 return <>
  <section className="od-stack" aria-label="Web Flow 运行状态" style={{gap:'var(--space-1)',paddingBlock:'var(--space-2)'}}>
   <div className="od-toolbar">
    <strong className="od-field-label">自动运行</strong>
    {!panelOpen&&switchControl}
    <span className="od-note" role="status">{snapshot?(snapshot.enabled?'已开启':'已关闭'):'状态未确认'}</span>
    <Button id="webflow-runtime-open" variant="secondary" aria-haspopup="dialog" aria-expanded={panelOpen}
     aria-controls="webflow-runtime-panel" style={{marginInlineStart:'auto'}} onClick={()=>setPanelOpen(true)}>运行与授权</Button>
   </div>
   {webflowAuto?.readBridgeState&&<p id="webflow-runtime-summary" className="od-note" role="status" title={summary}
    style={{margin:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{summary}</p>}
   {!panelOpen&&feedback}
  </section>
  <WebflowRuntimePanel open={panelOpen} onClose={closePanel}>{content}</WebflowRuntimePanel>
 </>;
}
