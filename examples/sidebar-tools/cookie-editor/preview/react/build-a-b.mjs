#!/usr/bin/env node
// SOURCE-BOUND comparison wrapper. It never reproduces the Cookie product UI.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
export const accepted='94e518247e812f80b5b65e06966a443310777743';
export async function approvedHtml(){
 const original=await readFile(resolve(here,'../cookie-editor.html'));
 const sha=createHash('sha1').update('blob '+original.length+'\0').update(original).digest('hex');
 if(sha!==accepted)throw Error('E_R35_APPROVED_HTML_CHANGED: '+sha);
 return original;
}
export function comparisonHtml(original,react,{dev=false,digest=''}={}){
const attr=text=>String(text).replaceAll('&','&amp;').replaceAll('"','&quot;')
 .replaceAll('<','&lt;').replaceAll('>','&gt;');
const file='<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<meta name="approved-blob" content="'+accepted+'">'+
 '<meta name="react-sha256" content="'+digest+'">'+
 '<title>Cookie Editor · 真实原版与 React A/B</title>'+
 '<style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#f2f3f5;'+
 'color:#202124;font:13px/1.5 system-ui,sans-serif}h1{font-size:15px;margin:0 0 5px}'+
 'header{max-width:940px;margin:0 auto 12px}header p{font-size:11px;color:#59616c;margin:0}'+
 '.pair{display:flex;flex-wrap:wrap;align-items:start;justify-content:center;gap:16px}'+
 'figure{margin:0;min-width:0}figcaption{margin:0 0 6px;font-weight:600;font-size:12px}'+
 'iframe{display:block;width:440px;max-width:min(100%,calc(100vw - 32px));height:820px;'+
 'border:1px solid #d0d3d8;border-radius:10px;background:#fff}'+
 '@media(max-width:920px){.pair{gap:20px}iframe{width:440px}}'+
 '</style></head><body><header><h1>Cookie Editor · 真实交互 A/B</h1>'+
 '<p>左：批准版 HTML 模拟操作；右：正式 React 组件 + Mock SDK。两边均不读取真实 Cookie。</p></header>'+
 '<div class="pair"><figure><figcaption>批准版 HTML · 视觉基线</figcaption>'+
 '<iframe id="approved-html" title="批准版 HTML" sandbox="allow-scripts allow-downloads allow-popups"'+
 ' srcdoc="'+attr(original.toString('utf8'))+'"></iframe></figure>'+
 '<figure><figcaption>正式 React · '+(dev?'当前源码 dev':'同源构建')+'</figcaption>'+
 '<iframe id="current-react" title="正式 React"'+(dev?'':' sandbox="allow-scripts allow-downloads allow-popups"')+
 (dev?' src="/dev.html" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"':' srcdoc="'+attr(react)+'"')+'></iframe></figure></div></body></html>';
return file;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const original=await approvedHtml();
 const sha=accepted;
const checked=execFileSync(process.execPath,[join(here,'build-preview.mjs'),'--check'],{
 cwd:here,encoding:'utf8',stdio:['ignore','pipe','pipe']
});
if(!checked.includes('R520_PREVIEW_MATCH'))throw Error('E_R35_STALE_REACT_HTML');
const react=await readFile(join(here,'index.html'),'utf8');
if(!react.includes('data:text/javascript;base64,')||!react.includes("connect-src 'none'"))
 throw Error('E_R35_MISSING_PRODUCTION_REACT_SOURCE');
const digest=createHash('sha256').update(react).digest('hex');
const file=comparisonHtml(original,react,{digest});
const out=join(here,'a-b.html');
await writeFile(out,file);
console.log(JSON.stringify({status:'R35_AB_BUILT',file:out,
 originalBlob:sha,reactSha256:digest,htmlBytes:Buffer.byteLength(file)},null,2));

}
