import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {generatePreview,PREVIEW_SCENARIOS,PREVIEW_ADBLOCK_OPERATIONS} from '../../scripts/preview/build-preview.mjs';
import {canonicalAdblockPreviewHost} from '../../scripts/preview/adblock-host-source.mjs';
import {assertLayoutOnly,officialDesignSources} from '../../scripts/preview/shared-tool-design.mjs';

const source=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const project=resolve('examples/sidebar-tools/adblock');

test('AdBlock official installable sandbox reuses the source-bound public design and real restore button',async()=>{
  const [pkg,css]=await Promise.all([
    createSidebarToolPackage(project),
    source('examples/sidebar-tools/adblock/src/style.css')
  ]);
  const {tokens,publicRules}=await officialDesignSources();
  assert.equal(pkg.id,'adblock');
  assert.equal(assertLayoutOnly(css).includes('.adblock-tool{'),true);
  assert.ok(pkg.css.includes(tokens));
  assert.ok(pkg.css.includes(publicRules));
  assert.match(pkg.html,/od-surface od-surface--padded/);
  assert.match(pkg.html,/id="exceptions"/);
  assert.match(pkg.js,/od-button od-button--secondary adblock-restore/);
  assert.doesNotMatch(pkg.html,/id="global-switch"|id="site-switch"|id="open-settings"/);
  assert.ok(!pkg.capabilities.includes('chrome'), 'sandbox cannot request direct Chrome authority');
});

test('native host snapshots render original trusted control factory, not HTML re-drawn by hand',async()=>{
  const host=await canonicalAdblockPreviewHost();
  assert.equal(Object.keys(host.snapshots).length,7);
  for(const [name,html] of Object.entries(host.snapshots)){
    assert.match(html,/id="sidebar-tool-adblock-native"/,name);
    assert.match(html,/sidebar-tool-adblock-native od-surface/,name);
    assert.equal((html.match(/role="switch"/g)||[]).length,2,name);
    assert.match(html,/aria-label="全局广告拦截"/,name);
    assert.match(html,/sidebar-toc-settings-row/,name);
  }
  assert.match(host.snapshots['on-site-on'],/aria-checked="true"/);
  assert.match(host.snapshots['on-site-off'],/aria-checked="false"/);
  assert.match(host.snapshots['off'],/所有 AdBlock 规则已停止/);
  assert.match(host.snapshots['restart'],/需重启 Chrome/);
  const noPermission=host.snapshots['no-permission'];
  const permissionButton=noPermission.match(/<button[^>]*aria-label="全局广告拦截"[^>]*>/)?.[0];
  const siteButton=noPermission.match(/<button[^>]*aria-label="网站 [^"]+"[^>]*>/)?.[0];
  assert.ok(permissionButton&&!permissionButton.includes('disabled'),
    'missing optional DNR permission still allows a fresh trusted request');
  assert.ok(siteButton?.includes('disabled'),'site filtering cannot run without DNR');
  assert.match(host.snapshots['error'],/状态未确认/);
  assert.match(host.snapshots['loading'],/状态未确认/);
  assert.match(host.css,/.sidebar-tool-adblock-native button\[role=switch\]/);
  const native=await source('examples/sidebar-tools/adblock/trusted/host-controls.js');
  assert.match(native,/createAdblockPermissionControls/);
  assert.doesNotMatch(host.css,/chrome\.permissions|declarativeNetRequest/);
});

