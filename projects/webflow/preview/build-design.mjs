// One source-bound preview of the current worktree. No Git-era UI or presentation patches.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createWebflowUIFixture} from '../tests/auto-trigger-ui-server.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=fileURLToPath(new URL('.',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
export async function createWebflowPreview(){
const fixture=await createWebflowUIFixture({selfContained:true});
const script=value=>String(value).replaceAll('</script','<\\/script');
const candidate=`<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src about:; connect-src 'none'; img-src data:"><title>Web Flow · 当前源码 / 模拟边界</title><style>${fixture.css}</style><body><div id="fixture-close" hidden></div><div id="fixture-open" hidden></div><div id="fixture-fail" hidden></div><div id="fixture-result" hidden></div><p id="fixture-events" hidden></p><section id="fixture-return" hidden><p>已返回模拟工具列表，应用草稿仍保留。</p><button id="fixture-reopen" class="od-button">重新打开 Web Flow</button></section><div id="opendesk-react-app" class="opendesk-react-app"></div><script type="module">${script(fixture.js)}</script></body></html>`;
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const sourcePaths=[...new Set([...fixture.dependencyPaths,'package.json','package-lock.json','projects/webflow/tool.config.json',
 ...['main.js','model.js','style.css'].map(name=>'projects/webflow/src/ui/'+name),
 'src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css','src/ui/extension-center.css',
 'projects/webflow/tests/auto-trigger-ui-server.mjs',
 ...['build-design.mjs','design-app.fragment','design-app.js'].map(name=>'projects/webflow/preview/'+name)])].sort();
const inputs=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(root+path))])));
const candidateHash=sha(JSON.stringify(inputs));
const template=await readFile(dir+'design-app.fragment','utf8');
const behavior=await readFile(dir+'design-app.js','utf8');
const html=template.replace('/* SOURCE_STYLES */',()=>fixture.css)
 .replace('<!-- SOURCE_REVISION -->',()=> '当前工作区 · '+candidateHash.slice(0,12))
 .replace('/* SOURCE_DOCUMENTS */',()=>JSON.stringify({candidate}).replaceAll('<','\\u003c'))
 .replace('/* PREVIEW_BEHAVIOR */',()=>script(behavior));
const manifest={format:'webflow.current-source-preview.v2',date:'2026-11-07',sourceCommit,sourceMode:'CURRENT_WORKTREE',candidateHash,
 evidence:'OFFLINE_REAL_SOURCE_COMPONENTS_MOCK_BOUNDARIES',sourceParity:'CURRENT_SOURCE_WITHOUT_PRESENTATION_PATCHES',
 applicationSources:Object.fromEntries([...fixture.appSources].map(([path,bytes])=>[path,sha(bytes)])),
 fixtureJS:sha(fixture.js),embeddedCandidateJS:sha(script(fixture.js)),fixtureCSS:sha(fixture.css),
 applicationDocumentSHA:sha(fixture.applicationHtml),documents:{candidate:sha(candidate)},htmlSha256:sha(html),inputs,
 historicalComparison:'runtime-layout.css and runtime-presentation.json are unused historical design material',
 installedPackage:'NOT_UPDATED',nativeChrome:'NOT_TESTED',native:'NOT_TESTED',production:'NOT_TESTED'};
const context={view:'完整宿主 → Web Flow 首页、当前任务、任务授权、使用说明',
 scenario:'当前源码、模拟监听就绪、自动运行开启、无当前任务；外部可切换状态',source:manifest.evidence,sourceMode:manifest.sourceMode,
 candidateHash,htmlSha256:manifest.htmlSha256,
 hostInteractions:['原运行与授权面板','键盘/触摸状态详情','原生开关','原请求停止','授权编辑与草稿保留'],
 simulation:'Only in-memory SDK/storage/permission/task/clipboard boundaries; no network, Chrome, Native or real execution.',
 historicalComparison:manifest.historicalComparison,installedPackage:'NOT_UPDATED',nativeChrome:'NOT_TESTED',production:'NOT_TESTED'};
return {html,manifest,context,fixture};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const {html,manifest,context}=await createWebflowPreview();
await writeFile(dir+'webflow-v0.3-preview.html',html);
await writeFile(dir+'webflow-v0.3-preview.manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile(dir+'webflow-v0.3-preview.context.json',JSON.stringify(context,null,2)+'\n');
console.log(JSON.stringify({path:dir+'webflow-v0.3-preview.html',sha256:manifest.htmlSha256,candidateHash:manifest.candidateHash,inputs:Object.keys(manifest.inputs).length,bytes:Buffer.byteLength(html)},null,2));
}
