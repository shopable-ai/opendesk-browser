import * as React from 'react';
import {Button} from '../components/ui/button.tsx';
import {UninstallDialog} from './tools.tsx';
import './locale-manager.css';
import {LOCALE_PACK_MAX_BYTES} from '../../sidebar-tools/locale-packs.js';

const languageNames={auto:'跟随浏览器',en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'};
const languageName=value=>languageNames[value]||value;
const failureText=failure=>{
  const code=failure?.code||'';
  if(code.includes('OUTCOME_UNKNOWN'))return '保存结果未知。请重新核对存储后再操作；系统不会自动重放保存。';
  if(code.includes('RECOVERY_REQUIRED'))return '请先重新核对存储，再重新选择需要执行的操作。';
  if(code==='E_TOOL_CHANGED')return '应用已更新或卸载。请重新打开语言管理后再导入。';
  if(code==='E_TOOL_NO_LOCALIZATION')return '此应用未声明本地化资源，无法安装语言包。';
  if(code.includes('QUOTA'))return '本地存储空间不足。请先导出备份，再移除不需要的语言包。';
  if(code==='E_UI_LOCALE_STORAGE')return '默认语言未能确认保存。请重新核对存储。';
  if(failure instanceof SyntaxError)return 'JSON 文件无效，请检查文件格式后重新导入。';
  if(code==='E_TOOL_LOCALIZATION'&&failure.message?.includes('blank message text'))
    return '语言包包含空白文案。请补全译文，或删除该词条以回退原文。';
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
  const [maintenanceOpen,setMaintenanceOpen]=React.useState(Boolean(model.importPack));
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
  const importRef=React.useRef(null),previewRef=React.useRef(null),deleteRef=React.useRef(null),maintenanceRef=React.useRef(null);
  const fileRef=React.useRef(null),alive=React.useRef(true),operation=React.useRef(false);
  const tool=tools.find(item=>item.id===toolId);
  const globalLocale=localeController?.getLocale?.()||'zh-CN';
  let available=[],toolPreference=null,catalog=null,localeReadError=null;
  try{
    if(tool&&service){
      available=service.getAvailableLocales(tool);
      toolPreference=service.getToolLocale(toolId);
      catalog=service.getCatalog(tool,globalLocale);
    }
  }catch(failure){localeReadError=failure;available=[];toolPreference=null;catalog=null;}
  const ready=Boolean(service&&tool&&serviceStatus==='ready'&&!localeReadError);
  const requested=toolPreference||globalLocale;
  const effective=catalog?.locale;
  const missingLanguage=Boolean(effective&&effective!==requested);
  const updateTargetForTool=()=>{
    if(!preview&&!model.importPack)setTarget(effective||'en');
  };
  React.useEffect(updateTargetForTool,[toolId,serviceStatus]);
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
    const previousFocus=document.activeElement;
    operation.current=true;setBusy(true);setError('');setNotice('');
    try{await action();}catch(failure){if(alive.current)report(failure);}
    finally{operation.current=false;if(alive.current){setBusy(false);
      setTimeout(()=>{
        if(!alive.current)return;
        const focused=document.activeElement;
        if(!focused?.isConnected||focused?.getAttribute('role')==='dialog'){
          if(previousFocus?.isConnected&&!previousFocus.disabled&&!previousFocus.closest('details:not([open])'))
            previousFocus.focus({preventScroll:true});
          else returnToImport();
        }
      },0);}}
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
    setToolId(pack.toolId);setTarget(pack.targetLocale);setMaintenanceOpen(true);
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
  const changeToolLanguage=value=>{if(!ready)return;void run(async()=>{
    await service.setToolLocale(toolId,value==='follow'?null:value);
    if(!alive.current)return;
    const actual=service.getCatalog(tool,localeController?.getLocale?.()||'zh-CN')?.locale;
    setNotice('已保存并立即应用：'+languageName(actual)+'。'+
      (value==='follow'?'此工具跟随 OpenDesk 默认语言。':'仅更改此工具及其网页界面。'));
  });};
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
  const returnToImport=()=>{
    const button=importRef.current;
    const target=!button||button.disabled||button.closest('details:not([open])')?maintenanceRef.current:button;
    target?.focus({preventScroll:true});
  };
  const importPreview=preview?.result;
  const overwrite=Boolean(preview&&packs.some(pack=>pack.targetLocale===preview.pack.targetLocale));
  return <UninstallDialog open title="语言 / Language" busy={busy} onCancel={model.onClose}
    cancelLabel="关闭语言与翻译" closeLabel="关闭语言与翻译"
    returnFocusSelector={model.returnFocusSelector||"#extension-center-language-settings"}>
    <div className="od-locale-manager od-stack">
      <label className="od-locale-field" htmlFor="od-locale-global">OpenDesk 默认语言
        <select id="od-locale-global" className="od-field" value={preference} aria-describedby="od-locale-global-hint"
          disabled={busy||!localeController||globalUnknown}
          onChange={event=>{
            if(localeController?.getError?.()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN')return;
            const value=event.currentTarget.value;void run(async()=>{
            try{await localeController.setLocale(value);}finally{syncGlobal();}
            setNotice('默认语言已保存：'+languageName(localeController.getLocale())+'。跟随默认的工具会立即更新。');
          });}}>
          {Object.entries(languageNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p id="od-locale-global-hint">当前默认：{languageName(globalLocale)}。用于支持翻译的界面与选择“跟随”的工具；尚未翻译的文案保留原文。</p>
      {model.toolId?<p>当前工具：{tool?.title||tool?.name||'应用已移除或不支持翻译'}</p>:
      <label className="od-locale-field" htmlFor="od-locale-tool">选择工具
        <select id="od-locale-tool" className="od-field" value={toolId} disabled={busy||!tools.length}
          onChange={event=>selectTool(event.currentTarget.value)}>
          {!tools.length&&<option value="">暂无支持语言切换的工具</option>}
          {model.toolId&&!tool&&<option value={model.toolId}>应用已移除或不支持翻译</option>}
          {tools.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id}</option>)}
        </select>
      </label>}
      {tool&&<section className="od-locale-preview" aria-label="日常语言切换">
        <label className="od-locale-field" htmlFor="od-locale-tool-language">此工具语言
          <select id="od-locale-tool-language" className="od-field" value={localeReadError?'unreadable':toolPreference||'follow'}
            aria-describedby="od-locale-tool-status od-locale-tool-hint" disabled={busy||!ready}
            onChange={event=>changeToolLanguage(event.currentTarget.value)}>
            {localeReadError&&<option value="unreadable">读取失败，请重新核对</option>}
            <option value="follow">跟随 OpenDesk（{languageName(globalLocale)}）</option>
            {toolPreference&&!available.includes(toolPreference)&&<option value={toolPreference}>
              仅此工具：{languageName(toolPreference)}（缺少语言包）
            </option>}
            {available.map(locale=><option key={locale} value={locale}>仅此工具：{languageName(locale)}</option>)}
          </select>
        </label>
        <p id="od-locale-tool-status" role="status">{ready&&effective?
          '当前生效：'+languageName(effective)+' · '+(toolPreference?'仅此工具':'跟随 OpenDesk'):
          localeReadError?'无法读取当前工具语言，请重新核对。':'正在读取工具语言…'}</p>
        <p id="od-locale-tool-hint">选择后立即生效并自动保存。仅此工具的选择不影响其他工具；也会同步到它已获授权的网页界面，网页正文保持原样。</p>
        {(missingLanguage||Boolean(catalog?.missing.length))&&<div className="od-locale-preview">
          <p>{missingLanguage?'此工具暂未提供 '+languageName(requested)+'，当前使用 '+languageName(effective)+'。':
            '有 '+catalog.missing.length+' 条文案尚未翻译，暂时显示原文。'}</p>
          <Button disabled={busy||!ready} onClick={()=>{targetChanged(requested);setMaintenanceOpen(true);
            setTimeout(()=>importRef.current?.focus(),0);}}>添加或补全此语言…</Button>
        </div>}
      </section>}
      {busy&&<p role="status">正在处理，请稍候…</p>}
      {error&&<p role="alert">{error}</p>}
      {localeReadError&&<p role="alert" aria-label="工具语言读取错误">{failureText(localeReadError)}</p>}
      {notice&&<p role="status">{notice}</p>}
      {!service&&<p role="status">语言包服务暂不可用，请稍后重试。</p>}
      {globalError&&<p role="alert" aria-label="默认语言存储错误">
        默认语言：{failureText(globalError)}
      </p>}
      {(globalError||service&&(serviceStatus!=='ready'||error||localeReadError))&&<div className="od-locale-recovery">
        <p role="status">{globalUnknown?'默认语言写入结果未知，已暂停写入；请重新核对存储，不会自动重放保存。':serviceStatus==='unknown'?'上次写入结果未知，请重新核对存储；不会自动重放导入。':serviceStatus==='ready'?'本次操作未完成。可修正问题后重试，或重新读取当前设置；重新读取不会执行保存或导入。':'语言存储状态需要核对；重新读取不会执行保存或导入。'}</p>
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
          if(tool&&service){service.getAvailableLocales(tool);service.getToolLocale(toolId);service.getCatalog(tool,localeController?.getLocale?.()||'zh-CN');}
          setError('');setNotice('已重新核对存储，请审阅当前状态后继续。');
        })}>重新核对存储</Button>
      </div>}
      <details className="od-disclosure od-disclosure--flat" open={maintenanceOpen}
        onToggle={event=>setMaintenanceOpen(event.currentTarget.open)}>
        <summary ref={maintenanceRef}>添加或管理语言包</summary>
        <div className="od-locale-preview">
      <p>日常切换只需使用上方选择框。需要添加语言、补译或备份时再使用这里；选择下面的语言不会切换界面。</p>
      <label className="od-locale-field" htmlFor="od-locale-target">要翻译或管理的语言
        <input id="od-locale-target" type="text" className="od-field" value={target} list="od-locale-targets" disabled={busy||!ready}
          placeholder="例如 en、ja、fr" onInput={event=>targetChanged(event.currentTarget.value)}/>
        <datalist id="od-locale-targets">{locales.map(locale=><option key={locale} value={locale}>{languageNames[locale]||locale}</option>)}</datalist>
      </label>
      {packs.length>0&&<section className="od-locale-preview" aria-label="已安装语言包">
        <h3>已安装语言包</h3>
        <div className="od-locale-actions">{packs.map(pack=><Button key={pack.targetLocale}
          aria-pressed={target===pack.targetLocale} disabled={busy}
          onClick={()=>targetChanged(pack.targetLocale)}>{languageNames[pack.targetLocale]||pack.targetLocale} · {pack.targetLocale}</Button>)}</div>
      </section>}
      {tool&&<p>原文语言：{languageName(tool.localization.sourceLocale)} · 已添加语言包：{packs.length}。
        {target===tool.localization.sourceLocale?'这是原文语言，无需补译。':''}</p>}
      <div className="od-locale-actions">
        <Button ref={importRef} disabled={busy||!service||Boolean(localeReadError)} onClick={()=>fileRef.current?.click()}>导入语言包…</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" aria-label="选择语言包文件"
          disabled={busy||!service||Boolean(localeReadError)} hidden onChange={event=>{readFile(event.currentTarget.files);event.currentTarget.value='';}}/>
        <Button disabled={busy||!ready||!installedPack} onClick={()=>exportData('exportPack','locale-pack')}>导出语言包</Button>
        <Button disabled={busy||!ready||!target||target===tool?.localization.sourceLocale} onClick={()=>exportData('exportMissingTask','translation-task')}>导出缺失翻译 AI 任务</Button>
        <Button variant="danger" disabled={busy||!ready||!installedPack}
          onClick={()=>setPendingDelete({toolId,locale:target,title:tool?.title||toolId})}>删除语言包…</Button>
      </div>
      <p>导入后会先预览，再由你确认；确认后应用到此工具。导出补译任务不会自动发送文案给 AI。</p>
        </div>
      </details>
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
        <p>删除 {pendingDelete.title} 的 {pendingDelete.locale} 导入语言包？内置翻译不会删除。</p>
        <div className="od-locale-actions">
          <Button ref={deleteRef} disabled={busy} onClick={()=>{setPendingDelete(false);returnToImport();}}>取消删除</Button>
          <Button variant="danger" disabled={busy||!ready} onClick={()=>void run(async()=>{
            await service.remove(pendingDelete.toolId,pendingDelete.locale);await reload(pendingDelete.toolId);
            setPendingDelete(false);setPreview(null);setNotice('语言包已删除。');
          })}>确认删除</Button>
        </div>
      </section>}
      <div className="od-locale-actions"><Button disabled={busy} data-uninstall-cancel="true" onClick={model.onClose}>关闭</Button></div>
    </div>
  </UninstallDialog>;
}