test('preview and installed AdBlock sandbox have byte-identical HTML/CSS/JS; host separately scoped',async()=>{
  const pkg=await createSidebarToolPackage(project);
  const a=await generatePreview({tool:'adblock',scenario:'success',width:360});
  const b=await generatePreview({tool:'adblock',scenario:'success',width:360});
  assert.equal(a.html,b.html,'same source and fixture must produce deterministic HTML');
  assert.equal(a.manifest.tool,'adblock');
  assert.equal(a.manifest.shellTheme,'light');
  assert.deepEqual(a.manifest.operations,PREVIEW_ADBLOCK_OPERATIONS);
  assert.equal(a.manifest.installed,false);
  assert.equal(a.manifest.permissionsGranted,false);
  assert.match(a.frameHtml,/connect-src 'none'/);
  assert.match(a.html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(a.html,/sandbox="allow-scripts allow-same-origin"/);
  assert.ok(a.frameHtml.includes('data:text/css;base64,'+Buffer.from(pkg.css).toString('base64')));
  assert.ok(a.frameHtml.includes('data:text/javascript;base64,'+Buffer.from(pkg.js).toString('base64')));
  assert.match(a.html,/id="od-preview-adblock-host"/);
  assert.match(a.html,/id="od-preview-adblock-restore-dialog"/);
  assert.match(a.html,/id="opendesk-preview-adblock-snapshots"/);
  assert.match(a.html,/id="sidebar-tool-remove"/);
  assert.match(a.html,/id="tab-tools"/);
  assert.ok(!a.frameHtml.includes('createAdblockPermissionControls'),
    'fixed native host JS must never appear in a sandbox package');
  assert.ok(!a.frameHtml.includes('permissions.request'),
    'preview sandbox may not gain native permission requests');
  assert.ok(!a.html.includes('id="theme-button"'),
    'old bespoke dark-mode prototype controls are not part of production UI');
});

test('every AdBlock preview scenario stays offline and the unsupported surface fails closed',async()=>{
  for(const scenario of PREVIEW_SCENARIOS){
    const output=await generatePreview({tool:'adblock',scenario});
    assert.equal(output.manifest.scenario,scenario);
    assert.match(output.frameHtml,/__opendeskPreviewScenario/);
    assert.ok(output.frameHtml.includes('data:text/javascript;base64,'));
    assert.match(output.html,/模拟预览 · 非真实安装/);
  }
  await assert.rejects(generatePreview({tool:'adblock',surface:'injected-page'}),
    /no verified production preview adapter/);
});

test('untrusted scenario uses text only, and in-memory mock refuses unlisted APIs / hostile restore',async()=>{
  const code=await source('scripts/preview/adblock-mock.js');
  const init=scenario=>{
    const window={addEventListener(){},parent:{postMessage(){}}};
    const env={document:{getElementById:id=>id==='tool-root'?{}:null},
      window,__opendeskPreviewScenario:scenario};
    env.globalThis=env;
    vm.runInNewContext(code,env,{timeout:1000});
    return env.OpenDeskTool;
  };
  const preview=init('untrusted');
  const state=await preview.request('adblock.status',{});
  assert.match(state.exceptions[0],/<img src=x onerror=alert\(1\)>/);
  await assert.rejects(preview.request('adblock.site.restore',{host:state.exceptions[0]}),
    /不可信演示域名/);
  await assert.rejects(preview.request('adblock.enable',{}),/未批准的 API/);
  await assert.rejects(init('permission-denied').request('adblock.status',{}),/尚未授权/);
  await assert.rejects(init('error').request('adblock.status',{}),/读取模拟 DNR/);
});


test('AdBlock preview first DNR grant is restart-fenced and messages stay bounded',async()=>{
  const code=await source('scripts/preview/adblock-host-preview.js');
  const handlers=new Map(),messages=[],buttons=[{disabled:false,focus(){}},{disabled:false,focus(){}}];
  let click;
  const mount={innerHTML:'',contains:node=>buttons.includes(node),
    querySelectorAll:()=>buttons,addEventListener:(name,fn)=>{if(name==='click')click=fn;}};
  const frame={style:{},contentWindow:{postMessage:msg=>messages.push(msg)},addEventListener(){}};
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}};
  const elements={
    'od-preview-adblock-host':mount,'opendesk-preview-frame':frame,
    'opendesk-preview-adblock-snapshots':{textContent:JSON.stringify({
      scenario:'empty',snapshots:{'no-permission':'no-permission','restart':'restart',
      'off':'off','on-site-on':'on-site-on','on-site-off':'on-site-off'}})},
    'od-preview-adblock-restore-dialog':dialog,
    'od-preview-adblock-restore-description':{textContent:''},
    'od-preview-adblock-feedback':{textContent:''},
    'od-preview-adblock-restore-cancel':{addEventListener(){},focus(){}},
    'od-preview-adblock-restore-accept':{addEventListener(){}},
    'od-preview-reset':{addEventListener(){}}
  };
  vm.runInNewContext(code,{
    window:{addEventListener:(name,fn)=>handlers.set(name,fn)},
    document:{getElementById:id=>elements[id]||null}
  },{timeout:1000});
  assert.equal(mount.innerHTML,'no-permission');
  click({isTrusted:true,target:{closest:()=>buttons[0]}});
  assert.equal(mount.innerHTML,'restart');
  assert.equal(messages.at(-1).enabled,false);
  assert.equal(messages.at(-1).granted,true);
  assert.equal(messages.at(-1).restartRequired,true);
  assert.match(elements['od-preview-adblock-feedback'].textContent,/重启 Chrome/);
  click({isTrusted:true,target:{closest:()=>buttons[0]}});
  assert.equal(mount.innerHTML,'restart','cannot enable until restart');
  handlers.get('message')({source:frame.contentWindow,origin:'https://evil.example',
    data:{type:'opendesk.preview.adblock.height',height:400}});
  assert.equal(frame.style.height,undefined);
  handlers.get('message')({source:frame.contentWindow,origin:'null',
    data:{type:'opendesk.preview.adblock.height',height:140}});
  assert.equal(frame.style.height,'140px');
});

test('AdBlock offline restore requires accepted matching receipt and product initial height',async()=>{
  const [host,mock,builder]=await Promise.all([
    source('scripts/preview/adblock-host-preview.js'),
    source('scripts/preview/adblock-mock.js'),
    source('scripts/preview/build-preview.mjs')
  ]);
  assert.match(host,/pendingAck=null/);
  assert.match(host,/message\.requestId!==pendingAck\.requestId/);
  assert.match(host,/!state\.exceptions\.includes\(site\)/);
  assert.match(mock,/announce\(data\.requestId\)/);
  assert.match(builder,/HEIGHT:String\(tool==='adblock'\?220:height\)/);
});


test('checked-in AdBlock HTML stays generator-identical independent of unrelated HEAD commits',async()=>{
  const snapshot=await source('examples/sidebar-tools/adblock/adblock-r1-interactive-preview.html');
  const generated=await generatePreview({
    tool:'adblock',surface:'side-panel',scenario:'success',theme:'light',width:360,height:760
  });
  const normalize=html=>html
    .replace(/Source: [0-9a-f]{40}/g,'Source: SOURCE_REVISION')
    .replace(/"sourceCommit":"[0-9a-f]{40}"/g,'"sourceCommit":"SOURCE_REVISION"');
  assert.equal(normalize(snapshot),normalize(generated.html),
    'reviewed HTML must match canonical package/shell/host/mock byte-for-byte, excluding Git HEAD metadata');
});
