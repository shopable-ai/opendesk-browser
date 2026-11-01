// Offline consumer of the SAME component sources published by sidebar-shared-ui.js.
// Native form semantics use canonical od-* CSS; no fictional @opendesk/ui Field API.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {Button as SharedButton,IconButton} from '../../src/ui/react/components/ui/button.tsx';
import {Card,CardContent} from '../../src/ui/react/components/ui/card.tsx';
import {SharedConversationFrame,SharedConversationDock} from '../../src/ui/react/components/conversation.tsx';
import {createConversationSession} from '../../src/ui/conversation/session.js';
import {Switch} from '../../src/ui/react/components/ui/switch.tsx';

import {Input,Textarea} from '../../src/ui/react/components/ui/input.tsx';

const Button=props=><SharedButton base="aria" {...props}/>;
const root=document.getElementById('od-preview-app');
const refreshIcon=<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg>;

function Recipes(){
  const [theme,setTheme]=React.useState('light'),[generation,setGeneration]=React.useState(0);
  const [locked,setLocked]=React.useState(false);
  const reset=()=>{setTheme('light');setGeneration(value=>value+1);setLocked(false);};
  React.useEffect(()=>{root.dataset.previewTheme=theme;},[theme]);
  React.useEffect(()=>{
    root.addEventListener('opendesk-preview-reset',reset);
    return ()=>root.removeEventListener('opendesk-preview-reset',reset);
  },[]);
  return <>
    <ChatRecipe key={'chat-'+generation} locked={locked}>
      <RecipeGallery onLock={setLocked}/>
    </ChatRecipe>
    {createPortal(<div className="preview-controls">
      <label htmlFor="recipe-theme" className="od-field-label">工具主题</label>
      <select id="recipe-theme" className="od-field" value={theme} disabled={locked} onChange={event=>setTheme(event.target.value)}>
        <option value="light">浅色</option><option value="dark">深色</option>
      </select>
      <Button id="recipe-reset" disabled={locked} onClick={reset}>恢复初始预览</Button>
    </div>,document.getElementById('od-preview-recipe-controls'))}
  </>;
}

// Pattern sources: Bookmark PreviewPane (read before edit), CookieSearch and
// CookieAdvancedFields (search first, disclose secondary fields). Business code
// and app-owned palettes stay with those owners; these are memory-only recipes.
const initialResources=[
  {id:'design',name:'设计系统与组件',group:'产品设计',url:'https://example.com/design',note:'颜色、间距与组件的使用约定'},
  {id:'research',name:'用户研究记录',group:'产品设计',url:'https://example.com/research',note:'访谈、反馈与下一轮改进'},
  {id:'extension',name:'扩展开发指南',group:'开发资料',url:'https://example.com/extensions',note:'从本地项目到侧栏调试'},
  {id:'automation',name:'自动化任务与运行记录',group:'开发资料',url:'https://example.com/automation',note:'任务、计划和执行结果'},
  {id:'long',name:'团队共享资源：跨项目设计与开发协作参考',group:'开发资料',url:'https://example.com/team/reference',note:'完整标题可换行，低频属性按需展开'}
];
function RecipeGallery({onLock}){
  const [view,setView]=React.useState('resources');
  const [resourceLock,setResourceLock]=React.useState(false),[controlLock,setControlLock]=React.useState(false);
  const locked=resourceLock||controlLock;
  React.useLayoutEffect(()=>onLock(locked),[locked,onLock]);
  return <>
    <nav className="preview-actions" aria-label="页面组合">
      {[['resources','资源工作台'],['settings','偏好设置'],['controls','基础控件']].map(([id,label])=>
        <Button key={id} variant={view===id?'outline':'quiet'} aria-pressed={view===id} disabled={locked} onClick={()=>setView(id)}>
          {view===id?<strong>{label}</strong>:label}
        </Button>)}
    </nav>
    <div hidden={view==='controls'}><WorkspaceRecipe view={view} onLock={setResourceLock}/></div>
    <div hidden={view!=='controls'}><RecipeContent onLock={setControlLock} externalLock={resourceLock}/></div>
  </>;
}

