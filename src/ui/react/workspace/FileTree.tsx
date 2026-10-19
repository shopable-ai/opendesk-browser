import * as React from 'react';
import {Button, IconButton} from '../components/ui/button';
import {translate as t} from '../../../i18n/index.js';
import {workspaceFileIconVariant} from '../../../native-agent/workspace-file-icons.js';
import {useWorkspaceLocale, WorkspaceIcon} from './view-helpers';

export type TreeRow = {path: string; name: string; kind: string; depth: number; expanded?: boolean; truncated?: boolean; pos?: number; size?: number};
type Props = {
  rows: TreeRow[]; workspaceId: string; selectedPath?: string; busy: boolean; connected: boolean; message: string;
  directoryName?: string;
  runAction?: (event: React.SyntheticEvent<HTMLElement>, action: () => unknown) => unknown;
  actions: {read: (path: string) => unknown; toggleDirectory: (path: string) => unknown; refreshTree: () => unknown; collapseTree: () => unknown};
};

export function FileTree({rows, workspaceId, selectedPath, busy, connected, message, directoryName, actions, runAction}: Props) {
  useWorkspaceLocale();
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const [focus, setFocus] = React.useState({workspaceId, path: ''});
  const focusedPath = focus.workspaceId === workspaceId && rows.some(row => row.path === focus.path)
    ? focus.path : rows.find(row => row.path === selectedPath)?.path ?? rows[0]?.path;
  const parent = selectedPath?.includes('/') ? selectedPath.slice(0, selectedPath.lastIndexOf('/')) : '';
  const location = directoryName || (parent ? '/' + parent : t('workspace.rootDirectory'));
  const disabled = busy || !connected;
  const positions = React.useMemo(() => {
    const groups = new Map<string, TreeRow[]>();
    for (const row of rows) {
      const parent = row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : '';
      const key = `${row.depth}:${parent}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    const positions = new Map<string, {pos: number; size: number}>();
    for (const siblings of groups.values()) siblings.forEach((row, index) => positions.set(row.path, {pos: index + 1, size: siblings.length}));
    return positions;
  }, [rows]);
  const run = (event: React.SyntheticEvent<HTMLElement>, action: () => unknown) => runAction ? runAction(event, action) : action();
  const move = (row?: TreeRow) => {
    if (!row) return;
    setFocus({workspaceId, path: row.path});
    refs.current.get(row.path)?.focus();
  };
  const activate = (row: TreeRow) => row.kind === 'directory' ? actions.toggleDirectory(row.path) : actions.read(row.path);
  function keydown(event: React.KeyboardEvent, row: TreeRow, index: number) {
    if (disabled) return;
    let next: TreeRow | undefined;
    switch (event.key) {
      case 'ArrowDown': next = rows[Math.min(index + 1, rows.length - 1)]; break;
      case 'ArrowUp': next = rows[Math.max(index - 1, 0)]; break;
      case 'Home': next = rows[0]; break;
      case 'End': next = rows.at(-1); break;
      case 'ArrowRight':
        if (row.kind === 'directory') {
          if (!row.expanded) run(event, () => actions.toggleDirectory(row.path));
          else if (rows[index + 1]?.depth > row.depth) next = rows[index + 1];
        }
        break;
      case 'ArrowLeft':
        if (row.kind === 'directory' && row.expanded) run(event, () => actions.toggleDirectory(row.path));
        else next = rows.slice(0, index).reverse().find(candidate => candidate.depth < row.depth);
        break;
      default: return; // Native button Enter/Space activation is retained.
    }
    event.preventDefault();
    move(next);
  }
  return <details className="file-rail" open aria-label={t('workspace.filesTree')}>
    <summary className="rail-toggle" aria-label={t('workspace.expandFiles')}><strong>{t('workspace.files')}</strong><WorkspaceIcon name="chevron" /></summary>
    <div className="rail-header"><div className="rail-title"><strong>{t('workspace.files')}</strong></div>
      <div className="rail-actions" role="group" aria-label={t('workspace.treeActions')}>
        <IconButton id="refresh-files" className="tree-action" label={t('workspace.refreshTree')} disabled={disabled || !workspaceId} onClick={event => run(event, actions.refreshTree)}><WorkspaceIcon name="refresh" /></IconButton>
        <IconButton id="parent-directory" className="tree-action" label={t('workspace.collapseAll')} disabled={disabled || !rows.some(row => row.path && row.expanded)} onClick={() => {move(rows[0]); actions.collapseTree();}}><WorkspaceIcon name="collapse" /></IconButton>
      </div>
    </div>
    <div className="tree-location" title={t('workspace.currentDirectory')}><span className="tree-location-label">{t('workspace.location')}</span><span id="directory-name" title={location}>{location}</span></div>
    <div id="file-list" className="file-list" data-icon-system="local-svg" role="tree" aria-label={t('workspace.authorizedTree')}>
      {rows.map((row, index) => {
        const directory = row.kind === 'directory';
        const selected = !directory && row.path === selectedPath;
        const variant = workspaceFileIconVariant(row.kind, row.name, !!row.expanded);
        return <Button key={`${workspaceId}:${row.kind}:${row.path}`} variant="plain"
          ref={node => {if (node) refs.current.set(row.path, node); else refs.current.delete(row.path);}}
          className={`file-entry${selected ? ' selected' : ''}`} data-path={row.path} data-kind={row.kind}
          role="treeitem" aria-level={row.depth + 1} aria-posinset={row.pos ?? positions.get(row.path)?.pos} aria-setsize={row.size ?? positions.get(row.path)?.size}
          aria-selected={selected} aria-expanded={directory ? !!row.expanded : undefined}
          tabIndex={row.path === focusedPath ? 0 : -1} disabled={disabled} title={row.path ? '/' + row.path : t('workspace.authorizedTree')}
          style={{'--tree-indent': `${Math.min(row.depth, 16) * 16 + 8}px`} as React.CSSProperties}
          onFocus={() => setFocus({workspaceId, path: row.path})} onKeyDown={event => keydown(event, row, index)} onClick={event => run(event, () => activate(row))}>
          {directory ? <WorkspaceIcon name="chevron" className="tree-caret" data-expanded={!!row.expanded} /> : <span className="tree-caret tree-caret-empty" aria-hidden="true" />}
          <WorkspaceIcon name={variant} className="file-icon" data-variant={variant} />
          <span className="file-name">{row.path ? row.name : t('workspace.rootDirectory')}</span>
          {row.truncated && <span className="tree-truncated" title={t('runtime.nativeTruncated')}>{t('runtime.partial')}</span>}
        </Button>;
      })}
    </div>
    <p id="tree-message" className="tree-message" role="status" aria-live="polite">{message}</p>
    <p className="rail-note">{t('workspace.treeHelp')}</p>
  </details>;
}
