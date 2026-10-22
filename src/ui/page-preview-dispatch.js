import {PAGE_PREVIEW_RECEIPT_FORMAT} from '../scripting/user-scripts/execution-source.js';

// All native Page dispatches stay on the original client and exact-document
// authority. This module owns the prepared byte/receipt contract, not editor
// state, permission grants, presentation, or a second RunHost.
export async function dispatchManagedPagePreview({
  client,currentPageTarget,dependencyResolver,prepareManagedSource,
  captured,pageSource,managedInput,fixedFrameSource,frozen,entryFormat,bindingId,
  check,onPrepared,onOwner,onUnknown,onRecovered
}){
  if(fixedFrameSource)pageSource=await dependencyResolver.resolveForRun(pageSource,check);
  const built=await prepareManagedSource(managedInput,captured,check,{frozen,entryFormat});
  await currentPageTarget.revalidate(captured);check();
  const previewId=crypto.randomUUID(),managedUI={previewId,bindingId,enabled:true};
  const identity={previewId,bindingId,target:captured,sourceHash:built.sourceHash,
    ...(managedInput.framework?{framework:managedInput.framework}:{})};
  onPrepared(); // From here cancellation cannot undo a dispatched native effect.
  let result;
  try{
    result=await client.request('previewPageScript',{
      sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
      ...(pageSource?.programId!==undefined?{programId:pageSource.programId}:{}),
      managedUI,target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
        expectedUrl:captured.url,expectedWindowId:captured.windowId}});
    if(!result||result.state!=='preview-evaluated'||result.sourceHash!==built.sourceHash||
       result.tabId!==captured.tabId||result.documentId!==captured.documentId||result.managedUI!==true||result.managedPreviewId!==previewId){
      onUnknown(captured);
      throw {code:'E_PAGE_COMPILER_RECEIPT',message:'页面回执与固定源码身份不一致；正在核查原执行记录'};
    }
  }catch(error){
    const response=error?.response;
    if(response?.managedUI===true){
      if(response.managedPreviewId===previewId&&response.sourceHash===built.sourceHash&&
         response.tabId===captured.tabId&&response.documentId===captured.documentId)onOwner(identity);
      else onUnknown(captured);
    }
    if(error.code==='E_EFFECT_UNKNOWN'||error.code==='E_PAGE_COMPILER_RECEIPT'){
      onUnknown(captured);
      // Read the original completion once; never retry the native execution.
      try{
        const observed=await client.request('queryPagePreview',{
          previewId,sourceHash:built.sourceHash,tabId:captured.tabId,documentId:captured.documentId});
        if(observed?.queryOnly===true&&observed.originalDocumentOnly===true&&
          ['preview-evaluated','preview-failed'].includes(observed.state)&&observed.managedUI===true&&
          observed.managedPreviewId===previewId&&observed.sourceHash===built.sourceHash&&observed.tabId===captured.tabId&&
          observed.documentId===captured.documentId&&observed.world==='USER_SCRIPT'&&
          observed.completion?.format===PAGE_PREVIEW_RECEIPT_FORMAT&&typeof observed.completion.ok==='boolean'&&
          typeof observed.receiptNonce==='string'&&observed.completion.nonce===observed.receiptNonce){
          onRecovered({...identity,recoveredOnly:true},observed);
          error.previewRecovered=true;
        }
      }catch{} // Unknown remains quarantined, without replay.
    }
    throw error;
  }
  onOwner(identity);
  await currentPageTarget.revalidate(captured);
  return {result,built,previous:{
    sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:pageSource?.lockId??null,
    ...(pageSource?.programId!==undefined?{programId:pageSource.programId}:{}),
    importSourceUrl:pageSource?.importSourceUrl??null,authoringSourceUtf8:managedInput.source,
    previewUrl:captured.url,documentId:captured.documentId,tabId:captured.tabId,target:captured,
    sourceHash:built.sourceHash,previewId
  }};
}

export async function dispatchPageDraftPreview({
  client,currentPageTarget,dependencyResolver,captured,pageSource,check,isCompiledCurrent,onDispatched
}){
  pageSource=await dependencyResolver.resolveForRun(pageSource,check);
  await currentPageTarget.revalidate(captured);check();
  let executable=pageSource;
  if(pageSource.sourceFormat){
    const built=await dependencyResolver.compile(pageSource);
    if(!isCompiledCurrent())throw {code:'E_STATIC_ESM_STALE',
      message:'离线编译期间作者源码或运行模式已变化'};
    await currentPageTarget.revalidate(captured);
    if(!isCompiledCurrent()||
      dependencyResolver.capture({sourceFormat:'esm-page'}).version!==pageSource.version)
      throw {code:'E_STATIC_ESM_STALE',message:'最终核对时作者源码、运行世界或批准锁已变化'};
    executable={sourceUtf8:built.sourceUtf8,entryFormat:'async-main',lockId:null,sourceHash:built.sourceHash};
    pageSource={...pageSource,compiledSourceUtf8:built.sourceUtf8,compilerVersion:built.compilerVersion};
  }
  check();
  const {sourceHash:compiledHash,...previewSource}=executable;
  onDispatched?.(); // Cancel preparation only before this native dispatch boundary.
  const result=await client.request('previewPageScript',{
    ...previewSource,
    ...(pageSource.programId!==undefined?{programId:pageSource.programId}:{}),
    ...(pageSource.sourceFormat?{authorSourceUtf8:pageSource.sourceUtf8,authorLockId:pageSource.lockId,
      authorManifestDigest:pageSource.manifestDigest,compilerVersion:pageSource.compilerVersion}:{}),
    target:{tabId:captured.tabId,frameId:0,documentId:captured.documentId,
      expectedUrl:captured.url,expectedWindowId:captured.windowId}});
  if(pageSource.sourceFormat&&(result.state!=='preview-evaluated'||result.sourceHash!==compiledHash))
    throw {code:'E_STATIC_ESM_OUTPUT',message:'网页回执不属于本次固定编译产物'};
  return {result,pageSource,previous:{
    sourceUtf8:pageSource.sourceUtf8,entryFormat:pageSource.entryFormat,
    lockId:pageSource.lockId,
    ...(pageSource.programId!==undefined?{programId:pageSource.programId,dependencyScope:'program'}:{}),
    importSourceUrl:pageSource.importSourceUrl??null,previewUrl:captured.url,documentId:captured.documentId,
    tabId:captured.tabId,target:captured,sourceHash:result.sourceHash,
    ...(pageSource.sourceFormat?{sourceFormat:pageSource.sourceFormat,
      compiledSourceUtf8:pageSource.compiledSourceUtf8,compilerVersion:pageSource.compilerVersion}:{})
  }};
}
