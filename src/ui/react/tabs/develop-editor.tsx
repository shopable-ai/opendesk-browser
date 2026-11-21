import * as React from 'react';
import {DevelopField,DevelopWorldChoices,DevelopIcon,DevelopOptionsSummary} from './develop-controls.tsx';
import {DevelopDependencies} from './develop-dependencies.tsx';
import {translateUiText} from '../../../i18n/strings.js';
import {BROWSER_PUBLIC_CONFIG} from '../../../config/browser-config.js';
import {DevelopPromptButton} from './develop-ai-prompt.tsx';

// Keep the current-page controls and the single editable source projection separate.
export function DevelopContextHeader(){
  return (
        <div className="developer-context od-stack">
          <section aria-label="当前网页" className="developer-target">
            <DevelopField as="details" id="developer-target-detail" className="developer-target-card od-disclosure od-disclosure--icon">
              <summary className="developer-page-summary">
                <span className="developer-target-icon"><DevelopIcon name="globe"/></span>
                <span className="developer-target-copy">
                  <span className="visually-hidden">当前网页</span>
                  <DevelopField as="strong" id="script-current-page-title" className="page-title">正在识别…</DevelopField>
                  <DevelopField as="span" id="script-current-page-host" title="当前活动网页" data-opendesk-react-owner="developer-target-host">正在识别…</DevelopField>
                </span>
                <DevelopField as="span" id="script-current-page-status" role="status" aria-live="polite" data-state="resolving">检查中</DevelopField>
                <DevelopIcon name="chevron" className="od-disclosure-chevron"/>
              </summary>
              <div className="developer-page-detail">
                <DevelopField as="p" id="script-current-page-url" className="identity"/>
              </div>
            </DevelopField>
          </section>
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

        </div>
  );
}

