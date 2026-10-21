/** @jsx h */
import * as React from 'react';
import {createPortal} from 'react-dom';
import {TimeReviewSettings,StayFocusSettings,StayFocusQuickAdd,AiAccessSettings} from './trusted-settings.tsx';
import {UninstallDialog} from './tools.tsx';
import {TrustedConversationHeaderSlot} from '../components/conversation.tsx';

const h=React.createElement.bind(React);
const ToolContext = React.createContext(null);


export function ToolHost({view}) {
  const snapshot = React.useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const importOpen = snapshot.fields['sidebar-tool-import']?.hidden === false;
  // These are the only editable inputs in this host. Business decisions remain
  // synchronous controller actions, with the original trusted browser event.
  const actions = React.useMemo(() => ({
    chooseFile(event) {
      view.patch('sidebar-tool-file', {value:event.currentTarget.value});
      view.dispatch('sidebar-tool-file', 'change', event.nativeEvent);
    },
    cancelFile(event) {view.dispatch('sidebar-tool-file', 'cancel', event);},
    language(event) {
      view.patch('sidebar-tool-toc-language-select', {value:event.currentTarget.value});
      view.dispatch('sidebar-tool-toc-language-select', 'change', event.nativeEvent);
    },
    revoke(key, id, event) {view.activateRow(key, id, event.nativeEvent);}
  }), [view]);
  const nodes = React.useRef({frameRoot:null,settingsControl:null});
  const refs = React.useRef(new Map());
  const runtimeRefs = React.useMemo(() => Object.fromEntries(Object.keys(nodes.current).map(key => [key, node => {nodes.current[key] = node;}])), []);
  React.useLayoutEffect(() => view.attachRuntime({...nodes.current}), [view]);
  React.useLayoutEffect(() => {
    for (const effect of view.takeEffects()) {
      let target=refs.current.get(effect.key),options=effect.options;
      if(effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'){
        const doc=nodes.current.frameRoot?.ownerDocument;
        if(Object.hasOwn(options??{},'extensionToolId')){
          if(snapshot.fields['sidebar-tool-display'].hidden===false)continue;
          const {extensionToolId,...focusOptions}=options;options=focusOptions;
          const controls=[...(doc?.querySelectorAll('#extension-center-list button[data-extension-key]')??[])]
            .filter(button=>button.dataset.extensionKey==='app:'+extensionToolId);
          target=controls.find(button=>button.dataset.extensionAction==='primary')||
            controls.find(button=>button.dataset.extensionAction==='more')||
            controls.find(button=>button.dataset.extensionAction==='main')||
            doc?.getElementById('extension-center-search');
        }
        target??=doc?.getElementById('sidebar-tool-import-trigger')??doc?.getElementById('extension-center-import');
      }
      target?.[effect.method]?.(options);
    }
  }, [view, snapshot.effectVersion]);
  // Keep the trusted installer single-owned; the drawer changes only its layout.
  React.useEffect(() => {
    if(!importOpen)return;
    const panel=refs.current.get('sidebar-tool-import');
    if(!panel)return;
    const doc=panel.ownerDocument,app=doc.getElementById('opendesk-react-app');
    const priorFocus=doc.activeElement,priorInert=app?.inert;
    const priorOverflow=doc.body.style.overflow;
    if(app)app.inert=true;
    doc.body.style.overflow='hidden';
    panel.querySelector('#sidebar-tool-file')?.focus({preventScroll:true});
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        view.dispatch('sidebar-tool-import-close','click',event);return;
      }
      if(event.key!=='Tab')return;
      const focusable=[...panel.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node=>!node.closest('[hidden]')&&node.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(!first){event.preventDefault();panel.focus({preventScroll:true});return;}
      if(event.shiftKey&&(doc.activeElement===first||!panel.contains(doc.activeElement))){
        event.preventDefault();last.focus({preventScroll:true});
      }else if(!event.shiftKey&&(doc.activeElement===last||!panel.contains(doc.activeElement))){
        event.preventDefault();first.focus({preventScroll:true});
      }
    };
    doc.addEventListener('keydown',onKeyDown,true);
    return ()=>{
      doc.removeEventListener('keydown',onKeyDown,true);
      doc.body.style.overflow=priorOverflow;
      if(app)app.inert=priorInert;
      if(panel.contains(doc.activeElement)||doc.activeElement===doc.body){
        const target=priorFocus?.isConnected&&!priorFocus.closest?.('[hidden]')?priorFocus:
          doc.getElementById('extension-center-more')||doc.getElementById('extension-center-search');
        target?.focus?.({preventScroll:true});
      }
    };
  },[importOpen,view]);
  const context = React.useMemo(() => ({view, snapshot, refs}), [view, snapshot]);
  return <ToolContext.Provider value={context}><div className="sidebar-tool-host od-stack"><ToolField as="section" id="sidebar-tool-action-review" className="sidebar-tool-action-review od-surface" role="group" aria-label="确认当前工具操作" hidden={true}>
