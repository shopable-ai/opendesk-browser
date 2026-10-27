#!/usr/bin/env node
// Source-bound HTML: reuses the compiled installed IIFE and the pinned React
// runtime; only the SDK transport is replaced by an explicit preview fixture.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSharedToolCss,canonicalThemeOverride}
  from '../../../../../scripts/preview/shared-tool-design.mjs';
const preview=dirname(fileURLToPath(import.meta.url));
const project=resolve(preview,'../..');
const repo=resolve(project,'../../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=rel=>readFile(join(project,rel));
const ready=JSON.parse(await read('dist/build-ready.json'));
if(ready?.format!=='opendesk.ui-build-ready.v1'||!ready.sources||!ready.files)
  throw Error('E_FINGERPRINT_PREVIEW_NO_READY_BUILD');
for(const [name,info] of Object.entries({...ready.sources,...ready.files})){
  const bytes=await read(name);
  if(bytes.length!==info.bytes||hash(bytes)!==info.sha256)
    throw Error('E_FINGERPRINT_SOURCE_OR_BUILD_DRIFT: '+name);
}
const [app,style,runtime,shared,fixture,light,dark]=await Promise.all([
  read('dist/tool.js'),read('dist/tool.css'),
  readFile(join(repo,'src/libs/page-frameworks/react-19.2.0.js')),
  readFile(join(repo,'dist/development/sidebar-shared-ui.js')),
  read('preview/react/sdk-preview.js'),
  canonicalThemeOverride('light'),canonicalThemeOverride('dark')
]);
if(runtime.length!==193163||hash(runtime)!==
  'd1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758')
  throw Error('E_FINGERPRINT_REACT_PIN_MISMATCH');
if(!shared.includes(Buffer.from('OpenDeskSidebarUI')))
  throw Error('E_FINGERPRINT_SHARED_UI_NOT_BUILT');
const composedCss=Buffer.from(
  (await compileSharedToolCss(style.toString('utf8')))+'\n'+
  light.replace(':root{',':root:not([data-preview-theme="dark"]){')+'\n'+
  dark.replace(':root{',':root[data-preview-theme="dark"]{')+'\n'+
  '.fp-demo-top{font:12px system-ui;max-width:520px;margin:auto;display:flex;'+
  'align-items:center;gap:9px;flex-wrap:wrap;padding:12px;'+
  'border-bottom:1px solid var(--od-line)}.fp-demo-top select{'+
  'border:1px solid var(--od-line);border-radius:8px;padding:6px}\n');
const uri=(mime,b)=>'data:'+mime+';base64,'+b.toString('base64');
const controls='<div class="fp-demo-top"><strong>浏览器环境检测</strong>'+
  '<span>离线交互预览：SDK 替身，不是网页检测或原生验收</span>'+
  '<label>演示网站 <select id="fp-fixture">'+
  '<option value="0">QA 购物车</option><option value="1">电商结账页</option>'+
  '</select></label><span id="fp-fixture-status"></span></div>';
const html='<!doctype html><html lang="zh-CN"><head>'+
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;;'+
  ' script-src data:;style-src data:;img-src data:;connect-src &#39;none&#39;;'+
  ' object-src &#39;none&#39;;base-uri &#39;none&#39;;form-action &#39;none&#39;">'+
  '<title>Browser Fingerprint · 正式 React 同源预览</title>'+
  '<link rel="stylesheet" href="'+uri('text/css',composedCss)+'">'+
  '</head><body>'+controls+'<div id="fp-preview-root"><div id="tool-app"></div></div>'+
  [runtime,shared,fixture,app].map(b=>
    '<script src="'+uri('text/javascript',b)+'"></script>').join('')+
  '</body></html>\n';
const output=join(preview,'index.html');
if(process.argv.includes('--check')){
  if(await readFile(output,'utf8')!==html)throw Error('E_FINGERPRINT_PREVIEW_DRIFT');
  console.log('FINGERPRINT_SAME_SOURCE_PREVIEW_MATCH '+hash(html));
}else{
  await writeFile(output,html);
  // CI retains the EXACT generated HTML as a raw artifact, not a second UI.
  if(process.env.GITHUB_ACTIONS==='true'){
    const artifact=join(repo,'artifacts/app-ci/browser-fingerprint');
    await mkdir(artifact,{recursive:true});
    await writeFile(join(artifact,'preview.html'),html);
    await writeFile(join(artifact,'preview.sha256'),hash(html)+'\n');
  }
  console.log(JSON.stringify({status:'SAME_SOURCE_PREVIEW_BUILT',
    htmlSha256:hash(html),appSha256:hash(app),
    runtimeSha256:hash(runtime),sharedUiSha256:hash(shared)},null,2));
}
