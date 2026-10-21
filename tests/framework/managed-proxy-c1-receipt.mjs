#!/usr/bin/env node
// Shared C1 evidence gate. Validation checks recorded observations and file
// integrity; synthetic validator fixtures are never native acceptance evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,readFile,realpath} from 'node:fs/promises';
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';

const SHA256=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const NATIVE_SCREENSHOTS=['native-side-panel-ai-vip','native-side-panel-sdk-denied-stop'];
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const record=(value,label)=>{
  assert(value&&typeof value==='object'&&!Array.isArray(value),label+' must be an object');
  return value;
};
const nonempty=(value,label)=>{
  assert(typeof value==='string'&&value.trim().length>0,label+' must be a nonempty string');
  return value;
};
function disabledStatus(value,label){
  record(value,label);
  assert.equal(value.state,'disabled',label+'.state');
  assert.equal(value.permission,true,label+'.permission');
  assert.equal(value.control,'controllable_by_this_extension',label+'.control');
  assert.equal(value.canStop,false,label+'.canStop');
  assert.equal(value.reason,null,label+'.reason');
}
function sdkSuccess(value,method,label){
  record(value,label);
  assert.equal(value.method,method,label+'.method');
  assert.equal(value.ok,true,label+'.ok');
  assert.equal(value.code,undefined,label+' must not contain an error code');
  disabledStatus(value.data,label+'.data');
}
function enableDenied(value,label){
  record(value,label);
  assert.equal(value.method,'requestEnable',label+'.method');
  assert.equal(value.ok,false,label+'.ok');
  assert.equal(value.code,'E_PROXY_PROFILE_NOT_APPROVED',label+'.code');
}

