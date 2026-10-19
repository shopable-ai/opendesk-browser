import * as React from 'react';
import {Button, IconButton} from '../components/ui/button';
import {getLocalePreference, LOCALE_NAMES, setLocalePreference, SUPPORTED_LOCALES, translate as t} from '../../../i18n/index.js';
import {ChatController, ChatEditPanel} from './ChatEditPanel';
import {FileTree, TreeRow} from './FileTree';
import {Store, useControlAction, useWorkspaceLocale, WorkspaceIcon} from './view-helpers';

type WorkspaceSnapshot = {
  connected: boolean; busy: boolean; demo: boolean; workspaceId: string;
  workspaces: {workspaceId: string; name: string; label?: string; access: string; sourceId: string}[];
  targets: {tabId: number; title: string; url: string}[]; targetId: string;
  file: {workspaceId: string; path: string; content: string; baseContent: string; sha256: string | null; dirty: boolean; unknown: boolean; remote: {content: string} | null; importedDraft: boolean} | null;
  tree: TreeRow[]; view: string; status: {text: string; error: boolean}; access: string; writable: boolean;
  creationPending: {workspaceId: string; path: string} | null; capabilities: Record<string, boolean>;
  presentation: {connectionLabel: string; fileTitle: string; fileMeta: string; draftLabel: string;
    previewHTML: string; previewKind: string; previewURL: string; connectedPreviewURL: string;
    saveAsPath: string; accessReason: string; treeMessage: string; directoryName: string; pendingSource?: boolean;
    toolPreviewStatus: {text: string; error: boolean}; actionReview: {message: string; button: string} | null};
};
type KnowledgeController = Store<{pending: {title: string; filename: string} | null; busy: boolean; disabled: boolean}> & {importDraft: (event: Event) => unknown};
type WorkspaceActions = {
  setDraft: (text: string) => unknown; read: (path: string) => unknown; save: () => unknown; reread: () => unknown; discardDraft: () => unknown;
  saveAs: (path: string) => unknown; checkCreated: () => unknown; useDisk: () => unknown; refresh: () => unknown;
  selectWorkspace: (id: string) => unknown; setTarget: (id: string) => unknown; toggleDirectory: (path: string) => unknown;
  refreshTree: () => unknown; collapseTree: () => unknown; chooseView: (view: string) => unknown; setSaveAsPath: (path: string) => unknown;
  setPreviewURL: (url: string) => unknown; connectPreview: () => unknown; openPreview: () => unknown; copyContent: () => unknown;
  pagePreview: (remove: boolean) => unknown; openSettings: () => unknown; openSidebar: (event: Event) => unknown; openWorkbench: (event: Event) => unknown;
  previewTool: (event: Event) => unknown; confirmAction: () => unknown; cancelAction: () => unknown;
};
export type WorkspaceController = Store<WorkspaceSnapshot> & {actions: WorkspaceActions; chatEdit: ChatController; knowledgeHandoff: KnowledgeController};

function KnowledgeHandoff({controller}: {controller: KnowledgeController}) {
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <section id="knowledge-handoff" className="notice" hidden={!state.pending} aria-label={t('workspace.knowledgeDraft')}>
    <strong id="knowledge-handoff-title">{state.pending?.title}</strong><p>{t('workspace.knowledgeHint')}</p>
    <Button id="knowledge-handoff-import" disabled={state.disabled || state.busy} onClick={event => controller.importDraft(event.nativeEvent)}>{t('workspace.importKnowledge')}</Button>
  </section>;
}

