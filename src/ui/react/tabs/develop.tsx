import * as React from 'react';
import {DevelopProvider,DevelopField} from './develop-controls.tsx';
import {DevelopDependencies} from './develop-dependencies.tsx';

// One React owner for the complete trusted developer workbench. User source
// stays in fields and crosses only the existing compiler/RunHost boundary.
export function DeveloperPage({model,view=model,actions=view.actions,hidden=false}){
  return <DevelopProvider view={view} actions={actions}>
    <div id="workbench-develop" role="tabpanel" aria-labelledby="tab-develop" className="od-page" data-workbench-page="develop" hidden={hidden}>
      <section className="developer-editor" aria-label="代码开发">
        <div className="developer-context od-stack">
          <DevelopField as="div" id="developer-source-switch" className="developer-source-switch od-toolbar od-page-head" role="group" aria-label="代码来源" data-mode="manual">
            <DevelopField as="span" className="od-page-title" id="developer-source-title">
              {"直接编辑"}
            </DevelopField>
            <div className="od-page-actions" role="group" aria-label="开发页操作">
              <DevelopField as="button" type="button" id="program-new-script" title="新建 JavaScript 草稿（退出当前只读源码视图）" aria-label="新建 JavaScript 草稿" className="od-icon-button">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14">
                  </path>
                </svg>
              </DevelopField>
              <label htmlFor="local-project-mode">
                <DevelopField as="input" id="local-project-mode" type="checkbox" role="switch" aria-label="使用本地项目" aria-description="关闭时在编辑器直接编写，开启时选择已授权的本地项目。切换不会自动运行。" aria-controls="local-project-tools manual-source-editor"/>
                <span className="local-project-switch-track" aria-hidden="true">
                </span>
                <span>
                  {"本地项目"}
                </span>
              </label>
            </div>
          </DevelopField>
          <section aria-label="当前网页" className="developer-target">
            <DevelopField as="details" id="developer-target-detail" className="od-disclosure">
              <summary className="developer-page-summary">
                <span className="developer-page-label">
                  {"当前网页"}
                </span>
                <DevelopField as="span" id="script-current-page-host" title="当前活动网页">
                  {"正在识别…"}
                </DevelopField>
                <DevelopField as="span" id="script-current-page-status" role="status" aria-live="polite" data-state="resolving">
                  {"检查中"}
                </DevelopField>
              </summary>
              <div className="developer-page-detail">
                <DevelopField as="p" id="script-current-page-title" className="page-title">
                  {"正在识别…"}
                </DevelopField>
                <DevelopField as="p" id="script-current-page-url" className="identity">
                </DevelopField>
              </div>
            </DevelopField>
          </section>
        </div>
        <DevelopField as="section" id="local-project-tools" className="local-project-tools" aria-label="本地项目连接">
          <DevelopField as="p" id="local-project-intro" className="local-project-intro od-note">
            {"选择已授权项目，可运行或核对安装；复用历史验证必须匹配当前源码、网页与持久回执。"}
          </DevelopField>
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
        <DevelopField as="div" id="manual-source-editor">
          <DevelopField as="p" id="program-source-info" className="identity od-technical" role="status">
          </DevelopField>
          <DevelopField as="div" id="program-source-toolbar" className="program-source-toolbar od-toolbar" role="group" aria-label="源码视图操作">
            <label htmlFor="program-source-files" className="visually-hidden">
              {"实际执行代码或项目源码快照"}
            </label>
            <DevelopField as="select" id="program-source-files" className="od-field"/>
          </DevelopField>
          <DevelopField as="div" id="page-component-editor-tools" className="od-toolbar">
            <DevelopField as="fieldset" id="page-component-framework" aria-describedby="page-component-hint">
              <legend className="visually-hidden">
                {"代码类型"}
              </legend>
              <span className="page-component-label" aria-hidden="true">
                {"代码类型"}
              </span>
              <div className="page-component-choices od-segmented">
                <label htmlFor="page-component-javascript" title="JavaScript">
                  <DevelopField as="input" id="page-component-javascript" type="radio" name="page-component-choice" aria-label="JavaScript"/>
                  <span>
                    {"JavaScript"}
                  </span>
                </label>
                <label htmlFor="page-component-react" title="React · JSX">
                  <DevelopField as="input" id="page-component-react" type="radio" name="page-component-choice" aria-label="React JSX"/>
                  <span>
                    {"React"}
                  </span>
                </label>
                <label htmlFor="page-component-vue" title="Vue · SFC">
                  <DevelopField as="input" id="page-component-vue" type="radio" name="page-component-choice" aria-label="Vue SFC"/>
                  <span>
                    {"Vue"}
                  </span>
                </label>
              </div>
            </DevelopField>
          </DevelopField>
          <DevelopField as="div" id="script-javascript-world-row" className="od-toolbar" role="group" aria-label="JavaScript 执行环境">
            <label htmlFor="script-javascript-world" className="od-field-label">
              {"运行环境"}
            </label>
            <DevelopField as="select" id="script-javascript-world" className="od-field" aria-label="JavaScript 执行环境"/>
          </DevelopField>
          <DevelopField as="label" htmlFor="script-source" className="visually-hidden" id="developer-source-label">
            {"JavaScript、React JSX 或 Vue SFC 源码编辑器"}
          </DevelopField>
          <DevelopField as="textarea" id="script-source" rows="6" wrap="off" spellCheck={false} autoCapitalize="off" className="od-field"/>
          <DevelopField as="p" id="page-component-hint" className="hint">
            {"保存草稿不会运行网页"}
          </DevelopField>
          <DevelopDependencies view={view} actions={actions}/>
          <DevelopField as="section" id="page-component-remote" className="od-stack" aria-label="组件 HTTPS 依赖准备">
            <DevelopField as="p" id="page-component-remote-status" role="status" aria-live="polite">
            </DevelopField>
            <DevelopField as="pre" id="page-component-remote-sources" aria-label="本次需明确确认的 HTTPS 模块来源">
            </DevelopField>
            <label htmlFor="page-component-remote-lock" className="visually-hidden">
              {"选择已固定的组件依赖版本"}
            </label>
            <DevelopField as="select" id="page-component-remote-lock" className="od-field"/>
            <div className="od-toolbar">
              <DevelopField as="button" id="page-component-remote-prepare" type="button" className="od-button od-button--secondary">
                {"检查依赖"}
              </DevelopField>
              <DevelopField as="button" id="page-component-remote-cancel" type="button" className="od-button od-button--secondary">
                {"取消准备"}
              </DevelopField>
            </div>
            <DevelopField as="details" id="page-component-remote-details" className="od-disclosure od-disclosure--flat">
              <summary>
                {"固定模块、许可证与 SHA-256"}
              </summary>
              <DevelopField as="pre" id="page-component-remote-detail-body">
              </DevelopField>
            </DevelopField>
          </DevelopField>
          <DevelopField as="details" id="program-generated" className="od-disclosure od-disclosure--flat">
            <summary>
              {"编译产物（技术信息）"}
            </summary>
            <DevelopField as="pre" id="program-generated-source">
            </DevelopField>
          </DevelopField>
        </DevelopField>
        <DevelopField as="details" id="manual-project-params-tools" className="developer-params od-disclosure">
          <summary>
            {"参数 JSON（可选）"}
          </summary>
          <label htmlFor="script-params" className="od-field-label">
            {"参数 JSON"}
          </label>
          <DevelopField as="textarea" id="script-params" rows="3" spellCheck={false} className="od-field"/>
        </DevelopField>
        <DevelopField as="details" id="tool-diagnostics" className="od-disclosure">
          <summary>
            {"高级诊断与网页 SDK"}
          </summary>
          <DevelopField as="section" id="scraping-panel" aria-label="采集模块">
          </DevelopField>
          <DevelopField as="details" id="developer-sdk-diagnostics" className="od-disclosure od-disclosure--flat">
            <DevelopField as="summary" id="sdk-title">
              {"网页 SDK 授权管理"}
            </DevelopField>
            <section className="developer-diagnostics-body od-stack" aria-labelledby="sdk-title">
              <p>
                {"SDK 与 axiosx 会自动加载到允许访问的 HTTP(S) 网页。默认同源 HTTP 与固定本地实验测试 Origin 无需逐页审批；本区域只用于"}
                <strong>
                  {"额外跨站 Origin 或高级能力"}
                </strong>
                {"的显式授权、检查和撤销。后台仍按真实网页身份核查每次请求。"}
              </p>
              <div className="row">
                <label htmlFor="sdk-tab" className="od-field-label">
                  {"网页"}
                </label>
                <DevelopField as="select" id="sdk-tab" className="od-field"/>
                <DevelopField as="button" id="sdk-refresh" className="od-button od-button--secondary">
                  {"刷新网页列表"}
                </DevelopField>
              </div>
              <div className="row">
                <label htmlFor="sdk-document" className="od-field-label">
                  {"精确文档"}
                </label>
                <DevelopField as="select" id="sdk-document" className="od-field"/>
              </div>
              <DevelopField as="fieldset" id="sdk-capabilities">
                <legend className="od-field-label">
                  {"允许的服务（仅授予勾选项）"}
                </legend>
              </DevelopField>
              <label htmlFor="sdk-target-origins" className="od-field-label">
                {"额外批准的目标 origin（每行一个，最多 8 条）"}
              </label>
              <DevelopField as="textarea" id="sdk-target-origins" rows="3" maxLength="18000" spellCheck={false} placeholder="https://api.example.com\nhttp://127.0.0.1:43111" aria-describedby="sdk-target-help" className="od-field"/>
              <DevelopField as="p" id="sdk-target-help">
                {"留空仅允许来源同源；这里是完整的新范围，不与旧授权自动合并。协议、主机和有效端口精确匹配；不能填写账户、路径、查询或通配符。回环与局域网也须明确列出。原生权限可能覆盖更多端口，但不会扩大应用授权；此检查不是 DNS 重绑定防护。"}
              </DevelopField>
              <details open className="od-disclosure od-disclosure--flat">
                <summary>
                  <span>
                    {"本次批准快照（来源、精确 document、服务与目标）"}
                  </span>
                </summary>
                <DevelopField as="pre" id="sdk-approval-preview" aria-live="polite" className="od-result">
                </DevelopField>
              </details>
              <div className="row">
                <DevelopField as="button" id="sdk-install" className="od-button">
                  {"明确批准此快照并安装 SDK"}
                </DevelopField>
              </div>
              <div className="row">
                <DevelopField as="button" id="sdk-inspect" type="button" className="od-button od-button--secondary">
                  {"只读查询当前授权"}
                </DevelopField>
                <DevelopField as="button" id="sdk-revoke" type="button" className="od-button od-button--danger">
                  {"撤销已确认授权"}
                </DevelopField>
              </div>
              <p className="hint">
                {"这是"}
                <strong>
                  {"网页文档级"}
                </strong>
                {"授权：同页第一方与第三方 JavaScript 都可能调用 SDK，"}
                <strong>
                  {"并非只授权某个用户脚本"}
                </strong>
                {"。用户脚本的 @grant / GM_* 不会在这里自动授权。查询不会申请新权限；撤销阻止后续 SDK 服务，但不能回滚已发生操作，也无法强制卸载已执行 JS；结果未知时须重新查询。"}
              </p>
              <DevelopField as="p" id="sdk-status" role="status" data-state="idle">
                {"请选择网页、文档和服务"}
              </DevelopField>
              <DevelopField as="pre" id="sdk-result" aria-label="SDK 安装结果" className="od-result">
              </DevelopField>
            </section>
          </DevelopField>
          <DevelopField as="details" id="developer-health-diagnostics" className="od-disclosure od-disclosure--flat">
            <DevelopField as="summary" id="health-title">
              {"目标健康检查"}
            </DevelopField>
            <section className="developer-diagnostics-body od-stack" aria-labelledby="health-title">
              <p>
                {"检查只确认包内脚本与目标文档通信。不会采集数据或翻动原页面。"}
              </p>
              <div className="row">
                <label htmlFor="target-url" className="od-field-label">
                  {"测试页面地址"}
                </label>
                <DevelopField as="input" id="target-url" type="url" placeholder="https://example.com/" className="od-field"/>
                <DevelopField as="button" id="create-target" className="od-button">
                  {"授权并创建检查页"}
                </DevelopField>
              </div>
              <div className="row">
                <DevelopField as="button" id="check-source" className="od-button od-button--secondary">
                  {"检查原页面"}
                </DevelopField>
                <DevelopField as="button" id="check-target" className="od-button od-button--secondary">
                  {"检查已绑定文档"}
                </DevelopField>
              </div>
              <DevelopField as="p" id="status" role="status">
                {"环境入口已加载"}
              </DevelopField>
              <DevelopField as="pre" id="health-result" aria-label="目标检查结果" className="od-result">
              </DevelopField>
            </section>
          </DevelopField>
          <aside>
            {"SDK 授权与自动化任务独立；健康检查只确认环境通信。"}
          </aside>
        </DevelopField>
        <div className="developer-run-area od-stack">
          <DevelopField as="p" id="developer-run-feedback" className="developer-run-feedback" role="status" aria-live="polite">
            <DevelopField as="span" id="script-status" data-state="loading">
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
              <DevelopField as="pre" id="script-result" aria-label="脚本返回值" className="od-result">
                {"尚无结果"}
              </DevelopField>
              <DevelopField as="details" id="script-history-panel" className="result-history od-disclosure od-disclosure--flat">
                <summary>
                  {"运行记录与技术信息"}
                </summary>
                <div className="developer-history-content">
                  <div className="developer-history-head">
                    <DevelopField as="p" id="script-history-hint" className="hint">
                      {"仅刷新已有记录，不会重新运行脚本。"}
                    </DevelopField>
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
        <DevelopField as="details" id="developer-program-management" className="od-disclosure">
          <summary>
            {"保存与安装（高级）"}
          </summary>
          <DevelopField as="details" id="script-version-identity" className="od-disclosure">
            <summary>
              {"正式版本身份（仅保存或加载时需要）"}
            </summary>
            <p className="hint">
              {"临时代码运行无需脚本 ID 或版本号；保存固定程序或创建任务时才设置。"}
            </p>
            <label htmlFor="script-id" className="od-field-label">
              {"脚本名称 / ID"}
            </label>
            <DevelopField as="input" id="script-id" autoComplete="off" className="od-field"/>
            <div className="row">
              <label htmlFor="script-revision" className="od-field-label">
                {"revision"}
              </label>
              <DevelopField as="input" id="script-revision" type="number" min="1" placeholder="留空加载最新版本" className="od-field"/>
              <DevelopField as="button" id="script-load" className="od-button od-button--secondary">
                {"加载版本"}
              </DevelopField>
            </div>
          </DevelopField>
          <DevelopField as="details" id="page-preview-tools" className="od-disclosure">
            <DevelopField as="summary" id="page-preview-mode-title">
              {"网页 JavaScript 试运行"}
            </DevelopField>
            <DevelopField as="p" id="page-preview-mode-hint" className="hint">
              {"直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。不要求特殊脚本声明；运行前仍需网站授权。"}
            </DevelopField>
            <DevelopField as="button" id="page-preview-run" type="button" className="od-button">
              {"在当前网页试运行"}
            </DevelopField>
            <DevelopField as="p" id="page-component-status" role="status" aria-live="polite">
            </DevelopField>
            <DevelopField as="p" id="page-preview-status" role="status">
              {"请先确认当前网页可用；试运行不会保存版本或安装任务。"}
            </DevelopField>
            <DevelopField as="pre" id="page-preview-result" aria-label="网页 JavaScript 试运行结果" className="od-result">
              {"尚未运行"}
            </DevelopField>
            <DevelopField as="details" id="page-preview-technical-panel" className="od-disclosure od-disclosure--flat">
              <summary>
                {"技术信息"}
              </summary>
              <DevelopField as="pre" id="page-preview-technical">
              </DevelopField>
            </DevelopField>
            <div className="row">
              <DevelopField as="button" id="page-candidate-save" type="button" className="od-button od-button--secondary">
                {"保存网页脚本版本"}
              </DevelopField>
            </div>
            <p className="hint">
              {"试运行后可保存固定 Page 版本；普通 JS 默认仅匹配本次预览的协议与主机，同主机其他端口可能匹配；显式 @match 保留原范围。保存的冻结版本仍须单独验证、审阅并安装。脚本 ID 和版本在下方「版本管理」中设置。"}
            </p>
            <DevelopField as="p" id="page-candidate-status" role="status" aria-live="polite">
              {"尚未保存网页脚本候选。"}
            </DevelopField>
            <label htmlFor="page-program-list" className="od-field-label">
              {"已保存网页脚本"}
            </label>
            <DevelopField as="select" id="page-program-list" className="od-field"/>
            <DevelopField as="pre" id="page-program-detail" className="od-result">
              {"尚未读取。"}
            </DevelopField>
            <div className="row">
              <DevelopField as="button" id="page-program-load" type="button" className="od-button od-button--secondary">
                {"加载源码"}
              </DevelopField>
              <DevelopField as="button" id="page-program-verify" type="button" className="od-button od-button--secondary">
                {"验证冻结版本"}
              </DevelopField>
            </div>
            <div className="row">
              <DevelopField as="button" id="page-program-install" type="button" className="od-button">
                {"安装自动运行"}
              </DevelopField>
              <DevelopField as="button" id="page-program-toggle" type="button" className="od-button od-button--secondary">
                {"停用自动运行"}
              </DevelopField>
              <DevelopField as="button" id="page-program-restore" type="button" className="od-button od-button--secondary">
                {"恢复访问"}
              </DevelopField>
              <DevelopField as="button" id="page-program-uninstall" type="button" className="od-button od-button--danger">
                {"卸载程序"}
              </DevelopField>
              <DevelopField as="button" id="page-program-refresh" type="button" className="od-button od-button--secondary">
                {"刷新状态"}
              </DevelopField>
            </div>
            <DevelopField as="p" id="page-program-status" role="status" aria-live="polite">
              {"正式安装支持顶层网页与 document-idle；停用不会撤销已有网页效果。效果未知时不自动重放。"}
            </DevelopField>
          </DevelopField>
          <DevelopField as="details" id="script-library-tools" className="od-disclosure">
            <summary>
              {"版本管理与任务制作"}
            </summary>
            <label htmlFor="script-list" className="od-field-label">
              {"已保存脚本"}
            </label>
            <div className="row">
              <DevelopField as="select" id="script-list" className="od-field"/>
              <DevelopField as="button" id="script-list-refresh" className="od-button od-button--secondary">
                {"刷新"}
              </DevelopField>
              <DevelopField as="button" id="script-list-load" className="od-button od-button--secondary">
                {"加载最新"}
              </DevelopField>
            </div>
            <DevelopField as="p" id="script-version" role="status">
              {"尚未保存"}
            </DevelopField>
            <DevelopField as="button" id="script-save-version" type="button" className="od-button od-button--secondary">
              {"保存 Controller 固定版本"}
            </DevelopField>
            <DevelopField as="details" id="task-package-dev" className="od-disclosure od-disclosure--flat">
              <summary>
                {"从已保存版本创建任务候选"}
              </summary>
              <p className="hint">
                {"先保存程序版本，再定义任务信息。创建候选不会自动验证、发布或安装。"}
              </p>
              <label htmlFor="task-dev-id" className="od-field-label">
                {"稳定任务标识"}
              </label>
              <DevelopField as="input" id="task-dev-id" autoComplete="off" className="od-field"/>
              <label htmlFor="task-dev-version" className="od-field-label">
                {"任务版本"}
              </label>
              <DevelopField as="input" id="task-dev-version" autoComplete="off" className="od-field"/>
              <label htmlFor="task-dev-title" className="od-field-label">
                {"名称"}
              </label>
              <DevelopField as="input" id="task-dev-title" className="od-field"/>
              <label htmlFor="task-dev-description" className="od-field-label">
                {"用途"}
              </label>
              <DevelopField as="input" id="task-dev-description" className="od-field"/>
              <label htmlFor="task-dev-author" className="od-field-label">
                {"作者"}
              </label>
              <DevelopField as="input" id="task-dev-author" className="od-field"/>
              <label htmlFor="task-dev-schema" className="od-field-label">
                {"参数 Schema（JSON）"}
              </label>
              <DevelopField as="textarea" id="task-dev-schema" rows="4" spellCheck={false} className="od-field"/>
              <DevelopField as="button" type="button" id="task-create-candidate" className="od-button">
                {"保存为待验证任务候选"}
              </DevelopField>
              <DevelopField as="p" id="task-dev-status" role="status">
                {"候选需要真实运行验证后才能安装"}
              </DevelopField>
            </DevelopField>
          </DevelopField>
          <DevelopField as="details" id="script-advanced" className="od-disclosure">
            <summary>
              {"高级脚本与目标设置"}
            </summary>
            <DevelopField as="details" id="site-access" className="site-access-panel od-disclosure od-disclosure--flat">
              <summary>
                {"网站权限 · 默认全部网站"}
              </summary>
              <DevelopField as="p" id="site-access-status" role="status" data-state="checking">
                {"正在查询 Chrome 网站权限…"}
              </DevelopField>
              <p className="hint">
                {"安装或更新时由 Chrome 请求全部网站及核心浏览器 API（含 Cookie、通知）。后续插件的额外 API 仍需明确授权；浏览器网站权限不会自动授予脚本或 SDK 的应用级权限。"}
              </p>
              <div className="row">
                <DevelopField as="button" id="site-access-grant" type="button" className="od-button od-button--secondary">
                  {"恢复全部网站访问"}
                </DevelopField>
                <DevelopField as="button" id="site-access-refresh" type="button" className="od-button od-button--secondary">
                  {"刷新授权状态"}
                </DevelopField>
              </div>
              <p className="hint">
                {"如 Chrome 限制了网站权限，可点击恢复或前往扩展详情将“网站访问”改为“所有网站”。浏览器内部页、file://、隐身与用户脚本开关仍有独立限制。"}
              </p>
            </DevelopField>
            <p className="hint">
              {"默认使用当前网页；手动目标仅用于高级操作。"}
            </p>
            <div className="row">
              <label htmlFor="script-target-mode" className="od-field-label">
                {"目标方式"}
              </label>
              <DevelopField as="select" id="script-target-mode" className="od-field"/>
            </div>
            <label htmlFor="script-owned-url" className="od-field-label">
              {"隔离网页地址"}
            </label>
            <DevelopField as="input" id="script-owned-url" type="url" placeholder="https://example.com/" className="od-field"/>
            <div className="row">
              <label htmlFor="script-tab" className="od-field-label">
                {"现有网页"}
              </label>
              <DevelopField as="select" id="script-tab" className="od-field"/>
              <DevelopField as="button" id="script-refresh" className="od-button od-button--secondary">
                {"刷新网页列表"}
              </DevelopField>
            </div>
            <label htmlFor="script-document" className="od-field-label">
              {"精确文档"}
            </label>
            <DevelopField as="select" id="script-document" className="od-field"/>
            <p>
              <label>
                <DevelopField as="input" id="script-allow-cookies" type="checkbox"/>
                {"允许脚本访问目标网站的 Cookie"}
              </label>
            </p>
            <DevelopField as="button" id="script-delete" className="od-button od-button--danger">
              {"删除脚本"}
            </DevelopField>
            <details className="od-disclosure od-disclosure--flat">
              <summary>
                {"当前网页精确身份"}
              </summary>
              <DevelopField as="pre" id="script-current-page-debug" aria-label="当前网页精确目标">
              </DevelopField>
            </details>
          </DevelopField>
        </DevelopField>
      </section>
    </div>
  </DevelopProvider>;
}

export function DeveloperDock({model,view=model,actions=view.actions,hidden=false}){
  return <DevelopProvider view={view} actions={actions}>
    <div id="develop-dock" className="dock-actions" hidden={hidden}>
      <div className="dock-buttons od-toolbar">
        <DevelopField as="button" className="od-button" id="script-run">
          {"运行草稿"}
        </DevelopField>
        <DevelopField as="button" className="od-button od-button--secondary" id="script-save">
          {"保存版本"}
        </DevelopField>
        <DevelopField as="button" id="script-stop" className="od-button od-button--secondary">
          {"停止"}
        </DevelopField>
      </div>
    </div>
  </DevelopProvider>;
}
