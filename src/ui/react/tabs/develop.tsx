import * as React from 'react';
import {DevelopProvider,DevelopField,useDevelop,DevelopIcon} from './develop-controls.tsx';
import {DevelopContextHeader,DevelopSourceEditor} from './develop-editor.tsx';
import {DevelopLocalProject} from './develop-local.tsx';
import {DevelopDiagnostics} from './develop-diagnostics.tsx';
import {DevelopExecution} from './develop-execution.tsx';
import {DevelopAdvanced,DevelopBrowserPermissions} from './develop-advanced.tsx';
import {DevelopPromptProvider} from './develop-ai-prompt.tsx';
import {Confirmation} from '../components/confirmation.tsx';

// Presentation shares the existing field store; controllers retain all execution authority.
const sectionTitles={save:'保存脚本',library:'管理脚本',history:'运行记录与下载',install:'安装与发布',diagnostics:'权限与诊断'};
export function DeveloperPage({model,view=model,actions=view.actions,hidden=false,locale='zh-CN',noticeView,offline=false}){
  const snapshot=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const section=snapshot.section||'editor';
  const back=React.useRef(null);
  React.useLayoutEffect(()=>{
    view.setPresentationActive(!hidden);
    return ()=>view.setPresentationActive(false,'unmounted');
  },[hidden,view]);
  React.useLayoutEffect(()=>{
    if(hidden)return;
    const doc=back.current?.ownerDocument;
    const target=section!=='editor'?back.current:doc?.getElementById(snapshot.returnFocusId);
    target?.focus();
    // A modal FocusScope may restore focus after this layout effect. Recover
    // only a background/hidden focus, without stealing a newer user choice.
    const win=doc?.defaultView;
    const frame=win?.requestAnimationFrame?.(()=>{
      if(target?.isConnected&&!doc.querySelector('.od-confirm-overlay')&&
        (doc.activeElement===doc.body||doc.activeElement?.closest('[hidden]')))target.focus();
    });
    return ()=>{if(frame!==undefined)win.cancelAnimationFrame(frame);};
  },[section,hidden]);
  return <DevelopProvider view={view} actions={actions}>
    <div id="workbench-develop" role="tabpanel" aria-labelledby="tab-develop" className="od-page" data-workbench-page="develop" hidden={hidden}>
      <section className="developer-editor" aria-label="代码开发">
        <div className="developer-sub-head" hidden={section==='editor'}>
          <button ref={back} type="button" className="od-icon-button" aria-label="返回编辑" onClick={()=>view.navigate('editor')}><DevelopIcon name="chevron"/></button>
          <h2 className="od-page-title">{sectionTitles[section]}</h2>
        </div>
        <DevelopPromptProvider noticeView={noticeView} locale={locale} hidden={hidden||section!=='editor'}>
        <div className="developer-compose od-stack" hidden={section!=='editor'}>
          <DevelopContextHeader offline={offline}/>
          {!offline&&<DevelopLocalProject/>}
          <DevelopSourceEditor view={view} actions={actions} locale={locale} offline={offline}/>
        </div>
        </DevelopPromptProvider>
        <div hidden={section!=='diagnostics'}><DevelopBrowserPermissions active={!hidden&&section==='diagnostics'}/></div>
        <DevelopExecution section={section} offline={offline}>
          {!offline&&<nav className="developer-management-links od-toolbar" aria-label="脚本管理" hidden={section!=='editor'}>
            <DevelopSectionButton section="diagnostics" id="developer-diagnostics-entry">权限与诊断</DevelopSectionButton>
          </nav>}
        </DevelopExecution>
        <DevelopAdvanced section={section}/>
        <div hidden={section!=='diagnostics'}><DevelopDiagnostics/></div>
        <Confirmation open={!hidden&&Boolean(snapshot.confirmation)} identity={snapshot.confirmation?.identity}
          title={snapshot.confirmation?.title} message={snapshot.confirmation?.message}
          confirmLabel={snapshot.confirmation?.confirmLabel} cancelLabel={snapshot.confirmation?.cancelLabel}
          tone={snapshot.confirmation?.tone}
          onConfirm={()=>view.settleConfirmation(snapshot.confirmation?.identity,'confirm')}
          onCancel={reason=>view.settleConfirmation(snapshot.confirmation?.identity,'cancel',reason)}/>
      </section>
    </div>
  </DevelopProvider>;
}

function DevelopSectionButton({section,children,...props}){
  const {model}=useDevelop();
  return <button type="button" className="od-button od-button--quiet" {...props}
    onClick={event=>model.navigate(section,{returnFocusId:event.currentTarget.closest('#developer-more-actions')?'developer-more-button':event.currentTarget.id})}>{children}</button>;
}

export function DeveloperDock({model,view=model,actions=view.actions,hidden=false,offline=false}){
  const {fields,section}=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const local=fields['local-project-mode'].checked;
  const [more,setMore]=React.useState(false);
  const moreButton=React.useRef(null);
  const showStop=!fields['script-stop'].disabled||fields['script-status'].data.state==='stopping';
  return <DevelopProvider view={view} actions={actions}>
    <div id="develop-dock" className="dock-actions" data-subview={section!=='editor'} hidden={hidden||section!=='editor'&&!showStop}>
      <div className="dock-buttons od-toolbar" data-opendesk-react-owner="developer-actions">
        <DevelopField as="button" className="od-button" id="script-run" icon={<DevelopIcon name="play"/>}>{offline?'试运行':'运行'}</DevelopField>
        {showStop&&<DevelopField as="button" id="script-stop" className="od-button od-button--secondary" icon={<DevelopIcon name="stop"/>}>停止</DevelopField>}
        {!offline&&<><DevelopSectionButton section="save" hidden={local} className="od-button od-button--secondary" id="developer-save-entry"><DevelopIcon name="save"/>保存脚本</DevelopSectionButton>
        <span hidden={!local}><DevelopField as="button" id="script-save" className="od-button od-button--secondary" icon={<DevelopIcon name="save"/>}>检查并保存本地项目</DevelopField></span>
        <div className="developer-more" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setMore(false);}}
          onKeyDown={event=>{if(event.key==='Escape'){setMore(false);moreButton.current?.focus();}}}>
          <button type="button" id="developer-more-button" ref={moreButton} className="od-icon-button" aria-label="更多操作" aria-expanded={more}
            aria-controls="developer-more-actions" onClick={()=>setMore(!more)}><DevelopIcon name="dots"/></button>
          <div id="developer-more-actions" className="developer-more-actions od-surface" hidden={!more} onClick={()=>setMore(false)}>
            <DevelopSectionButton section="library" id="developer-library-entry" hidden={local}>管理脚本</DevelopSectionButton>
            <DevelopSectionButton section="history">运行记录与下载</DevelopSectionButton>
            <DevelopSectionButton section="install">安装与发布</DevelopSectionButton>
            <DevelopSectionButton section="diagnostics">权限与诊断</DevelopSectionButton>
          </div>
        </div></>}
      </div>
    </div>
  </DevelopProvider>;
}
