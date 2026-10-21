import * as React from 'react';
import {DevelopField} from './develop-controls.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopLocalProject(){
  return (
        <DevelopField as="section" id="local-project-tools" className="local-project-tools" aria-label="本地项目连接">
          <p id="local-project-intro" className="local-project-intro od-note">选择已授权项目后运行或安装；系统会核对最新源码与授权。</p>
          <div className="local-project-controls od-toolbar">
            <label htmlFor="local-project-select" className="visually-hidden">
              {"已授权本地项目"}
            </label>
            <DevelopField as="select" id="local-project-select" className="od-field"/>
            <DevelopField as="button" id="local-project-refresh" type="button" className="od-icon-button" title="刷新已授权本地项目" aria-label="刷新已授权本地项目">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7">
                </path>
              </svg>
            </DevelopField>
          </div>
          <DevelopField as="p" id="local-project-status" role="status" aria-live="polite">
          </DevelopField>
          <DevelopField as="button" id="script-save" type="button" className="od-button od-button--secondary">
            {"检查并保存本地项目"}
          </DevelopField>
          <DevelopField as="section" id="local-install-review" className="local-install-review od-surface" aria-label="固定版本安装确认" aria-describedby="local-install-summary local-install-warning" tabIndex="-1">
            <strong>
              {"安装与管理"}
            </strong>
            <DevelopField as="p" id="local-install-summary" className="hint" role="status">
            </DevelopField>
            <label htmlFor="local-install-title" className="od-field-label">
              {"名称"}
            </label>
                <DevelopField as="input" id="local-install-title" type="text" maxLength="100" autoComplete="off" className="od-field"/>
            <label htmlFor="local-install-version" className="od-field-label">
              {"版本"}
            </label>
            <DevelopField as="input" id="local-install-version" type="text" maxLength="24" autoComplete="off" className="od-field"/>
            <DevelopField as="p" id="local-install-warning" className="hint">
            </DevelopField>
            <div className="row">
              <DevelopField as="button" id="local-install-confirm" type="button" className="od-button">
                {"确认安装固定版本"}
              </DevelopField>
              <DevelopField as="button" id="local-install-cancel" type="button" className="od-button od-button--secondary">
                {"取消"}
              </DevelopField>
            </div>
            <DevelopField as="p" id="local-install-status" role="status" aria-live="polite">
            </DevelopField>
          </DevelopField>
          <details className="od-disclosure od-disclosure--flat">
            <summary>
              {"本地连接诊断"}
            </summary>
            <DevelopField as="p" id="local-project-diagnostics">
              {"正在核对 Native 和源码 Provider。"}
            </DevelopField>
          </details>
          <DevelopField as="div" id="local-project-recovery" className="local-project-recovery">
            <DevelopField as="button" id="local-project-connect" className="local-project-connect od-button od-button--secondary" type="button">
              {"连接本机 OpenDesk ↗"}
            </DevelopField>
            <DevelopField as="details" id="local-project-guide" className="local-project-guide od-disclosure od-disclosure--info">
              <summary>
                {"首次使用：连接方法"}
              </summary>
              <ol>
                <li>
                  {"首次使用时安装并配对 OpenDesk 原生程序；仅在 Native 未连接时点击「连接本机 OpenDesk」完成可信授权。"}
                </li>
                <li>
                  {"在要授权的目录执行"}
                  <code>
                    {"opendesk browser dev ."}
                  </code>
                  {"或"}
                  <code>
                    {"opendesk-dev ."}
                  </code>
                  {"；单文件使用原有的"}
                  <code>
                    {"opendesk browser project add"}
                  </code>
                  {"命令。"}
                </li>
                <li>
                  {"已授权项目会自动出现、自动准备；多个项目可切换，再点击「运行本地项目」。"}
                </li>
              </ol>
              <p>
                {"Native 连接、源码 Provider 和"}
                <code>
                  {"127.0.0.1:43111"}
                </code>
                {"测试网页互不等价；已有授权不必重新配对，网站权限仍在运行时独立确认。"}
              </p>
              <DevelopField as="button" id="local-project-guide-open" type="button" className="od-button od-button--secondary">
                {"查看首次配置命令和示例 ↗"}
              </DevelopField>
              <p>
                {"查看"}
                <code>
                  {"docs/api/local-projects.zh-CN.md"}
                </code>
                {"中的正式授权示例。"}
              </p>
            </DevelopField>
          </DevelopField>
          <DevelopField as="details" id="local-project-params-tools" className="od-disclosure">
            <summary>
              {"项目参数 JSON（Controller 可选）"}
            </summary>
            <label htmlFor="local-project-params" className="visually-hidden">
              {"本地项目参数"}
            </label>
            <DevelopField as="textarea" id="local-project-params" rows="3" spellCheck={false} className="od-field"/>
          </DevelopField>
        </DevelopField>
  );
}