export function assertC1Receipt(receipt,{sha,build='PRODUCTION'}={}){
  record(receipt,'receipt');
  assert(typeof sha==='string'&&/^[0-9a-f]{40}$/.test(sha),'Expected checked-out SHA is required');
  assert(['PRODUCTION','DEVELOPMENT'].includes(build),'Unsupported C1 build');
  assert.equal(receipt.schema,'opendesk.managed-proxy.c1.v1','C1 schema');
  assert.equal(receipt.sha,sha,'C1 receipt SHA differs from checked-out source');
  assert.equal(receipt.build,build,'C1 build differs from requested gate');
  assert.equal(receipt.result,build==='PRODUCTION'?'FORMAL_C1_NATIVE_PASS':'DEV_C1_NATIVE_PASS','C1 result');
  for(const key of ['installed','sidePanelObserved','sidePanelInteracted'])
    assert.equal(receipt[key],true,'C1 '+key);
  assert.equal(receipt.mockSdk,false,'C1 must use the installed SDK');
  assert(Array.isArray(receipt.errors)&&receipt.errors.length===0,'C1 receipt contains unresolved errors');
  assert(receipt.sidePanelBlocker==null,'C1 has an unresolved Side Panel blocker');
  assert(!(receipt.cdpEvents||[]).some(row=>row?.method==='Runtime.exceptionThrown'),'C1 has a runtime exception');
  const extensionId=nonempty(receipt.extensionId,'extensionId');
  assert(/^[a-p]{32}$/.test(extensionId),'Invalid installed extensionId');
  assert(isAbsolute(nonempty(receipt.extensionPath,'extensionPath')),'extensionPath must be absolute');
  assert.equal(basename(receipt.extensionPath),build.toLowerCase(),'extensionPath build');
  assert.equal(basename(dirname(receipt.extensionPath)),'dist','extensionPath must select the built extension');
  record(receipt.chrome,'chrome');
  assert.equal(receipt.chrome.headed,true,'C1 requires a real windowed Side Panel');
  assert(['native','xvfb'].includes(receipt.chrome.headedMode),'C1 headed mode');
  if(build==='DEVELOPMENT'){
    assert(SHA256.test(receipt.developmentRevision),'Development revision required');
    record(receipt.developmentConnection,'developmentConnection');
    assert(nonempty(receipt.developmentConnection.text,'developmentConnection.text').includes('开发服务已连接'),
      'Development watcher must be connected');
    const title=nonempty(receipt.developmentConnection.title,'developmentConnection.title');
    assert(title.includes(receipt.developmentRevision)&&title.includes(extensionId),'Development connection identity mismatch');
  }else{
    assert.equal(receipt.developmentRevision,undefined,'Development evidence cannot become production');
    assert.equal(receipt.developmentConnection,undefined,'Development evidence cannot become production');
  }

  const formal=record(receipt.formal,'formal');
  assert.equal(formal.id,'ai-vip-share','Official installed tool');
  assert.equal(formal.version,'1.3.5','Official installed version');
  assert(SHA256.test(formal.packageHash),'Official packageHash');
  assert(SHA256.test(formal.swSha256),'Installed SW hash');
  assert(receipt.installEpoch===null||typeof receipt.installEpoch==='string'&&UUID.test(receipt.installEpoch),
    'installEpoch must be explicit null for first install or a valid UUID');
  assert(Array.isArray(receipt.steps),'C1 steps required');
  for(const row of receipt.steps){
    record(row,'step');
    assert(!row.error&&!['FAIL','NATIVE_UI_BLOCKED','NOT_TESTED'].includes(row.status),'C1 contains an unsuccessful step');
  }
  const step=name=>{
    const rows=receipt.steps.filter(row=>row.name===name);
    assert.equal(rows.length,1,'C1 must contain exactly one '+name);
    assert.equal(rows[0].status,'PASS',name+' must pass');
    return rows[0];
  };
  const buildStep=step(build+'_BUILD');
  assert.equal(buildStep.version,formal.version,'Build version differs from installed version');
  assert.equal(buildStep.packageHash,formal.packageHash,'Build packageHash differs from installed package');
  assert(!receipt.steps.some(row=>row.name===(build==='PRODUCTION'?'DEVELOPMENT_BUILD':'PRODUCTION_BUILD')),
    'Mixed development and production build evidence');
  const identity=step('FORMAL_INSTALL_IDENTITY');
  assert.equal(identity.packageHash,formal.packageHash,'Installed packageHash mismatch');
  assert.equal(identity.installEpoch,receipt.installEpoch,'Installed epoch mismatch');
  assert.equal(identity.enabled,true,'Installed official tool must be enabled');
  assert(['already-installed','extension-center-import'].includes(identity.installationRoute),'Unknown installation route');
  const fixture=step('ISOLATED_TOOL_UI_INSTALLED');
  assert.equal(fixture.id,'managed-proxy-c2-fixture','Isolated fixture identity');
  assert(SHA256.test(fixture.packageHash),'Isolated fixture packageHash');
  sdkSuccess(step('C1_SDK_STATUS').output,'getStatus','C1_SDK_STATUS');
  const denied=step('C1_PRODUCTION_ENABLE_DENIED');
  assert.equal(denied.profileReviewed,false,'No production profile may be approved');
  enableDenied(denied.output,'C1_PRODUCTION_ENABLE_DENIED');
  sdkSuccess(step('C1_SDK_STOP').output,'requestDisable','C1_SDK_STOP');
  const unchanged=step('NO_UNAPPROVED_NATIVE_SET');
  assert.equal(unchanged.permission,true,'Native proxy permission must actually be available');
  assert.equal(unchanged.mode,'system','Native proxy must retain system mode');
  assert.equal(unchanged.journal,null,'Native proxy journal must remain null');

  const documentId=nonempty(receipt.sidePanelDocumentId,'sidePanelDocumentId');
  const target=record(receipt.sidePanelTarget,'sidePanelTarget');
  nonempty(target.id,'sidePanelTarget.id');
  nonempty(target.type,'sidePanelTarget.type');
  assert.equal(target.documentId,documentId,'Side Panel target document differs');
  assert(UUID.test(nonempty(target.hostInstanceId,'hostInstanceId')),'Invalid canonical hostInstanceId');
  const hostUrl=nonempty(target.hostUrl,'canonical hostUrl'),url=new URL(hostUrl);
  assert.equal(url.protocol,'chrome-extension:','Canonical Side Panel scheme');
  assert.equal(url.hostname,extensionId,'Canonical Side Panel extension');
  assert.equal(url.pathname,'/sidepanel.html','Canonical Side Panel document');
  assert.equal(url.username+url.password+url.port+url.hash,'','Canonical Side Panel URL has extra authority or fragment');
  assert.deepEqual([...url.searchParams],[['hostInstanceId',target.hostInstanceId]],'Canonical hostInstanceId URL mismatch');
  assert.equal(url.href,hostUrl,'Canonical Side Panel URL must be exact');
  assert(Array.isArray(receipt.sidePanelContexts)&&receipt.sidePanelContexts.length===1,
    'One current SIDE_PANEL context required (opening contexts are not acceptance evidence)');
  const context=record(receipt.sidePanelContexts[0],'current SIDE_PANEL context');
  assert.equal(context.type,'SIDE_PANEL','Native SIDE_PANEL context required');
  assert.equal(context.id,documentId,'Current SIDE_PANEL document differs (stale opening context)');
  assert.equal(context.url,hostUrl,'Current SIDE_PANEL URL differs from canonical document');
  for(const row of receipt.steps.filter(row=>row.name?.startsWith('C1_SIDE_PANEL_'))){
    assert.equal(row.documentId,documentId,row.name+' document differs');
    if(Object.hasOwn(row,'hostUrl'))assert.equal(row.hostUrl,hostUrl,row.name+' canonical URL differs');
  }
  const tools=step('C1_SIDE_PANEL_TOOLS_VISIBLE');
  const official=step('C1_SIDE_PANEL_OFFICIAL_UI');
  const native=step('C1_SIDE_PANEL_SDK_HOST_NATIVE');
  assert(receipt.steps.indexOf(tools)<receipt.steps.indexOf(official)&&
    receipt.steps.indexOf(official)<receipt.steps.indexOf(native),'Native C1 operations are out of order');
  assert(Array.isArray(tools.clickTrace),'Trusted Tools tab event trace required');
  const events=tools.clickTrace.filter(row=>row?.target==='tab-tools');
  assert.deepEqual(events.map(row=>row.type),['pointerdown','mousedown','mouseup','click'],'Four ordered Tools tab events required');
  let previous=-1;
  for(const event of events){
    assert.equal(event.isTrusted,true,'Tools tab events must be trusted');
    assert(['x','y','at'].every(key=>typeof event[key]==='number'&&Number.isFinite(event[key])&&event[key]>=0),
      'Trusted tab event coordinates and timestamp required');
    assert(event.at>=previous,'Trusted tab event timestamps out of order');
    previous=event.at;
  }
  const nativeInput=(name,selector,after,before)=>{
    const rows=receipt.steps.slice(after+1,before).filter(row=>row.name===name&&row.selector===selector);
    assert.equal(rows.length,1,'Exactly one native input required: '+selector);
    assert.equal(rows[0].surface,'native-side-panel','Input must belong to the native Side Panel: '+selector);
    assert.equal(rows[0].api,'Input.dispatchMouseEvent','Input must originate from Chrome: '+selector);
  };
  const toolsIndex=receipt.steps.indexOf(tools),officialIndex=receipt.steps.indexOf(official),nativeIndex=receipt.steps.indexOf(native);
  nativeInput('CHROME_MOUSE_INPUT','#tab-tools',-1,toolsIndex);
  nativeInput('CHROME_SANDBOX_MOUSE_INPUT','#ai-vip-proxy-refresh',toolsIndex,officialIndex);
  nativeInput('CHROME_SANDBOX_MOUSE_INPUT','#proxy-c2-enable',officialIndex,nativeIndex);
  nativeInput('CHROME_SANDBOX_MOUSE_INPUT','#proxy-c2-disable',officialIndex,nativeIndex);
  const approvals=receipt.steps.slice(officialIndex+1,nativeIndex).filter(row=>
    row.name==='CHROME_MOUSE_INPUT'&&row.selector==='#sidebar-tool-action-continue');
  assert.equal(approvals.length,2,'Native ENABLE and STOP require their trusted confirmations');
  for(const approval of approvals){
    assert.equal(approval.surface,'native-side-panel','Confirmation surface');
    assert.equal(approval.api,'Input.dispatchMouseEvent','Confirmation native input');
  }
  assert.equal(official.hostUrl,hostUrl,'Official UI canonical URL');
  assert.equal(official.chromeTargetType,target.type,'Official UI Chrome target type');
  assert.equal(native.chromeTargetType,target.type,'Fixture Chrome target type');
  for(const mode of [official.via,native.frameMode])
    assert(['parent-frame','oopif-target'].includes(mode),'Installed sandbox frame evidence required');
  const state=record(official.officialState,'officialState');
  assert.equal(state.member,'服务未配置','Official unconfigured UI');
  assert(nonempty(state.detail,'officialState.detail').includes('代理服务尚未接入'),'Official proxy presentation');
  assert.equal(state.enableHidden,true,'Unreviewed official ENABLE must be hidden');
  assert.equal(state.refreshHidden,false,'Official STATUS refresh must be visible');
  const request=record(official.statusRequest,'official refresh request');
  assert.equal(request.toolId,'ai-vip-share','Official STATUS request tool');
  assert.equal(request.operation,'browser.proxy.managed.getStatus','Official STATUS operation');
  nonempty(request.requestId,'Official STATUS requestId');
  nonempty(request.instance,'Official STATUS instance');
  const response=record(official.officialStatus,'official STATUS response');
  assert.equal(response.protocol,'opendesk.sidebar-tool.bridge.v1','Official STATUS protocol');
  assert.equal(response.kind,'response','Official STATUS response kind');
  for(const key of ['toolId','requestId','instance'])assert.equal(response[key],request[key],'Official STATUS '+key+' mismatch');
  assert.equal(response.ok,true,'Official STATUS failed');
  assert.equal(response.error,undefined,'Official STATUS contains an error');
  disabledStatus(response.result,'Official STATUS result');
  sdkSuccess(native.statusOutput,'getStatus','Native fixture STATUS');
  enableDenied(native.enableDenied,'Native fixture ENABLE');
  sdkSuccess(native.stopOutput,'requestDisable','Native fixture STOP');
  assert.equal(native.journal,null,'Native Side Panel journal must remain null');
  record(native.readback,'native readback');
  assert.equal(native.readback.levelOfControl,'controllable_by_this_extension','Extension must not control native proxy');
  assert.deepEqual(native.readback.value,{mode:'system'},'Native proxy must retain only system configuration');

  assert(Array.isArray(receipt.screenshots),'C1 screenshots required');
  const names=new Set(),paths=new Set();
  const prefix=build==='PRODUCTION'?'managed-proxy-c1-':'managed-proxy-dev-c1-';
  for(const screenshot of receipt.screenshots){
    record(screenshot,'screenshot');
    assert(typeof screenshot.name==='string'&&/^[a-z0-9-]+$/.test(screenshot.name),'Invalid screenshot name');
    assert(!names.has(screenshot.name)&&!paths.has(screenshot.path),'Duplicate screenshot evidence');
    names.add(screenshot.name);paths.add(screenshot.path);
    assert.equal(screenshot.path,'artifacts/'+prefix+screenshot.name+'.png','Screenshot path must be canonical and build-bound');
    assert(SHA256.test(screenshot.sha256),'Screenshot SHA-256 required');
    assert(Number.isSafeInteger(screenshot.bytes)&&screenshot.bytes>0,'Screenshot byte count required');
  }
  for(const name of NATIVE_SCREENSHOTS)assert(names.has(name),'Native screenshot missing: '+name);
  const nativeShots=receipt.screenshots.filter(row=>NATIVE_SCREENSHOTS.includes(row.name));
  assert.notEqual(nativeShots[0].sha256,nativeShots[1].sha256,'Native screenshots must show distinct official and fixture surfaces');
  return receipt;
}

