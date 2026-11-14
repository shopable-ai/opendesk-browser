import * as React from 'react';
import {DevelopField,useDevelop} from './develop-controls.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopExecution({section='editor',children}={}){
  const {model,snapshot}=useDevelop();
  const resultAvailable=!snapshot.fields['script-copy-result'].disabled;
  const hasFeedback=['script-status','script-task-status'].some(id=>{
    const field=snapshot.fields[id];
    return !field.hidden&&Boolean(field.textContent?.trim());
  });
  const showArea=['editor','history','diagnostics','run-detail'].includes(section)||hasFeedback||
    !snapshot.fields['script-user-scripts-recovery'].hidden;
  const navigate=(section,event)=>model.navigate(section,{returnFocusId:event.currentTarget.id});
  return <div className="developer-output od-stack" hidden={!showArea}>
        <div className="developer-run-area od-stack" hidden={!showArea}>
          <DevelopField as="div" id="script-user-scripts-recovery" className="developer-execution-help od-alert od-alert--warning" data-state="blocked">
            <DevelopField as="p" id="script-user-scripts-recovery-status" role="status" aria-live="polite">
            </DevelopField>
            <div className="developer-execution-help-actions">
              <DevelopField as="button" id="script-user-scripts-settings" type="button" className="od-button od-button--secondary">
                {"打开扩展设置"}
              </DevelopField>
              <DevelopField as="button" id="script-user-scripts-check" type="button" className="od-button od-button--secondary">
                {"重新检测"}
              </DevelopField>
            </div>
          </DevelopField>
          <div hidden={!['editor','history','diagnostics'].includes(section)}>
            <DevelopField as="section" id="developer-results-panel" className="developer-results" aria-label="运行结果">
              <div className="developer-result-head"><h2>{section==='editor'?'运行结果':'所选运行结果'}</h2>
                <DevelopField as="span" id="script-result-kind" className="hint">尚无结果</DevelopField>
              </div>
              <div className="developer-results-body">
                <DevelopField as="pre" id="script-result" data-opendesk-react-owner="developer-result" aria-label="脚本返回值" className="od-result">尚无结果</DevelopField>
                <DevelopField as="span" id="script-copy-feedback" className="od-note" role="status" aria-live="polite"/>
                <div className="developer-result-actions" hidden={!resultAvailable}>
                  <DevelopField as="button" type="button" id="script-copy-result" className="developer-text-button" title="复制运行结果">复制</DevelopField>
                  <button type="button" id="developer-result-download" className="developer-text-button" onClick={event=>navigate('history',event)}>下载选项</button>
                  <button type="button" id="developer-result-detail" className="developer-text-button" onClick={event=>navigate('run-detail',event)}>本次详情</button>
                  <button type="button" id="developer-result-history" className="developer-text-button" onClick={event=>navigate('history',event)}>过去运行</button>
                </div>
              </div>
            </DevelopField>
          </div>
          <DevelopField as="p" id="developer-run-feedback" className="developer-run-feedback" role="status" aria-live="polite">
            <DevelopField as="span" id="script-status" data-opendesk-react-owner="developer-run-status" data-state="loading">
              {"正在连接公共运行入口…"}
            </DevelopField>
            <DevelopField as="span" id="script-task-status" className="developer-task-status">
            </DevelopField>
          </DevelopField>
          <div hidden={section!=='run-detail'}>
                <DevelopField as="details" id="developer-run-technical" className="developer-run-technical od-disclosure">
                  <summary>
                    {"运行目标与版本"}
                  </summary>
                  <DevelopField as="p" id="script-task-id" className="identity">
                    {"尚未运行"}
                  </DevelopField>
                  <DevelopField as="p" id="script-running-target" className="identity" data-state="idle">
                    {"运行目标：尚未建立"}
                  </DevelopField>
                  <DevelopField as="p" id="script-task-version" className="identity">
                  </DevelopField>
                </DevelopField>
          </div>
          <div hidden={section!=='history'}>
            <DevelopField as="details" id="script-history-panel" className="result-history od-disclosure od-disclosure--flat">
              <summary>
                {"过去运行"}
              </summary>
              <div className="developer-history-content">
                <div className="developer-history-head">
                  <p id="script-history-hint" className="hint">
                    {"仅刷新已有记录，不会重新运行脚本。"}
                  </p>
                  <DevelopField as="button" id="script-read" type="button" className="od-icon-button" title="刷新运行历史" aria-label="刷新运行历史">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7">
                      </path>
                    </svg>
                  </DevelopField>
                </div>
                <div className="developer-history-field">
                  <label htmlFor="script-history-run" className="od-field-label">
                    {"历史运行"}
                  </label>
                  <div className="developer-history-actions">
                    <DevelopField as="select" id="script-history-run" aria-describedby="script-history-hint" className="od-field"/>
                    <DevelopField as="button" id="script-history-open" type="button" className="od-button od-button--secondary">
                      {"查看选中任务"}
                    </DevelopField>
                  </div>
                </div>
                <details className="developer-history-disclosure od-disclosure od-disclosure--flat">
                  <summary>
                    {"完整历史与版本身份"}
                  </summary>
                  <DevelopField as="pre" id="script-history" aria-label="持久结果历史" className="od-result">
                    {"正在读取…"}
                  </DevelopField>
                </details>
                <details className="developer-history-disclosure od-disclosure od-disclosure--flat">
                  <summary>
                    {"持久结果下载"}
                  </summary>
                  <div className="developer-history-field">
                    <label htmlFor="script-download-result" className="od-field-label">
                      {"已完成的持久结果"}
                    </label>
                    <div className="developer-history-actions">
                      <DevelopField as="select" id="script-download-result" className="od-field"/>
                      <DevelopField as="button" id="script-download" type="button" className="od-button od-button--secondary">
                        {"下载结果 JSON"}
                      </DevelopField>
                    </div>
                  </div>
                  <DevelopField as="p" id="script-download-status" className="hint" role="status">
                    {"结果下载保留类型信息，包括 undefined。"}
                  </DevelopField>
                </details>
              </div>
            </DevelopField>
          </div>
          <div hidden={section!=='diagnostics'}>
                <details className="developer-history-disclosure od-disclosure od-disclosure--flat">
                  <summary>
                    {"按 runId 查询"}
                  </summary>
                  <div className="developer-history-field">
                    <label htmlFor="script-run-id" className="od-field-label">
                      {"查询 runId（留空读取全部历史）"}
                    </label>
                    <DevelopField as="input" id="script-run-id" placeholder="runId" className="od-field"/>
                  </div>
                  <div className="developer-history-control-row">
                    <DevelopField as="button" id="script-read-run" type="button" className="od-button od-button--secondary">
                      {"查询任务"}
                    </DevelopField>
                  </div>
                </details>
          </div>
        </div>
        {children}
  </div>;
}
