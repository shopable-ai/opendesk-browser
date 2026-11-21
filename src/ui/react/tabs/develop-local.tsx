import * as React from 'react';
import {DevelopField,DevelopOptionsSummary} from './develop-controls.tsx';
import {DevelopPromptButton} from './develop-ai-prompt.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopLocalProject(){
  return (
        <DevelopField as="section" id="local-project-tools" className="local-project-tools" aria-label="本地项目连接">
          <div className="od-stack">
          <div className="od-form-field">
            <label htmlFor="local-project-select" className="visually-hidden">
              {"已授权本地项目"}
            </label>
          <div className="local-project-controls od-toolbar">
            <DevelopField as="select" id="local-project-select" className="od-field"/>
            <DevelopPromptButton local/>
          </div>
          </div>
          </div>
          <div className="od-stack">
          <DevelopField as="p" id="local-project-status" role="status" aria-live="polite"/>
          <DevelopField as="button" id="local-project-refresh" aria-describedby="local-project-preview-hint" type="button" className="od-button od-button--secondary local-project-refresh">
            检查连接与项目
          </DevelopField>
          <p id="local-project-intro" className="local-project-intro od-note">在外部编辑器修改源码，这里运行或调试。</p>
          <DevelopField as="p" id="local-project-tool-pointer" className="od-field-help" role="status" aria-live="polite"/>
          <div className="local-project-actions">
            <DevelopField as="div" id="local-project-recovery" className="local-project-recovery">
              <DevelopField as="button" id="local-project-connect" className="local-project-connect od-button od-button--secondary" type="button">
                {"连接本机 OpenDesk ↗"}
              </DevelopField>
            </DevelopField>
            <DevelopField as="button" id="local-project-preview" aria-describedby="local-project-preview-hint" type="button" className="od-button od-button--secondary">在侧栏调试 ↗</DevelopField>
          </div>
          <DevelopField as="p" id="local-project-preview-hint" className="od-field-help"/>
          <DevelopField as="details" id="local-project-guide" className="local-project-guide od-disclosure od-disclosure--info">
            <summary>连接方法：单文件与目录</summary>
            <p>重新打开侧栏时，会找回当前连接中已授权的单文件。若本机连接已关闭，请用 <code>opendesk browser project add</code> 为新连接重新授权。</p>
            <p>要调试侧栏工具，先生成工具的开发构建。在源码目录运行 <code>opendesk browser dev .</code>，或按示例用 <code>opendesk browser workspace add</code> 授权目录，再回来选择它。</p>
            <DevelopField as="button" id="local-project-guide-open" type="button" className="od-button od-button--secondary">查看授权与构建示例 ↗</DevelopField>
          </DevelopField>
          </div>

          <DevelopField as="section" id="local-install-review" className="local-install-review od-surface" aria-label="固定版本安装确认" aria-describedby="local-install-summary local-install-warning" tabIndex="-1">
            <strong>
              {"安装与管理"}
            </strong>
            <DevelopField as="p" id="local-install-summary" className="hint" role="status">
            </DevelopField>
            <div className="od-form-field">
            <label htmlFor="local-install-title" className="od-field-label">
              {"名称"}
            </label>
                <DevelopField as="input" id="local-install-title" type="text" maxLength="100" autoComplete="off" className="od-field"/>
            </div>
            <div className="od-form-field">
            <label htmlFor="local-install-version" className="od-field-label">
              {"版本"}
            </label>
            <DevelopField as="input" id="local-install-version" type="text" maxLength="24" autoComplete="off" className="od-field"/>
            </div>
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
          <details className="developer-options developer-project-options od-disclosure od-disclosure--icon">
            <DevelopOptionsSummary>项目设置与连接</DevelopOptionsSummary>
            <div className="developer-option-body od-stack">
              <p className="od-note">模块、依赖和资源在本地项目维护，源码历史由 Git 管理。</p>
          <DevelopField as="details" id="local-project-params-tools" className="od-disclosure">
            <summary>
              {"项目参数 JSON（Controller 可选）"}
            </summary>
            <label htmlFor="local-project-params" className="visually-hidden">
              {"本地项目参数"}
            </label>
            <DevelopField as="textarea" id="local-project-params" rows="3" spellCheck={false} className="od-field"/>
          </DevelopField>
          <details className="od-disclosure od-disclosure--flat">
          <summary>源码关联（可选）</summary>
          <div className="local-project-binding od-stack">
          <div className="od-form-field">
          <label htmlFor="local-project-tool" className="od-field-label">关联已安装工具（可选）</label>
          <DevelopField as="select" id="local-project-tool" className="od-field" aria-describedby="local-project-tool-pointer"/>
          <p className="od-field-help">关联只记住此工具要打开的目录，不证明它是正式安装包的源码，也不授予安装权限。</p>
          </div>
          <div className="od-toolbar">
            <DevelopField as="button" id="local-project-tool-bind" type="button" className="od-button od-button--secondary">保存源码关联</DevelopField>
          </div>
          </div>
          </details>
          <details className="od-disclosure od-disclosure--flat">
            <summary>
              {"本地连接诊断"}
            </summary>
            <DevelopField as="p" id="local-project-diagnostics">
              {"正在核对 Native 和源码 Provider。"}
            </DevelopField>
          </details>
            </div>
          </details>
        </DevelopField>
  );
}