function WorkspaceRecipe({view,onLock}){
  const [items,setItems]=React.useState(initialResources),[query,setQuery]=React.useState('');
  const [selected,setSelected]=React.useState(null),[editing,setEditing]=React.useState(false);
  const [draft,setDraft]=React.useState({name:'',url:'',note:''}),[error,setError]=React.useState('');
  const [notice,setNotice]=React.useState(''),[automatic,setAutomatic]=React.useState(true);
  const [settingNotice,setSettingNotice]=React.useState('');
  const search=React.useRef(null),name=React.useRef(null),create=React.useRef(null),edit=React.useRef(null),detailTitle=React.useRef(null);
  const openers=React.useRef(new Map());
  const item=items.find(row=>row.id===selected);
  const visible=items.filter(row=>(row.name+' '+row.group+' '+row.note).toLowerCase().includes(query.trim().toLowerCase()));
  React.useLayoutEffect(()=>{onLock(editing);if(editing)name.current?.focus();},[editing,onLock]);
  React.useLayoutEffect(()=>{if(selected&&!editing)detailTitle.current?.focus();},[selected,editing]);
  const back=()=>{
    const matches=visible.some(row=>row.id===selected);
    setSelected(null);setNotice(matches?'':'该资源已不匹配当前搜索，已保留搜索条件。');
    requestAnimationFrame(()=>{const target=openers.current.get(selected)||search.current;target?.focus();});
  };
  const begin=()=>{setDraft(item?{...item}:{name:'',url:'',note:''});setError('');setNotice('');setEditing(true);};
  const cancel=()=>{setEditing(false);setError('');requestAnimationFrame(()=>(item?edit:create).current?.focus());};
  const save=event=>{
    event.preventDefault();
    if(!draft.name.trim()){setError('请输入名称。');name.current?.focus();return;}
    try{const url=new URL(draft.url);if(!['http:','https:'].includes(url.protocol))throw Error();}
    catch{setError('请输入完整的 HTTP 或 HTTPS 地址。');document.getElementById('workspace-url')?.focus();return;}
    const next={...draft,name:draft.name.trim(),id:item?.id||'resource-'+Date.now(),group:item?.group||'开发资料'};
    setItems(rows=>item?rows.map(row=>row.id===item.id?next:row):[...rows,next]);
    setSelected(next.id);setEditing(false);setError('');setNotice('已保存「'+next.name+'」。');
    requestAnimationFrame(()=>edit.current?.focus());
  };
  return <>
    <section hidden={view!=='resources'} className="preview-sections" aria-label="资源组合示例">
      {editing?<form className="preview-sections" noValidate onSubmit={save} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();cancel();}}}>
        <h2 className="od-page-title">{item?'编辑资源':'添加资源'}</h2>
        <Card><CardContent><div className="od-stack">
          <div className="od-form-field"><label className="od-field-label" htmlFor="workspace-name">名称</label>
            <Input ref={name} id="workspace-name" className="od-field" required maxLength={80} value={draft.name}
              aria-invalid={error==='请输入名称。'||undefined} aria-describedby={error==='请输入名称。'?'workspace-error':undefined}
              onChange={event=>{setDraft({...draft,name:event.target.value});setError('');}}/></div>
          <div className="od-form-field"><label className="od-field-label" htmlFor="workspace-url">地址</label>
            <Input id="workspace-url" className="od-field" type="url" required value={draft.url}
              aria-invalid={error.includes('地址')||undefined} aria-describedby={'workspace-url-help'+(error.includes('地址')?' workspace-error':'')}
              onChange={event=>{setDraft({...draft,url:event.target.value});setError('');}}/>
            <p id="workspace-url-help" className="od-field-help">保存地址，不会打开网站。</p></div>
          {error&&<p id="workspace-error" role="alert" className="od-field-error">{error}</p>}
          <details className="od-disclosure od-disclosure--flat"><summary>备注（可选）</summary>
            <div className="od-form-field"><label className="od-field-label" htmlFor="workspace-note">备注</label>
              <Textarea id="workspace-note" className="od-field" rows={3} value={draft.note} onChange={event=>setDraft({...draft,note:event.target.value})}/></div>
          </details>
        </div></CardContent></Card>
        <div className="preview-actions"><Button variant="primary" type="submit">保存资源</Button><Button onClick={cancel}>取消</Button></div>
        <p className="od-field-help">保存或取消后可切换页面；取消会放弃本次编辑。</p>
      </form>:item?<>
        <div className="od-page-head"><Button variant="quiet" onClick={back}>← 返回资源</Button><Button ref={edit} onClick={begin}>编辑资源</Button></div>
        <Card><CardContent><div className="od-stack">
          <h2 ref={detailTitle} tabIndex={-1} className="od-page-title">{item.name}</h2><p className="od-note">{item.group}</p>
          <span>{item.url}</span>{item.note&&<p className="od-note">{item.note}</p>}
        </div></CardContent></Card>
      </>:<>
        <div className="od-page-head"><h2 className="od-page-title">收藏资源</h2><Button ref={create} variant="primary" onClick={begin}>添加资源</Button></div>
        <div className="od-form-field"><label className="od-field-label" htmlFor="workspace-search">搜索资源</label>
          <div className="preview-row"><Input ref={search} id="workspace-search" className="od-field" type="search" placeholder="名称、分组或备注" value={query} onChange={event=>{setQuery(event.target.value);setNotice('');}}/>
            {query&&<Button variant="quiet" onClick={()=>{setQuery('');setNotice('');search.current?.focus();}}>清除</Button>}</div></div>
        <Card><CardContent>{visible.length?<div className="od-stack">
          {(automatic?['产品设计','开发资料']:['全部资源']).map(group=>{const rows=automatic?visible.filter(row=>row.group===group):[...visible].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));return rows.length?<details key={group} className="od-disclosure od-disclosure--flat" open>
            <summary>{group} · {rows.length}</summary><div role="list" aria-label={group} className="od-stack">
              {rows.map(row=><div key={row.id} role="listitem"><Button ref={node=>{if(node)openers.current.set(row.id,node);else openers.current.delete(row.id);}} variant="quiet"
                style={{width:'100%',textAlign:'start',justifyContent:'flex-start',whiteSpace:'normal'}} aria-label={'查看 '+row.name} onClick={()=>{setSelected(row.id);setNotice('');}}>
                <span className="od-stack" style={{rowGap:'var(--space-1)'}}><strong>{row.name}</strong><span className="od-note">{row.note}</span></span>
              </Button></div>)}
            </div></details>:null;})}
        </div>:<div className="od-stack"><p className="od-note" role="status">没有匹配的资源。</p><Button onClick={()=>{setQuery('');setNotice('');search.current?.focus();}}>清除搜索</Button></div>}</CardContent></Card>
        <p className="od-field-help" role="status">{visible.length} 项资源</p>
      </>}
      {notice&&<p className="od-note" role="status">{notice}</p>}
    </section>
    <section hidden={view!=='settings'} className="preview-sections" aria-label="设置组合示例">
      <h2 className="od-page-title">整理偏好</h2>
      <Card><CardContent><div className="od-stack">
        <div className="preview-row"><label id="workspace-auto-label" className="od-field-label">按分组整理资源</label>
          <Switch aria-labelledby="workspace-auto-label" aria-describedby="workspace-auto-help" isSelected={automatic} onChange={value=>{setAutomatic(value);setSettingNotice(value?'已开启分组整理。':'已关闭分组整理。');}}/></div>
        <p id="workspace-auto-help" className="od-field-help">立即生效，仅保存在本页内存。关闭后列表按名称排列。</p>
      </div></CardContent></Card>
      {settingNotice&&<p className="od-note" role="status">{settingNotice}</p>}
    </section>
  </>;
}

