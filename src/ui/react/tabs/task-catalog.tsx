import * as React from 'react';
import {MyControl} from './my-controls.tsx';

// Presentation only; the existing controller owns catalog identity and actions.
export function TaskCatalogPage({view,hidden=false}){
  React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const catalog=view.data.catalogRows||{rows:[],selectedKey:''};
  const detail=view.data.catalogDetail;
  const filters=[['all','全部'],['installed','已安装'],['available','可安装'],['candidate','待验证']];

  return <MyControl view={view} as="section" id="workbench-discover" hidden={hidden}
    className="od-page" data-workbench-page="catalog" aria-labelledby="discover-heading">
    <div className="catalog-section od-stack">
      <header className="catalog-header od-page-head">
        <h2 id="discover-heading" className="od-page-title">本地任务目录</h2>
        <div className="od-page-actions">
          <MyControl view={view} as="button" id="task-catalog-refresh" type="button"
            className="od-button od-button--secondary"
            onClick={event=>view.actions.taskCatalogRefreshClick?.(event.nativeEvent)}>刷新目录</MyControl>
        </div>
      </header>

      <div>
        <label htmlFor="task-search" className="visually-hidden">搜索本地任务</label>
        <MyControl view={view} as="input" id="task-search" type="search" className="od-field"
          placeholder="搜索任务名称、用途、作者或网站…" autoComplete="off" aria-controls="task-catalog-cards"
          onInput={event=>view.actions.taskSearchInput?.(event.nativeEvent)}/>
        <div id="task-categories" className="category-chips" role="group" aria-label="任务分类">
          {filters.map(([filter,label])=><button key={filter} type="button"
            className={'category-chip'+((catalog.filter||'all')===filter?' selected':'')}
            data-catalog-filter={filter} aria-pressed={(catalog.filter||'all')===filter}
            aria-controls="task-catalog-cards"
            onClick={()=>view.actions.taskCatalogFilterClick?.(filter)}>{label}</button>)}
        </div>
        <MyControl view={view} as="p" id="task-catalog-count" className="hint" aria-live="polite"/>
      </div>

      <div className="catalog-layout">
        <div id="task-catalog-cards" className="catalog-card-grid" role="group" aria-label="本地任务列表">
          {!catalog.rows.length&&<p className="task-search-empty">暂无匹配的本地任务，可刷新目录或导入任务包。</p>}
          {catalog.rows.map(row=><button key={row.key} type="button"
            className={'catalog-card'+(row.key===catalog.selectedKey?' selected':'')}
            data-candidate-key={row.key} aria-pressed={row.key===catalog.selectedKey}
            aria-controls="task-catalog-detail" onClick={()=>view.actions.taskCatalogSelect?.(row.key)}>
            <strong>{row.title}</strong>
            <small>{row.description}</small>
            <span className="catalog-card-state">{row.state}</span>
          </button>)}
        </div>

        <aside className="catalog-reader od-surface" aria-label="选中任务详情与安装">
          <label htmlFor="task-catalog-list" className="visually-hidden">候选版本</label>
          <MyControl view={view} as="select" id="task-catalog-list" className="od-field" hidden
            onChange={event=>view.actions.taskCatalogListChange?.(event.nativeEvent)}/>
          <MyControl view={view} id="task-catalog-detail" className="task-detail" aria-live="polite">
            {detail?<React.Fragment key={detail.key}>
              <h3>{detail.title}</h3>
              <p className="catalog-reader-desc">{detail.description}</p>
              <div className="catalog-reader-facts">
                {(detail.facts||[]).map(fact=><div key={fact.name} className="catalog-reader-fact">
                  <span>{fact.name}</span><strong>{fact.value}</strong>
                </div>)}
              </div>
              <p className="catalog-reader-note">{detail.note}</p>
              {detail.addedSites?.length>0&&<p className="catalog-reader-note">
                新增网站范围：{detail.addedSites.join('、')}。请核对后再安装。
              </p>}
              <p>{detail.paramsNote}</p>
              <details className="od-disclosure od-disclosure--flat">
                <summary>固定版本与哈希</summary>
                <pre>{detail.hashes}</pre>
              </details>
              <details className="catalog-source-review od-disclosure od-disclosure--flat"
                onToggle={event=>{if(event.currentTarget.open)view.actions.taskCatalogSourceOpen?.(detail.key);}}>
                <summary>查看固定版本源码（只读）</summary>
                {detail.sourceError&&<p role="alert">{detail.sourceError}</p>}
                <pre>{detail.source}</pre>
              </details>
            </React.Fragment>:<p>选中任务后查看作者、网站、权限、版本及验证状态。</p>}
          </MyControl>
          <p className="catalog-reader-note">查看源码不会运行任务。安装仅针对选定固定版本，网站权限由现有授权流程确认。</p>
          <div className="catalog-install">
            <MyControl view={view} as="button" id="task-install" type="button" className="od-button od-button--primary"
              onClick={event=>view.actions.taskInstallClick?.(event.nativeEvent)}>安装选定版本</MyControl>
          </div>
          <MyControl view={view} as="p" id="task-install-feedback" className="install-feedback" role="status" aria-live="polite"/>
          <MyControl view={view} as="details" id="catalog-verification" className="od-disclosure od-disclosure--flat">
            <summary>开发者：核对证据与设为本地可用</summary>
            <div className="od-stack">
              <label htmlFor="task-verify-run">已完成的真实运行 ID</label>
              <MyControl view={view} as="input" id="task-verify-run" className="od-field" autoComplete="off"
                placeholder="与相同源码、网站和实际运行结果对应"/>
              <div className="od-toolbar">
                <MyControl view={view} as="button" id="task-verify" type="button" className="od-button od-button--secondary"
                  onClick={event=>view.actions.taskVerifyClick?.(event.nativeEvent)}>核对运行证据</MyControl>
                <MyControl view={view} as="button" id="task-publish" type="button" className="od-button od-button--secondary"
                  onClick={event=>view.actions.taskPublishClick?.(event.nativeEvent)}>设为本地可用</MyControl>
              </div>
            </div>
          </MyControl>
        </aside>
      </div>

      <div className="od-stack">
        <label htmlFor="task-package-file">导入任务包 JSON、程序草稿 JSON 或 .js 文件</label>
        <MyControl view={view} as="input" id="task-package-file" type="file" className="od-field"
          accept=".json,.js,application/json,text/javascript"
          onChange={event=>view.actions.taskPackageFileChange?.(event.nativeEvent)}/>
        <MyControl view={view} as="p" id="task-catalog-status" className="hint" role="status" aria-live="polite"/>
      </div>
    </div>
  </MyControl>;
}
