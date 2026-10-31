// Offline consumer of the SAME component sources published by sidebar-shared-ui.js.
// Native form semantics use canonical od-* CSS; no fictional @opendesk/ui Field API.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {Button,IconButton} from '../../src/ui/react/components/ui/button.tsx';
import {Card,CardContent} from '../../src/ui/react/components/ui/card.tsx';
import {SharedConversationFrame,SharedConversationDock} from '../../src/ui/react/components/conversation.tsx';
import {createConversationSession} from '../../src/ui/conversation/session.js';
import {Switch} from '../../src/ui/react/components/ui/switch.tsx';

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
      <RecipeContent onLock={setLocked}/>
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

function RecipeContent({onLock}){
  const [enabled,setEnabled]=React.useState(true),[value,setValue]=React.useState('示例条目');
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
    setNotice('已保存「'+value.trim()+'」到本页内存。');setError(false);
  };
  return <>
    <section className="od-stack" aria-labelledby="recipe-controls-title">
      <div className="od-page-head"><h2 className="od-page-title" id="recipe-controls-title">操作与设置</h2>
        <div className="od-page-actions"><IconButton label="刷新组件示例" onClick={()=>setNotice('组件示例已刷新。')}>{refreshIcon}</IconButton></div>
      </div>
      <Card><CardContent><div className="od-stack">
        <div className="preview-actions"><Button variant="primary" onClick={()=>setNotice('主要操作已执行。')}>主要操作</Button>
          <Button onClick={()=>setNotice('次要操作已执行。')}>次要操作</Button>
          <Button variant="quiet" onClick={()=>setNotice('轻量操作已执行。')}>轻量操作</Button><Button disabled>不可用</Button></div>
        <div className="preview-row"><label className="od-field-label" id="recipe-switch-label">自动整理</label>
          <Switch aria-labelledby="recipe-switch-label" isSelected={enabled} onChange={setEnabled} isDisabled={blocked}/></div>
        <p className="od-field-help" role="status">{enabled?'已开启自动整理':'已关闭自动整理'}</p>
      </div></CardContent></Card>
    </section>
    <section className="od-stack" aria-labelledby="recipe-form-title" aria-busy={scenario==='busy'}>
      <h2 className="od-page-title" id="recipe-form-title">字段与保存</h2>
      <Card><CardContent><form className="preview-sections" noValidate onSubmit={save}>
        <div className="od-form-field"><label className="od-field-label" htmlFor="recipe-name">名称</label>
          <input ref={input} id="recipe-name" className="od-field" value={value} required maxLength={80} disabled={blocked}
            aria-invalid={error||undefined} aria-describedby={'recipe-name-help'+(error?' recipe-name-error':'')}
            onChange={event=>{setValue(event.target.value);if(event.target.value.trim())setError(false);}}/>
          <p id="recipe-name-help" className="od-field-help">最多 80 个字符。清空后保存可查看错误。</p>
          {error&&<p id="recipe-name-error" className="od-field-error" role="alert">请输入名称。</p>}
        </div>
        <div className="preview-actions"><Button type="submit" variant="primary" disabled={blocked}>保存示例</Button>
          <Button onClick={()=>{setValue('示例条目');setError(false);setNotice('已取消编辑，示例名称已恢复。');input.current?.focus();}} disabled={blocked}>取消编辑</Button></div>
      </form></CardContent></Card>
      <p className={blocked?'od-alert '+(scenario==='error'?'od-alert--error':['denied','revoked'].includes(scenario)?'od-alert--warning':''):'od-note'}
        role={['error','revoked'].includes(scenario)?'alert':'status'} aria-live="polite">{blocked?feedback[scenario]:notice}</p>
    </section>
    <section className="od-stack" aria-labelledby="recipe-confirm-title" onKeyDown={event=>{if(event.key==='Escape'&&confirm){event.preventDefault();close();}}}>
      <h2 className="od-page-title" id="recipe-confirm-title">危险操作与确认</h2>
      {confirm?<Card><CardContent><div className="od-stack" role="group" aria-label="删除确认">
        <strong className="od-title">删除示例条目？</strong><p className="od-note">仅清除本页模拟内容；恢复初始预览后可重新操作。</p>
        <div className="preview-actions"><Button ref={cancel} onClick={close}>取消</Button><Button variant="danger" onClick={()=>{setValue('');setNotice('示例条目已删除，仅修改本页内存。');close();}}>确认删除</Button></div>
      </div></CardContent></Card>:null}
      <div className="preview-actions"><Button ref={remove} variant="danger" disabled={blocked||confirm} onClick={()=>setConfirm(true)}>删除示例…</Button></div>
    </section>
    {createPortal(<div className="od-form-field"><label htmlFor="recipe-scenario" className="od-field-label">模拟状态</label>
      <select id="recipe-scenario" className="od-field" value={scenario} disabled={confirm} onChange={event=>setScenario(event.target.value)}>
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
root.className='';
Object.assign(root.style,{flex:'1 1 auto',minHeight:'0',padding:'0',overflow:'hidden'});
createRoot(root).render(<Recipes/>);
