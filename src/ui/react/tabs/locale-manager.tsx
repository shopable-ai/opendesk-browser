import * as React from 'react';
import {Button} from '../components/ui/button.tsx';
import {UninstallDialog} from './tools.tsx';
import './locale-manager.css';
import {LOCALE_PACK_MAX_BYTES} from '../../sidebar-tools/locale-packs.js';

const languageNames={auto:'跟随浏览器',en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'};
const failureText=failure=>{
  const code=failure?.code||'';
  if(code.includes('OUTCOME_UNKNOWN'))return '保存结果未知。请重新核对存储后再操作；系统不会自动重放保存。';
  if(code.includes('RECOVERY_REQUIRED'))return '请先重新核对存储，再重新选择需要执行的操作。';
  if(code==='E_TOOL_CHANGED')return '应用已更新或卸载。请重新打开语言管理后再导入。';
  if(code==='E_TOOL_NO_LOCALIZATION')return '此应用未声明本地化资源，无法安装语言包。';
  if(code.includes('QUOTA'))return '本地存储空间不足。请先导出备份，再移除不需要的语言包。';
  if(code==='E_UI_LOCALE_STORAGE')return '默认语言未能确认保存。请重新核对存储。';
  if(failure instanceof SyntaxError)return 'JSON 文件无效，请检查文件格式后重新导入。';
  if(code==='E_LOCALE_PACK'||code.startsWith('E_TOOL_LOCALIZATION'))
    return '语言包不符合规则，请核对应用 ID、语言、原文、占位符和纯文本内容。';
  return String(failure?.message||failure);
};

// Downloads contain data only. No tool source, generated code or AI is executed.
export function downloadLocaleData(value,filename,doc=document){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=doc.createElement('a');anchor.href=url;anchor.download=filename;
  doc.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function LocaleManager({model}){
  const {service,localeController}=model;
  const tools=model.tools||[];
  const [toolId,setToolId]=React.useState(model.toolId||tools[0]?.id||'');
  const [target,setTarget]=React.useState('en');
  const [packs,setPacks]=React.useState([]);
  const [serviceStatus,setServiceStatus]=React.useState(service?.getState().status||'loading');
  const [preview,setPreview]=React.useState(null);
  const [pendingDelete,setPendingDelete]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [notice,setNotice]=React.useState('');
  const [error,setError]=React.useState('');
  const [preference,setPreference]=React.useState(localeController?.getPreference?.()||'auto');
  const [globalError,setGlobalError]=React.useState(()=>localeController?.getError?.()||null);
  const globalUnknown=globalError?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN';
  const importRef=React.useRef(null),previewRef=React.useRef(null),deleteRef=React.useRef(null);
  const fileRef=React.useRef(null),alive=React.useRef(true),operation=React.useRef(false);
  const tool=tools.find(item=>item.id===toolId);
  const ready=Boolean(service&&tool&&serviceStatus==='ready');
  const report=failure=>setError(failureText(failure));
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const syncGlobal=()=>{
    setPreference(localeController?.getPreference?.()||'auto');
    setGlobalError(localeController?.getError?.()||null);
  };
  React.useEffect(()=>{
    syncGlobal();return localeController?.subscribe?.(syncGlobal);
  },[localeController]);
  const run=async action=>{
    if(operation.current)return;
    operation.current=true;setBusy(true);setError('');setNotice('');
    try{await action();}catch(failure){if(alive.current)report(failure);}
    finally{operation.current=false;if(alive.current){setBusy(false);
      setTimeout(()=>{if(alive.current&&!document.activeElement?.isConnected)returnToImport();},0);}}
  };
  const readPacks=(id,state=service.getState())=>Object.values(state.tools?.[id]?.packs||{});
  const reload=async id=>{
    const state=await service.reload();
    if(alive.current){setPacks(readPacks(id,state));setServiceStatus(state.status);}
  };
  React.useEffect(()=>{
    let current=true;
    setPacks([]);setPendingDelete(false);
    if(!service||!toolId)return;
    const update=state=>{if(current){setPacks(readPacks(toolId,state));setServiceStatus(state.status);
      if(state.error)report(state.error);}};
    const stop=service.subscribe(update);
    Promise.resolve(service.ready).then(()=>update(service.getState()),failure=>{if(current)report(failure);});
    return ()=>{current=false;stop();};
  },[service,toolId]);
  const previewPack=async pack=>{
    const selected=tools.find(item=>item.id===pack.toolId);
    if(!selected)throw Error('该应用未安装或不支持翻译，不能导入语言包。');
    if(service.getState().status!=='ready')await service.ready;
    const result=await service.preview(pack,selected);
    if(!alive.current)return;
    setToolId(pack.toolId);setTarget(pack.targetLocale);
    setPreview({pack:result.pack,result,tool:selected});setPendingDelete(false);
  };
  // External imports use the same preview and confirmation as the file picker.
  React.useEffect(()=>{
    if(!model.importPack||!service)return;
    void run(()=>previewPack(model.importPack));
  },[model.importPack,service]);
  const readFile=files=>void run(async()=>{
    const file=files?.[0];if(!file)return;
    if(files.length!==1||file.size>LOCALE_PACK_MAX_BYTES)throw Error('请选择一个不超过 256 KiB 的语言包。');
    const pack=JSON.parse(await file.text());
    if(pack?.format!=='opendesk.locale-pack.v1')throw Error('请选择 OpenDesk 语言包；此入口不会安装代码。');
    await previewPack(pack);
  });
  const selectTool=value=>{setToolId(value);setPreview(null);setPendingDelete(false);setNotice('');};
  const targetChanged=value=>{setTarget(value);setPendingDelete(false);};
  const exportData=(method,suffix)=>void run(async()=>{
    const value=method==='exportPack'?await service.exportPack(toolId,target):
      await service.exportTranslationTask(tool,target);
    if(!value)throw Error('该语言没有已导入的语言包。');
    if(!alive.current)return;
    downloadLocaleData(value,toolId+'.'+target+'.'+suffix+'.json');
    setNotice(suffix==='translation-task'?'已导出缺失翻译 AI 任务；请在你选择的 AI 中处理，再导入语言包预览。':'已导出语言包。');
  });
  const installedPack=packs.find(pack=>pack.targetLocale===target);
  const locales=[...new Set(['en','zh-CN','zh-TW','ja',tool?.localization?.sourceLocale,
    ...Object.keys(tool?.localization?.messages||{}),...packs.map(pack=>pack.targetLocale)].filter(Boolean))];
  React.useLayoutEffect(()=>{
    if(preview)previewRef.current?.focus({preventScroll:true});
    else if(pendingDelete)deleteRef.current?.focus({preventScroll:true});
  },[preview,pendingDelete]);
  const returnToImport=()=>importRef.current?.focus({preventScroll:true});
  const importPreview=preview?.result;
  const overwrite=Boolean(preview&&packs.some(pack=>pack.targetLocale===preview.pack.targetLocale));
  return <UninstallDialog open title="语言与翻译" busy={busy} onCancel={model.onClose}
    cancelLabel="关闭语言与翻译" closeLabel="关闭语言与翻译"
    returnFocusSelector={model.returnFocusSelector||"#extension-center-more"}>
    <div className="od-locale-manager od-stack">
      <label className="od-locale-field">默认界面语言
        <select className="od-field" value={preference} disabled={busy||!localeController||globalUnknown}
          onChange={event=>{
            if(localeController?.getError?.()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN')return;
            const value=event.currentTarget.value;void run(async()=>{
            try{await localeController.setLocale(value);}finally{syncGlobal();}
            setNotice('默认语言已保存。');
          });}}>
          {Object.entries(languageNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="od-locale-field">已安装且支持翻译的应用
        <select className="od-field" value={toolId} disabled={busy||!tools.length}
          onChange={event=>selectTool(event.currentTarget.value)}>
          {!tools.length&&<option value="">暂无支持 localization 的应用</option>}
          {model.toolId&&!tool&&<option value={model.toolId}>应用已移除或不支持翻译</option>}
          {tools.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id} · {item.id}</option>)}
        </select>
      </label>
      {!service&&<p role="status">语言包服务暂不可用，请稍后重试。</p>}
      {globalError&&<p role="alert" aria-label="默认语言存储错误">
        默认语言：{failureText(globalError)}
      </p>}
      {(globalError||service&&(serviceStatus!=='ready'||error))&&<div className="od-locale-recovery">
        <p role="status">{globalUnknown?'默认语言写入结果未知，已暂停写入；请重新核对存储，不会自动重放保存。':serviceStatus==='unknown'?'上次写入结果未知，请重新核对存储；不会自动重放导入。':'语言存储状态需要核对；重新读取不会执行保存或导入。'}</p>
        <Button disabled={busy} onClick={()=>void run(async()=>{
          // Wait for both readbacks, even if one fails. Never replay a write.
          const results=await Promise.allSettled([
            Promise.resolve().then(()=>service?reload(toolId):undefined),
            Promise.resolve().then(()=>localeController?.load())
          ]);
          if(!alive.current)return;
          syncGlobal();
          const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
          const remainingGlobalError=localeController?.getError?.();
          if(remainingGlobalError)failures.push(remainingGlobalError);
          if(failures.length)throw Error(failures.map(failure=>failure?.message||String(failure)).join('；'));
          setError('');setNotice('已重新核对存储，请审阅当前状态后继续。');
        })}>重新核对存储</Button>
      </div>}
      <label className="od-locale-field">目标语言
        <input type="text" className="od-field" value={target} list="od-locale-targets" disabled={busy||!ready}
          placeholder="例如 en、ja、fr" onInput={event=>targetChanged(event.currentTarget.value)}/>
        <datalist id="od-locale-targets">{locales.map(locale=><option key={locale} value={locale}>{languageNames[locale]||locale}</option>)}</datalist>
      </label>
      {packs.length>0&&<section className="od-locale-preview" aria-label="已安装语言包">
        <h3>已安装语言包</h3>
        <div className="od-locale-actions">{packs.map(pack=><Button key={pack.targetLocale}
          aria-pressed={target===pack.targetLocale} disabled={busy}
          onClick={()=>targetChanged(pack.targetLocale)}>{languageNames[pack.targetLocale]||pack.targetLocale} · {pack.targetLocale}</Button>)}</div>
      </section>}
      {tool&&<p>源语言：{tool.localization.sourceLocale} · 已导入语言包：{packs.length}</p>}
      <div className="od-locale-actions">
        <Button ref={importRef} disabled={busy||!service} onClick={()=>fileRef.current?.click()}>导入语言包…</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" aria-label="选择语言包文件"
          disabled={busy||!service} hidden onChange={event=>{readFile(event.currentTarget.files);event.currentTarget.value='';}}/>
        <Button disabled={busy||!ready||!installedPack} onClick={()=>exportData('exportPack','locale-pack')}>导出语言包</Button>
        <Button disabled={busy||!ready||!target} onClick={()=>exportData('exportMissingTask','translation-task')}>导出缺失翻译 AI 任务</Button>
        <Button variant="danger" disabled={busy||!ready||!installedPack} onClick={()=>setPendingDelete(true)}>删除语言包…</Button>
      </div>
      {preview&&<section className="od-locale-preview od-surface od-surface--padded" aria-label="语言包导入预览">
        <h3 ref={previewRef} tabIndex={-1}>导入预览</h3>
        <p>应用：{preview.pack.toolId} · 目标语言：{preview.pack.targetLocale}</p>
        <p>翻译条目：{Object.keys(preview.pack.messages||{}).length}</p>
        {importPreview&&!importPreview.hashMatches&&<p>源目录已更新；过期条目不会生效，将回退原文。</p>}
        {Boolean(importPreview?.stale?.length)&&<p>过期或未知条目：{importPreview.stale.join('、')}</p>}
        {importPreview?.missing&&<p>缺失翻译：{importPreview.missing.length} 项</p>}
        <dl className="od-locale-samples">{Object.entries(preview.pack.messages).slice(0,5).map(([key,row])=><React.Fragment key={key}>
          <dt>{key}</dt><dd><span>原文：{row.source}</span><span>译文：{row.text}</span></dd>
        </React.Fragment>)}</dl>
        <p>{overwrite?'此语言已有导入包；确认后覆盖原包。':'确认后保存此语言包，不运行任何代码。'}</p>
        <div className="od-locale-actions">
          <Button disabled={busy} onClick={()=>{setPreview(null);setError('');returnToImport();}}>取消导入</Button>
          <Button variant="primary" disabled={busy||!ready} onClick={()=>void run(async()=>{
            await service.install(preview.pack,preview.tool);
            await reload(preview.pack.toolId);setPreview(null);setNotice('语言包已保存。已应用 '+preview.pack.targetLocale+'。');
          })}>{overwrite?'确认覆盖':'确认导入'}</Button>
        </div>
      </section>}
      {pendingDelete&&<section className="od-locale-preview" aria-label="删除语言包确认">
        <p>删除 {tool?.title||toolId} 的 {target} 导入语言包？内置翻译不会删除。</p>
        <div className="od-locale-actions">
          <Button ref={deleteRef} disabled={busy} onClick={()=>{setPendingDelete(false);returnToImport();}}>取消删除</Button>
          <Button variant="danger" disabled={busy} onClick={()=>void run(async()=>{
            await service.remove(toolId,target);await reload(toolId);
            setPendingDelete(false);setPreview(null);setNotice('语言包已删除。');
          })}>确认删除</Button>
        </div>
      </section>}
      {busy&&<p role="status">正在处理，请稍候…</p>}
      {error&&<p role="alert">{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      <div className="od-locale-actions"><Button disabled={busy} data-uninstall-cancel="true" onClick={model.onClose}>关闭</Button></div>
    </div>
  </UninstallDialog>;
}
