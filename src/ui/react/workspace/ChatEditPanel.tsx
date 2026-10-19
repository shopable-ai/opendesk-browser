import * as React from 'react';
import {Button} from '../components/ui/button';
import {translate as t} from '../../../i18n/index.js';
import {Store, useWorkspaceLocale} from './view-helpers';

export type ChatSnapshot = {
  task: string; requestPath: string; answer: string; prompt: string; contextFile: string; contextBinding: string;
  proposal: {path: string; before: string; content: string; bytes?: number} | null;
  proposalBefore: string; proposalAfter: string; proposalSummary?: string;
  status: {text: string; error: boolean}; stages: string | Record<string, string>;
  resultState: string; resultText: string; receipt: string; controls: Record<string, boolean>; demo?: boolean;
};
type ChatAction = 'prepareEdit' | 'prepareFileRequest' | 'fillContext' | 'refillResult' | 'copyContext' | 'readChatGPT' | 'review' | 'adopt' | 'discard' | 'copyReceipt' | 'demoAnswer';
export type ChatController = Store<ChatSnapshot> & {actions: Record<ChatAction, () => unknown> & {
  setTask: (text: string) => unknown; setRequestPath: (text: string) => unknown; setAnswer: (text: string) => unknown;
}};
type Props = {controller: ChatController; demo?: boolean; runAction?: (event: React.SyntheticEvent<HTMLElement>, action: () => unknown) => unknown};

export function ChatEditPanel({controller, demo, runAction}: Props) {
  useWorkspaceLocale();
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const {actions} = controller;
  const enabled = (name: string) => state.controls[name] === true;
  const act = (name: ChatAction) => (event: React.MouseEvent<HTMLButtonElement>) => runAction ? runAction(event, () => actions[name]()) : actions[name]();
  const stages = typeof state.stages === 'string' ? state.stages : Object.values(state.stages).join(' · ');
  return <details className="chat-edit-panel">
    <summary><strong>{t('workspace.chatEditing')}</strong><span>{t('workspace.chatFlow')}</span></summary>
    <div className="chat-edit-body">
      <label htmlFor="edit-task">{t('workspace.editTask')}</label>
      <input id="edit-task" maxLength={2000} placeholder={t('workspace.editTaskPlaceholder')} value={state.task} disabled={!enabled('setTask')} onChange={event => actions.setTask(event.target.value)} />
      <div className="chat-request-path"><label htmlFor="chat-request-path">{t('workspace.initialRelativePath')}</label>
        <input id="chat-request-path" value={state.requestPath} placeholder="README.md" aria-label={t('workspace.firstReadPath')} disabled={!enabled('setRequestPath')} onChange={event => actions.setRequestPath(event.target.value)} /></div>
      <div className="chat-edit-actions">
        <Button id="prepare-file-request" className="primary" disabled={!enabled('prepareFileRequest')} onClick={act('prepareFileRequest')}>{t('workspace.prepareRequest')}</Button>
        <Button id="fill-chat-context" disabled={!enabled('fillContext')} onClick={act('fillContext')}>{t('workspace.fillContext')}</Button>
        <Button id="prepare-edit" disabled={!enabled('prepareEdit')} onClick={act('prepareEdit')}>{t('workspace.exportContext')}</Button>
        <Button id="copy-edit-context" disabled={!enabled('copyContext')} onClick={act('copyContext')}>{t('workspace.copyContext')}</Button>
        <Button id="read-chatgpt-edit" disabled={!enabled('readChatGPT')} onClick={act('readChatGPT')}>{t('workspace.processReply')}</Button>
        <Button id="demo-edit-answer" hidden={!(state.demo ?? demo)} disabled={!enabled('demoAnswer')} onClick={act('demoAnswer')}>{t('workspace.demoReply')}</Button>
      </div>
      <p id="chat-edit-status" className={`chat-edit-status${state.status.error ? ' error' : ''}`} role="status" aria-live="polite">{state.status.text || t('workspace.chatIntro')}</p>
      <p id="chat-request-stages" className="chat-edit-note" role="status">{stages}</p>
      <details id="chat-file-result-panel" hidden={!state.resultText}><summary>{t('workspace.nativeFileResult')}</summary>
        <p id="chat-result-state" className="chat-edit-note">{state.resultState}</p>
        <textarea id="chat-file-result" readOnly spellCheck={false} aria-label={t('workspace.nativeResultLabel')} value={state.resultText} />
        <Button id="refill-chat-result" disabled={!enabled('refillResult')} onClick={act('refillResult')}>{t('workspace.retryFill')}</Button>
      </details>
      <details id="edit-context-panel" hidden={!state.prompt}><summary>{t('workspace.viewContext')}</summary>
        <p id="edit-context-binding" className="chat-edit-note">{state.contextBinding}</p>
        <textarea id="edit-context" readOnly aria-label={t('workspace.fileChatContext')} spellCheck={false} value={state.prompt} />
      </details>
      <details className="edit-paste"><summary>{t('workspace.manualProposal')}</summary>
        <label htmlFor="edit-answer">{t('workspace.pasteProposal')}</label>
        <textarea id="edit-answer" aria-label={t('workspace.aiProposal')} spellCheck={false} placeholder={t('workspace.proposalPlaceholder')} value={state.answer} disabled={!enabled('setAnswer')} onChange={event => actions.setAnswer(event.target.value)} />
        <Button id="review-edit" disabled={!enabled('review')} onClick={act('review')}>{t('workspace.reviewEdits')}</Button>
      </details>
      <section id="edit-review" className="edit-review" hidden={!state.proposal} aria-label={t('workspace.editReview')}>
        <strong id="edit-review-summary">{state.proposalSummary || state.proposal?.path}</strong>
        <div className="edit-diff"><div><h2>{t('workspace.originalFile')}</h2><pre id="edit-before">{state.proposalBefore}</pre></div>
          <div><h2>{t('workspace.suggestedContent')}</h2><pre id="edit-after">{state.proposalAfter}</pre></div></div>
        <div className="chat-edit-actions"><Button id="adopt-edit" className="primary" disabled={!enabled('adopt')} onClick={act('adopt')}>{t('workspace.adoptDraft')}</Button>
          <Button id="discard-edit" disabled={!enabled('discard')} onClick={act('discard')}>{t('workspace.discardPreview')}</Button></div>
        <p className="chat-edit-note">{t('workspace.adoptNote')}</p>
      </section>
      <details id="edit-receipt-panel" hidden={!state.receipt}><summary>{t('workspace.lastReceipt')}</summary><pre id="edit-receipt">{state.receipt}</pre>
        <Button id="copy-edit-receipt" disabled={!enabled('copyReceipt')} onClick={act('copyReceipt')}>{t('workspace.copyReceipt')}</Button></details>
      <p className="chat-edit-note">{t('workspace.chatSafety')}</p>
    </div>
  </details>;
}
