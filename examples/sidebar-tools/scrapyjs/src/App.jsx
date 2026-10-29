import * as React from 'react';
import {Button} from '@opendesk/ui';
import {fieldForm,applyField,crawlForm,applyCrawl} from './editor.js';

const freshUI=epoch=>({epoch,json:null,valid:true,error:'',field:null,fieldPending:false,crawl:null,crawlPending:false,target:null,targetValid:true,fieldHelp:'点击字段载入编辑；复杂规则在完整 JSON 中编辑。',removeField:false});
const stringify=value=>JSON.stringify(value,null,2);
const cell=value=>value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
function Field({id,label,children,...props}){
  return <div className="field"><label htmlFor={id}>{label}</label>{children||<input id={id} autoComplete="off" {...props}/>}</div>;
}
function Message({id,children,alert=false,...props}){
  return <p id={id} hidden={!children} role={alert?'alert':'status'} className={alert?'error':'secondary'} {...props}>{children}</p>;
}
function statusOf(state,matches,busy){
  if(state.phase==='unknown')return '运行状态待确认';
  if(state.phase==='starting')return '正在准备采集…';
  if(busy)return state.stopRequested?'正在停止 · 等待原实例退出':'正在采集…';
  if(!state.retired)return matches?'准备采集':'请确认采集目标';
  const host=state.snapshot?.status,engine=state.result?.engine?.status;
  if(engine==='partial'||state.result?.list?.engine?.status==='partial')return '采集结束 · 含部分结果';
  if(host==='completed'&&engine==='completed')return '采集完成';
  if(['stopped','cancelled'].includes(host)||engine==='cancelled')return '采集已停止';
  return '采集结束 · 请查看运行详情';
}

