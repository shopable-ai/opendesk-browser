import * as React from 'react';
import {DevelopField} from './develop-controls.tsx';

// JSX-only region: the trusted DevelopProvider remains in DeveloperPage.
export function DevelopDiagnostics(){
  return (
        <DevelopField as="details" id="tool-diagnostics" className="od-disclosure">
          <summary>
            {"高级诊断与网页 SDK"}
          </summary>
          <DevelopField as="details" id="developer-sdk-diagnostics" className="od-disclosure od-disclosure--flat">
            <summary id="sdk-title">
              {"网页 SDK 授权管理"}
            </summary>
            <section className="developer-diagnostics-body od-stack" aria-labelledby="sdk-title">
              <p>
                {"SDK 与 axiosx 会自动加载到允许访问的 HTTP(S) 网页。默认同源 HTTP 与固定本地实验测试 Origin 无需逐页审批；本区域只用于"}
                <strong>
                  {"额外跨站 Origin 或高级能力"}
                </strong>
                {"的显式授权、检查和撤销。后台仍按真实网页身份核查每次请求。"}
              </p>
              <div className="od-page-head" role="group" aria-label="授权网页">
                <div className="od-form-field">
                  <span className="od-field-label">授权网页</span>
                  <DevelopField as="strong" id="sdk-page-title"/>
                  <DevelopField as="p" id="sdk-page-url" className="identity"/>
                </div>
                <DevelopField as="button" id="sdk-refresh" className="od-icon-button" title="刷新网页与文档" aria-label="刷新网页与文档">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7"/>
                  </svg>
                </DevelopField>
              </div>
              <details className="od-disclosure od-disclosure--flat">
                <summary>更换网页或子框架</summary>
                <div className="od-stack">
                  <div className="od-form-field">
                    <label htmlFor="sdk-tab" className="od-field-label">选择网页</label>
                    <DevelopField as="select" id="sdk-tab" className="od-field"/>
                  </div>
                  <div className="od-form-field">
                    <label htmlFor="sdk-document" className="od-field-label">网页文档</label>
                    <DevelopField as="select" id="sdk-document" className="od-field"/>
                  </div>
                  <DevelopField as="button" id="sdk-use-current" className="od-button od-button--secondary"/>
                </div>
              </details>
              <DevelopField as="fieldset" id="sdk-capabilities" aria-describedby="sdk-capabilities-help">
                <legend className="od-field-label">
                  {"开发服务"}
                </legend>
              </DevelopField>
              <p id="sdk-capabilities-help">
                {"已默认选中当前可用服务，可取消不需要的项目。勾选后仍需点击批准才会授权。"}
              </p>
              <label htmlFor="sdk-target-origins" className="od-field-label">
                {"额外访问的网站（可选，每行一个，最多 8 个）"}
              </label>
              <DevelopField as="textarea" id="sdk-target-origins" rows="3" maxLength="18000" spellCheck={false} placeholder="https://api.example.com\nhttp://127.0.0.1:43111" aria-describedby="sdk-target-help" className="od-field"/>
              <p id="sdk-target-help">
                {"HTTP 默认可访问当前网页同源地址；需要跨站访问时，在此填写目标地址的协议、主机和端口，例如 https://api.example.com。不要填写路径、查询参数或通配符。本次批准以所选文档、服务和这里填写的完整范围为准，不自动合并旧授权。"}
              </p>
              <details open className="od-disclosure od-disclosure--flat">
                <summary>
                  <span>
                    {"本次授权范围（网页、文档、服务与访问目标）"}
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
                {"请选择网页和当前文档，核对所选开发服务"}
              </DevelopField>
              <DevelopField as="pre" id="sdk-result" aria-label="SDK 安装结果" className="od-result">
              </DevelopField>
            </section>
          </DevelopField>
          <DevelopField as="details" id="developer-health-diagnostics" className="od-disclosure od-disclosure--flat">
            <summary id="health-title">
              {"目标健康检查"}
            </summary>
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
        </DevelopField>
  );
}
