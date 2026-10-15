// R1 offline preview: compile the exact validated sidebar tool package, then substitute ONLY its SDK boundary.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSidebarToolPackage} from '../build-sidebar-tool.mjs';
import {officialDesignSources,canonicalThemeOverride} from './shared-tool-design.mjs';

export const PREVIEW_FORMAT='opendesk.ui-preview.v1';
export const PREVIEW_SCENARIOS=Object.freeze(['success','empty','error','loading','permission-denied','untrusted']);
export const PREVIEW_MOCK_OPERATIONS=Object.freeze(['storage.get','storage.set','currentPage.info','tasks.open']);
const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const base64=bytes=>Buffer.from(bytes).toString('base64');
const dataUrl=(mime,bytes)=>'data:'+mime+';base64,'+base64(bytes);
const htmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const fail=message=>{throw Error('E_UI_PREVIEW: '+message);};
const toText=bytes=>Buffer.from(bytes).toString('utf8');

export async function generatePreview({
  tool='quick-notes',surface='side-panel',scenario='success',theme='light',
  width=360,height=760,out=null
}={}){
  if(!/^[a-z0-9-]{1,64}$/.test(tool))fail('invalid tool ID');
  // Fail closed: injected-page/standalone need their own real production mounting adapter.
  if(surface!=='side-panel')fail('surface '+surface+' has no verified production preview adapter');
  if(tool!=='quick-notes')fail('mock SDK adapter is not implemented for '+tool);
  if(!PREVIEW_SCENARIOS.includes(scenario))fail('unsupported scenario');
  if(!['light','dark'].includes(theme))fail('unsupported theme');
  if(!Number.isInteger(width)||width<240||width>1440||
    !Number.isInteger(height)||height<320||height>2400)fail('invalid CSS viewport');
  const project=join(repoRoot,'examples/sidebar-tools',tool);
  const pkg=await createSidebarToolPackage(project);
  if(!pkg.css.startsWith('/* opendesk.shared-design.v1 sha256='))
    fail('official design CSS is missing from the validated tool package');
  const invoked=[...pkg.js.matchAll(/\brequest\s*\(\s*['"]([^'"]+)['"]/g)].map(match=>match[1]);
  if(!invoked.length||invoked.some(operation=>!PREVIEW_MOCK_OPERATIONS.includes(operation))||
    PREVIEW_MOCK_OPERATIONS.some(operation=>!invoked.includes(operation)))
    fail('mock and real UI request operations do not match');
  const mock=await readFile(new URL('./quick-notes-mock.js',import.meta.url));
  const {tokens,digest}=await officialDesignSources();
  const override=await canonicalThemeOverride(theme);
  let commit;
  try {commit=execFileSync('git',['-C',repoRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();}
  catch {fail('a checked-out Git source revision is required');}
  if(!/^[0-9a-f]{40}$/.test(commit))fail('invalid Git source revision');
  const uiDigest=sha256(JSON.stringify([pkg.id,pkg.version,pkg.html,pkg.css,pkg.js]));
  const frameHtml=[
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src data: \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">',
    '<link rel="stylesheet" href="'+dataUrl('text/css',pkg.css)+'">',
    '<style>'+override+'</style>',
    '</head><body><div id="tool-root">'+pkg.html+'</div>',
    '<script>Object.defineProperty(globalThis,"__opendeskPreviewScenario",{value:'+JSON.stringify(scenario)+'});</script>',
    '<script src="'+dataUrl('text/javascript',mock)+'"></script>',
    '<script src="'+dataUrl('text/javascript',pkg.js)+'"></script>',
    '</body></html>'
  ].join('');
  const manifest=Object.freeze({
    format:PREVIEW_FORMAT,tool:pkg.id,toolVersion:pkg.version,surface,scenario,theme,
    viewport:{width,height},sourceCommit:commit,designSha256:digest,uiSha256:uiDigest,
    previewBuild:'R1',mock:true,installed:false,permissionsGranted:false,
    operations:PREVIEW_MOCK_OPERATIONS
  });
  const viewportTitle='OpenDesk Browser · '+pkg.title+' · 仅供离线模拟';
  const viewerCss=[
    'body{margin:0;padding:var(--space-3);background:var(--od-bg);color:var(--od-ink);font:var(--od-body-size)/1.5 system-ui,sans-serif}',
    '.preview-meta{padding:var(--space-3);margin:0 auto var(--space-3);max-width:900px;background:var(--od-paper);border:1px solid var(--od-line);border-radius:var(--radius-surface)}',
    '.preview-meta strong{display:block}.preview-meta small{display:block;color:var(--od-sub);overflow-wrap:anywhere}',
    '.preview-device{width:max-content;max-width:100%;margin:auto}.preview-device iframe{display:block;width:'+width+'px;height:'+height+'px;max-width:100%;background:var(--od-paper);border:1px solid var(--od-line);border-radius:var(--radius-control)}',
    '.preview-notice{margin:0 0 var(--space-2);color:var(--od-negative);font-weight:650}'
  ].join('\n');
  const outputHtml=[
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>'+htmlEscape(viewportTitle)+'</title>',
    '<style>'+tokens+'\n'+override+'\n'+viewerCss+'</style>',
    '</head><body><section class="preview-meta" aria-label="预览来源与模拟限制">',
    '<p class="preview-notice">模拟预览 · 非真实安装、权限或网络执行</p>',
    '<strong>'+htmlEscape(pkg.title)+' · '+htmlEscape(scenario)+' · '+htmlEscape(theme)+'</strong>',
    '<small>Source: '+commit+' · Design SHA-256: '+digest+' · UI SHA-256: '+uiDigest+'</small>',
    '<small>环境：Side Panel 沙箱 · 视口：'+width+' × '+height+' CSS px · 操作：仅内存模拟</small>',
    '</section><main class="preview-device">',
    '<iframe id="opendesk-preview-frame" title="'+htmlEscape(viewportTitle)+'" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>',
    '</main>',
    '<script type="application/json" id="opendesk-preview-manifest">'+JSON.stringify(manifest).replaceAll('<','\\u003c')+'</script>',
    '<script>(()=>{const encoded="'+base64(frameHtml)+'";',
    'const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));',
    'document.getElementById("opendesk-preview-frame").srcdoc=new TextDecoder().decode(bytes);})();</script>',
    '</body></html>'
  ].join('');
  const output=resolve(out||join(repoRoot,'artifacts/previews',pkg.id,
    [surface,scenario,theme,String(width)].join('-')+'.html'));
  return Object.freeze({manifest,frameHtml,html:outputHtml,output});
}
export async function buildPreview(options={}){
  const preview=await generatePreview(options);
  await mkdir(dirname(preview.output),{recursive:true});
  await writeFile(preview.output,preview.html,'utf8');
  return {output:preview.output,...preview.manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),parsed={};
  const opts=new Map([['--tool','tool'],['--surface','surface'],['--scenario','scenario'],
    ['--theme','theme'],['--width','width'],['--height','height'],['--out','out']]);
  try {
    for(let i=0;i<args.length;i+=2){
      if(!opts.has(args[i])||i+1>=args.length)fail('usage: --tool quick-notes --surface side-panel --scenario success --theme light --width 360 [--height 760] [--out file]');
      const key=opts.get(args[i]);
      parsed[key]=['width','height'].includes(key)?Number(args[i+1]):args[i+1];
    }
    buildPreview(parsed).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
      .catch(error=>{console.error(error.message);process.exitCode=1;});
  }catch(error){console.error(error.message);process.exitCode=1;}
}