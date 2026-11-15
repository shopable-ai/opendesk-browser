import * as React from 'react';
import {MyControl} from './my-controls.tsx';
import {MyTaskDetail} from './tasks.tsx';

// Immutable text only. TaskWorkbench owns reads, hashes and installation fences.
export function TaskCode({view}){
  const detail=view.data.taskInspection;
  const heading=React.useRef(null);
  React.useLayoutEffect(()=>{if(detail)heading.current?.focus();},[detail]);
  if(!detail)return null;
  return <MyControl view={view} as="details" id="task-code-panel" className="od-disclosure">
    <summary ref={heading} tabIndex={-1}>查看代码 · v{detail.identity.version}</summary>
    <p className="hint">只读查看此固定版本，不运行、不安装，也不申请权限。修改请使用「复制为新草稿」。</p>
    {detail.loading&&<p role="status">正在核对固定源码与安装身份…</p>}
    {detail.error&&<div role="alert"><p>{detail.error}</p>
      <button type="button" className="od-button od-button--secondary" onClick={()=>view.actions.taskViewCodeClick?.()}>重新读取</button>
    </div>}
    {detail.source!==undefined&&<>
      <MyTaskDetail value={detail.facts}/>
      <pre className="od-result" aria-label="只读任务源码">{detail.source}</pre>
      <details className="od-disclosure od-disclosure--flat"><summary>Manifest 与版本身份</summary>
        <pre className="od-result" aria-label="固定任务 Manifest">{JSON.stringify(detail.manifest,null,2)}</pre>
        <pre className="od-result">{`源码 SHA-256：${detail.identity.contentHash}\nManifest SHA-256：${detail.identity.manifestHash}\n安装 ID：${detail.identity.installationId}\n安装代际：${detail.identity.generation}`}</pre>
      </details>
    </>}
    <p className="hint">任务包包含明文 JavaScript。本机有相应文件或浏览器资料权限的管理者可查看；此入口不会上传代码或开放远程管理权限。</p>
  </MyControl>;
}