export function DevelopSourceEditor({view,actions,locale='zh-CN'}){
  const {fields}=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const framework=fields['page-component-react'].checked?'react':fields['page-component-vue'].checked?'vue':'javascript';
  const page=fields['script-javascript-world'].value==='page';
  const longDraftRun=Number(fields['script-draft-deadline-ms'].value)>=60*60*1000;
  const readOnly=fields['script-source'].readOnly;
  const filename=fields['program-source-files'].value||'program.js';
  const mode=framework==='javascript'?(page?'page':'controller'):framework;
  const reference=BROWSER_PUBLIC_CONFIG?.navigation.developerReferences[mode];
  const t=(key,params={})=>translateUiText('develop.editor.'+key,params,locale);
  const referenceMode=t(mode);
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
          <div className="developer-editor-controls">
          <DevelopField as="div" id="page-component-editor-tools" className="od-toolbar">
            <DevelopField as="fieldset" id="page-component-framework" aria-describedby="page-component-hint">
              <legend className="visually-hidden">
                {"代码类型"}
              </legend>
              <div className="page-component-choices developer-choices od-segmented" data-opendesk-react-owner="developer-framework">
                <label htmlFor="page-component-javascript" title="JavaScript">
                  <DevelopField as="input" id="page-component-javascript" type="radio" name="page-component-choice" aria-label="JavaScript"/>
                  <span>
                    {"JS"}
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
            <span className="page-component-label">运行位置</span>
            <DevelopWorldChoices/>
          </DevelopField>
          </div>
          <div className="developer-source-input">
          <div className="developer-editor-card">
          <div className="developer-editor-head">
            {readOnly&&<div className="developer-editor-identity">
              <span className="developer-editor-readonly">{t('readOnly')}</span>
              <span className="developer-editor-filename od-technical" title={filename}>{filename}</span>
            </div>}
            <div className="developer-editor-actions" role="group" aria-label={t('references')}>
              <DevelopPromptButton/>
              {reference&&['examples','help'].map(kind=>{
                const label=t(kind,{mode:referenceMode});
                return <a key={kind} id={'developer-source-'+kind} className="od-icon-button od-icon-button--quiet"
                  href={reference[kind]} target="_blank" rel="noopener noreferrer"
                  title={label} aria-label={label}><DevelopIcon name={kind==='examples'?'code':'help'}/></a>;
              })}
            </div>
          </div>
          <DevelopField as="label" htmlFor="script-source" className="visually-hidden" id="developer-source-label">
            {"JavaScript、React JSX 或 Vue SFC 源码编辑器"}
          </DevelopField>
          <DevelopField as="textarea" id="script-source" data-opendesk-react-owner="developer-source" rows="6" wrap="off" spellCheck={false} autoCapitalize="off" className="od-field" aria-describedby={`developer-environment-hint page-component-hint${readOnly?'':' developer-draft-help'}`}/>
          </div>
          <p id="developer-environment-hint" className="visually-hidden">
            {framework==='react'?'React 组件显示在网页；点击运行才执行。':framework==='vue'?'Vue 组件显示在网页；点击运行才执行。':page?'使用 document 修改网页；点击运行才执行。':'使用 page 操作网页；点击运行才执行。'}
          </p>
          {!readOnly&&<p className="visually-hidden" id="developer-draft-help">草稿未自动保存；关闭或刷新后不恢复。请用「保存脚本」保留版本。</p>}

          </div>
          <DevelopField as="p" id="page-component-status" role="status" aria-live="polite"/>
          <DevelopField as="p" id="page-preview-status" role="status"/>
          <div className="developer-source-options od-stack">
          <details className="developer-run-options developer-options od-disclosure od-disclosure--icon">
            <DevelopOptionsSummary optional>运行选项</DevelopOptionsSummary>
            <div className="developer-option-body od-stack">
              <DevelopField as="div" id="manual-project-params-tools" className="developer-params od-form-field">
                <label htmlFor="script-params" className="od-field-label">参数 JSON</label>
                <DevelopField as="textarea" id="script-params" rows="3" spellCheck={false} className="od-field"/>
              </DevelopField>
              <DevelopField as="div" id="script-draft-deadline-row" className="od-form-field">
                <label htmlFor="script-draft-deadline-ms" className="od-field-label">下次草稿最长运行时间</label>
                <DevelopField as="select" id="script-draft-deadline-ms" className="od-field"
                  aria-describedby={longDraftRun?'script-draft-deadline-help script-draft-deadline-note':'script-draft-deadline-help'}/>
                <p id="script-draft-deadline-help" className="od-field-help">仅用于下一次自动化草稿，运行开始后期限固定。已安装任务沿用安装时声明的期限。</p>
                <p id="script-draft-deadline-note" className="od-field-help" role="status" aria-live="polite" hidden={!longDraftRun}>长时运行请保持浏览器和当前运行页面打开，并让电脑保持唤醒。关闭运行页面会终止草稿。</p>
                <details className="od-disclosure od-disclosure--flat">
                  <summary>长时间等待说明</summary>
                  <div className="od-stack">
                    <p className="od-field-help">总运行时间包含等待时间。单次 Locator 等待默认 30 秒；需要更久时，可在代码中设置 <code>timeout: 0</code>，等待仍受草稿总期限和「停止」控制。</p>
                    <p className="od-field-help">侧栏持有的草稿会在关闭侧栏时终止；切换产品 Tab 不会终止运行。此设置不提供浏览器关闭或电脑休眠期间的持续执行。</p>
                  </div>
                </details>
              </DevelopField>
          <div className="od-stack" hidden={!page&&framework==='javascript'}>
            <DevelopField as="h3" id="page-preview-mode-title" className="od-field-label"/>
            <DevelopField as="p" id="page-preview-mode-hint" className="od-field-help"/>
          </div>
          <details className="developer-environment-guide od-disclosure od-disclosure--flat">
            <summary>运行方式说明</summary>
            <div className="od-stack">
              <DevelopField as="p" id="page-component-hint" className="hint">
                {"编辑源码不会自动执行，点击运行才会执行"}
              </DevelopField>
              <p><strong>自动化</strong>：执行一系列网页操作，选择 JavaScript + 自动化（Controller）。</p>
              <p><strong>网页</strong>：增加按钮、修改 DOM 或挂载 React / Vue 组件，运行在当前网页（Page）。</p>
              <p><strong>侧栏应用</strong>：从「本地项目」调试独立工具；这里的 React / Vue 编辑器用于网页组件。</p>
              <p><strong>侧栏 + 网页</strong>：从「本地项目」选择组合项目，点击「在侧栏调试」；组合包经「扩展 → 导入」审阅安装后，再打开或刷新获准的网站验证网页部分。侧栏预览不会更新已安装的网页代码。</p>
              <p>空白或未修改的示例随代码类型和运行位置切换；你的代码会保留。点击「运行」才执行。安装、网站授权与自动运行范围仍需原审阅。</p>
            </div>
          </details>
            </div>
          </details>
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
