// Pure Node contract checks only. Real macOS Chrome remains the Native gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sidePanelDocumentTarget,verifiedSidePanelDocument,attachVerifiedSidePanel
} from '../framework/helpers/verified-side-panel-native.mjs';

const EXT='pnhiokdnhhpbidgojhbjknpldipijdfa';
const HOST='new-side-panel-instance';
const URL_NOW=`chrome-extension://${EXT}/sidepanel.html?hostInstanceId=${HOST}`;
const target={targetId:'DOCUMENT',type:'page',url:URL_NOW};
const context={contextType:'SIDE_PANEL',documentId:'NEW_DOCUMENT',
  contextId:'NEW_CONTEXT',documentUrl:URL_NOW,
  documentOrigin:`chrome-extension://${EXT}`,frameId:0,tabId:-1};
const identity=()=>({
  href:URL_NOW,hostInstanceId:HOST,currentTabId:null,realPanel:true,
  contexts:[{...context}]
});

test('Chrome page is a Side Panel candidate; same-URL tab wrapper and launcher are not',()=>{
  assert.equal(sidePanelDocumentTarget(target,EXT),true);
  assert.equal(sidePanelDocumentTarget({...target,type:'tab'},EXT),false);
  assert.equal(sidePanelDocumentTarget(target,EXT,['DOCUMENT']),false);
  assert.equal(sidePanelDocumentTarget({...target,url:'chrome-extension://'+EXT+'/options.html'},EXT),false);
  assert.equal(sidePanelDocumentTarget({...target,url:'https://example.test/sidepanel.html'},EXT),false);
});

test('fresh document identity validates after a captured canonical URL becomes stale',()=>{
  const oldCaptured={documentId:'OLD_DOCUMENT',documentUrl:`chrome-extension://${EXT}/sidepanel.html`};
  assert.notEqual(oldCaptured.documentId,context.documentId);
  assert.notEqual(oldCaptured.documentUrl,context.documentUrl);
  assert.deepEqual(verifiedSidePanelDocument({target,identity:identity(),extensionId:EXT}),context);
});

test('reject normal extension tab and same-path or stale CDP targets',()=>{
  assert.equal(verifiedSidePanelDocument({target:{...target,type:'tab'},identity:identity(),extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target:{...target,url:`chrome-extension://${EXT}/sidepanel.html`},
    identity:identity(),extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),currentTabId:12},extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),realPanel:false},extensionId:EXT}),null);
});

test('reject wrong hostInstanceId, ambiguous context or unsynchronized document URL',()=>{
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),hostInstanceId:'stale'},extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),contexts:[
    context,{...context,documentId:'SECOND',documentUrl:URL_NOW.replace(HOST,'other')}
  ]},extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),
    contexts:[{...context,documentId:'OLD',documentUrl:`chrome-extension://${EXT}/sidepanel.html`}]},extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),
    contexts:[{...context,tabId:13}]},extensionId:EXT}),null);
  assert.equal(verifiedSidePanelDocument({target,identity:{...identity(),
    contexts:[{...context,frameId:1}]},extensionId:EXT}),null);
});

test('CDP document discovery detaches false candidates and retains only live SIDE_PANEL',async()=>{
  const launcher={targetId:'LAUNCH',type:'page',
    url:`chrome-extension://${EXT}/sidepanel.html?hostInstanceId=launcher`};
  const wrapper={targetId:'WRAPPER',type:'tab',url:URL_NOW};
  const detached=[];
  const client={send:async(method,args)=>{
    if(method==='Target.getTargets')return {targetInfos:[launcher,wrapper,target]};
    if(method==='Target.getTargetInfo')return {targetInfo:
      args.targetId===launcher.targetId?launcher:target};
    if(method==='Target.detachFromTarget'){detached.push(args.sessionId);return {};}
    throw Error('unexpected '+method);
  }};
  const result=await attachVerifiedSidePanel({
    client,extensionId:EXT,excludeTargetIds:[],
    attachTarget:async id=>'SID:'+id,
    evaluate:async session=>session==='SID:DOCUMENT'?identity():
      {...identity(),currentTabId:17},
    until:async callback=>{const v=await callback();assert.ok(v);return v;}
  });
  assert.equal(result.target.targetId,'DOCUMENT');
  assert.equal(result.context.documentId,'NEW_DOCUMENT');
  assert.deepEqual(detached,['SID:LAUNCH']);
});

test('CDP discovery fails closed on two live documents or inconsistent context',async()=>{
  const other={...target,targetId:'OTHER',
    url:URL_NOW.replace(HOST,'other')};
  let detached=[];
  const client={send:async(method,args)=>{
    if(method==='Target.getTargets')return {targetInfos:[target,other]};
    if(method==='Target.getTargetInfo')return {targetInfo:args.targetId==='DOCUMENT'?target:other};
    if(method==='Target.detachFromTarget'){detached.push(args.sessionId);return {};}
    throw Error(method);
  }};
  const errors=[];
  await assert.rejects(attachVerifiedSidePanel({
    client,extensionId:EXT,attachTarget:async id=>'SID:'+id,
    evaluate:async session=>session==='SID:DOCUMENT'?identity():
      {...identity(),href:other.url,hostInstanceId:'other',
        contexts:[{...context,documentId:'SECOND',documentUrl:other.url}]},
    until:async fn=>{const v=await fn();assert.equal(v,null);throw Error('ambiguous');},
    onFailure:value=>errors.push(value)
  }),/ambiguous/);
  assert.equal(detached.length,2);
  assert.equal(errors[0].acceptedCount,2);
});
