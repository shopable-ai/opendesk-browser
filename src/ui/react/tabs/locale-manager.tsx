import * as React from 'react';
import {Button} from '../components/ui/button.tsx';
import {UninstallDialog} from './tools.tsx';
import {localeManagerLocale,localeManagerText} from '../../locale-manager-localization.js';
import {LOCALE_PACK_MAX_BYTES} from '../../sidebar-tools/locale-packs.js';

const languageNames={auto:'auto',en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'};
const failureText=(failure,t)=>{
  if(failure?.localeMessage)return t(failure.localeMessage);
  const code=failure?.code||'';
  if(code.includes('OUTCOME_UNKNOWN'))return t('outcomeUnknown');
  if(code.includes('RECOVERY_REQUIRED'))return t('recoveryRequired');
  if(code==='E_TOOL_CHANGED')return t('toolChanged');
  if(code==='E_TOOL_NO_LOCALIZATION')return t('noLocalization');
  if(code.includes('QUOTA'))return t('quota');
  if(code==='E_UI_LOCALE_STORAGE')return t('localeStorage');
  if(failure instanceof SyntaxError)return t('invalidJson');
  if(code==='E_TOOL_LOCALIZATION'&&failure.message?.includes('blank message text'))
    return t('blankText');
  if(code==='E_LOCALE_PACK'||code.startsWith('E_TOOL_LOCALIZATION'))
    return t('invalidPack');
  return t('unknownError')+' '+String(failure?.message||failure);
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
  const [globalLocale,setGlobalLocale]=React.useState(()=>localeController?.getLocale?.()||'zh-CN');
  const panelLocale=localeManagerLocale(globalLocale);
  const t=(key,parameters={})=>localeManagerText(panelLocale,key,parameters);
  const languageName=value=>value==='auto'?t('auto'):languageNames[value]||value;
  const localError=key=>Object.assign(new Error(key),{localeMessage:key});
  let available=[],toolPreference=null,catalog=null,localeReadError=null;
  try{
    if(tool&&service){
      available=service.getAvailableLocales(tool);
      toolPreference=service.getToolLocale(toolId);
      catalog=service.getCatalog(tool,globalLocale);
    }
  }catch(failure){localeReadError=failure;available=[];toolPreference=null;catalog=null;}
  const sourceTitle=tool?.localization?.messages?.[tool.localization.sourceLocale]?.title;
  const currentToolTitle=tool?.title===sourceTitle&&typeof catalog?.messages?.title==='string'?
    catalog.messages.title:tool?.title||tool?.name||t('removedTool');
  const ready=Boolean(service&&tool?.localization&&serviceStatus==='ready'&&!localeReadError);
  const requested=toolPreference||globalLocale;
  const effective=catalog?.locale;
  const missingLanguage=Boolean(effective&&effective!==requested);
  const updateTargetForTool=()=>{
    if(!preview&&!model.importPack)setTarget(effective||'en');
  };
  React.useEffect(updateTargetForTool,[toolId,serviceStatus]);
  const report=failure=>setError(()=>failure);
  React.useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  const syncGlobal=()=>{
    setGlobalLocale(localeController?.getLocale?.()||'zh-CN');
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
    if(!selected)throw localError('unavailableTool');
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
    if(files.length!==1||file.size>LOCALE_PACK_MAX_BYTES)throw localError('fileSize');
    const pack=JSON.parse(await file.text());
    if(pack?.format!=='opendesk.locale-pack.v1')throw localError('fileFormat');
    await previewPack(pack);
  });
  const selectTool=value=>{setToolId(value);setPreview(null);setPendingDelete(false);setNotice('');};
  const targetChanged=value=>{setTarget(value);setPendingDelete(false);};
  const changeToolLanguage=value=>{if(!ready)return;void run(async()=>{
    await service.setToolLocale(toolId,value==='follow'?null:value);
    if(!alive.current)return;
    const actual=service.getCatalog(tool,localeController?.getLocale?.()||'zh-CN')?.locale;
    setNotice({key:value==='follow'?'toolSavedFollow':'toolSavedOnly',language:actual});
  });};
  const exportData=(method,suffix,language=target)=>void run(async()=>{
    const value=method==='exportPack'?await service.exportPack(toolId,language):
      await service.exportTranslationTask(tool,language);
    if(!value)throw localError('noPack');
    if(!alive.current)return;
    downloadLocaleData(value,toolId+'.'+language+'.'+suffix+'.json');
    setNotice({key:suffix==='translation-task'?'exportTaskDone':'exportDone'});
  });
  const installedPack=packs.find(pack=>pack.targetLocale===target);
  const locales=[...new Set(['en','zh-CN','zh-TW','ja',tool?.localization?.sourceLocale,
    ...Object.keys(tool?.localization?.messages||{}),...packs.map(pack=>pack.targetLocale)].filter(Boolean))];
  // Only the verified service/catalog can claim translated and missing entries.
  const sourceLocale=tool?.localization?.sourceLocale;
  const totalEntries=Object.keys(tool?.localization?.messages?.[sourceLocale]||{}).length;
  const resourceLanguages=[...new Set([...packs.map(pack=>pack.targetLocale),...available])];
  const resourceRows=ready?resourceLanguages.map(language=>{
    const pack=packs.find(item=>item.targetLocale===language);
    let missing=totalEntries;
    try{missing=language===sourceLocale?0:service.exportTranslationTask(tool,language).translationKeys.length;}
    catch{/* Invalid/stale resources cannot be claimed complete. */}
    let stale=false;
    if(pack)try{const checked=service.preview(pack,tool);stale=!checked.hashMatches||checked.stale.length>0;}
    catch{stale=true;}
    return {language,pack,translated:totalEntries-missing,stale,
      origin:language===sourceLocale?'sourceResource':pack?'importedPack':'builtinPack'};
  }):[];
  let targetMissing=null;
  if(ready&&target&&target!==sourceLocale){
    try{targetMissing=service.exportTranslationTask(tool,target).translationKeys.length;}
    catch{/* The installed service owns BCP47/source validation. */}
  }
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
  return <UninstallDialog open title={t('title')} busy={busy} busyLabel={t('busy')} onCancel={model.onClose}
    onEscape={()=>{
      if(!maintenanceOpen)return false;
      if(preview){setPreview(null);returnToImport();return true;}
      if(pendingDelete){setPendingDelete(false);returnToImport();return true;}
      if(!busy)setMaintenanceOpen(false);
      return true;
    }}
    panelClassName="od-locale-shell"
    cancelLabel={t('closeLabel')} closeLabel={t('closeLabel')}
    returnFocusSelector={model.returnFocusSelector||"#extension-center-language-settings"}>
    <div className="od-locale-manager od-stack">
      <div className="od-locale-daily od-stack" inert={maintenanceOpen} aria-hidden={maintenanceOpen||undefined}>
      <label className="od-locale-field" htmlFor="od-locale-global">{t('globalLabel')}
        <select id="od-locale-global" className="od-field" value={preference} aria-describedby="od-locale-global-hint"
          disabled={busy||!localeController||globalUnknown}
          onChange={event=>{
            if(localeController?.getError?.()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN')return;
            const value=event.currentTarget.value;void run(async()=>{
            try{await localeController.setLocale(value);}finally{syncGlobal();}
            setNotice({key:'globalSaved',language:localeController.getLocale()});
          });}}>
          {Object.keys(languageNames).map(value=><option key={value} value={value}>{languageName(value)}</option>)}
        </select>
      </label>
      <p id="od-locale-global-hint">{t('globalHint',{language:languageName(globalLocale)})}</p>
      {panelLocale!==globalLocale&&<p role="status">{t('panelFallback',{requested:languageName(globalLocale),effective:languageName(panelLocale)})}</p>}
      {model.toolId?<p>{t('currentTool',{title:currentToolTitle})}</p>:
      <label className="od-locale-field" htmlFor="od-locale-tool">{t('chooseTool')}
        <select id="od-locale-tool" className="od-field" value={toolId} disabled={busy||!tools.length}
          onChange={event=>selectTool(event.currentTarget.value)}>
          {!tools.length&&<option value="">{t('noTools')}</option>}
          {model.toolId&&!tool&&<option value={model.toolId}>{t('removedTool')}</option>}
          {tools.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id}</option>)}
        </select>
      </label>}
      {tool&&!tool.localization&&<p role="status">{t('noLocalization')}</p>}
      {tool?.localization&&<section className="od-locale-preview" aria-label={t('daily')}>
        <label className="od-locale-field" htmlFor="od-locale-tool-language">{t('toolLanguage')}
          <select id="od-locale-tool-language" className="od-field" value={localeReadError?'unreadable':toolPreference||'follow'}
            aria-describedby="od-locale-tool-status od-locale-tool-hint" disabled={busy||!ready}
            onChange={event=>changeToolLanguage(event.currentTarget.value)}>
            {localeReadError&&<option value="unreadable">{t('unreadable')}</option>}
            <option value="follow">{t('followOption',{language:languageName(globalLocale)})}</option>
            {toolPreference&&!available.includes(toolPreference)&&<option value={toolPreference}>
              {t('missingOption',{language:languageName(toolPreference)})}
            </option>}
            {available.map(locale=><option key={locale} value={locale}>{t('onlyOption',{language:languageName(locale)})}</option>)}
          </select>
        </label>
        <p id="od-locale-tool-status" role="status">{ready&&effective?
          t('effective',{language:languageName(effective),scope:t(toolPreference?'onlyTool':'follow')}):
          localeReadError?t('readError'):t('reading')}</p>
        <p id="od-locale-tool-hint" className="od-locale-assistive">{t('toolHint')}</p>
        {(missingLanguage||Boolean(catalog?.missing.length))&&<div className="od-locale-preview">
          <p>{missingLanguage?t('missingLanguage',{requested:languageName(requested),effective:languageName(effective)}):
            t('missingText',{count:catalog.missing.length})}</p>
          <Button disabled={busy||!ready} onClick={()=>{targetChanged(requested);setMaintenanceOpen(true);
            setTimeout(()=>importRef.current?.focus(),0);}}>{t('addLanguage')}</Button>
        </div>}
      </section>}
      {busy&&<p role="status">{t('busy')}</p>}
      {error&&<p role="alert">{failureText(error,t)}</p>}
      {localeReadError&&<p role="alert" aria-label={t('toolReadError')}>{failureText(localeReadError,t)}</p>}
      {notice&&<p role="status">{t(notice.key,{language:languageName(notice.key==='packSaved'?effective:notice.language)})}</p>}
      {!service&&<p role="status">{t('serviceUnavailable')}</p>}
      {globalError&&<p role="alert" aria-label={t('globalReadError')}>
        {t('globalPrefix')}{failureText(globalError,t)}
      </p>}
      {(globalError||service&&(serviceStatus!=='ready'||error||localeReadError))&&<div className="od-locale-recovery">
        <p role="status">{globalUnknown?t('globalUnknown'):serviceStatus==='unknown'?t('packUnknown'):serviceStatus==='ready'?t('retryHint'):t('storageHint')}</p>
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
          setError('');setNotice({key:'rechecked'});
        })}>{t('recheck')}</Button>
      </div>}
      </div>
      <details className="od-locale-maintenance od-disclosure od-disclosure--flat" open={maintenanceOpen}
        onToggle={event=>setMaintenanceOpen(event.currentTarget.open)}>
        <summary ref={maintenanceRef} aria-label={maintenanceOpen?t('backToDaily'):t('maintenance')}
          onClick={event=>{
            // Native toggle is queued; commit the layer before a fast Escape.
            event.preventDefault();setMaintenanceOpen(open=>!open);
          }}>
          {maintenanceOpen?t('backToDaily'):t('maintenance')}
        </summary>
        <div className="od-locale-sheet-body od-locale-preview">
      <p className="od-locale-caption">{t('maintenanceHint')}</p>
      {error&&<p role="alert">{failureText(error,t)}</p>}
      {notice&&<p role="status">{t(notice.key,{language:languageName(notice.key==='packSaved'?effective:notice.language)})}</p>}
      {serviceStatus==='unknown'&&<p role="alert">{t('packUnknown')}</p>}
      <label className="od-locale-field" htmlFor="od-locale-target">{t('targetLabel')}
        <span className="od-input-group">
          <span className="od-input-prefix" aria-hidden="true">BCP47</span>
          <input id="od-locale-target" type="text" className="od-field" value={target} list="od-locale-targets" disabled={busy||!ready}
            placeholder={t('placeholder')} onInput={event=>targetChanged(event.currentTarget.value)}/>
          <button type="button" className="od-input-action" aria-label={t('clearTarget')} title={t('clearTarget')}
            disabled={busy||!target} onClick={()=>targetChanged('')}>×</button>
        </span>
        <datalist id="od-locale-targets">{locales.map(locale=><option key={locale} value={locale}>{languageName(locale)}</option>)}</datalist>
      </label>
      {resourceRows.length>0&&<section className="od-locale-preview" aria-label={t('installed')}>
        <h3>{t('installed')}</h3>
        <div className="od-locale-resources" role="list">{resourceRows.map(row=>
          <div key={row.language} className="od-locale-resource" role="listitem">
            <Button className="od-locale-resource-select" aria-pressed={target===row.language}
              disabled={busy} onClick={()=>targetChanged(row.language)}>
              <strong>{languageName(row.language)}</strong>
              <small>{t(row.origin)}{row.stale?' · '+t('resourceStale'):''}</small>
            </Button>
            <span className="od-locale-resource-count" aria-label={t('translatedCount',{translated:row.translated,total:totalEntries})}>
              {row.translated}/{totalEntries}
            </span>
            {row.pack&&<Button className="od-locale-resource-export" disabled={busy||!ready}
              onClick={()=>exportData('exportPack','locale-pack',row.language)}>{t('export')}</Button>}
          </div>)}</div>
      </section>}
      {tool?.localization&&<p className="od-locale-caption">{t('sourceInfo',{language:languageName(sourceLocale),count:packs.length})}
        {target===sourceLocale?t('sourceOnly'):''}</p>}
      {targetMissing===0&&<p role="status">{t('translationsComplete')}</p>}
      {target&&ready&&target!==sourceLocale&&targetMissing===null&&<p role="alert">{t('invalidTarget')}</p>}
      <div className="od-locale-actions">
        <Button ref={importRef} disabled={busy||!service||Boolean(localeReadError)} onClick={()=>fileRef.current?.click()}>{t('import')}</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" aria-label={t('fileLabel')}
          disabled={busy||!service||Boolean(localeReadError)} hidden onChange={event=>{readFile(event.currentTarget.files);event.currentTarget.value='';}}/>
        {targetMissing>0&&<Button disabled={busy||!ready} onClick={()=>exportData('exportMissingTask','translation-task')}>{t('exportTask')}</Button>}
        {installedPack&&<Button variant="danger" disabled={busy||!ready}
          onClick={()=>setPendingDelete({toolId,locale:target,title:tool?.title||toolId})}>{t('delete')}</Button>}
      </div>
      <p className="od-locale-caption">{t('importHint')}</p>
        </div>
      {preview&&<section className="od-locale-preview od-surface od-surface--padded" aria-label={t('previewLabel')}>
        <h3 ref={previewRef} tabIndex={-1}>{t('preview')}</h3>
        <p>{t('previewInfo',{tool:preview.pack.toolId,locale:preview.pack.targetLocale})}</p>
        <p>{t('entryCount',{count:Object.keys(preview.pack.messages||{}).length})}</p>
        {importPreview&&!importPreview.hashMatches&&<p>{t('staleHint')}</p>}
        {Boolean(importPreview?.stale?.length)&&<p>{t('staleEntries')}{importPreview.stale.join(', ')}</p>}
        {importPreview?.missing&&<p>{t('missingCount',{count:importPreview.missing.length})}</p>}
        <dl className="od-locale-samples">{Object.entries(preview.pack.messages).slice(0,5).map(([key,row])=><React.Fragment key={key}>
          <dt>{key}</dt><dd><span>{t('sourcePrefix')}{row.source}</span><span>{t('translationPrefix')}{row.text}</span></dd>
        </React.Fragment>)}</dl>
        <p>{overwrite?t('overwriteHint'):t('confirmHint')}</p>
        <div className="od-locale-actions">
          <Button disabled={busy} onClick={()=>{setPreview(null);setError('');returnToImport();}}>{t('cancelImport')}</Button>
          <Button variant="primary" disabled={busy||!ready} onClick={()=>void run(async()=>{
            await service.install(preview.pack,preview.tool);
            await reload(preview.pack.toolId);setPreview(null);setNotice({key:'packSaved'});
          })}>{overwrite?t('confirmOverwrite'):t('confirmImport')}</Button>
        </div>
      </section>}
      {pendingDelete&&<section className="od-locale-preview" aria-label={t('deleteLabel')}>
        <p>{t('deleteQuestion',{title:pendingDelete.title,locale:pendingDelete.locale})}</p>
        <div className="od-locale-actions">
          <Button ref={deleteRef} disabled={busy} onClick={()=>{setPendingDelete(false);returnToImport();}}>{t('cancelDelete')}</Button>
          <Button variant="danger" disabled={busy||!ready} onClick={()=>void run(async()=>{
            await service.remove(pendingDelete.toolId,pendingDelete.locale);await reload(pendingDelete.toolId);
            setPendingDelete(false);setPreview(null);setNotice({key:'deleted'});
          })}>{t('confirmDelete')}</Button>
        </div>
      </section>}
      </details>
      <div className="od-locale-actions" hidden={maintenanceOpen}>
        <Button disabled={busy} data-uninstall-cancel="true" onClick={model.onClose}>{t('close')}</Button>
      </div>
    </div>
  </UninstallDialog>;
}
