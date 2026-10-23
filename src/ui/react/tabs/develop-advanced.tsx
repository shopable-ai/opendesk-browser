import * as React from 'react';
import {DevelopField} from './develop-controls.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopAdvanced(){
  return (
        <DevelopField as="details" id="developer-program-management" className="od-disclosure">
          <summary>
            {"保存与管理"}
          </summary>
          <DevelopField as="section" id="script-version-identity" className="developer-management-section">
            <label htmlFor="script-id" className="od-field-label">
              {"脚本 ID（用于保存）"}
            </label>
            <DevelopField as="input" id="script-id" autoComplete="off" className="od-field"/>
            <div className="row">
              <label htmlFor="script-revision" className="od-field-label">
                {"Revision（可选）"}
              </label>
              <DevelopField as="input" id="script-revision" type="number" min="1" placeholder="留空加载最新版本" className="od-field"/>
              <DevelopField as="button" id="script-load" className="od-button od-button--secondary">
                {"按 ID 加载版本"}
              </DevelopField>
            </div>
          </DevelopField>
          <DevelopField as="section" id="page-preview-tools" className="developer-management-section">
            <DevelopField as="h3" id="page-preview-mode-title" className="od-field-label">
              {"网页 JavaScript 试运行"}
            </DevelopField>
            <DevelopField as="p" id="page-preview-mode-hint" className="hint">
              {"直接使用上方 JavaScript 源码操作当前网页 DOM；可写 async function main() 返回结果，也可直接编写顶层语句。不要求特殊脚本声明；运行前仍需网站授权。"}
            </DevelopField>
            <DevelopField as="p" id="page-component-status" role="status" aria-live="polite">
            </DevelopField>
            <DevelopField as="p" id="page-preview-status" role="status">
              {"请先确认当前网页可用；试运行不会保存版本或安装任务。"}
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
              {"保存仅创建固定候选，不会自动安装。普通 JS 默认匹配本次网页的协议与主机（可能包括同主机其他端口）；显式 @match 保留原范围。后续仍须验证并确认权限。脚本 ID 与 Revision 在上方设置。"}
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
              <DevelopField as="button" id="page-program-run" type="button" className="od-button od-button--secondary">
                {"手动运行"}
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
          <DevelopField as="section" id="script-library-tools" className="developer-management-section">
            <h3 className="od-field-label">Controller 版本与任务</h3>
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
              <label htmlFor="task-dev-intent-templates" className="od-field-label">
                {"自然语言匹配模板（可选，每行一条）"}
              </label>
              <DevelopField as="textarea" id="task-dev-intent-templates" rows="3" spellCheck={false} className="od-field"
                placeholder="在当前演示搜索页搜索 {keyword}，并核对结果"/>
              <p className="hint">
                {"模板仅匹配声明的业务操作；{keyword} 等占位符必须属于上方参数 Schema。必填参数必须在每条模板中明确绑定。"}
              </p>
              <label htmlFor="task-dev-intent-result-texts" className="od-field-label">
                {"独立网页结果核验（可选，每行一条）"}
              </label>
              <DevelopField as="textarea" id="task-dev-intent-result-texts" rows="2" spellCheck={false} className="od-field"
                placeholder={"结果：{keyword}\n提交次数：1"}/>
              <p className="hint">
                {"声明需要从运行后的真实网页独立读取的可见文本；没有核验声明时，不会把脚本返回值当成业务成功。创建仅产生待验证候选。"}
              </p>
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
  );
}
