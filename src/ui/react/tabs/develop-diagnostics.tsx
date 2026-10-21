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
              <p id="sdk-target-help">
                {"留空仅允许来源同源；这里是完整的新范围，不与旧授权自动合并。协议、主机和有效端口精确匹配；不能填写账户、路径、查询或通配符。回环与局域网也须明确列出。原生权限可能覆盖更多端口，但不会扩大应用授权；此检查不是 DNS 重绑定防护。"}
              </p>
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
