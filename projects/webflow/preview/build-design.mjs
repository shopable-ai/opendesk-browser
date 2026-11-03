// Rebuild the single offline DESIGN prototype through the canonical preview kit.
// This is not a source-bound adapter or a Sidebar Tool packager.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {load} from 'cheerio';
import {createPreviewKit,createComponentReference,checkPreview} from '../../../scripts/sidebar-preview-kit.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const kit=await createPreviewKit({title:'Web Flow'});
// The canonical shell links to these optional, locally generated companions.
const reference=await createComponentReference(kit);
await writeFile(dir+'components.html',reference.html);
await writeFile(dir+'component-recipes.md',reference.guide);
const $=load(kit.html);
$('#od-preview-app').html(await readFile(dir+'design-app.fragment','utf8'));
const prefix=$('#od-preview-behavior').text().split('/* DESIGN_APP_BEHAVIOR */')[0];
$('#od-preview-behavior').text(prefix+'/* DESIGN_APP_BEHAVIOR */\n'+await readFile(dir+'design-app.js','utf8'));
const html=$.html();
const checked=await checkPreview(html);
if(!checked.ok)throw Error(checked.errors.join('\n'));
const sha=createHash('sha256').update(html).digest('hex');
await writeFile(dir+'webflow-v0.3-preview.html',html);
await writeFile(dir+'webflow-v0.3-preview.manifest.json',JSON.stringify({...kit.manifest,htmlHash:sha,date:'2026-11-03',baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),designVersion:'0.3.7-design',evidence:'OFFLINE_DESIGN_PREVIEW',sourceParity:'NOT_CLAIMED',inputs:{...kit.manifest.inputs,...Object.fromEntries(await Promise.all(['design-app.fragment','design-app.js'].map(async name=>[name,createHash('sha256').update(await readFile(dir+name)).digest('hex')])))}},null,2)+'\n');
await writeFile(dir+'webflow-v0.3-preview.context.json',JSON.stringify({view:'OpenDesk → 扩展 → Web Flow',scenario:'未批准，自动运行关闭，当前任务为空',hostInteractions:['五 Tab / 扩展返回 / 模拟卸载','帮助与设置复用唯一宿主返回','运行面板独立滚动，不挤压原应用'],source:'canonical sidebar-preview-kit; application markup/behavior are a design simulation, not production compiled bytes',simulation:'内存中模拟批准、开关、指令、任务、结果和交付；无网络、SDK、真实权限、存储或剪贴板写入。复制操作演示反馈并提供手动选择。',htmlSha256:sha,designVersion:'0.3.7-design',nativeChrome:'NOT_TESTED',production:'NOT_TESTED',requirements:'BR-01–12 / AWB-01–08 remain in original product-contract and execution-plan; future workflows are labeled in Help.'},null,2)+'\n');
console.log(JSON.stringify({path:dir+'webflow-v0.3-preview.html',sha256:sha,check:checked.ok},null,2));
