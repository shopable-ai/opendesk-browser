import * as React from 'react';
import {DevelopField} from './develop-controls.tsx';
import {DevelopDependencies} from './develop-dependencies.tsx';

// Keep the current-page controls and the single editable source projection separate.
export function DevelopContextHeader(){
  return (
        <div className="developer-context od-stack">
          <DevelopField as="div" id="developer-source-switch" className="developer-source-switch od-toolbar od-page-head" role="group" aria-label="代码来源" data-mode="manual">
            <DevelopField as="span" className="od-page-title" id="developer-source-title">
              {"直接编辑"}
            </DevelopField>
            <div className="od-page-actions" role="group" aria-label="开发页操作">
              <DevelopField as="button" type="button" id="program-new-script" title="新建 JavaScript（退出当前只读源码视图）" aria-label="新建 JavaScript" className="od-icon-button">
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
                <DevelopField as="span" id="script-current-page-host" title="当前活动网页" data-opendesk-react-owner="developer-target-host">
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
  );
}

export function DevelopSourceEditor({view,actions}){
  const {fields}=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const framework=fields['page-component-react'].checked?'react':fields['page-component-vue'].checked?'vue':'javascript';
  const page=fields['script-javascript-world'].value==='page';
  const placeholder=framework==='react'?`// React 网页组件示例
import React from 'react';

export default function App() {
  return <button>你好，网页</button>;
}`:framework==='vue'?`<!-- Vue 网页组件示例 -->
<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>

<template>
  <button @click="count++">{{ count }}</button>
</template>`:page?`// 网页示例：使用当前页面 DOM
const heading = document.querySelector('h1');
return heading?.textContent;`:`// 自动化示例：使用 page 操作网页
async function main() {
  return await page.title();
}`;
  return <>
        <DevelopField as="div" id="manual-source-editor">
          <DevelopField as="p" id="program-source-info" className="identity od-technical" role="status">
          </DevelopField>
          <DevelopField as="div" id="program-source-toolbar" className="program-source-toolbar od-toolbar" role="group" aria-label="源码视图操作">
            <label htmlFor="program-source-files" className="visually-hidden">
              {"实际执行代码或项目源码快照"}
            </label>
            <DevelopField as="select" id="program-source-files" className="od-field"/>
          </DevelopField>
          <div className="developer-editor-controls od-stack">
          <DevelopField as="div" id="page-component-editor-tools" className="od-toolbar">
            <DevelopField as="fieldset" id="page-component-framework" aria-describedby="page-component-hint">
              <legend className="visually-hidden">
                {"代码类型"}
              </legend>
              <span className="page-component-label" aria-hidden="true">
                {"代码类型"}
              </span>
              <div className="page-component-choices developer-choices od-segmented" data-opendesk-react-owner="developer-framework">
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
          <DevelopField as="div" id="script-javascript-world-row" data-opendesk-react-owner="developer-world" className="od-toolbar" role="group" aria-label="JavaScript 执行环境">
            <span className="page-component-label" aria-hidden="true">
              {"运行环境"}
            </span>
            <DevelopField as="fieldset" id="script-javascript-world" className="developer-choices od-segmented" aria-label="JavaScript 运行环境" aria-describedby="developer-environment-hint">
              <legend className="visually-hidden">JavaScript 运行环境</legend>
            </DevelopField>
          </DevelopField>
          </div>
          <div className="od-form-field">
          <DevelopField as="label" htmlFor="script-source" className="visually-hidden" id="developer-source-label">
            {"JavaScript、React JSX 或 Vue SFC 源码编辑器"}
          </DevelopField>
          <DevelopField as="textarea" id="script-source" data-opendesk-react-owner="developer-source" rows="6" wrap="off" spellCheck={false} autoCapitalize="off" className="od-field" placeholder={fields['script-source'].readOnly?'':placeholder} aria-describedby="developer-environment-hint page-component-hint"/>
          <p id="developer-environment-hint" className="od-field-help">
            {framework==='react'?'React 组件显示在网页；点击运行才执行。':framework==='vue'?'Vue 组件显示在网页；点击运行才执行。':page?'使用 document 修改网页；点击运行才执行。':'使用 page 操作网页；点击运行才执行。'}
          </p>

          </div>
          <div className="developer-source-options od-stack">
          <details className="developer-environment-guide od-disclosure od-disclosure--flat">
            <summary>如何选择运行方式</summary>
            <div className="od-stack">
              <DevelopField as="p" id="page-component-hint" className="hint">
                {"编辑源码不会自动执行，点击运行才会执行"}
              </DevelopField>
              <p><strong>自动化</strong>：执行一系列网页操作，选择 JavaScript + 自动化（Controller）。</p>
              <p><strong>网页</strong>：增加按钮、修改 DOM 或挂载 React / Vue 组件，运行在当前网页（Page）。</p>
              <p><strong>侧栏应用</strong>：从「本地项目」调试独立工具；这里的 React / Vue 编辑器用于网页组件。</p>
              <p><strong>侧栏 + 网页</strong>：从「本地项目」选择组合项目，点击「在侧栏调试」；组合包经「扩展 → 导入」审阅安装后，再打开或刷新获准的网站验证网页部分。侧栏预览不会更新已安装的网页代码。</p>
              <p>切换只改变运行方式，不替换源码；点击「运行」才执行。安装、网站授权与自动运行范围仍需原审阅。</p>
            </div>
          </details>
        <DevelopField as="details" id="manual-project-params-tools" className="developer-params od-disclosure od-disclosure--flat">
          <summary>
            {"参数 JSON（可选）"}
          </summary>
          <label htmlFor="script-params" className="od-field-label">
            {"参数 JSON"}
          </label>
          <DevelopField as="textarea" id="script-params" rows="3" spellCheck={false} className="od-field"/>
        </DevelopField>
          </div>
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

  </>;
}