<ToolField as="p" id="sidebar-tool-action-summary" role="status">

</ToolField>
<div className="sidebar-tool-action-buttons">
<ToolField as="button" type="button" id="sidebar-tool-action-continue" className="od-button">
{"继续"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-action-cancel" className="od-button od-button--secondary">
{"取消"}
</ToolField>

</div>

</ToolField>

<ImportSheet open={importOpen}
  onBackdrop={event=>view.dispatch('sidebar-tool-import-close','click',event.nativeEvent)}
  onFileDrop={event=>view.dispatch('sidebar-tool-file','drop',event.nativeEvent)}>
<ToolField as="section" id="sidebar-tool-import" className="sidebar-tool-import od-surface"
  role="dialog" aria-modal={importOpen} aria-labelledby="sidebar-tool-import-heading" hidden={true} tabIndex={-1}>
<div className="sidebar-tool-import-head od-toolbar">
<strong id="sidebar-tool-import-heading">
{"导入扩展"}
</strong>
<ToolField as="button" type="button" id="sidebar-tool-import-close" className="sidebar-tool-icon-action od-icon-button" title="取消导入" aria-label="取消导入">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M5 5l14 14M19 5 5 19">

</path>

</svg>

</ToolField>

</div>
<div className="od-import-sheet-body">
<label htmlFor="sidebar-tool-file">
{"拖入 JSON 安装包，或点击选择文件"}
</label>
<ToolFileInput value={snapshot.fields['sidebar-tool-file'].value} disabled={snapshot.fields['sidebar-tool-file'].disabled}
  onChoose={actions.chooseFile} onCancel={actions.cancelFile}/><ToolField as="p" id="sidebar-tool-file-error" className="sidebar-tool-file-error" role="alert" hidden={true}>

</ToolField>
<p className="sidebar-tool-import-hint">
{"支持 .opendesk-tool.json 应用包或 .opendesk-page.json 网页增强安装包。选择文件后查看身份、版本和权限，再确认安装。网页增强安装后在批准的网站自动运行。开发草稿请到「开发」导入。"}
</p>
<ToolField as="div" id="sidebar-tool-preview" className="sidebar-tool-preview" hidden={true}>
<div className="sidebar-tool-preview-heading">
<ToolField as="strong" id="sidebar-tool-preview-title">

</ToolField>
<ToolField as="span" id="sidebar-tool-preview-version">

</ToolField>

</div>
<ToolField as="p" id="sidebar-tool-preview-description">

</ToolField>
<div className="sidebar-tool-capabilities od-surface">
<span>
{"申请能力"}
</span>
<ToolField as="p" id="sidebar-tool-preview-capabilities">

</ToolField>

</div>
<ToolField as="p" id="sidebar-tool-preview-file" className="sidebar-tool-preview-file">

</ToolField>
<ToolField as="div" id="sidebar-tool-update" className="sidebar-tool-update od-surface" hidden={true}>
<strong>
{"更新前请核对"}
</strong>
<ToolField as="p" id="sidebar-tool-update-versions">

</ToolField>
<ToolField as="p" id="sidebar-tool-update-capabilities">

</ToolField>
<p>
{"侧边栏工具：同 ID 更新保留本地数据，卸载时才清理。网页增强：原生注册与权限以 Host 回执为准。"}
</p>
<ToolField as="p" id="sidebar-tool-update-warning" className="sidebar-tool-update-warning" hidden={true}>

</ToolField>

</ToolField>
</ToolField>
<ToolField as="p" id="page-install-import-status" role="status" aria-live="polite" hidden={true}>

</ToolField>
<ToolField as="details" id="page-install-import-receipt" className="od-disclosure" hidden={true}>
<summary>
{"安装回执"}
</summary>
<ToolField as="p" id="page-install-import-receipt-text">

</ToolField>

</ToolField>
</div>
<div className="od-import-sheet-footer" hidden={snapshot.fields['sidebar-tool-preview'].hidden}>
<ToolField as="button" type="button" id="sidebar-tool-install" className="od-button" disabled={true}>
{"确认安装"}
</ToolField>
</div>
</ToolField>
</ImportSheet>

<ToolField as="section" id="sidebar-tool-display" className="sidebar-tool-display" aria-label="当前工具界面" hidden={true}>
<div className="sidebar-tool-view-head od-toolbar od-page-head">
<ToolField as="button" type="button" id="sidebar-tool-back" className="sidebar-tool-icon-action od-icon-button" title="返回工具列表" aria-label="返回自定义工具列表">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="m14 5-7 7 7 7M7 12h14">

</path>

</svg>

</ToolField>
<ToolField as="strong" id="sidebar-tool-title" className="od-page-title">

</ToolField>
<TrustedConversationHeaderSlot/>
<ToolField as="button" type="button" id="sidebar-tool-open-tab" className="sidebar-tool-icon-action od-icon-button" title="在新标签页打开" aria-label="在新标签页打开当前工具" disabled={true}>
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M13 5h6v6m0-6-9 9M19 13v6H5V5h6">

</path>

</svg>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-settings-open" className="sidebar-tool-icon-action od-icon-button" title="工具设置" aria-label="工具设置" aria-controls="sidebar-tool-settings-view" aria-expanded="false" hidden={true} nodeRef={runtimeRefs.settingsControl}>
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="3">

</circle>
<path d="M10 2h4l.5 2.5 2 1 2.4-1 2.3 3-1.7 2v3l1.7 2-2.3 3-2.4-1-2 1L14 21h-4l-.5-2.5-2-1-2.4 1-2.3-3 1.7-2v-3l-1.7-2 2.3-3 2.4 1 2-1Z">

</path>

</svg>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-visibility" className="sidebar-tool-icon-action od-icon-button" title="显示或隐藏此网站的悬浮目录" aria-label="显示或隐藏此网站的悬浮目录" aria-pressed="true" hidden={true}>
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z">

</path>
<circle cx="12" cy="12" r="3">

</circle>

</svg>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-context-menu" className="sidebar-tool-icon-action od-icon-button" title="为当前网站启用右键菜单" aria-label="为当前网站启用右键菜单" aria-pressed="false" hidden={true}>
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M4 5h16M4 12h16M4 19h16M9 3v4M15 10v4M11 17v4">

</path>

</svg>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-remove" className="sidebar-tool-icon-action od-icon-button" title="卸载工具及本地数据" aria-label="卸载当前工具及本地数据" disabled={true}>
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5">

</path>

</svg>

</ToolField>

</div>
<ToolField as="p" id="sidebar-tool-readonly-banner" className="sidebar-tool-status" data-state="readonly" role="note" hidden={true}>
{"开发只读预览 · 未安装。模拟读取仅返回空值；禁止写入、发送消息、控制网页或运行任务。需要正式使用时，请另行审阅并安装工具包。"}
</ToolField>
<section id="sidebar-tool-adblock-native" hidden={!snapshot.legacyAdblockVisible}>此版本 AdBlock 的旧控制界面已退役。请在扩展中心更新至正式 React 版本；你仍可停用或卸载，可信服务负责清理该工具自有规则。</section><StayFocusQuickAdd model={snapshot.trustedSettings.stayFocus} actions={view.trustedSettingsActions.stayFocus}/><div id="sidebar-tool-frame" className="sidebar-tool-frame" ref={runtimeRefs.frameRoot}/><section id="sidebar-tool-ai-proxy-native" className="sidebar-tool-ai-proxy-native" aria-label="AI 智能访问可信设置" hidden={!snapshot.trustedSettings.aiAccess?.visible}><AiAccessSettings model={snapshot.trustedSettings.aiAccess} actions={view.trustedSettingsActions.aiAccess}/></section><ToolField as="button" type="button" id="sidebar-tool-launch" className="od-button" hidden={true}>
{"打开工具"}
</ToolField>
<ToolField as="section" id="sidebar-tool-retired-draft" className="sidebar-tool-settings-view od-surface" aria-label="停用前的草稿" hidden={true}>
<p>
{"工具已停止。以下表单草稿可选择并复制；关闭此窗口后副本会丢失。"}
</p>
<textarea id="sidebar-tool-retired-draft-text" aria-label="可复制的草稿副本" readOnly className="od-field"
  value={snapshot.fields['sidebar-tool-retired-draft-text'].value}/>
<ToolField as="button" type="button" id="sidebar-tool-retired-draft-dismiss" className="od-button">
{"清除草稿副本"}
</ToolField>

</ToolField>
<ToolField as="section" id="sidebar-tool-settings-view" className="sidebar-tool-settings-view od-surface" aria-label="工具设置" hidden={true}>
<CookieSettings onRevoke={actions.revoke}/><BookmarkSettings/><ToolField as="div" id="sidebar-tool-toc-language" className="sidebar-toc-settings-row" hidden={true}>
<label htmlFor="sidebar-tool-toc-language-select">
<ToolLabel name="languageLabel"/>
</label>
<select id="sidebar-tool-toc-language-select" className="od-field" aria-label="界面语言"
  value={snapshot.fields['sidebar-tool-toc-language-select'].value} disabled={snapshot.fields['sidebar-tool-toc-language-select'].disabled}
  onChange={actions.language}>
<option value="zh-CN">
{"简体中文"}
</option>
<option value="en">
{"English"}
</option>

</select>

</ToolField>
<div className="sidebar-toc-settings-row">
<span className="sidebar-tool-prompt-enable-info">
<ToolField as="strong" id="sidebar-tool-prompt-enable-label">
<ToolLabel name="toggleHeading"/>
</ToolField>
<ToolField as="small" id="sidebar-tool-prompt-enable-description" hidden={true}>
{"停用后提示词仍保留"}
</ToolField>

</span>
<ToolField as="button" type="button" id="sidebar-tool-enable" className="od-button od-button--secondary ps-host-switch" aria-pressed="true">
{"停用工具"}
</ToolField>

</div>
<ToolField as="p" id="sidebar-tool-enable-hint" className="sidebar-toc-settings-hint" role="status">

</ToolField>
<ToolField as="div" id="sidebar-tool-prompt-web-row" className="sidebar-toc-settings-row sidebar-tool-prompt-native" hidden={true}>
<span className="sidebar-tool-prompt-native-info">
<strong>
{"网页快捷按钮"}
</strong>
<small>
{"在已支持的网站显示快捷按钮"}
</small>

</span>
<ToolField as="button" type="button" id="sidebar-tool-prompt-web-action" className="ps-host-switch" role="switch" aria-label="网页快捷按钮" aria-checked="true" disabled={true}>

</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-prompt-native-row" className="sidebar-toc-settings-row sidebar-tool-prompt-native" hidden={true}>
<span className="sidebar-tool-prompt-native-info">
<strong>
{"选中文字快速添加"}
</strong>
<small>
{"Chrome 原生右键，可选"}
</small>

</span>
<ToolField as="button" id="sidebar-tool-prompt-native-action" type="button" aria-pressed="false" className="od-button od-button--secondary ps-host-switch">
{"启用右键"}
</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-generic-site-scope" className="sidebar-toc-settings-scope">
<div>
<ToolField as="span" className="sidebar-toc-settings-caption" id="sidebar-tool-settings-scope-label">
{"当前网站授权"}
</ToolField>
<ToolField as="strong" id="sidebar-tool-settings-target">
{"请选择适用网页"}
</ToolField>

</div>
<ToolField as="button" type="button" id="sidebar-tool-settings-scope" hidden={true} className="od-button od-button--secondary">
{"只设置本页"}
</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-generic-site-binary" className="sidebar-toc-settings-binary" role="group" aria-label="当前网站授权">
<ToolField as="button" type="button" id="sidebar-tool-settings-allow" aria-pressed="false" className="od-button od-button--secondary">
{"授权当前网站"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-settings-deny" aria-pressed="false" className="od-button od-button--danger">
{"撤销当前网站授权"}
</ToolField>

</ToolField>
<ToolField as="p" id="sidebar-tool-settings-hint" className="sidebar-toc-settings-hint" role="status">

</ToolField>
<ToolField as="div" id="sidebar-tool-visibility-settings" hidden={true}>
<strong className="sidebar-toc-settings-title">
<ToolLabel name="overlayHeading"/>
</strong>
<div className="sidebar-toc-settings-row">
<span>
<ToolLabel name="websiteHeading"/>
</span>
<ToolField as="button" type="button" id="sidebar-tool-settings-site-visibility" className="sidebar-toc-visibility-toggle">
{"隐藏"}
</ToolField>

</div>
<div className="sidebar-toc-settings-row">
<span>
<ToolLabel name="pageHeading"/>
</span>
<ToolField as="button" type="button" id="sidebar-tool-settings-page-visibility" className="sidebar-toc-visibility-toggle">
{"隐藏"}
</ToolField>

</div>
<p className="sidebar-toc-settings-hint">
<ToolLabel name="overlayHint"/>
</p>

</ToolField>
<ToolField as="details" id="sidebar-tool-generic-site-advanced" className="sidebar-toc-advanced od-disclosure od-disclosure--flat" open={true}>
<summary>
<ToolLabel name="advancedHeading"/>
</summary>
<ToolField as="strong" className="sidebar-toc-settings-title" id="sidebar-tool-settings-sites-title">
{"已授权的网站"}
</ToolField>
<ToolGrantRows id="sidebar-tool-settings-sites" rows={snapshot.fields['sidebar-tool-settings-sites'].rows}
  emptyLabel={snapshot.fields['sidebar-tool-settings-sites'].emptyLabel} disabled={snapshot.fields['sidebar-tool-settings-sites'].disabled}
  className="sidebar-toc-settings-entries" onRevoke={actions.revoke}/>
<ToolField as="div" id="sidebar-tool-page-exceptions" hidden={true}>
<strong className="sidebar-toc-settings-title">
<ToolLabel name="exceptionsHeading"/>
</strong>
<ToolGrantRows id="sidebar-tool-settings-pages" rows={snapshot.fields['sidebar-tool-settings-pages'].rows}
  emptyLabel={snapshot.fields['sidebar-tool-settings-pages'].emptyLabel} disabled={snapshot.fields['sidebar-tool-settings-pages'].disabled}
  className="sidebar-toc-settings-entries" onRevoke={actions.revoke}/>

</ToolField>

</ToolField>
<TimeReviewSettings model={snapshot.trustedSettings.timeReview} actions={view.trustedSettingsActions.timeReview}/><StayFocusSettings model={snapshot.trustedSettings.stayFocus} actions={view.trustedSettingsActions.stayFocus}/>
</ToolField>

</ToolField>

<ToolField as="p" id="sidebar-tool-status" className="sidebar-tool-status" role="status" aria-live="polite" hidden={true}>

</ToolField>

<UninstallDialog open={snapshot.fields['sidebar-tool-inline-remove'].hidden===false}
  title={'卸载「'+(snapshot.fields['sidebar-tool-title']?.textContent||'当前扩展')+'」？'}
  busy={snapshot.fields['sidebar-tool-inline-remove-confirm'].disabled}
  returnFocusSelector="#sidebar-tool-remove"
  onCancel={event=>view.dispatch('sidebar-tool-inline-remove-cancel','click',event)}>
<ToolField as="section" id="sidebar-tool-inline-remove" className="sidebar-tool-inline-remove od-surface" aria-label="卸载工具确认" hidden={true}>
<ToolField as="p" id="sidebar-tool-inline-remove-text">

</ToolField>
<div className="sidebar-tool-inline-remove-actions od-uninstall-dialog-actions">
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-cancel" data-uninstall-cancel="true" className="od-button od-button--secondary">
{"取消"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-confirm" className="od-button od-uninstall-confirm">
{"确认卸载"}
</ToolField>

</div>

</ToolField>
</UninstallDialog>
</div></ToolContext.Provider>;
}

function ImportSheet({open,onBackdrop,onFileDrop,children}) {
  const [fileOver,setFileOver]=React.useState(false),depth=React.useRef(0);
  React.useEffect(()=>{if(!open){depth.current=0;setFileOver(false);}},[open]);
  const hasFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  const overlay=<div className="od-import-overlay" hidden={!open}
    data-file-drag={fileOver?'true':undefined}
    onDragEnter={event=>{
      if(!hasFiles(event))return;
      event.preventDefault();depth.current++;setFileOver(true);
    }}
    onDragOver={event=>{
      if(!hasFiles(event))return;
      event.preventDefault();event.dataTransfer.dropEffect='copy';
    }}
    onDragLeave={event=>{
      if(!hasFiles(event))return;
      depth.current=Math.max(0,depth.current-1);
      if(!depth.current)setFileOver(false);
    }}
    onDrop={event=>{
      if(!hasFiles(event))return;
      event.preventDefault();event.stopPropagation();
      depth.current=0;setFileOver(false);onFileDrop?.(event);
    }}>
    <button type="button" className="od-import-backdrop" tabIndex={-1}
      aria-label="关闭导入扩展" onClick={onBackdrop}/>
    {children}
  </div>;
  // SSR keeps the single expected host; Chrome portals it out of scroll clipping.
  return typeof document==='undefined' ? overlay : createPortal(overlay,document.body);
}

function ToolLabel({name}) {return React.useContext(ToolContext).snapshot.labels[name];}

function CookieSettings({onRevoke}) {
  const {snapshot} = React.useContext(ToolContext);
  const {rows, emptyLabel, disabled} = snapshot.fields['sidebar-tool-cookie-other-sites'];
  return <ToolField as="section" id="sidebar-tool-cookie-permissions" className="sidebar-tool-cookie-permissions od-surface">
    <ToolField as="strong" id="sidebar-tool-cookie-heading"/>
    <ToolField as="p" id="sidebar-tool-cookie-target"/>
    <ToolField as="p" id="sidebar-tool-cookie-help"/>
    <ToolField id="sidebar-tool-cookie-first-use"><ToolField as="button" id="sidebar-tool-cookie-site-toggle" className="od-button"/></ToolField>
    <ToolGrantRows id="sidebar-tool-cookie-other-sites" rows={rows} emptyLabel={emptyLabel} disabled={disabled}
      rowClassName="sidebar-toc-settings-row" onRevoke={onRevoke}/>
  </ToolField>;
}
function BookmarkSettings() {
  return <ToolField as="section" id="sidebar-tool-bookmark-permissions" className="sidebar-tool-cookie-permissions od-surface">
    <ToolField as="strong" id="sidebar-tool-bookmark-heading"/>
    <ToolField as="p" id="sidebar-tool-bookmark-info"/>
    <ToolField as="button" id="sidebar-tool-bookmark-grant" className="od-button"/>
  </ToolField>;
}

function ToolField({as:Tag='div', id, children, nodeRef, ...props}) {
  const {view, snapshot, refs} = React.useContext(ToolContext), state = snapshot.fields[id];
  if (!state) throw new Error('E_SIDEBAR_TOOL_FIELD: ' + id);
  const ref = React.useCallback(node => {if (node) refs.current.set(id, node); else refs.current.delete(id); nodeRef?.(node);}, [refs, id, nodeRef]);
  const attrs = {...props, id, ref, hidden: state.hidden, title: state.title ?? props.title,
    className: state.className ?? props.className, ...state.attributes};
  for (const [key, value] of Object.entries(state.data)) attrs['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = value;
  if (Tag === 'button') {attrs.disabled = state.disabled; attrs.type = props.type || 'button'; attrs.onClick = event => view.dispatch(id, 'click', event.nativeEvent);}
  if (Tag === 'details') {attrs.open = state.open; attrs.onToggle = event => {if (event.currentTarget.open !== view.fields[id].open) view.patch(id, {open:event.currentTarget.open});};}
  return <Tag {...attrs}>{state.textSet ? state.textContent : children ?? state.textContent}</Tag>;
}

function ToolGrantRows({id, rows, emptyLabel, disabled, onRevoke, className, rowClassName='sidebar-tool-site-entry'}) {
  return <div id={id} className={className}>
    {rows.length ? rows.map(row => <div key={row.id} className={rowClassName}>
      <span title={row.text}>{row.text}</span><button type="button" className="sidebar-tool-site-revoke" disabled={disabled || row.disabled}
        aria-label={row.ariaLabel || row.label + ' ' + row.text} onClick={event => onRevoke(id, row.id, event)}>{row.label}</button>
    </div>) : emptyLabel ? <p>{emptyLabel}</p> : null}
  </div>;
}

function ToolFileInput({value, disabled, onChoose, onCancel}) {
  const ref = React.useRef(null);
  // File selection cannot be controlled by React. Only clear it on controller
  // reset; cancelling a native picker is a separate, non-bubbling browser event.
  React.useLayoutEffect(() => {if (value === '') ref.current.value = '';}, [value]);
  React.useLayoutEffect(() => {
    const node = ref.current;
    node.addEventListener('cancel', onCancel); return () => node.removeEventListener('cancel', onCancel);
  }, [onCancel]);
  return <input ref={ref} id="sidebar-tool-file" type="file" accept=".json,application/json"
    aria-describedby="sidebar-tool-file-error" disabled={disabled} onChange={onChoose}/>;
}
