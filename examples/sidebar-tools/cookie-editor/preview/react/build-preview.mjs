#!/usr/bin/env node
// Existing single-file pipeline; same fixed runtime and Shared UI as the product.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSharedToolCss,canonicalThemeOverride} from '../../../../../scripts/preview/shared-tool-design.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const repo=resolve(root,'../../../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=JSON.parse(await readFile(join(root,'dist/source-inputs.json'),'utf8'));
for(const [path,digest] of Object.entries(inputs)){
 if(sha(await readFile(path))!==digest)throw Error('E_PREVIEW_SOURCE_DRIFT: '+path);
}
const [js,previewCss,runtime,sharedUI,productCss]=await Promise.all([
 readFile(join(root,'dist/cookie-react.js')),readFile(join(root,'dist/cookie-react.css')),
 readFile(join(repo,'src/libs/page-frameworks/react-19.2.0.js')),
 readFile(join(repo,'dist/development/sidebar-shared-ui.js')),
 readFile(resolve(root,'../../src/react.css'),'utf8')
]);
if(!runtime.includes(Buffer.from('19.2.0'))||!sharedUI.includes(Buffer.from('OpenDeskSidebarUI')))throw Error('E_PREVIEW_FIXED_RUNTIME_MISSING');
const [compiled,light,dark]=await Promise.all([compileSharedToolCss(productCss),canonicalThemeOverride('light'),canonicalThemeOverride('dark')]);
const css=Buffer.from(compiled+'\n'+previewCss+'\n'+light.replace(':root{',':root:not([data-preview-theme="dark"]){')+'\n'+dark.replace(':root{',':root[data-preview-theme="dark"]{'));
const data=(type,bytes)=>'data:'+type+';base64,'+bytes.toString('base64');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cookie Editor R5.23 · 自适应侧边栏交互预览</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src data:; style-src data:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><link rel="stylesheet" href="${data('text/css',css)}"></head><body><div id="r49-root"></div>${[runtime,sharedUI,js].map(bytes=>'<script src="'+data('text/javascript',bytes)+'"></script>').join('')}</body></html>\n`;
const destination=join(root,'index.html');
if(process.argv.includes('--check')){
 if(await readFile(destination,'utf8')!==html)throw Error('R520_REACT_PREVIEW_DRIFT');
 console.log('R520_PREVIEW_MATCH',sha(html));
}else{
 await writeFile(destination,html);
 console.log(JSON.stringify({status:'R520_REACT_PREVIEW_BUILT',htmlBytes:Buffer.byteLength(html),htmlSha256:sha(html),appSha256:sha(js),runtimeSha256:sha(runtime),sharedUISha256:sha(sharedUI)},null,2));
}