export default function App(){
  const tool=globalThis.OpenDeskTool;
  const [snapshot,setSnapshot]=React.useState(null);
  const [ui,setUI]=React.useState(()=>freshUI(0));
  const [app]=React.useState(()=>globalThis.ScrapyAppModel.createApp(
    globalThis.ScrapyAppSdk.createSdk((operation,payload)=>tool.request(operation,payload)),state=>{
      setSnapshot({...state});
      setUI(previous=>previous.epoch===state.profileEpoch?previous:freshUI(state.profileEpoch));
    }));
  const state=snapshot||app.state;
  const [view,setView]=React.useState('results');
  const [naming,setNaming]=React.useState(null);
  const actionFocus=React.useRef('profile-list');
  const jsonDetails=React.useRef(null);
  const update=change=>setUI(previous=>({...previous,...change}));
  const focusLater=id=>requestAnimationFrame(()=>{
    const node=tool.root.querySelector('#'+id);
    const folded=node?.closest('details:not([open])');
    (folded?.querySelector('summary')||node)?.focus();
  });
  React.useEffect(()=>{
    app.load();app.refreshTarget();
    const changed=()=>app.refreshTarget();
    tool.root.addEventListener('opendesk-page-changed',changed);
    const timer=setInterval(()=>app.refresh(),1000);
    return ()=>{clearInterval(timer);tool.root.removeEventListener('opendesk-page-changed',changed);app.dispose();};
  },[app,tool]);
  const busy=state.phase==='starting'||Boolean(state.clientRequestId)&&!state.retired;
  const locked=busy||state.saving||Boolean(naming)||Boolean(state.pendingAction)||state.phase==='unknown';
  const managementLocked=locked||!state.storageReady||Boolean(state.conflict);
  const pending=ui.fieldPending||ui.crawlPending;
  const valid=ui.valid&&ui.targetValid;
  const current=state.records.find(row=>row.id===state.selectedId);
  const fields=Object.entries(state.config.itemConfig).filter(([key])=>!key.startsWith('_'));
  const form=ui.field||{key:'',originalKey:'',selector:'',read:'text',attr:'',container:state.config.itemConfig._listContainer||'',item:state.config.itemConfig._listItem||''};
  const crawl=ui.crawl||crawlForm(state.config);
  let matches=false;
  try{matches=Boolean(state.target)&&new URL(state.config.url).origin===new URL(state.target.url).origin;}catch{}
  const help=state.phase==='unknown'?'开始结果未知，请刷新原实例状态；不要重复开始。':
    !valid?'完整 JSON 或目标网址有误，请打开采集规则或目标网址修正。':
    pending?'有未应用的'+[ui.fieldPending?'字段':'',ui.crawlPending?'分页与详情':''].filter(Boolean).join('、')+'编辑，请先点击对应的「应用」按钮。':
    !state.target?'请先打开目标网页，再刷新当前网页。':!busy&&!matches?'目标网址与当前网页不同源，请切换到目标网站后刷新当前网页。':
    state.saving?'正在保存配置，请稍候。':naming||state.pendingAction?'请先完成或取消配置操作。':'';
  React.useEffect(()=>{tool.setState?.({dirty:state.dirty||!valid||pending||Boolean(naming),busy:busy||state.saving});},[tool,state.dirty,valid,pending,naming,busy,state.saving]);
  function guarded(action){try{action();}catch(error){update({error:error.message});}}
  function touch(change){guarded(()=>{app.touch();update({...change,error:''});});}
  function editJSON(text){
    try{app.edit(JSON.parse(text));update({json:text,valid:true,target:null,targetValid:true,error:'',field:null,crawl:null,removeField:false});}
    catch(error){guarded(()=>app.touch());update({json:text,valid:false,error:error.message});}
  }
  function apply(which,value){
    try{
      app.edit(value);
      const field=which==='field'&&form.key.trim()?{...form,originalKey:form.key.trim(),key:form.key.trim()}:ui.field;
      update({[which+'Pending']:false,field,json:null,valid:true,error:'',removeField:false});
    }
    catch(error){update({error:error.message});}
  }
  function loadField(key,rule){
    const loaded=fieldForm(key,rule);
    if(!loaded){jsonDetails.current.open=true;focusLater('config-json');update({fieldHelp:'字段「'+key+'」使用复杂规则，请在完整 JSON 中编辑；原规则已保留。'});return;}
    update({field:{...form,...loaded},fieldHelp:'正在编辑「'+key+'」；修改后点击「应用字段」。',removeField:false});focusLater('field-selector');
  }
  function requestAction(method,id){actionFocus.current=id;app[method]();if(app.state.pendingAction)focusLater('profile-confirm-cancel');else focusLater('profile-current');}
  function cancelAction(){app.cancelAction();focusLater(actionFocus.current);}
  function openName(type,source){setNaming({type,source,value:type==='rename'?current.name:type==='copy'?(current?.name||'配置')+' 副本':'',error:''});focusLater('profile-name');}
  function closeName(){const source=naming.source;setNaming(null);focusLater(source);}
  async function submitName(){
    if(!naming||state.saving)return;
    const ok=await app[{save:'save',copy:'copyProfile',rename:'renameProfile'}[naming.type]](naming.value);
    if(ok)closeName();else{setNaming(previous=>({...previous,error:app.state.error}));focusLater('profile-name');}
  }
  function tabKey(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?'results':event.key==='End'?'rules':view==='results'?'rules':'results';
    setView(next);focusLater('tab-'+next);
  }
  const rows=Array.isArray(state.result?.data)?state.result.data:[];
  const allKeys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  const keys=allKeys.includes('title')?['title',...allKeys.filter(key=>key!=='title')]:allKeys;
  const confirmation=state.pendingAction?.type==='delete'?'确认删除「'+current?.name+'」？'+(state.dirty?'未保存的编辑也将丢弃。':''):
    '未保存的 JSON 或未应用编辑将丢弃。确认'+({new:'新建配置',select:'切换配置',saved:'用远端完整列表替换草稿'}[state.pendingAction?.type]||'')+'？';
  return <main className="capture-app" aria-label="scrapyjs 采集" onKeyDown={event=>{
    if(event.key!=='Escape'||state.saving)return;
    if(naming){event.preventDefault();closeName();}else if(state.pendingAction){event.preventDefault();cancelAction();}
    else if(ui.removeField){event.preventDefault();update({removeField:false});focusLater('remove-field');}
  }}>
    <section aria-labelledby="config-heading">
      <div className="toolbar"><h2 id="config-heading">采集配置</h2><Button id="new-profile" disabled={managementLocked} onClick={()=>requestAction('newProfile','new-profile')}>＋ 新建</Button></div>
      <div className="profile-choice"><label className="sr-only" htmlFor="profile-list">已保存配置</label>
        <select id="profile-list" aria-label="已保存配置" value={state.selectedId||''} disabled={managementLocked||!state.records.length} onChange={event=>{
          actionFocus.current='profile-list';app.selectProfile(event.target.value);if(app.state.pendingAction)focusLater('profile-confirm-cancel');
        }}><option value="" disabled>未保存配置</option>{state.records.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <Button id="save-config" variant="primary" disabled={managementLocked||!valid||pending} onClick={()=>state.selectedId?app.save():openName('save','save-config')}>{state.saving?'保存中…':state.dirty?'保存配置 · 未保存':'保存配置'}</Button>
      </div>
      <p id="profile-current" className="secondary" role="status" tabIndex={-1}>{state.dirty?'有未保存更改':current?'配置已保存':'未保存配置'}</p>
      <details id="profile-management" className="flat"><summary>配置管理</summary><div className="toolbar">
        <Button id="copy-profile" disabled={managementLocked||!valid||pending} onClick={()=>openName('copy','copy-profile')}>另存为 / 复制</Button>
        <Button id="rename-profile" disabled={managementLocked||!current||state.dirty} onClick={()=>openName('rename','rename-profile')}>重命名</Button>
        <Button id="delete-profile" variant="danger" disabled={managementLocked||!current} onClick={()=>requestAction('deleteProfile','delete-profile')}>删除配置</Button>
      </div></details>
      <div id="profile-naming" className="confirmation" role="group" aria-label="配置名称" hidden={!naming}>
        <Field id="profile-name" label={naming?.type==='rename'?'重命名配置':naming?.type==='copy'?'保存独立副本':'保存新配置'}>
          <input id="profile-name" autoComplete="off" maxLength={120} disabled={state.saving} value={naming?.value||''} aria-describedby="profile-name-error" onChange={event=>setNaming({...naming,value:event.target.value})} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();submitName();}}}/>
        </Field>
        <Message id="profile-name-error" alert>{naming?.error}</Message>
        <div className="toolbar"><Button id="profile-name-submit" disabled={state.saving} onClick={submitName}>保存名称</Button><Button id="profile-name-cancel" disabled={state.saving} onClick={closeName}>取消</Button></div>
      </div>
      <div id="profile-confirm" className="confirmation" hidden={!state.pendingAction} role="group" aria-labelledby="profile-confirm-text"><p id="profile-confirm-text">{confirmation}</p><div className="toolbar">
        <Button id="profile-confirm-accept" disabled={state.saving||busy} onClick={async()=>{await app.confirmAction();focusLater('profile-current');}}>确认</Button><Button id="profile-confirm-cancel" disabled={state.saving||busy} onClick={cancelAction}>取消</Button>
      </div></div>
      <div id="conflict" className="confirmation" hidden={state.storageReady&&!state.conflict}>
        <p>存储尚未就绪或版本冲突。当前草稿仍保留；替换将采用远端的完整配置列表，请先复制需要的草稿。</p>
        <Button id="load-config" disabled={locked} onClick={()=>app.load()}>读取保存版本</Button>
        <Button id="use-saved" hidden={!state.conflict} disabled={locked} onClick={()=>{actionFocus.current='use-saved';app.useSaved();if(app.state.pendingAction)focusLater('profile-confirm-cancel');}}>用保存版本替换草稿</Button>
      </div>
    </section>
    <section aria-labelledby="target-heading">
      <div className="toolbar"><h2 id="target-heading">采集目标</h2><Button id="refresh-target" disabled={busy||state.saving} onClick={()=>app.refreshTarget()}>刷新当前网页</Button></div>
      <p id="page-title" className="secondary">{state.target?.title||state.host}</p>
      <details id="target-settings" className="flat"><summary>目标网址 <span id="target-address" title={state.config.url}>{state.config.url}</span></summary>
        <Field id="target-url" label="目标网址" type="url" disabled={locked||pending||!ui.valid} value={ui.target??state.config.url} aria-describedby="target-help" onChange={event=>{
          const url=event.target.value;try{app.edit({...state.config,url});update({target:url,targetValid:true,json:null,error:''});}catch(error){guarded(()=>app.touch());update({target:url,targetValid:false,error:error.message});}
        }}/><p id="target-help" className="secondary">在目标网页打开此 App；仅采集当前网页同源地址。</p>
      </details>
      <Message id="config-error" alert>{ui.error}</Message>
      <div className="toolbar actions"><Button id="start" variant="primary" disabled={locked||!matches||!valid||pending} aria-describedby="run-help" onClick={()=>{app.start(state.config.url);setView('results');}}>开始采集</Button><Button id="stop" disabled={!busy||state.retired||state.stopAccepted} onClick={()=>app.stop()}>停止原实例</Button></div>
      <p id="run-summary" className="run-summary" role="status">{statusOf(state,matches,busy)}</p>
      <Message id="run-help">{help}</Message><Message id="app-error" alert>{state.error}</Message><Message id="app-notice">{state.notice}</Message>
      <div className="view-tabs" role="tablist" aria-label="采集工作区">{[['results','数据预览','results-panel'],['rules','采集规则','rules-editor']].map(([name,label,panel])=><Button key={name} id={'tab-'+name} role="tab" variant="quiet" aria-selected={view===name} aria-controls={panel} tabIndex={view===name?0:-1} onClick={()=>setView(name)} onKeyDown={tabKey}>{label}</Button>)}</div>
    </section>
    <section id="rules-editor" role="tabpanel" aria-labelledby="tab-rules" tabIndex={0} hidden={view!=='rules'}>
      <div className="toolbar"><h2>采集规则</h2><p id="config-summary" className="secondary">{fields.length} 个字段 · {state.config.nextPageSelector?'分页':'当前页'}{state.config.detail?' + 详情':''}</p></div>
      <details id="field-editor" open><summary>字段与属性</summary>
        <div id="field-list" className="field-list" role="group" aria-label="已有采集字段">{fields.map(([key,rule])=><Button key={key} data-field-key={key} aria-label={'编辑字段 '+key} disabled={locked||!valid||pending} onClick={()=>loadField(key,rule)}><strong>{key}</strong><code>{typeof rule==='string'?rule:JSON.stringify(rule)}</code></Button>)}</div>
        <Message id="field-edit-help">{ui.fieldHelp}</Message>
        <Button id="new-field" disabled={locked||!valid||pending} onClick={()=>{update({field:{...form,key:'',originalKey:'',selector:'',read:'text',attr:''},fieldHelp:'填写新字段后点击「应用字段」。',removeField:false});focusLater('field-key');}}>＋ 新增字段</Button>
        <fieldset disabled={locked||!valid}>
          <Field id="field-key" label="字段名" value={form.key} onChange={event=>touch({field:{...form,key:event.target.value},fieldPending:true})}/>
          <Field id="field-selector" label="字段 CSS 选择器" value={form.selector} placeholder="例如 .title" onChange={event=>touch({field:{...form,selector:event.target.value},fieldPending:true})}/>
          <div className="field-pair"><Field id="field-read" label="读取内容"><select id="field-read" value={form.read} onChange={event=>touch({field:{...form,read:event.target.value},fieldPending:true})}><option value="text">文本</option><option value="attr">属性</option></select></Field>
            <Field id="field-attr" label="属性名称" value={form.attr} disabled={form.read!=='attr'} placeholder="href、src、title" onChange={event=>touch({field:{...form,attr:event.target.value},fieldPending:true})}/></div>
          <Field id="list-container" label="列表容器选择器" value={form.container} onChange={event=>touch({field:{...form,container:event.target.value},fieldPending:true})}/>
          <Field id="list-item" label="列表项选择器" value={form.item} onChange={event=>touch({field:{...form,item:event.target.value},fieldPending:true})}/>
          <div className="toolbar"><Button id="apply-field" onClick={()=>guarded(()=>apply('field',applyField(state.config,form)))}>应用字段</Button>
            <Button id="remove-field" variant="danger" disabled={!form.originalKey||pending} onClick={()=>{update({removeField:true});focusLater('cancel-remove-field');}}>删除字段</Button></div>
          {ui.removeField&&<div className="confirmation"><p>确认删除字段「{form.originalKey}」？保存配置后才会写入存储。</p><div className="toolbar"><Button variant="danger" onClick={()=>{
            const itemConfig={...state.config.itemConfig};delete itemConfig[form.originalKey];
            try{app.edit({...state.config,itemConfig});update({field:null,json:null,removeField:false,error:''});focusLater('new-field');}catch(error){update({error:error.message,removeField:false});}
          }}>确认删除字段</Button><Button id="cancel-remove-field" onClick={()=>{update({removeField:false});focusLater('remove-field');}}>取消</Button></div></div>}
        </fieldset>
      </details>
      <details id="crawl-editor"><summary>分页与列表详情</summary><fieldset disabled={locked||!valid}>
        {[['next-selector','下一页 CSS 选择器（留空为单页）','next'],['max-pages','页数安全上限','maxPages'],['dedupe-key','去重字段（留空保留全部）','dedupe']].map(([id,label,key])=><Field key={id} id={id} label={label} type={key==='maxPages'?'number':'text'} min={key==='maxPages'?1:undefined} max={key==='maxPages'?10:undefined} value={crawl[key]} onChange={event=>touch({crawl:{...crawl,[key]:event.target.value},crawlPending:true})}/>)}
        <label className="check"><input id="detail-enabled" type="checkbox" checked={crawl.enabled} onChange={event=>touch({crawl:{...crawl,enabled:event.target.checked},crawlPending:true})}/>采集列表对应详情</label>
        <div hidden={!crawl.enabled} className="stack">
          <Field id="detail-url-field" label="列表中的详情 URL 字段" value={crawl.urlField} onChange={event=>touch({crawl:{...crawl,urlField:event.target.value},crawlPending:true})}/>
          <Field id="detail-id-field" label="列表与详情共同的身份字段" value={crawl.identity} onChange={event=>touch({crawl:{...crawl,identity:event.target.value},crawlPending:true})}/>
          <Field id="detail-fields" label="详情 itemConfig JSON"><textarea id="detail-fields" rows={5} spellCheck={false} value={crawl.fields} onChange={event=>touch({crawl:{...crawl,fields:event.target.value},crawlPending:true})}/></Field>
          <Field id="detail-numbers" label="按严格小数转换的详情字段（逗号分隔）" value={crawl.numbers} onChange={event=>touch({crawl:{...crawl,numbers:event.target.value},crawlPending:true})}/>
        </div><Button id="apply-crawl" onClick={()=>guarded(()=>apply('crawl',applyCrawl(state.config,crawl)))}>应用分页与详情</Button>
        <p className="secondary">沿原导航授权，最多 10 页、100 条详情；身份不符或内容冲突会报错。</p>
      </fieldset></details>
      <details id="json-editor" className="flat" ref={jsonDetails}><summary>高级 · 完整 JSON</summary>
        <Field id="config-json" label="完整 JSON 配置"><textarea id="config-json" rows={12} spellCheck={false} disabled={locked||pending} value={ui.json??stringify(state.config)} aria-invalid={!ui.valid} aria-describedby="config-help config-error" onChange={event=>editJSON(event.target.value)}/></Field>
        <p id="config-help" className="secondary">保留复杂规则、validation / fieldRequirements / processing。_listContainer / _listItem 定义列表；.::text 读取当前项文本。itemConfig 最多 4096 字节。</p>
      </details>
    </section>
    <section id="results-panel" role="tabpanel" aria-labelledby="tab-results" tabIndex={0} hidden={view!=='results'}>
      <div className="toolbar"><h2 id="result-heading">采集结果</h2><p id="record-summary" className="secondary" role="status">{state.result==null?'尚无记录':'共 '+rows.length+' 条记录'+(rows.length>50?'，表格显示前 50 条；下载保留完整记录':'')}</p></div>
      <p id="run-profile" className="secondary">{state.runProfile?'本次运行配置：'+state.runProfile.name:'尚无运行'}</p>
      <div id="export-actions" className="toolbar" role="group" aria-label="导出采集结果" hidden={state.result==null}><Button id="download-csv" disabled={!Array.isArray(state.result?.data)} onClick={()=>app.download('csv')}>下载 CSV</Button><Button id="download-json" onClick={()=>app.download()}>下载完整 JSON</Button></div>
      <p id="table-help" className="secondary" hidden={!rows.length}>左右滚动查看全部字段；完整内容可下载。</p>
      <p id="result-empty" className="empty-state" hidden={rows.length>0}>{busy?'采集中，记录将在任务返回后显示。':state.result==null?'开始采集后，在这里查看记录和下载结果。':'本次结果没有记录，可展开运行详情查看原因。'}</p>
      <div id="record-scroll" className="table-scroll" tabIndex={0} role="region" aria-label="采集记录，更多字段可横向滚动" hidden={!rows.length}><table id="record-table"><thead><tr>{keys.map(key=><th key={key} scope="col">{key}</th>)}</tr></thead><tbody>{rows.slice(0,50).map((row,index)=><tr key={index}>{keys.map(key=><td key={key}>{cell(row[key])}</td>)}</tr>)}</tbody></table></div>
      <details id="run-details" className="flat"><summary>运行详情与原始结果</summary><Button id="refresh-run" disabled={!state.clientRequestId||state.retired} onClick={()=>app.refresh()}>刷新状态</Button>
        <dl className="status-grid"><dt>宿主</dt><dd id="host-status">{state.host}</dd><dt>引擎</dt><dd id="engine-status">{state.engine}</dd><dt>停止受理</dt><dd id="stop-status">{state.stopAccepted?'已受理':state.stopRequested?'已请求，等待确认':'未请求'}</dd><dt>实例退休</dt><dd id="retired-status">{state.retired?'已确认退休':busy?'尚未确认':'尚无运行'}</dd></dl>
        <pre id="result" tabIndex={0} aria-label="任务原始结果">{state.snapshot?stringify(state.snapshot):'尚无结果'}</pre>
      </details>
    </section>
  </main>;
}
