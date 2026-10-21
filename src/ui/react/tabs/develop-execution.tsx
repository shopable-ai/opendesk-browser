import * as React from 'react';
import {DevelopField} from './develop-controls.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopExecution(){
  return <>
        <div className="developer-run-area od-stack">
          <DevelopField as="p" id="developer-run-feedback" className="developer-run-feedback" role="status" aria-live="polite">
            <DevelopField as="span" id="script-status" data-opendesk-react-owner="developer-run-status" data-state="loading">
              {"正在连接公共运行入口…"}
            </DevelopField>
            <DevelopField as="span" id="script-task-status" className="developer-task-status">
            </DevelopField>
          </DevelopField>
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
          <DevelopField as="details" id="developer-results-panel" className="developer-results od-disclosure">
            <summary>
              {"运行结果"}
            </summary>
            <div className="developer-results-body">
              <div className="result-toolbar">
                <DevelopField as="span" id="script-result-kind" className="hint">
                  {"尚无结果"}
                </DevelopField>
                <DevelopField as="span" id="script-copy-feedback" className="od-note" role="status" aria-live="polite">
                </DevelopField>
                <DevelopField as="button" type="button" id="script-copy-result" className="od-icon-button" title="复制运行结果" aria-label="复制运行结果">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2">
                    </rect>
                    <path d="M16 8V4H4v12h4">
                    </path>
                  </svg>
                </DevelopField>
              </div>
              <DevelopField as="pre" id="script-result" data-opendesk-react-owner="developer-result" aria-label="脚本返回值" className="od-result">
                {"尚无结果"}
              </DevelopField>
              <DevelopField as="details" id="script-history-panel" className="result-history od-disclosure od-disclosure--flat">
                <summary>
                  {"运行记录与技术信息"}
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
                      {"结果下载与任务查询"}
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
          </DevelopField>
        </div>
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
  </>;
}
