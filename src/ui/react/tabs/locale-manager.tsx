import * as React from 'react';
import {Button,IconButton} from '../components/ui/button.tsx';
import {localeManagerLocale,localeManagerText} from '../../locale-manager-localization.js';
import {LOCALE_PACK_MAX_BYTES} from '../../sidebar-tools/locale-packs.js';
import {sameStorageValue} from '../../sidebar-tools/storage-state.js';

const languageNames={auto:'auto',en:'English','zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語'};
const failureText=(failure,t)=>{
  if(failure?.localeMessage)return t(failure.localeMessage);
  const code=failure?.code||'';
  if(code.includes('OUTCOME_UNKNOWN'))return t('outcomeUnknown');
  if(code.includes('RECOVERY_REQUIRED'))return t('recoveryRequired');
  if(code==='E_TOOL_CHANGED')return t('toolChanged');
  if(code==='E_TOOL_NO_LOCALIZATION')return t('noLocalization');
  if(code==='E_LOCALE_PACK_STALE')return t('staleRejected');
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
  const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
  const anchor=doc.createElement('a');anchor.href=url;anchor.download=filename;
  doc.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function LocaleManager({model}){
  const {service,localeController}=model;
  const tools=model.tools||[];
  const [toolId,setToolId]=React.useState(model.toolId||tools[0]?.id||'');
  const [target,setTarget]=React.useState('ja');
  const [view,setView]=React.useState(model.importPack?'packs':'settings');
  const [composeOpen,setComposeOpen]=React.useState(false);
  const [customLocale,setCustomLocale]=React.useState('');
  const [dragOver,setDragOver]=React.useState(false);
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
  const importRef=React.useRef(null),previewRef=React.useRef(null),deleteRef=React.useRef(null),headingRef=React.useRef(null);
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
    return state;
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
    setToolId(pack.toolId);setTarget(pack.targetLocale);setView('preview');
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
  const exportPack=language=>void run(async()=>{
    const value=service.exportPack(toolId,language);
    if(!value)throw localError('noPack');
    downloadLocaleData(value,toolId+'.'+language+'.locale-pack.json');
    setNotice({key:'exportDone'});
  });
  const exportTemplate=()=>void run(async()=>{
    const language=target==='other'?customLocale.trim():target;
    const task=service.exportTranslationTask(tool,language);
    const missing=new Set(task.translationKeys);
    const pack={...task.pack,messages:Object.fromEntries(Object.entries(task.pack.messages)
      .map(([key,row])=>[key,{source:row.source,text:missing.has(key)?'':row.text}]))};
    downloadLocaleData(pack,toolId+'.'+language+'.locale-template.json');
    setNotice({key:'templateDone'});
  });
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
  React.useLayoutEffect(()=>{
    if(headingRef.current?.closest('[hidden],[inert]'))return;
    if(view==='preview'&&preview)previewRef.current?.focus({preventScroll:true});
    else if(pendingDelete)deleteRef.current?.focus({preventScroll:true});
    else headingRef.current?.focus({preventScroll:true});
  },[view,preview,pendingDelete]);
  const returnToImport=()=>{
    const button=importRef.current;
    const target=!button||button.disabled||view!=='packs'?headingRef.current:button;
    target?.focus({preventScroll:true});
  };
  const importPreview=preview?.result;
  const overwrite=Boolean(preview&&packs.some(pack=>pack.targetLocale===preview.pack.targetLocale));
  const canInstall=Boolean(preview&&ready&&importPreview?.hashMatches&&importPreview.stale.length===0);
  const back=()=>{
    if(busy)return;
    if(pendingDelete){setPendingDelete(false);return;}
    if(view==='preview'){setPreview(null);setView('packs');return;}
    if(view==='packs'){setView('settings');return;}
    model.onClose?.();
  };
  React.useEffect(()=>{
    const selector=model.returnFocusSelector||'#extension-center-search';
    return ()=>setTimeout(()=>{
      const node=document.querySelector(selector);
      if(node?.isConnected&&!node.closest('[hidden],[inert]'))node.focus({preventScroll:true});
    },0);
  },[model.session]);
  const notices=<>
    {busy&&<p role="status">{t('busy')}</p>}
    {error&&<p role="alert">{failureText(error,t)}</p>}
    {localeReadError&&<p role="alert" aria-label={t('toolReadError')}>{failureText(localeReadError,t)}</p>}
    {notice&&<p role="status">{t(notice.key,{language:languageName(notice.language||effective)})}</p>}
    {!service&&<p role="status">{t('serviceUnavailable')}</p>}
    {globalError&&<p role="alert" aria-label={t('globalReadError')}>{t('globalPrefix')}{failureText(globalError,t)}</p>}
    {(globalError||service&&(serviceStatus!=='ready'||error||localeReadError))&&
      <div className="od-locale-recovery">
        <p role="status">{globalUnknown?t('globalUnknown'):serviceStatus==='unknown'?t('packUnknown'):
          serviceStatus==='ready'?t('retryHint'):t('storageHint')}</p>
        <Button disabled={busy} onClick={()=>void run(async()=>{
          // Explicit read-only recovery: UNKNOWN is never retried automatically.
          const results=await Promise.allSettled([
            Promise.resolve().then(()=>service?reload(toolId):undefined),
            Promise.resolve().then(()=>localeController?.load())
          ]);
          if(!alive.current)return;
          syncGlobal();
          const failures=results.filter(result=>result.status==='rejected').map(result=>result.reason);
          if(localeController?.getError?.())failures.push(localeController.getError());
          if(failures.length)throw Error(failures.map(e=>e?.message||String(e)).join('；'));
          if(tool&&service){service.getAvailableLocales(tool);service.getToolLocale(toolId);
            service.getCatalog(tool,localeController?.getLocale?.()||'zh-CN');}
          setError('');setNotice({key:'rechecked'});
        })}>{t('recheck')}</Button>
      </div>}
  </>;
  return <div className="od-locale-manager od-page" aria-label={t('title')} onKeyDown={event=>{
    if(event.key!=='Escape'||busy||event.defaultPrevented||event.nativeEvent.isComposing||
      event.currentTarget.closest('[hidden],[inert]'))return;
    event.preventDefault();event.stopPropagation();back();
  }}>
    <header className="od-page-head od-locale-heading">
      <IconButton label={view==='settings'?t('backToExtensions'):view==='packs'?t('backToDaily'):t('backToPacks')}
        disabled={busy} onClick={back}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
      </IconButton>
      <h2 ref={headingRef} tabIndex={-1} className="od-page-title">
        {view==='settings'?t('title'):view==='packs'?t('packPageTitle'):t('preview')}
      </h2>
    </header>
    {view==='settings'&&<div className="od-locale-view od-stack">
      <section className="od-locale-section od-stack" aria-label={t('globalLabel')}>
        <h3>{t('globalLabel')}</h3>
        <label className="od-locale-field" htmlFor="od-locale-global">
          <span className="od-locale-label">{t('uiLanguage')}</span>
          <select id="od-locale-global" className="od-field" value={preference}
            disabled={busy||!localeController||globalUnknown} onChange={event=>{
              if(localeController?.getError?.()?.code==='E_UI_LOCALE_OUTCOME_UNKNOWN')return;
              const value=event.currentTarget.value;void run(async()=>{
                try{await localeController.setLocale(value);}finally{syncGlobal();}
                setNotice({key:'globalSaved',language:localeController.getLocale()});
              });
            }}>
            {Object.keys(languageNames).map(value=><option key={value} value={value}>{languageName(value)}</option>)}
          </select>
        </label>
        <p className="od-locale-caption">{t('globalHint',{language:languageName(globalLocale)})}</p>
        {panelLocale!==globalLocale&&<p role="status">{t('panelFallback',{requested:languageName(globalLocale),effective:languageName(panelLocale)})}</p>}
      </section>
      <section className="od-locale-section od-stack" aria-label={t('extensionLanguage')}>
        <h3>{t('extensionLanguage')}</h3>
        {model.toolId?<p className="od-locale-caption">{t('currentTool',{title:currentToolTitle})}</p>:
          <label className="od-locale-field" htmlFor="od-locale-tool">
            <span className="od-locale-label">{t('chooseTool')}</span>
            <select id="od-locale-tool" className="od-field" value={toolId} disabled={busy||!tools.length}
              onChange={event=>selectTool(event.currentTarget.value)}>
              {!tools.length&&<option value="">{t('noTools')}</option>}
              {tools.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id}</option>)}
            </select>
          </label>}
        {tool?.localization?<label className="od-locale-field" htmlFor="od-locale-tool-language">
          <span className="od-locale-label">{t('displayLanguage')}</span>
          <select id="od-locale-tool-language" className="od-field" value={localeReadError?'unreadable':toolPreference||'follow'}
            aria-describedby="od-locale-tool-status" disabled={busy||!ready} onChange={event=>changeToolLanguage(event.currentTarget.value)}>
            {localeReadError&&<option value="unreadable">{t('unreadable')}</option>}
            <option value="follow">{t('followOption',{language:languageName(globalLocale)})}</option>
            {toolPreference&&!available.includes(toolPreference)&&<option value={toolPreference}>
              {t('missingOption',{language:languageName(toolPreference)})}</option>}
            {available.map(locale=><option key={locale} value={locale}>{languageName(locale)}</option>)}
          </select>
        </label>:<p className="od-locale-caption">{t('noTools')}</p>}
        <p id="od-locale-tool-status" role="status" className="od-locale-caption">{ready&&effective?
          t('effective',{language:languageName(effective),scope:t(toolPreference?'onlyTool':'follow')}):
          localeReadError?t('readError'):t('reading')}</p>
        {(missingLanguage||Boolean(catalog?.missing?.length))&&<p className="od-locale-caption">
          {missingLanguage?t('missingLanguage',{requested:languageName(requested),effective:languageName(effective)}):
            t('missingText',{count:catalog.missing.length})}
        </p>}
      </section>
      <Button className="od-locale-nav" onClick={()=>{setView('packs');setError('');setNotice('');}}>
        <span><strong>{t('managePacks')}</strong><small>{t('managePacksHint')}</small></span>
        <span aria-hidden="true">›</span>
      </Button>
    </div>}
    {view==='packs'&&<div className="od-locale-view od-stack">
      <section className="od-locale-section od-stack">
        <label className="od-locale-field" htmlFor="od-locale-pack-tool">
          <span className="od-locale-label">{t('chooseTool')}</span>
          <select id="od-locale-pack-tool" className="od-field" value={toolId}
            disabled={busy||!tools.length} onChange={event=>selectTool(event.currentTarget.value)}>
            {!tools.length&&<option value="">{t('noTools')}</option>}
            {tools.map(item=><option key={item.id} value={item.id}>{item.title||item.name||item.id}</option>)}
          </select>
        </label>
        <div className="od-locale-section-head"><h3>{t('importedPacks')}</h3><span className="od-locale-caption">{packs.length}</span></div>
        {packs.length?<div className="od-locale-resources" role="list" aria-label={t('installed')}>
          {resourceRows.filter(row=>row.pack).map(row=><div className="od-locale-resource" key={row.language} role="listitem">
            <div className="od-locale-resource-copy">
              <strong>{languageName(row.language)} <small>{row.language}</small></strong>
              <span className="od-locale-caption">{row.stale?t('resourceStale'):t('importedPack')} · {t('translatedCount',{translated:row.translated,total:totalEntries})}</span>
            </div>
            <div className="od-locale-resource-actions">
              <IconButton label={t('backup')+' '+languageName(row.language)} disabled={busy||!ready}
                onClick={()=>exportPack(row.language)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 18v3h16v-3"/></svg></IconButton>
              <IconButton label={t('delete')+' '+languageName(row.language)} disabled={busy||!ready}
                onClick={()=>setPendingDelete({toolId,locale:row.language,title:currentToolTitle,
                  review:structuredClone({tool,pack:row.pack,epoch:service.getState().epochs?.[toolId]??null})})}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7M10 11v6m4-6v6"/></svg>
              </IconButton>
            </div>
          </div>)}
        </div>:<p className="od-locale-caption">{t('noImportedPacks')}</p>}
        {pendingDelete&&<div className="od-locale-inline-confirm od-stack" role="group" aria-label={t('deleteLabel')}>
          <strong>{t('deleteQuestion',{title:pendingDelete.title,locale:pendingDelete.locale})}</strong>
          <div className="od-locale-actions">
            <Button ref={deleteRef} variant="danger" disabled={busy||!ready} onClick={()=>void run(async()=>{
              await service.remove(pendingDelete.toolId,pendingDelete.locale,pendingDelete.review);
              const verified=await reload(pendingDelete.toolId);
              if(verified.status!=='ready'||service.exportPack(pendingDelete.toolId,pendingDelete.locale))
                throw localError('readbackFailed');
              setPendingDelete(false);setNotice({key:'deleted'});
            })}>{t('confirmDelete')}</Button>
            <Button disabled={busy} onClick={()=>{setPendingDelete(false);returnToImport();}}>{t('cancelDelete')}</Button>
          </div>
        </div>}
      </section>
      <section className="od-locale-section od-stack" aria-label={t('importSection')}>
        <h3>{t('importSection')}</h3>
        <div className="od-locale-drop-zone" data-over={dragOver}
          onDragEnter={event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();setDragOver(true);}}}
          onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={event=>{event.preventDefault();event.stopPropagation();setDragOver(false);readFile(Array.from(event.dataTransfer.files||[]));}}>
          <Button ref={importRef} disabled={busy||!service||serviceStatus!=='ready'||Boolean(localeReadError)}
            onClick={()=>fileRef.current?.click()}>{t('selectJson')}</Button>
          <p className="od-locale-caption">{t('importZoneHint')}</p>
        </div>
        <input ref={fileRef} type="file" accept=".json,application/json" aria-label={t('fileLabel')} hidden
          disabled={busy||!service||serviceStatus!=='ready'} onChange={event=>{
            readFile(event.currentTarget.files);event.currentTarget.value='';
          }}/>
        <Button variant="quiet" className="od-locale-compose-toggle" aria-expanded={composeOpen}
          onClick={()=>setComposeOpen(value=>!value)}>{t('createToggle')} <span aria-hidden="true">{composeOpen?'⌄':'›'}</span></Button>
        {composeOpen&&<div className="od-locale-compose od-stack">
          <h3>{t('createTitle')}</h3>
          <label className="od-locale-field" htmlFor="od-locale-target">
            <span className="od-locale-label">{t('translateTo')}</span>
            <select id="od-locale-target" className="od-field" value={target}
              disabled={busy||!ready} onChange={event=>targetChanged(event.currentTarget.value)}>
              {['en','ja','fr','de','es','zh-TW'].map(locale=><option key={locale} value={locale}>
                {languageName(locale)} ({locale})</option>)}
              <option value="other">{t('otherLanguage')}</option>
            </select>
          </label>
          {target==='other'&&<label className="od-locale-field" htmlFor="od-locale-target-custom">
            <span className="od-locale-label">{t('localeCode')}</span>
            <input id="od-locale-target-custom" className="od-field" value={customLocale} placeholder="es-MX"
              autoComplete="off" spellCheck={false} onChange={event=>setCustomLocale(event.currentTarget.value)}/>
          </label>}
          <p className="od-locale-caption">{t('templateHint')}</p>
          <Button disabled={busy||!ready||target==='other'&&!customLocale.trim()} onClick={exportTemplate}>
            {t('downloadTemplate')}
          </Button>
        </div>}
      </section>
    </div>}
    {view==='preview'&&preview&&<div className="od-locale-view od-stack" aria-label={t('previewLabel')}>
      <section className="od-locale-section od-stack">
        <h3 ref={previewRef} tabIndex={-1}>{canInstall?t('validationOk'):t('validationBlocked')}</h3>
        <dl className="od-locale-facts">
          <div><dt>{t('chooseTool')}</dt><dd>{preview.tool.title||preview.pack.toolId} ({preview.pack.toolId})</dd></div>
          <div><dt>{t('targetLabel')}</dt><dd>{languageName(preview.pack.targetLocale)} ({preview.pack.targetLocale})</dd></div>
          <div><dt>{t('entryLabel')}</dt><dd>{Object.keys(preview.pack.messages).length}</dd></div>
          <div><dt>{t('hashLabel')}</dt><dd>{importPreview.hashMatches?t('hashOk'):t('hashBad')}<small className="od-locale-hash">{preview.pack.sourceCatalogHash}</small></dd></div>
          <div><dt>{t('placeholderLabel')}</dt><dd>{t('placeholderOk')}</dd></div>
          <div><dt>{t('missingLabel')}</dt><dd>{importPreview.missing.length}</dd></div>
        </dl>
        {!canInstall&&<p role="alert">{t('staleRejected')}</p>}
        {importPreview.stale.length>0&&<p role="alert">{t('staleEntries')}{importPreview.stale.join(', ')}</p>}
      </section>
      <section className="od-locale-section od-stack">
        <h3>{t('sampleTitle')}</h3>
        <dl className="od-locale-samples">{Object.entries(preview.pack.messages).slice(0,3).map(([key,row])=>
          <React.Fragment key={key}><dt>{key}</dt><dd>
            <span>{t('sourcePrefix')}{row.source}</span><span>{t('translationPrefix')}{row.text}</span>
          </dd></React.Fragment>)}</dl>
      </section>
      <p className="od-locale-caption">{overwrite?t('overwriteHint'):t('confirmHint')}</p>
      <div className="od-locale-actions">
        <Button variant="primary" disabled={busy||!canInstall} onClick={()=>void run(async()=>{
          await service.install(preview.pack,preview.tool);
          const verified=await reload(preview.pack.toolId);
          if(verified.status!=='ready'||!sameStorageValue(service.exportPack(preview.pack.toolId,preview.pack.targetLocale),preview.pack))
            throw localError('readbackFailed');
          setPreview(null);setView('packs');setNotice({key:'packSaved'});
        })}>{overwrite?t('confirmOverwrite'):t('confirmImport')}</Button>
        <Button disabled={busy} onClick={()=>{setPreview(null);setError('');setView('packs');}}>
          {t('cancelImport')}
        </Button>
      </div>
    </div>}
    {notices}
  </div>;
}
