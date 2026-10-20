import {patchDeveloperField} from './develop-view.js';
import {hasUnbuiltESM} from './esm-source-detector.js';
import {preparePageCandidateDraft} from './page-candidate-source.js';

// Prepared-only Candidates use a frozen one-save value, never the Preview receipt.
// Only the Page execution owner retains successful Preview identities.
export function createPageCandidateActions({client,view,currentPageTarget,pageLibrary}){
  async function prepareComponent({source,artifact,mode,captured,check,prepareManagedSource}){
    const frozen=artifact?.project.entryMode==='component';
    const framework=frozen?/^\/\/ @opendesk-lib (react|vue)\s*$/m.exec(source)?.[1]:mode;
    if(!framework)throw {code:'E_PROGRAM_DRAFT',message:'固定组件缺少框架身份'};
    const identity={source,framework,...(frozen?{sourceHash:artifact.build.sourceHash,projectId:artifact.project.id}:{})};
    const built=await prepareManagedSource(identity,captured,check,{frozen});
    check();
    await currentPageTarget.revalidate(captured);check();
    return {sourceUtf8:built.sourceUtf8,entryFormat:built.entryFormat,lockId:null,importSourceUrl:null,
      authoringSourceUtf8:source,componentMode:mode,previewUrl:captured.url,documentId:captured.documentId,
      tabId:captured.tabId,target:captured,sourceHash:built.sourceHash,preparedOnly:true};
  }
  async function save({previous,source,componentDraft,programId,revisionText,stillCurrent}){
    if(!componentDraft&&hasUnbuiltESM(source)&&previous.sourceFormat!=='esm-page')
      throw {code:'E_STATIC_ESM_IDENTITY',message:'请先准备并试运行当前作者 import 源码'};
    if(!stillCurrent())throw {code:'E_REVISION',message:'源码已经修改，请重新试运行后保存'};
    const revision=revisionText?Number(revisionText):1;
    // Only editable JSX/SFC has component author metadata. Frozen drafts
    // and managed JavaScript retain the exact executable source.
    const {authoringSourceUtf8,...candidate}=previous;
    const prepared=preparePageCandidateDraft({...candidate,programId,revision,
      ...(['react','vue'].includes(previous.componentMode)?{authoringSourceUtf8}:{})});
    await currentPageTarget.revalidate(previous.target);
    const saved=await client.request('importPageCandidate',prepared.request);
    if(saved?.stage!=='Candidate'||typeof saved.candidateId!=='string'||typeof saved.manifestHash!=='string')
      throw {code:'E_PAGE_CANDIDATE',message:'未收到可信的固定候选身份'};
    const status=view.fields['page-candidate-status'],changed=!stillCurrent();
    patchDeveloperField(view,status,{data:{...status.data,state:'saved'}});
    patchDeveloperField(view,status,{textContent:'已保存 Page Candidate：'+programId+' · r'+revision+' · '+saved.manifestHash.slice(0,12)+'…。 '+
      prepared.summary+(changed?' 保存期间编辑器已变化，请重新核对当前版本。':'')+
      ' 请在已保存网页脚本中验证冻结版本，再明确安装。'});
    await pageLibrary.refresh(programId+':'+revision);
  }
  return Object.freeze({prepareComponent,save});
}