export async function verifyC1Evidence(receipt,{sha,build='PRODUCTION',root=process.cwd()}={}){
  assertC1Receipt(receipt,{sha,build});
  const directory=await realpath(root);
  for(const screenshot of receipt.screenshots){
    const path=resolve(directory,screenshot.path);
    assert.equal(await realpath(path),path,'Screenshot must not traverse a symlink');
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const stat=await handle.stat();
      assert(stat.isFile(),'Screenshot must be a regular file');
      assert.equal(stat.size,screenshot.bytes,'Screenshot file byte count mismatch: '+screenshot.name);
      const bytes=await handle.readFile();
      assert.equal(bytes.length,screenshot.bytes,'Screenshot read byte count mismatch: '+screenshot.name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),screenshot.sha256,'Screenshot file SHA-256 mismatch: '+screenshot.name);
      assert(bytes.length>=33&&bytes.subarray(0,8).equals(PNG_SIGNATURE)&&
        bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&
        bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0,'Screenshot must contain a PNG image: '+screenshot.name);
    }finally{await handle.close();}
  }
  return {sha,build,result:receipt.result,sidePanelDocumentId:receipt.sidePanelDocumentId,
    verifiedScreenshots:receipt.screenshots.map(row=>row.path)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const {values,positionals}=parseArgs({allowPositionals:true,options:{
      sha:{type:'string',default:process.env.GITHUB_SHA},
      build:{type:'string',default:'PRODUCTION'},root:{type:'string',default:process.cwd()}
    }});
    assert(positionals.length<=1,'Usage: managed-proxy-c1-receipt.mjs [receipt.json] [--sha SHA] [--build PRODUCTION|DEVELOPMENT] [--root DIR]');
    const file=positionals[0]||(values.build==='DEVELOPMENT'?
      'artifacts/managed-proxy-installed-dev-c1.json':'artifacts/managed-proxy-installed-c1.json');
    const receipt=JSON.parse(await readFile(resolve(values.root,file),'utf8'));
    const result=await verifyC1Evidence(receipt,values);
    console.log(result.result+' verified for '+result.sha+' (build='+result.build+', screenshots='+result.verifiedScreenshots.length+')');
  }catch(error){console.error('C1_RECEIPT_REJECTED: '+error.message);process.exitCode=1;}
}
