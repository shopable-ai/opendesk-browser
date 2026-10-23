import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {MyTaskRows,MyTaskDetail} from './tasks.tsx';
import {SchedulePlanRows,ScheduleManagerRows} from './schedule.tsx';
import {MyTaskParams,MyTaskHistory,MyScheduleDetail,MyCopyConfirmation} from './my-sections.tsx';
import {MyAgentToggle} from './my-agent.tsx';

export function MyTasksDock({view,hidden=false}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  return <MyControl view={view} id="task-dock" className="task-dock" hidden={hidden||view.field('task-dock').hidden}>
    <MyControl view={view} as="button" id="task-run" type="button" className="od-button od-button--primary" onClick={event=>view.actions.taskRunClick?.(event.nativeEvent)}>运行任务</MyControl>
    <MyControl view={view} as="button" id="task-stop" type="button" className="od-button od-button--danger" onClick={event=>view.actions.taskStopClick?.(event.nativeEvent)}>停止</MyControl>
  </MyControl>;
}

function MyTaskWorkspace({view}){return (<MyControl view={view} as="div" id="task-selected-workspace" className="task-selected-workspace">
<MyControl view={view} as="p" id="task-current-site" className="identity">
</MyControl>
<MyControl view={view} as="form" id="task-params-form" onInput={event=>view.actions.taskParamsFormInput?.(event.nativeEvent)} onChange={event=>view.actions.taskParamsFormChange?.(event.nativeEvent)} onSubmit={event=>view.actions.taskParamsFormSubmit?.(event.nativeEvent)} autoComplete="off" aria-label="任务参数">
<MyTaskParams view={view}/>
</MyControl>
<MyControl view={view} as="p" id="task-status" role="status" aria-live="polite">
</MyControl>
<MyControl view={view} as="div" id="task-result-panel" className="task-result-panel">
<div className="task-result-controls">
<h3 className="task-result-heading">{"最近结果"}</h3>
<MyControl view={view} as="button" type="button" id="task-result-reveal" onClick={event=>view.actions.taskResultRevealClick?.(event.nativeEvent)} title="完整返回值可能包含敏感信息" className="od-button od-button--secondary">{"查看完整原值"}</MyControl>
</div>
<MyControl view={view} as="pre" id="task-result" aria-label="当前任务结果">{"尚未运行"}</MyControl>
</MyControl>
<MyControl view={view} as="details" id="task-history-panel" className="task-history-panel od-disclosure">
<summary>{"运行记录"}</summary>
<MyControl view={view} as="div" id="task-history" aria-live="polite">
<MyTaskHistory rows={view.data.taskHistory||[]}/>
</MyControl>
</MyControl>
<details className="task-scope-panel od-disclosure">
<summary>{"网站与权限"}</summary>
<MyControl view={view} as="div" id="task-installed-detail" className="task-detail" aria-live="polite">
<MyTaskDetail value={view.data.taskDetail||''}/>
</MyControl>
</details>
<MyControl view={view} as="details" id="task-tools" onToggle={event=>view.actions.taskToolsToggle?.(event.nativeEvent)} className="task-tools od-disclosure od-disclosure--flat">
<summary>{"更多操作"}</summary>
<div className="task-operation-strip" role="group" aria-label="当前任务操作">
<MyControl view={view} as="button" type="button" id="task-refresh" onClick={event=>view.actions.taskRefreshClick?.(event.nativeEvent)} className="od-icon-button" title="刷新任务列表" aria-label="刷新任务列表">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7"/>
</svg>
</MyControl>
<MyControl view={view} as="button" type="button" id="task-fork-draft" onClick={event=>view.actions.taskForkDraftClick?.(event.nativeEvent)} className="od-icon-button" title="复制为新草稿" aria-label="复制为新草稿">
<svg viewBox="0 0 24 24" aria-hidden="true">
<rect x="8" y="8" width="12" height="12" rx="2"/>
<path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
</svg>
</MyControl>
<MyControl view={view} as="button" type="button" id="task-toggle" onClick={event=>view.actions.taskToggleClick?.(event.nativeEvent)} className="od-icon-button" title="停用任务" aria-label="停用任务">
<svg data-task-toggle-icon="pause" viewBox="0 0 24 24" aria-hidden="true">
<path d="M7 5v14M17 5v14"/>
</svg>
<svg data-task-toggle-icon="play" viewBox="0 0 24 24" aria-hidden="true" hidden>
<path d="m8 5 12 7-12 7Z"/>
</svg>
</MyControl>
<MyControl view={view} as="button" type="button" id="task-uninstall" onClick={event=>view.actions.taskUninstallClick?.(event.nativeEvent)} className="od-icon-button od-icon-button--danger" title="卸载当前版本" aria-label="卸载当前版本">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>
</svg>
</MyControl>
<MyControl view={view} as="button" type="button" id="open-catalog" onClick={event=>view.actions.openCatalogClick?.(event.nativeEvent)} className="od-icon-button" title="打开本地任务目录" aria-label="打开本地任务目录">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M13 5h6v6m0-6-9 9M19 13v6H5V5h6"/>
</svg>
</MyControl>
</div>
<MyControl view={view} as="div" id="task-uninstall-confirm" className="task-uninstall-confirm" role="group" aria-label="确认卸载任务">
<MyControl view={view} as="p" id="task-uninstall-summary">{"确认卸载当前任务版本？历史运行结果不会一并删除。"}</MyControl>
<div className="task-uninstall-confirm-actions">
<MyControl view={view} as="button" type="button" id="task-uninstall-cancel" onClick={event=>view.actions.taskUninstallCancelClick?.(event.nativeEvent)} className="od-button od-button--secondary">{"取消"}</MyControl>
<MyControl view={view} as="button" type="button" id="task-uninstall-yes" onClick={event=>view.actions.taskUninstallYesClick?.(event.nativeEvent)} className="od-button od-button--danger">{"确认卸载"}</MyControl>
</div>
</MyControl>
</MyControl>
</MyControl>);}

