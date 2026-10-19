import * as React from 'react';

const ToolContext = React.createContext(null);

// Original audited controls retain their DOM owner inside this fixed island.
const TrustedSettingsIsland = React.memo(function TrustedSettingsIsland({nodeRef}) {
  return <div ref={nodeRef}><section id="time-review-permission-settings" className="time-review-trusted-actions" aria-label="时间回顾采集权限" hidden={true}>
<p>
{"安装不等于授权采集。先单独同意记录的网站，再主动开始；仅记录前台非空闲网页的域名和时长，默认只保存在本机。"}
</p>
<button id="time-review-grant-idle" type="button" className="od-button od-button--secondary">
{"授权空闲检测"}
</button>
<button id="time-review-revoke-idle" type="button" className="od-button od-button--secondary">
{"撤销空闲检测"}
</button>
<p>
{"网站采集授权与 Chrome 权限相互独立；撤权停止未来的记录，已有合法统计保留。"}
</p>
<button id="time-review-site-current-open" type="button" className="od-button od-button--secondary">
{"授权当前网站…"}
</button>
<section id="time-review-site-confirm" className="time-review-inline-clear-review" aria-label="确认当前网站统计权限" hidden={true}>
<p id="time-review-site-confirm-text">

</p>
<button id="time-review-site-current-approve" type="button" className="od-button od-button--secondary">
{"确认授权该网站"}
</button>
<button id="time-review-site-current-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<button id="time-review-site-all-open" type="button" className="od-button od-button--secondary">
{"授权全部普通网站…"}
</button>
<section id="time-review-site-all-confirm" className="time-review-inline-clear-review" aria-label="确认全部网站统计权限" hidden={true}>
<p>
{"确认允许 Time Review 统计全部普通 HTTP(S) 网站（不含浏览器内部与隐身页面）？该授权独立于主扩展权限。"}
</p>
<button id="time-review-site-all-approve" type="button" className="od-button od-button--secondary">
{"我同意记录全部普通网站"}
</button>
<button id="time-review-site-all-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<button id="time-review-site-all-revoke" type="button" className="od-button od-button--secondary">
{"撤销全部网站授权"}
</button>
<p id="time-review-site-grants-status" role="status">
{"正在读取网站授权…"}
</p>
<div id="time-review-site-grants-list" aria-label="已经授权的网站">

</div>
<button id="time-review-trusted-start" type="button" className="od-button od-button--secondary">
{"开始／恢复记录"}
</button>
<button id="time-review-clear-open" type="button" className="od-button od-button--secondary">
{"清空时间统计…"}
</button>
<section id="time-review-inline-clear-review" className="time-review-inline-clear-review" aria-label="确认清空时间统计" hidden={true}>
<p>
{"确定清空所有本机时间统计？请先导出备份，清空后无法恢复。"}
</p>
<button id="time-review-clear-approve" type="button" className="od-button od-button--secondary">
{"确认清空全部记录"}
</button>
<button id="time-review-clear-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>
<p>
{"可选分钟明细：仅保存未来真实结算的分钟数据，不记录标题、路径或正文；不会根据旧记录补造分钟。"}
</p>
<button id="time-review-minute-enable" type="button" className="od-button od-button--secondary">
{"开启分钟明细"}
</button>
<button id="time-review-minute-disable" type="button" className="od-button od-button--secondary">
{"关闭并删除分钟明细…"}
</button>
<section id="time-review-minute-delete-review" className="time-review-inline-clear-review" aria-label="确认删除分钟明细" hidden={true}>
<p>
{"确定关闭未来分钟采集并永久删除已有分钟明细？日汇总和分类保持不变。"}
</p>
<button id="time-review-minute-delete-approve" type="button" className="od-button od-button--secondary">
{"确认关闭并删除"}
</button>
<button id="time-review-minute-delete-cancel" type="button" className="od-button od-button--secondary">
{"取消"}
</button>

</section>

</section>
</div>;
});