function RecipeContent({onLock,externalLock}){
  const [enabled,setEnabled]=React.useState(true),[value,setValue]=React.useState('示例条目');
  const [savedValue,setSavedValue]=React.useState('示例条目');
  const [error,setError]=React.useState(false),[confirm,setConfirm]=React.useState(false);
  const [notice,setNotice]=React.useState('组件示例已就绪，只修改当前页面内存。');
  const [scenario,setScenario]=React.useState('ready');
  const input=React.useRef(null),remove=React.useRef(null),cancel=React.useRef(null);
  const blocked=scenario!=='ready';
  React.useEffect(()=>{onLock(confirm);if(confirm)cancel.current?.focus();},[confirm]);
  const close=()=>{setConfirm(false);requestAnimationFrame(()=>remove.current?.focus());};
  const feedback={error:'读取失败。返回就绪状态后可继续编辑。',denied:'尚未授权，当前操作不可用。',revoked:'授权已撤销，当前操作已停止。',busy:'正在读取，操作暂不可用。'};
  const save=event=>{
    event.preventDefault();
    if(blocked)return;
    if(!value.trim()){setError(true);input.current?.focus();return;}
    setSavedValue(value.trim());setValue(value.trim());setNotice('已保存「'+value.trim()+'」到本页内存。');setError(false);
  };
  return <>
    <section className="od-stack" aria-labelledby="recipe-controls-title">
      <div className="od-page-head"><h2 className="od-page-title" id="recipe-controls-title">操作与设置</h2>
        <div className="od-page-actions"><IconButton label="刷新组件示例" onClick={()=>setNotice('组件示例已刷新。')}>{refreshIcon}</IconButton></div>
      </div>
      <Card><CardContent><div className="od-stack">
        <div className="preview-actions"><Button variant="primary" onClick={()=>setNotice('主要操作已执行。')}>主要操作</Button>
          <Button onClick={()=>setNotice('次要操作已执行。')}>次要操作</Button>
          <Button variant="outline" onClick={()=>setNotice('描边操作已执行。')}>描边操作</Button>
          <Button variant="quiet" onClick={()=>setNotice('轻量操作已执行。')}>轻量操作</Button><Button variant="danger" onClick={()=>setNotice('危险操作请在下方确认示例中体验。')}>危险操作</Button><Button disabled>不可用</Button>
          <Button aria-busy="true" disabled>处理中…</Button></div>
        <div className="preview-row"><label className="od-field-label" id="recipe-switch-label">自动整理</label>
          <Switch aria-labelledby="recipe-switch-label" isSelected={enabled} onChange={setEnabled} isDisabled={blocked}/></div>
        <p className="od-field-help" role="status">{enabled?'已开启自动整理':'已关闭自动整理'}</p>
      </div></CardContent></Card>
    </section>
    <section className="od-stack" aria-labelledby="recipe-form-title" aria-busy={scenario==='busy'}>
      <h2 className="od-page-title" id="recipe-form-title">字段与保存</h2>
      <Card><CardContent><form className="preview-sections" noValidate onSubmit={save}>
        <div className="od-form-field"><label className="od-field-label" htmlFor="recipe-name">名称</label>
          <Input ref={input} id="recipe-name" className="od-field" value={value} required maxLength={80} disabled={blocked}
            aria-invalid={error||undefined} aria-describedby={'recipe-name-help'+(error?' recipe-name-error':'')}
            onChange={event=>{setValue(event.target.value);if(event.target.value.trim())setError(false);}}/>
          <p id="recipe-name-help" className="od-field-help">最多 80 个字符。清空后保存可查看错误。</p>
          {error&&<p id="recipe-name-error" className="od-field-error" role="alert">请输入名称。</p>}
        </div>
        <div className="preview-actions"><Button type="submit" variant="primary" disabled={blocked}>保存示例</Button>
          <Button onClick={()=>{setValue(savedValue);setError(false);setNotice('已取消编辑，恢复最近保存的名称。');input.current?.focus();}} disabled={blocked}>取消编辑</Button></div>
      </form></CardContent></Card>
      <p className={blocked?'od-alert '+(scenario==='error'?'od-alert--error':['denied','revoked'].includes(scenario)?'od-alert--warning':''):'od-note'}
        role={['error','revoked'].includes(scenario)?'alert':'status'} aria-live="polite">{blocked?feedback[scenario]:notice}</p>
    </section>
    <section className="od-stack" aria-labelledby="recipe-confirm-title" onKeyDown={event=>{if(event.key==='Escape'&&confirm&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();close();}}}>
      <h2 className="od-page-title" id="recipe-confirm-title">危险操作与确认</h2>
      {confirm?<Card><CardContent><div className="od-stack" role="group" aria-label="删除确认">
        <strong className="od-title">删除示例条目？</strong><p className="od-note">仅清除本页模拟内容；恢复初始预览后可重新操作。</p>
        <div className="preview-actions"><Button ref={cancel} onClick={close}>取消</Button><Button variant="danger" onClick={()=>{setValue('');setSavedValue('');setNotice('示例条目已删除，仅修改本页内存。');close();}}>确认删除</Button></div>
      </div></CardContent></Card>:null}
      <div className="preview-actions"><Button ref={remove} variant="quiet" disabled={blocked||confirm} onClick={()=>setConfirm(true)}>删除示例…</Button></div>
    </section>
    {createPortal(<div className="od-form-field"><label htmlFor="recipe-scenario" className="od-field-label">模拟状态</label>
      <select id="recipe-scenario" className="od-field" value={scenario} disabled={confirm||externalLock} onChange={event=>setScenario(event.target.value)}>
        <option value="ready">就绪</option><option value="error">读取失败</option><option value="denied">未授权</option>
        <option value="revoked">撤权</option><option value="busy">加载中</option>
      </select></div>,document.getElementById('od-preview-recipe-controls'))}
  </>;
}