export function MyTasksPage({view,agent=null,hidden=false}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  return <div id="workbench-tasks" role="tabpanel" aria-labelledby="tab-my-tasks" className="od-page" data-workbench-page="tasks" hidden={hidden}>
<MyControl view={view} as="section" className="tasks-surface" aria-label="已安装任务" id="my-task-surface">
<div className="task-section-head od-toolbar">
<div className="task-section-copy">
<strong>{"自动化任务"}</strong>
<MyControl view={view} as="span" id="task-installed-count" aria-live="polite">
</MyControl>
</div>
<div className="task-section-actions">
<MyAgentToggle agent={agent}/>
<MyControl view={view} as="button" id="task-search-toggle" onClick={event=>view.actions.taskSearchToggleClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="搜索和筛选任务" aria-label="搜索和筛选任务" aria-expanded="false" aria-controls="task-search-panel">
<svg viewBox="0 0 24 24" aria-hidden="true">
<circle cx="10.8" cy="10.8" r="6.8"/>
<path d="m16 16 5 5"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="task-manage-toggle" onClick={event=>view.actions.taskManageToggleClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="管理自动化任务" aria-label="管理自动化任务" aria-pressed="false" aria-controls="task-installed-cards">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M4 7h9m6 0h1M4 17h1m6 0h9"/>
<circle cx="16" cy="7" r="3"/>
<circle cx="8" cy="17" r="3"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-open" onClick={event=>view.actions.scheduleOpenClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="定时计划" aria-label="打开定时计划" aria-controls="scheduled-panel">
<svg viewBox="0 0 24 24" aria-hidden="true">
<circle cx="12" cy="12" r="9"/>
<path d="M12 7v5l3 2"/>
</svg>
</MyControl>
<MyControl view={view} as="button" type="button" id="task-open-catalog" onClick={event=>view.actions.taskOpenCatalogClick?.(event.nativeEvent)} className="od-icon-button" aria-label="添加任务" title="添加任务" aria-expanded="false" aria-controls="task-add-menu">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M12 5v14M5 12h14"/>
</svg>
</MyControl>
</div>
</div>
<MyControl view={view} as="div" id="task-add-menu" className="task-add-menu od-surface" role="group" aria-label="添加任务">
<div className="task-add-heading od-toolbar">
<strong>{"添加任务"}</strong>
<MyControl view={view} as="button" id="task-add-close" onClick={event=>view.actions.taskAddCloseClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="关闭添加任务" aria-label="关闭添加任务">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M5 5l14 14M19 5 5 19"/>
</svg>
</MyControl>
</div>
<p className="hint">{"支持任务包 JSON、程序草稿 JSON 和 .js；扩展工具包应在「扩展」导入。"}</p>
<MyControl view={view} as="button" type="button" id="task-add-import" onClick={event=>view.actions.taskAddImportClick?.(event.nativeEvent)} className="od-button">{"导入任务文件"}</MyControl>
<MyControl view={view} as="input" id="task-add-file" onChange={event=>view.actions.taskAddFileChange?.(event.nativeEvent)} type="file" accept=".json,.js,application/json,text/javascript" aria-label="选择本地任务包"/>
<div className="task-add-options od-toolbar">
<MyControl view={view} as="button" type="button" id="task-add-catalog" onClick={event=>view.actions.taskAddCatalogClick?.(event.nativeEvent)} className="od-button od-button--secondary">{"浏览任务目录 ↗"}</MyControl>
<MyControl view={view} as="button" type="button" id="task-add-develop" onClick={event=>view.actions.taskAddDevelopClick?.(event.nativeEvent)} className="od-button od-button--quiet">{"新建脚本"}</MyControl>
</div>
<MyControl view={view} as="p" id="task-add-status" className="hint" role="status" aria-live="polite">
</MyControl>
</MyControl>
<MyControl view={view} as="div" id="task-search-panel" onKeyDown={event=>view.actions.taskSearchPanelKeydown?.(event.nativeEvent)} className="task-search-panel">
<div className="local-discovery-search-row od-toolbar">
<label htmlFor="local-discover-search" className="visually-hidden">{"搜索已安装任务"}</label>
<MyControl view={view} as="input" type="search" id="local-discover-search" onInput={event=>view.actions.localDiscoverSearchInput?.(event.nativeEvent)} className="od-field" placeholder="搜索已安装任务…" autoComplete="off" aria-controls="task-installed-cards"/>
</div>
<MyControl view={view} as="div" id="local-discover-filters" className="local-discovery-filters od-segmented" role="group" aria-label="任务筛选">
<MyControl view={view} as="button" type="button" id="local-filter-all" onClick={event=>view.actions.localFilterAllClick?.(event.nativeEvent)} data-local-filter="all" aria-pressed="true">{"全部"}</MyControl>
<MyControl view={view} as="button" type="button" id="local-filter-current" onClick={event=>view.actions.localFilterCurrentClick?.(event.nativeEvent)} data-local-filter="current" aria-pressed="false">{"当前网页"}</MyControl>
<MyControl view={view} as="button" type="button" id="local-filter-disabled" onClick={event=>view.actions.localFilterDisabledClick?.(event.nativeEvent)} data-local-filter="disabled" aria-pressed="false">{"已停用"}</MyControl>
</MyControl>
<MyControl view={view} as="p" id="local-discover-count" className="visually-hidden" aria-live="polite">
</MyControl>
</MyControl>
<label htmlFor="task-installed-list" className="visually-hidden">{"已安装任务"}</label>
<MyControl view={view} as="select" id="task-installed-list" onChange={event=>view.actions.taskInstalledListChange?.(event.nativeEvent)} className="od-field">
<option value="">{"读取已安装任务…"}</option>
</MyControl>
<MyControl view={view} as="div" id="task-installed-cards" className="task-card-list od-stack" aria-label="已安装任务列表">
<MyTaskRows {...(view.data.taskRows||{})} renderWorkspace={()=>
<MyTaskWorkspace view={view}/>}/>
</MyControl>
</MyControl>

<MyControl view={view} as="section" id="scheduled-panel" onKeyDown={event=>view.actions.scheduledPanelKeydown?.(event.nativeEvent)} className="schedule-panel od-stack" aria-label="定时计划">
<header className="schedule-header od-page-head">
<MyControl view={view} as="button" id="schedule-back" onClick={event=>view.actions.scheduleBackClick?.(event.nativeEvent)} className="od-icon-button" type="button" title="返回我的任务" aria-label="返回我的任务">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M19 12H5m7-7-7 7 7 7"/>
</svg>
</MyControl>
<div className="schedule-header-heading">
<MyControl view={view} as="strong" id="schedule-panel-title" className="od-page-title">{"定时计划"}</MyControl>
<MyControl view={view} as="p" id="schedule-panel-subtitle" className="hint">
</MyControl>
</div>
<div className="od-page-actions">
<MyAgentToggle agent={agent} id="my-agent-schedule-toggle"/>
<MyControl view={view} as="button" id="schedule-open-manager" onClick={event=>view.actions.scheduleOpenManagerClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="任务管理" aria-label="任务管理">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M9 6h12M9 12h12M9 18h12M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-create" onClick={event=>view.actions.scheduleCreateClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="新建定时计划" aria-label="新建定时计划">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M12 5v14M5 12h14"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-manager-create" onClick={event=>view.actions.scheduleManagerCreateClick?.(event.nativeEvent)} type="button" className="od-icon-button" aria-label="新建任务（前往开发）" title="新建任务 · 前往开发">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M12 5v14M5 12h14"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-detail-edit" onClick={event=>view.actions.scheduleDetailEditClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="编辑当前计划" aria-label="编辑当前计划">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M12 20h9M16 4l4 4-11 11H5v-4L16 4z"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-detail-delete" onClick={event=>view.actions.scheduleDetailDeleteClick?.(event.nativeEvent)} type="button" className="od-icon-button od-icon-button--danger" title="删除当前计划（需要确认）" aria-label="删除当前计划">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-stop" onClick={event=>view.actions.scheduleStopClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"停止本次"}</MyControl>
</div>
</header>
<MyControl view={view} as="p" id="schedule-message" role="status" aria-live="polite" className="hint">
</MyControl>
<MyControl view={view} as="section" id="schedule-runner-view" className="schedule-runner-view od-stack" aria-label="定时任务运行概览">
<div className="schedule-runner-intro">
<div>
<p className="schedule-runner-kicker">{"可见运行宿主 · Chrome 定时计划"}</p>
<h1>{"运行概览"}</h1>
<p className="hint">{"本页保持打开后可执行获准的到期任务。"}</p>
</div>
<div className="schedule-actions od-toolbar">
<MyControl view={view} as="button" id="schedule-runner-manage" onClick={event=>view.actions.scheduleRunnerManageClick?.(event.nativeEvent)} type="button" className="od-button">{"管理全部计划"}</MyControl>
<MyControl view={view} as="button" id="schedule-runner-refresh" onClick={event=>view.actions.scheduleRunnerRefreshClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"刷新"}</MyControl>
</div>
</div>
<section className="schedule-runner-focus od-surface" aria-labelledby="schedule-runner-focus-title">
<p className="schedule-runner-focus-kicker">{"优先关注"}</p>
<div className="schedule-card-head od-toolbar">
<div>
<MyControl view={view} as="strong" id="schedule-runner-focus-title">{"下一个计划"}</MyControl>
<MyControl view={view} as="p" id="schedule-runner-focus-detail" className="hint">{"暂无已安装计划"}</MyControl>
</div>
<MyControl view={view} as="button" id="schedule-runner-toggle" onClick={event=>view.actions.scheduleRunnerToggleClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"暂停计划"}</MyControl>
</div>
<MyControl view={view} as="p" id="schedule-runner-focus-time" className="schedule-runner-focus-time" aria-live="polite">{"等待计划"}</MyControl>
<MyControl view={view} as="p" id="schedule-runner-explain" className="hint">{"到期时将检查目标网页、固定任务身份和执行槽。"}</MyControl>
<MyControl view={view} as="button" id="schedule-runner-history" onClick={event=>view.actions.scheduleRunnerHistoryClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"查看计划及运行记录"}</MyControl>
</section>
<div className="schedule-runner-metrics" aria-label="运行概况">
<div className="schedule-runner-metric od-surface">
<span>{"运行宿主"}</span>
<MyControl view={view} as="strong" id="schedule-runner-host-status" role="status">{"正在连接…"}</MyControl>
</div>
<div className="schedule-runner-metric od-surface">
<span>{"最近结果"}</span>
<MyControl view={view} as="strong" id="schedule-runner-result">{"尚无记录"}</MyControl>
<MyControl view={view} as="small" id="schedule-runner-result-detail">
</MyControl>
</div>
</div>
<details className="schedule-runner-extra od-disclosure od-disclosure--flat">
<summary>{"其他调度状态和运行说明"}</summary>
<div className="schedule-runner-extra-grid">
<div className="schedule-runner-metric schedule-runner-metric--detail od-surface">
<span>{"下次执行"}</span>
<MyControl view={view} as="strong" id="schedule-runner-next">{"暂无计划"}</MyControl>
<MyControl view={view} as="small" id="schedule-runner-next-detail">
</MyControl>
</div>
<div className="schedule-runner-metric schedule-runner-metric--detail od-surface">
<span>{"当前任务"}</span>
<MyControl view={view} as="strong" id="schedule-runner-current">{"暂无任务运行"}</MyControl>
<MyControl view={view} as="small" id="schedule-runner-current-detail">
</MyControl>
</div>
</div>
<p className="hint">{"定时执行依赖可见宿主、网站授权和原 Controller 执行槽；浏览器关闭时不会唤醒电脑。"}</p>
</details>
</MyControl>
<MyControl view={view} as="div" id="schedule-list-view" className="od-stack">
<MyControl view={view} as="p" id="schedule-host-status" className="hint" role="status">{"正在检查可用运行宿主…"}</MyControl>
<MyControl view={view} as="p" id="schedule-list-summary" className="schedule-list-summary" role="status" aria-live="polite">{"正在读取定时计划…"}</MyControl>
<MyControl view={view} as="div" id="schedule-plan-list" className="od-stack" aria-label="已保存的定时计划">
<SchedulePlanRows {...(view.data.planRows||{})}/>
</MyControl>
<details className="schedule-storage-details od-disclosure">
<summary>{"运行概览与本地记录"}</summary>
<div className="schedule-runner-secondary">
<MyControl view={view} as="button" id="schedule-open-runner" onClick={event=>view.actions.scheduleOpenRunnerClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary" title="在独立标签页打开运行概览" aria-label="打开独立运行页">{"打开运行概览"}</MyControl>
</div>
<MyControl view={view} as="p" id="schedule-storage-status" className="hint" role="status" aria-live="polite">{"历史记录按计划分页展示；未知副作用、未结算执行和审计记录不会自动清除。"}</MyControl>
</details>
</MyControl>
<MyControl view={view} as="section" id="schedule-detail-view" className="schedule-detail-view od-stack" aria-label="计划详情">
<MyScheduleDetail model={view.data.scheduleDetail}/>
</MyControl>
<MyControl view={view} as="form" id="schedule-form" onSubmit={event=>view.actions.scheduleFormSubmit?.(event.nativeEvent)} className="schedule-form od-stack" autoComplete="off" noValidate>
<section className="schedule-form-section" aria-labelledby="schedule-source-section-title">
<MyControl view={view} as="h3" id="schedule-source-section-title" className="schedule-section-title">
<span aria-hidden="true">{"1"}</span>{"名称与执行任务"}</MyControl>
<label className="od-field" htmlFor="schedule-title">{"计划名称\n          "}<MyControl view={view} as="input" id="schedule-title" onInput={event=>view.actions.scheduleTitleInput?.(event.nativeEvent)} type="text" maxLength="100" required aria-describedby="schedule-title-error" placeholder="例如：每天整理网页报告" className="od-field"/>
</label>
<MyControl view={view} as="p" id="schedule-title-error" className="schedule-field-error" role="alert">
</MyControl>
<div className="schedule-source-field">
<label htmlFor="schedule-task-select">{"执行任务（已验证并安装）"}</label>
<div className="schedule-source-row">
<MyControl view={view} as="select" id="schedule-task-select" onInput={event=>view.actions.scheduleTaskSelectInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleTaskSelectChange?.(event.nativeEvent)} required aria-label="选择已安装任务" aria-describedby="schedule-task-version schedule-task-error" className="od-field">
<option value="">{"请选择可用任务"}</option>
</MyControl>
<MyControl view={view} as="button" id="schedule-new-script" onClick={event=>view.actions.scheduleNewScriptClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="新建脚本 · 进入开发" aria-label="新建脚本">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-4-4v8"/>
</svg>
</MyControl>
<MyControl view={view} as="button" id="schedule-manage-tasks" onClick={event=>view.actions.scheduleManageTasksClick?.(event.nativeEvent)} type="button" className="od-icon-button" title="管理任务 · 搜索、启停和卸载" aria-label="管理任务">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M9 6h12M9 12h12M9 18h12M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>
</svg>
</MyControl>
</div>
<MyControl view={view} as="p" id="schedule-task-version" className="hint" aria-live="polite">
</MyControl>
<MyControl view={view} as="p" id="schedule-task-error" className="schedule-field-error" role="alert">
</MyControl>
<MyControl view={view} as="div" id="schedule-task-empty" className="schedule-task-empty od-alert od-alert--warning">
<strong>{"还没有可用于定时执行的任务"}</strong>
<p>{"请先在「开发」中验证并安装 Controller Task，启用任务并确认网站权限。"}</p>
<MyControl view={view} as="button" id="schedule-task-empty-create" onClick={event=>view.actions.scheduleTaskEmptyCreateClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"前往开发并创建任务"}</MyControl>
</MyControl>
</div>
</section>
<section className="schedule-form-section" aria-labelledby="schedule-target-section-title">
<MyControl view={view} as="h3" id="schedule-target-section-title" className="schedule-section-title">
<span aria-hidden="true">{"2"}</span>{"目标网页与可选参数"}</MyControl>
<label className="od-field" htmlFor="schedule-target">{"目标网页 URL\n          "}<MyControl view={view} as="input" id="schedule-target" onInput={event=>view.actions.scheduleTargetInput?.(event.nativeEvent)} type="url" inputMode="url" maxLength="2048" required aria-describedby="schedule-target-error" placeholder="https://example.com/path" className="od-field"/>
</label>
<p className="schedule-field-help">{"仅支持任务已批准的 HTTP(S) 网页，不包含账号密码或 # 片段。"}</p>
<MyControl view={view} as="p" id="schedule-target-error" className="schedule-field-error" role="alert">
</MyControl>
<label className="od-field" htmlFor="schedule-params">{"任务参数（JSON 对象）\n          "}<MyControl view={view} as="textarea" id="schedule-params" onInput={event=>view.actions.scheduleParamsInput?.(event.nativeEvent)} rows="2" spellCheck="false" aria-describedby="schedule-params-error" className="od-field">{"{}"}</MyControl>
</label>
<MyControl view={view} as="p" id="schedule-params-error" className="schedule-field-error" role="alert">
</MyControl>
</section>
<fieldset className="schedule-rule schedule-form-section">
<legend className="schedule-section-title">
<span aria-hidden="true">{"3"}</span>{"执行时间"}</legend>
<div className="schedule-rule-row">
<div className="schedule-rule-field">
<label htmlFor="schedule-kind">{"重复规则"}</label>
<MyControl view={view} as="select" id="schedule-kind" onInput={event=>view.actions.scheduleKindInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleKindChange?.(event.nativeEvent)} aria-describedby="schedule-time-error" className="od-field">
<option value="once">{"执行一次"}</option>
<option value="daily">{"每天"}</option>
<option value="weekly">{"每周"}</option>
<option value="interval">{"每隔一段时间"}</option>
</MyControl>
</div>
<div className="schedule-rule-field">
<MyControl view={view} as="label" id="schedule-timezone-label" htmlFor="schedule-timezone">{"执行时区"}</MyControl>
<div className="schedule-timezone-picker">
<MyControl view={view} as="select" id="schedule-timezone" onInput={event=>view.actions.scheduleTimezoneInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleTimezoneChange?.(event.nativeEvent)} required aria-describedby="schedule-timezone-help schedule-time-error" className="od-field" title="执行时区（保存后固定）">
<option value="">{"正在识别设备时区…"}</option>
</MyControl>
<MyControl view={view} as="p" className="hint schedule-timezone-help" id="schedule-timezone-help">{"默认使用设备时区；计划按所选城市的当地时间执行。"}</MyControl>
</div>
</div>
</div>
<MyControl view={view} as="label" id="schedule-once-field" className="od-field" htmlFor="schedule-once">{"执行日期和时间\n            "}<MyControl view={view} as="input" id="schedule-once" onInput={event=>view.actions.scheduleOnceInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleOnceChange?.(event.nativeEvent)} type="datetime-local" aria-describedby="schedule-time-error" className="od-field"/>
</MyControl>
<MyControl view={view} as="label" id="schedule-clock-field" className="od-field" htmlFor="schedule-clock">{"当地时间\n            "}<MyControl view={view} as="input" id="schedule-clock" onInput={event=>view.actions.scheduleClockInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleClockChange?.(event.nativeEvent)} type="time" aria-describedby="schedule-time-error" className="od-field"/>
</MyControl>
<MyControl view={view} as="fieldset" id="schedule-weekdays-field" onInput={event=>view.actions.scheduleWeekdaysFieldInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleWeekdaysFieldChange?.(event.nativeEvent)} className="schedule-weekdays">
<legend>{"星期（至少选择一天）"}</legend>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-1"/>{"一"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-2"/>{"二"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-3"/>{"三"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-4"/>{"四"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-5"/>{"五"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-6"/>{"六"}</label>
<label>
<MyControl view={view} as="input" type="checkbox" id="my-weekday-0"/>{"日"}</label>
</MyControl>
<MyControl view={view} as="label" id="schedule-interval-field" className="od-field" htmlFor="schedule-minutes">{"间隔分钟（1–10080）\n            "}<MyControl view={view} as="input" id="schedule-minutes" onInput={event=>view.actions.scheduleMinutesInput?.(event.nativeEvent)} onChange={event=>view.actions.scheduleMinutesChange?.(event.nativeEvent)} type="number" aria-describedby="schedule-time-error" min="1" max="10080" step="1" className="od-field"/>
</MyControl>
<MyControl view={view} as="div" id="schedule-next" className="schedule-next-preview" role="status" aria-live="polite">
<span>{"预计下次执行"}</span>
<MyControl view={view} as="strong" id="schedule-next-time">{"选择规则后显示时间"}</MyControl>
<MyControl view={view} as="small" id="schedule-next-zone">{"执行时间使用所选时区；Chrome 关闭期间不会唤醒电脑。"}</MyControl>
</MyControl>
<MyControl view={view} as="p" id="schedule-time-error" className="schedule-field-error" role="alert">
</MyControl>
</fieldset>
<section className="schedule-form-section schedule-form-advanced" aria-labelledby="schedule-advanced-section-title">
<MyControl view={view} as="h3" id="schedule-advanced-section-title" className="schedule-section-title">
<span aria-hidden="true">{"4"}</span>{"高级执行条件"}</MyControl>
<details className="schedule-advanced od-disclosure od-disclosure--flat">
<summary>{"高级选项"}</summary>
<label className="schedule-check">
<MyControl view={view} as="input" type="checkbox" id="schedule-open-target" onChange={event=>view.actions.scheduleOpenTargetChange?.(event.nativeEvent)}/>{"找不到已打开的目标网页时，允许为本次执行新开标签页"}</label>
<label className="od-field" htmlFor="schedule-misfire">{"错过触发\n            "}<MyControl view={view} as="select" id="schedule-misfire" onChange={event=>view.actions.scheduleMisfireChange?.(event.nativeEvent)} className="od-field">
<option value="skip">{"跳过错过的执行"}</option>
<option value="latest-within-hour">{"只补最近 1 小时内的一次"}</option>
</MyControl>
</label>
<label className="od-field" htmlFor="schedule-deadline">{"最长等待执行条件（分钟）\n            "}<MyControl view={view} as="input" id="schedule-deadline" onInput={event=>view.actions.scheduleDeadlineInput?.(event.nativeEvent)} type="number" aria-describedby="schedule-time-error" min="1" max="60" step="1" className="od-field"/>
</label>
</details>
<label className="schedule-check">
<MyControl view={view} as="input" type="checkbox" id="schedule-paused" onChange={event=>view.actions.schedulePausedChange?.(event.nativeEvent)}/>{"创建后先暂停"}</label>
</section>
<h3 className="schedule-section-title schedule-review-title">
<span aria-hidden="true">{"5"}</span>{"检查并保存"}</h3>
<MyControl view={view} as="div" id="schedule-save-confirm" className="schedule-save-confirm od-surface" role="group" aria-label="确认定时计划">
<strong>{"确认计划及固定任务授权"}</strong>
<MyControl view={view} as="p" id="schedule-save-summary">
</MyControl>
<p className="hint">{"保存后仅在已授权网页及合法可见运行宿主内按时尝试执行。浏览器关闭时不会自动操作网页。"}</p>
<div className="schedule-actions od-toolbar">
<MyControl view={view} as="button" id="schedule-confirm-yes" onClick={event=>view.actions.scheduleConfirmYesClick?.(event.nativeEvent)} type="button" className="od-button">{"确认并保存"}</MyControl>
<MyControl view={view} as="button" id="schedule-confirm-no" onClick={event=>view.actions.scheduleConfirmNoClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"返回修改"}</MyControl>
</div>
</MyControl>
<MyControl view={view} as="div" id="schedule-discard-confirm" className="schedule-discard-confirm od-surface" role="group" aria-label="离开计划编辑">
<strong>{"放弃尚未保存的修改？"}</strong>
<p>{"离开编辑后，这些修改不会自动保存。"}</p>
<div className="schedule-actions od-toolbar">
<MyControl view={view} as="button" id="schedule-discard-yes" onClick={event=>view.actions.scheduleDiscardYesClick?.(event.nativeEvent)} type="button" className="od-button schedule-danger-button">{"放弃修改"}</MyControl>
<MyControl view={view} as="button" id="schedule-discard-no" onClick={event=>view.actions.scheduleDiscardNoClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"继续编辑"}</MyControl>
</div>
</MyControl>
<div className="schedule-actions od-toolbar">
<MyControl view={view} as="button" type="submit" id="schedule-save" className="od-button">{"检查并确认"}</MyControl>
<MyControl view={view} as="button" type="button" id="schedule-cancel" onClick={event=>view.actions.scheduleCancelClick?.(event.nativeEvent)} className="od-button od-button--secondary">{"返回列表"}</MyControl>
</div>
</MyControl>
<MyControl view={view} as="div" id="schedule-task-manager" className="od-stack">
<MyControl view={view} as="button" id="schedule-manager-back" onClick={event=>view.actions.scheduleManagerBackClick?.(event.nativeEvent)} type="button" className="od-button od-button--secondary">{"← 返回计划"}</MyControl>
<div className="schedule-manager-controls">
<label className="od-field" htmlFor="schedule-manager-search">{"搜索已安装任务\n            "}<MyControl view={view} as="input" id="schedule-manager-search" onInput={event=>view.actions.scheduleManagerSearchInput?.(event.nativeEvent)} type="search" placeholder="任务名称 / ID" className="od-field"/>
</label>
<label className="od-field" htmlFor="schedule-manager-filter">{"筛选任务\n            "}<MyControl view={view} as="select" id="schedule-manager-filter" onChange={event=>view.actions.scheduleManagerFilterChange?.(event.nativeEvent)} className="od-field">
<option value="all">{"全部"}</option>
<option value="enabled">{"已启用"}</option>
<option value="disabled">{"已停用"}</option>
</MyControl>
</label>
</div>
<MyControl view={view} as="p" id="schedule-manager-count" className="hint" role="status" aria-live="polite">
</MyControl>
<MyControl view={view} as="div" id="schedule-manager-list" className="od-stack" aria-label="任务管理列表">
<ScheduleManagerRows {...(view.data.managerRows||{})}/>
<MyCopyConfirmation view={view}/>
</MyControl>
<MyControl view={view} as="div" id="schedule-uninstall-confirm" className="od-surface">
<MyControl view={view} as="p" id="schedule-uninstall-label">
</MyControl>
<div className="schedule-actions od-toolbar">
<MyControl view={view} as="button" type="button" id="schedule-uninstall-yes" onClick={event=>view.actions.scheduleUninstallYesClick?.(event.nativeEvent)} className="od-button">{"确认卸载"}</MyControl>
<MyControl view={view} as="button" type="button" id="schedule-uninstall-no" onClick={event=>view.actions.scheduleUninstallNoClick?.(event.nativeEvent)} className="od-button od-button--secondary">{"取消"}</MyControl>
</div>
</MyControl>
</MyControl>
</MyControl>

  </div>;
}