export function ToolHost({view}) {
  const snapshot = React.useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const nodes = React.useRef({frameRoot:null,trustedSettings:null,adblock:null,aiProxy:null,settingsControl:null});
  const refs = React.useRef(new Map());
  const runtimeRefs = React.useMemo(() => Object.fromEntries(Object.keys(nodes.current).map(key => [key, node => {nodes.current[key] = node;}])), []);
  React.useLayoutEffect(() => view.attachRuntime({...nodes.current}), [view]);
  React.useLayoutEffect(() => {for (const effect of view.takeEffects()) refs.current.get(effect.key)?.[effect.method]?.(effect.options);}, [view, snapshot.effectVersion]);
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

<ToolField as="div" id="sidebar-tool-import" className="sidebar-tool-import od-surface" hidden={true}>
<div className="sidebar-tool-import-head od-toolbar">
<strong>
{"导入扩展"}
</strong>
<ToolField as="button" type="button" id="sidebar-tool-import-close" className="sidebar-tool-icon-action od-icon-button" title="取消导入" aria-label="取消导入">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M5 5l14 14M19 5 5 19">

</path>

</svg>

</ToolField>

</div>
<label htmlFor="sidebar-tool-file">
{"选择应用包或网页增强安装包 JSON"}
</label>
<ToolField as="input" id="sidebar-tool-file" type="file" accept=".json,application/json" aria-describedby="sidebar-tool-file-error"/><ToolField as="p" id="sidebar-tool-file-error" className="sidebar-tool-file-error" role="alert" hidden={true}>

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
{"工具数据：同一工具 ID 的已保存数据将保留；卸载时才删除。"}
</p>
<ToolField as="p" id="sidebar-tool-update-warning" className="sidebar-tool-update-warning" hidden={true}>

</ToolField>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-install" className="od-button" disabled={true}>
{"确认安装"}
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

</ToolField>

</ToolField>

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
<section id="sidebar-tool-adblock-native" hidden ref={runtimeRefs.adblock}/><div id="sidebar-tool-frame" className="sidebar-tool-frame" ref={runtimeRefs.frameRoot}/><section id="sidebar-tool-ai-proxy-native" className="sidebar-tool-ai-proxy-native" aria-label="AI 智能访问可信设置" hidden ref={runtimeRefs.aiProxy}/><ToolField as="button" type="button" id="sidebar-tool-launch" className="od-button" hidden={true}>
{"打开工具"}
</ToolField>
<ToolField as="section" id="sidebar-tool-retired-draft" className="sidebar-tool-settings-view od-surface" aria-label="停用前的草稿" hidden={true}>
<p>
{"工具已停止。以下表单草稿可选择并复制；关闭此窗口后副本会丢失。"}
</p>
<ToolField as="textarea" id="sidebar-tool-retired-draft-text" aria-label="可复制的草稿副本" readOnly={true} className="od-field">

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-retired-draft-dismiss" className="od-button">
{"清除草稿副本"}
</ToolField>

</ToolField>
<ToolField as="section" id="sidebar-tool-settings-view" className="sidebar-tool-settings-view od-surface" aria-label="工具设置" hidden={true}>
<CookieSettings/><BookmarkSettings/><ToolField as="div" id="sidebar-tool-toc-language" className="sidebar-toc-settings-row" hidden={true}>
<label htmlFor="sidebar-tool-toc-language-select">
<ToolLabel name="languageLabel"/>
</label>
<ToolField as="select" id="sidebar-tool-toc-language-select" className="od-field" aria-label="界面语言">
<option value="zh-CN">
{"简体中文"}
</option>
<option value="en">
{"English"}
</option>

</ToolField>

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
<ToolField as="div" id="sidebar-tool-settings-sites" className="sidebar-toc-settings-entries">

</ToolField>
<ToolField as="div" id="sidebar-tool-page-exceptions" hidden={true}>
<strong className="sidebar-toc-settings-title">
<ToolLabel name="exceptionsHeading"/>
</strong>
<ToolField as="div" id="sidebar-tool-settings-pages" className="sidebar-toc-settings-entries">

</ToolField>

</ToolField>

</ToolField>
<TrustedSettingsIsland nodeRef={runtimeRefs.trustedSettings}/>
</ToolField>

</ToolField>

<ToolField as="p" id="sidebar-tool-status" className="sidebar-tool-status" role="status" aria-live="polite" hidden={true}>

</ToolField>

<ToolField as="section" id="sidebar-tool-inline-remove" className="sidebar-tool-inline-remove od-surface" aria-label="卸载工具确认" hidden={true}>
<ToolField as="p" id="sidebar-tool-inline-remove-text">

</ToolField>
<div className="sidebar-tool-inline-remove-actions">
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-confirm" className="od-button">
{"确认卸载并删除数据"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-cancel" className="od-button od-button--secondary">
{"取消"}
</ToolField>

</div>

</ToolField>
</div></ToolContext.Provider>;
}

function ToolLabel({name}) {return React.useContext(ToolContext).snapshot.labels[name];}

function CookieSettings() {
  return <ToolField as="section" id="sidebar-tool-cookie-permissions" className="sidebar-tool-cookie-permissions od-surface">
    <ToolField as="strong" id="sidebar-tool-cookie-heading"/>
    <ToolField as="p" id="sidebar-tool-cookie-target"/>
    <ToolField as="p" id="sidebar-tool-cookie-help"/>
    <ToolField id="sidebar-tool-cookie-first-use"><ToolField as="button" id="sidebar-tool-cookie-site-toggle" className="od-button"/></ToolField>
    <ToolField id="sidebar-tool-cookie-other-sites"/>
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
  React.useLayoutEffect(() => {
    if (Tag !== 'input' || props.type !== 'file') return;
    const node = refs.current.get(id);
    if (state.value === '') node.value = '';
  }, [Tag, props.type, refs, id, state.value]);
  React.useLayoutEffect(() => {
    if (Tag !== 'input' || props.type !== 'file') return;
    const node = refs.current.get(id), cancel = event => view.dispatch(id, 'cancel', event);
    node.addEventListener('cancel', cancel); return () => node.removeEventListener('cancel', cancel);
  }, [Tag, props.type, refs, id, view]);
  const attrs = {...props, id, ref, hidden: state.hidden, title: state.title ?? props.title,
    className: state.className ?? props.className, ...state.attributes};
  for (const [key, value] of Object.entries(state.data)) attrs['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = value;
  if (['button','input','textarea','select','fieldset','option'].includes(Tag)) attrs.disabled = state.disabled;
  const invoke = (type, event, values) => {if (values) view.patch(id, values); view.dispatch(id, type, event.nativeEvent);};
  if (Tag === 'button') {attrs.type = props.type || 'button'; attrs.onClick = event => invoke('click', event);}
  if (Tag === 'details') {attrs.open = state.open; attrs.onToggle = event => {if (event.currentTarget.open !== view.fields[id].open) view.patch(id, {open:event.currentTarget.open});};}
  if (Tag === 'input' || Tag === 'textarea') {
    attrs.readOnly = state.readOnly;
    if (props.type === 'file') attrs.onChange = event => invoke('change', event, {files: Array.from(event.currentTarget.files || []), value:event.currentTarget.value});
    else if (props.type === 'checkbox' || props.type === 'radio') {attrs.checked = state.checked; attrs.onChange = event => invoke('change', event, {checked:event.currentTarget.checked});}
    else {attrs.value = state.value; attrs.onChange = event => invoke('change', event, {value:event.currentTarget.value}); attrs.onInput = event => invoke('input', event, {value:event.currentTarget.value});}
    return <Tag {...attrs}/>;
  }
  if (Tag === 'select') return <select {...attrs} value={state.value} onChange={event => invoke('change', event, {value:event.currentTarget.value})}>{state.options.map(row => <option key={row.value} value={row.value} disabled={row.disabled}>{row.label}</option>)}</select>;
  if (['sidebar-tool-cookie-other-sites','sidebar-tool-settings-sites','sidebar-tool-settings-pages'].includes(id)) return <Tag {...attrs}>
    {state.rows.length ? state.rows.map(row => <div key={row.id} className={id === 'sidebar-tool-cookie-other-sites' ? 'sidebar-toc-settings-row' : 'sidebar-tool-site-entry'}>
      <span title={row.text}>{row.text}</span><button type="button" className="sidebar-tool-site-revoke" disabled={state.disabled || row.disabled} aria-label={row.ariaLabel || row.label + ' ' + row.text} onClick={event => view.activateRow(id, row.id, event.nativeEvent)}>{row.label}</button>
    </div>) : state.emptyLabel ? <p>{state.emptyLabel}</p> : null}
  </Tag>;
  return <Tag {...attrs}>{state.textSet ? state.textContent : children ?? state.textContent}</Tag>;
}