// One session per mounted recipe; theme changes and input renders retain it.
function ChatRecipe({locked,children}){
  const [open,setOpen]=React.useState(false);
  const trigger=React.useRef(null);
  const close=()=>{setOpen(false);trigger.current?.focus({preventScroll:true});};
  const [session]=React.useState(()=>createConversationSession({identity:{
    consumerId:'offline-component-recipe',instanceId:'chat-recipe',hostInstanceId:'memory-only'
  }}));
  const state=React.useSyncExternalStore(session.subscribe,session.getSnapshot);
  const round=React.useRef(null);
  const [scenario,setScenario]=React.useState('ready');
  const [feedback,setFeedback]=React.useState('仅本页内存；发送后可停止，或在外部辅助区完成模拟回复。');
  React.useEffect(()=>()=>{session.dispose();round.current=null;},[session]);
  const finish=()=>{round.current?.finish();round.current=null;};
  const choose=next=>{
    session.cancel();finish();setScenario(next);
    session.update({needsReview:next==='review'});
    if(next==='busy')round.current=session.begin();
    setFeedback({ready:'内存演示就绪。',busy:'模拟处理中，可点击 Frame 内的停止。',
      error:'模拟失败；没有发出请求。切换就绪可重试。',blocked:'模拟不可用；发送被阻止。',
      review:'模拟待核对；未发生真实写入，不自动重放。'}[next]);
  };
  const send=()=>{
    if(state.busy||state.needsReview||['blocked','error'].includes(scenario))return;
    session.append('你',state.draft.trim());session.update({draft:''});
    round.current=session.begin();setScenario('busy');setFeedback('模拟处理中，尚未产生回复。');
  };
  return <>
    {createPortal(<button ref={trigger} type="button" className="od-icon-button od-conversation-frame-trigger"
      aria-label="AI 对话" title="打开或收起 AI 对话" aria-pressed={open} aria-expanded={open}
      aria-controls="recipe-chat-dock" onClick={()=>setOpen(value=>!value)}><span className="od-conversation-ai-glyph" aria-hidden="true">AI</span></button>,
      document.getElementById('sidebar-tool-chat-slot'))}
    <div className="od-conversation-workspace" data-chat-open={String(open)}>
      <div className="od-conversation-business" style={{overflow:'auto',padding:'var(--space-3)'}}>
        <div className="preview-sections">{children}</div>
      </div>
      <SharedConversationDock open={open} onClose={close} id="recipe-chat-dock" aria-label="共享 Chat 内存演示" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();close();}}}>
        <SharedConversationFrame open={open} inputId="recipe-chat-input" rows={state.rows} draft={state.draft}
          busy={state.busy} blocked={state.needsReview||['blocked','error'].includes(scenario)}
          focusOnOpen={true} emptyPrompt="输入一条消息，体验共享 Frame。"
          onDraftChange={draft=>session.update({draft})} onSend={send}
          onStop={()=>{session.cancel();finish();setScenario('ready');setFeedback('已停止本页模拟轮次。');}}
          feedback={<p className={scenario==='error'?'od-conversation-error':'od-conversation-phase'} role={scenario==='error'?'alert':'status'}>{feedback}</p>}
          review={state.needsReview?<div className="od-conversation-feedback"><Button onClick={()=>{
            session.update({needsReview:false});setScenario('ready');setFeedback('已确认本页无真实操作；未重放消息。');
          }}>确认模拟核对</Button></div>:null}/>
      </SharedConversationDock>
    </div>
    {createPortal(<div className="od-stack">
      <label htmlFor="recipe-chat-scenario" className="od-field-label">Chat 模拟状态（纯内存，无 AI / Provider / Host / 业务）</label>
      <select id="recipe-chat-scenario" className="od-field" value={scenario} disabled={locked} onChange={event=>choose(event.target.value)}>
        <option value="ready">ready</option><option value="busy">busy</option><option value="error">error</option>
        <option value="blocked">blocked</option><option value="review">review</option>
      </select>
      <Button disabled={locked||!state.busy} onClick={()=>{
        round.current?.assertCurrent();session.append('助手','这是固定的离线演示回复，未调用模型。');
        finish();setScenario('ready');setFeedback('模拟回复已完成，仅保存在本页内存。');
      }}>完成模拟回复</Button>
    </div>,document.getElementById('od-preview-recipe-controls'))}
  </>;
}

// Only this same-document component reference bounds the real shell content.
const detail=document.getElementById('od-preview-extension-detail');
Object.assign(detail.style,{height:'700px',display:'flex',flexDirection:'column',minHeight:'0'});
for(const node of detail.children)if(node!==root)node.style.flex='none';
root.className='od-theme-shadcn';
Object.assign(root.style,{flex:'1 1 auto',minHeight:'0',padding:'0',overflow:'hidden'});
createRoot(root).render(<Recipes/>);