export function WorkspaceView({controller}: {controller: WorkspaceController}) {
  useWorkspaceLocale();
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const {actions} = controller;
  const {file, busy, connected, demo, presentation: p, capabilities: c} = state;
  const editor = React.useRef<HTMLTextAreaElement>(null);
  const runAction = useControlAction(editor);
  const click = (action: () => unknown) => (event: React.MouseEvent<HTMLButtonElement>) => runAction(event, action);
  const hasTarget = !demo && state.targets.some(target => String(target.tabId) === state.targetId);
  const canPreviewPage = !busy && connected && !!file && hasTarget;
  return <main id="file-workspace" className="min-w-0" data-workspace-ui="svg-r3" aria-busy={busy}>
    <header className="workspace-header"><div className="wordmark"><span className="brand-icon" aria-hidden="true">O</span><div><strong>OpenDesk</strong><span className="header-subtitle">{t('workspace.heading')}</span></div></div>
      <div className="header-actions"><label className="locale-switcher"><span>{t('common.language')}</span>
        <select id="workspace-locale" aria-label={t('common.language')} value={getLocalePreference()} onChange={event => setLocalePreference(event.target.value)}>
          <option value="auto">{t('common.browserLanguage')}</option>{SUPPORTED_LOCALES.map(locale => <option key={locale} value={locale}>{LOCALE_NAMES[locale]}</option>)}
        </select></label>
        <span id="connection-label" className={`connection${connected ? ' ready' : ''}`}>{p.connectionLabel || t('workspace.connecting')}</span>
        <IconButton id="refresh-connection" className="workspace-icon-action" label={t('workspace.refreshConnection')} title={t('workspace.refreshConnectionTitle')} disabled={busy} onClick={click(actions.refresh)}><WorkspaceIcon name="refresh" /></IconButton>
        <IconButton id="open-settings" className="workspace-icon-action" label={t('workspace.nativeSettings')} onClick={click(actions.openSettings)}><WorkspaceIcon name="settings" /></IconButton>
      </div>
    </header>
    <div id="demo-banner" className="demo-banner" hidden={!demo}>{t('workspace.demoBanner')}</div>
    <section className="workspace-toolbar" aria-label={t('workspace.toolbar')}>
      <label className="workspace-choice">{t('workspace.workspace')}<select id="workspace-picker" aria-label={t('workspace.authorizedWorkspaces')} value={state.workspaceId} disabled={busy || !connected} onChange={event => runAction(event, () => actions.selectWorkspace(event.target.value))}>
        {(!state.workspaces.length || p.pendingSource) && <option value="">{t('workspace.loading')}</option>}
        {state.workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.label || workspace.name}</option>)}
      </select></label>
      <label className="target-choice">{t('workspace.targetPage')}<select id="target-picker" aria-label={t('workspace.targetWeb')} value={state.targetId} disabled={busy || demo} onChange={event => actions.setTarget(event.target.value)}>
        <option value="">{t('workspace.choosePage')}</option>{state.targets.map(target => <option key={target.tabId} value={target.tabId}>{target.title || target.url}</option>)}
      </select></label>
      <div className="workspace-quick-actions" role="group" aria-label={t('workspace.navigation')}>
        <IconButton id="open-sidebar" className="workspace-icon-action" label={t('workspace.openSidebar')} disabled={!c.openSidebar} onClick={event => actions.openSidebar(event.nativeEvent)}><WorkspaceIcon name="sidebar" /></IconButton>
        <IconButton id="open-workbench" className="workspace-icon-action" label={t('workspace.returnWorkbench')} disabled={!c.openWorkbench} onClick={event => actions.openWorkbench(event.nativeEvent)}><WorkspaceIcon name="back" /></IconButton>
      </div>
    </section>
    <p id="workspace-status" className={`workspace-status${state.status.error ? ' error' : ''}`} role="status" aria-live="polite">{state.status.text}</p>
    <section id="workspace-action-review" className="notice" role="group" aria-label={t('workspace.unsavedReview')} hidden={!p.actionReview}>
      <strong>{t('workspace.unsavedHeading')}</strong><p id="workspace-action-summary" role="status">{p.actionReview?.message}</p>
      <div className="chat-edit-actions"><Button id="workspace-action-continue" onClick={() => actions.confirmAction()}>{p.actionReview?.button || t('common.continue')}</Button><Button id="workspace-action-cancel" onClick={() => actions.cancelAction()}>{t('common.cancelPreserve')}</Button></div>
    </section>
    <KnowledgeHandoff controller={controller.knowledgeHandoff} />
    <details className="workspace-tool-preview" aria-label={t('workspace.toolReadonly')}><summary><strong>{t('workspace.customTool')}</strong><span id="preview-sidebar-tool-status" className={p.toolPreviewStatus.error ? 'error' : undefined} role="status" aria-live="polite">{p.toolPreviewStatus.text || t('workspace.toolAwaiting')}</span></summary>
      <div className="tool-preview-body"><p>{t('workspace.toolHint')}</p><Button id="preview-sidebar-tool" disabled={!c.previewTool} onClick={event => runAction(event, () => actions.previewTool(event.nativeEvent))}>{t('workspace.previewTool')}</Button></div>
    </details>
    <aside id="workspace-access-note" className="workspace-access-note" hidden={!connected || state.access !== 'read-only'} aria-label={t('workspace.directoryAccess')}><strong>{t('workspace.readonly')}</strong><p id="workspace-access-reason">{p.accessReason}</p><p>{t('workspace.readonlyHint')}</p></aside>
    <div className="workspace-layout">
      <FileTree rows={state.tree} workspaceId={state.workspaceId} selectedPath={file?.workspaceId === state.workspaceId ? file.path : undefined} busy={busy} connected={connected} message={p.treeMessage} directoryName={p.directoryName} actions={actions} runAction={runAction} />
      <section className="workstage" aria-label={t('workspace.stage')}>
        <header className="file-heading"><div><h1 id="file-title" title={file?.path || t('workspace.openFile')}>{p.fileTitle || t('workspace.openFile')}</h1><span id="file-meta" title={p.fileMeta}>{p.fileMeta || t('workspace.initialMeta')}</span></div>
          <div className="file-actions" role="group" aria-label={t('workspace.fileActions')}>
            <IconButton id="reload-file" className="workspace-icon-action" label={t('workspace.reloadFile')} title={t('workspace.reloadHint')} disabled={!c.reread} onClick={click(actions.reread)}><WorkspaceIcon name="refresh" /></IconButton>
            <IconButton id="copy-content" className="workspace-icon-action" label={t('workspace.copyContent')} disabled={busy || !file} onClick={click(actions.copyContent)}><WorkspaceIcon name="copy" /></IconButton>
            <Button id="discard-file-draft" title={t('workspace.discardHint')} disabled={!c.discardDraft} onClick={click(actions.discardDraft)}><WorkspaceIcon name="discard" />{t('workspace.discardDraft')}</Button>
            <Button id="save-file" className="primary" disabled={!c.save} onClick={click(actions.save)}><WorkspaceIcon name="save" />{t('common.save')}</Button>
          </div>
        </header>
        <div className="view-toolbar"><div className="view-tabs" role="group" aria-label={t('workspace.viewMode')}>
          {([['preview', 'workspace.preview'], ['source', 'workspace.source'], ['split', 'workspace.compare'], ['app', 'workspace.localApp']] as const).map(([view, label]) => <Button key={view} data-view={view} aria-pressed={state.view === view} onClick={() => actions.chooseView(view)}>{t(label)}</Button>)}
        </div><Button id="show-page-preview" disabled={!canPreviewPage} onClick={click(() => actions.pagePreview(false))}>{t('workspace.showOnPage')}</Button><Button id="remove-page-preview" disabled={busy || !hasTarget} onClick={click(() => actions.pagePreview(true))}>{t('workspace.removeOnPage')}</Button></div>
        <details className="page-disclosure"><summary>{t('workspace.pagePreviewExplanation')}</summary><p>{t('workspace.pagePreviewNote')}</p></details>
        <div id="file-surface" className="file-surface" data-view={state.view} hidden={state.view === 'app'}>
          <section className="source-pane"><label htmlFor="file-editor" className="pane-label">{t('workspace.source')} <span id="draft-label" className={file?.dirty || file?.unknown ? 'dirty' : undefined}>{p.draftLabel || t('workspace.unopened')}</span></label>
            <textarea ref={editor} id="file-editor" spellCheck={false} aria-label={t('workspace.fileSource')} placeholder={t('workspace.editorPlaceholder')} disabled={!file} value={file?.content ?? ''} onChange={event => actions.setDraft(event.target.value)} />
          </section>
          <section className="preview-pane"><div className="pane-label">{t('workspace.preview')} <span id="preview-kind">{p.previewKind || t('workspace.safeStatic')}</span></div>
            <div id="file-preview-slot"><iframe id="file-preview" title={t('workspace.preview')} sandbox="" referrerPolicy="no-referrer" srcDoc={p.previewHTML} /></div>
          </section>
        </div>
        <section id="app-surface" className="app-surface" hidden={state.view !== 'app'}><div className="app-controls"><label htmlFor="preview-url">{t('workspace.localAppAddress')}</label>
          <div className="input-row"><input id="preview-url" type="url" value={p.previewURL} aria-label={t('workspace.localPreviewAddress')} onChange={event => actions.setPreviewURL(event.target.value)} /><Button id="connect-preview" onClick={click(actions.connectPreview)}>{t('workspace.connectPreview')}</Button>
            <IconButton id="open-preview-tab" className="workspace-icon-action" label={t('workspace.openAppTab')} title={t('workspace.openAppTabHint')} onClick={click(actions.openPreview)}><WorkspaceIcon name="external" /></IconButton></div><p>{t('workspace.previewAppNote')}</p></div>
          <div id="app-preview-slot"><iframe id="app-preview" title={t('workspace.localApp')} sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" src={p.connectedPreviewURL || undefined} /></div>
        </section>
        <ChatEditPanel controller={controller.chatEdit} demo={demo} runAction={runAction} />
        <section id="conflict-panel" className="conflict-panel" hidden={!file?.remote}><strong>{t('workspace.diskConflict')}</strong><p>{t('workspace.compareDisk')}</p><details><summary>{t('workspace.viewDisk')}</summary><pre id="disk-version">{file?.remote?.content}</pre></details><Button id="use-disk" disabled={!c.useDisk} onClick={click(actions.useDisk)}>{t('workspace.useDisk')}</Button></section>
        <footer className="file-footer"><label htmlFor="save-as-path">{t('workspace.saveAs')}</label><input id="save-as-path" placeholder={t('workspace.pathPlaceholder')} aria-label={t('workspace.newRelativePath')} value={p.saveAsPath} disabled={busy} onChange={event => actions.setSaveAsPath(event.target.value)} />
          <Button id="save-as" disabled={!c.saveAs} onClick={click(() => actions.saveAs(p.saveAsPath))}>{t('workspace.createFile')}</Button><Button id="check-created" hidden={!state.creationPending} disabled={!c.checkCreated} onClick={click(actions.checkCreated)}>{t('workspace.checkFile')}</Button><span id="file-limits">{t('workspace.fileLimit')}</span></footer>
      </section>
    </div>
    <footer className="workspace-footer"><span>{t('workspace.localOnly')}</span><details className="workspace-technical"><summary>{t('workspace.technical')}</summary><p>{t('workspace.technicalInfo')}</p></details></footer>
  </main>;
}
