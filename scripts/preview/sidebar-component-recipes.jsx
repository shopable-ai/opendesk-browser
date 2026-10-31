// Offline consumer of the SAME component sources published by sidebar-shared-ui.js.
// Native form semantics use canonical od-* CSS; no fictional @opendesk/ui Field API.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {Button,IconButton} from '../../src/ui/react/components/ui/button.tsx';
import {Card,CardContent} from '../../src/ui/react/components/ui/card.tsx';
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
    <RecipeContent key={generation} onLock={setLocked}/>
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

createRoot(root).render(<Recipes/>);
