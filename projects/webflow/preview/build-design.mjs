// The existing project entry now freezes its existing real component fixture.
// It no longer fills a hand-drawn kit application or produces an installable package.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWebflowUIFixture} from '../tests/auto-trigger-ui-server.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=fileURLToPath(new URL('.',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
// The last recorded native installation was 0.3.6. Both panes deliberately use
// those SAME application bytes; the current trusted component includes the
// generated-text visibility and draft fixes from 875ca5a4b.
const appRevision='246fd012a67d3b5e221ee7d1716df4ecc46fb93c';
// Rebuilding this style comparison must not silently consume parallel normal-chat work.
const uiSourceRevision='9418a5d1aa0f88cc0f60de108620149801b7eb1d';
const fixture=await createWebflowUIFixture({selfContained:true,appRevision,sourceRevision:uiSourceRevision});
const presentation=JSON.parse(await readFile(dir+'runtime-presentation.json','utf8'));
const candidateFixture=await createWebflowUIFixture({selfContained:true,appRevision,sourceRevision:uiSourceRevision,sourcePatches:[presentation]});
if(candidateFixture.applicationHtml!==fixture.applicationHtml)throw Error('Candidate changed the business application');
const candidateCSS=await readFile(dir+'runtime-layout.css','utf8');
const script=value=>String(value).replaceAll('</script','<\\/script');
const htmlFor=(layout,js)=>`<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src about:; connect-src 'none'; img-src data:"><title>Web Flow · 真实源码组件 / 模拟边界</title><style>${fixture.css}\n${layout}</style><body><div id="fixture-close" hidden></div><div id="fixture-open" hidden></div><div id="fixture-fail" hidden></div><div id="fixture-result" hidden></div><p id="fixture-events" hidden></p><section id="fixture-return" hidden><p>已返回模拟工具列表，应用草稿仍保留。</p><button id="fixture-reopen" class="od-button">重新打开 Web Flow</button></section><div id="opendesk-react-app" class="opendesk-react-app"></div><script type="module">${script(js)}</script></body></html>`;
const documents={baseline:htmlFor('',fixture.js),candidate:htmlFor(candidateCSS,candidateFixture.js)};
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const template=await readFile(dir+'design-app.fragment','utf8');
const behavior=await readFile(dir+'design-app.js','utf8');
const tokens=await readFile(root+'src/ui/design-tokens.css','utf8');
const components=await readFile(root+'src/ui/design-system.css','utf8');
// Function replacers keep literal $&, $' and $` in bundled source unchanged.
const html=template.replace('/* SOURCE_STYLES */',()=>tokens+'\n'+components)
 .replace('<!-- SOURCE_REVISION -->',()=>sourceCommit+' / app '+appRevision.slice(0,9))
 .replace('/* SOURCE_DOCUMENTS */',()=>JSON.stringify(documents).replaceAll('<','\\u003c'))
 .replace('/* PREVIEW_BEHAVIOR */',()=>script(behavior));
const sourcePaths=[...new Set([...fixture.dependencyPaths,'package.json','package-lock.json','projects/webflow/tool.config.json','src/ui/extension-center.css','src/ui/react/app-shell.tsx','src/ui/react/tabs/tool-host.tsx','src/ui/design-tokens.css',
 'src/ui/design-system.css','src/ui/tool-shell.css','src/ui/react/components/ui/button.tsx',
 'src/ui/react/components/ui/switch.tsx','src/ui/react/components/ui/sidebar-shared.css',
 'projects/webflow/trusted/AutoSettings.tsx','projects/webflow/trusted/RuntimePanel.tsx','projects/webflow/trusted/CurrentTask.tsx',
 'projects/webflow/tests/auto-trigger-ui-server.mjs',
 ...['build-design.mjs','design-app.fragment','design-app.js','runtime-layout.css','runtime-presentation.json'].map(name=>'projects/webflow/preview/'+name)])];
const sourceRevisions=Object.fromEntries(sourcePaths.filter(path=>path.startsWith('src/')||/^projects\/[^/]+\/trusted\//.test(path)||path==='projects/webflow/tool.config.json').map(path=>[path,uiSourceRevision]));
const inputs=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(sourceRevisions[path]?
 execFileSync('git',['show',sourceRevisions[path]+':'+path],{cwd:root}):await readFile(root+path))])));
const manifest={format:'webflow.source-comparison.v1',date:'2026-11-03',sourceCommit,uiSourceRevision,sourceRevisions,appRevision,
 evidence:'OFFLINE_REAL_SOURCE_COMPONENTS_MOCK_BOUNDARIES',sourceParity:'EXACT_BASELINE_WITH_DISCLOSED_RUNTIME_PRESENTATION_CANDIDATE',
 installedVersionReference:'0.3.6; historical native record, not a fresh installation read',
 applicationSources:Object.fromEntries([...fixture.appSources].map(([path,bytes])=>[path,sha(bytes)])),
 fixtureJS:sha(fixture.js),embeddedFixtureJS:sha(script(fixture.js)),candidateJS:sha(candidateFixture.js),embeddedCandidateJS:sha(script(candidateFixture.js)),
 applicationDocumentSHA:sha(fixture.applicationHtml),presentationPatch:presentation,fixtureCSS:sha(fixture.css),candidateCSS:sha(candidateCSS),
 documents:Object.fromEntries(Object.entries(documents).map(([name,bytes])=>[name,sha(bytes)])),
 htmlSha256:sha(html),inputs,nativeChrome:'NOT_TESTED',production:'NOT_TESTED',userPreferredVersion:'NOT_CONFIRMED'};
await writeFile(dir+'webflow-v0.3-preview.html',html);
await writeFile(dir+'webflow-v0.3-preview.manifest.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile(dir+'webflow-v0.3-preview.context.json',JSON.stringify({view:'完整宿主 → Web Flow：原版 / 运行与授权局部CSS候选',
 scenario:'同一模拟百度批准、自动运行开启、无当前任务',source:manifest.evidence,
 scope:['运行面板页签停留','只读摘要标签/值对齐','撤销按钮内容宽度','复制与下一次生成层级','审核就绪焦点/播报及输入错误关联'],
 unchanged:'相同0.3.6业务源码、原可信组件与底部Sheet；候选仅应用公开记录的表现补丁，不改生产源、权限、业务状态机或安装包',
 simulation:'Only in-memory SDK/storage/permission/task/clipboard boundaries; no network, Chrome, Native or real execution.',
 htmlSha256:manifest.htmlSha256,nativeChrome:'NOT_TESTED',production:'NOT_TESTED'},null,2)+'\n');
console.log(JSON.stringify({path:dir+'webflow-v0.3-preview.html',sha256:manifest.htmlSha256,bytes:Buffer.byteLength(html)},null,2));
