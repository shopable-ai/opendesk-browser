import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const skillsRoot=path.join(root,'.agents/skills');
const file=relative=>path.join(root,relative);
const read=relative=>readFile(file(relative),'utf8');
const CANONICAL_SKILLS=[
  'opendesk-extension-runtime','opendesk-extension-ui','opendesk-program-publish',
  'opendesk-script-authoring','opendesk-sidebar-tool-dev',
  'opendesk-sidebar-tool-package','opendesk-trusted-sidebar-feature',
  'opendesk-ui-preview'
];

test('Skills directory routes every canonical Skill exactly once with valid frontmatter',async()=>{
  const [index,universe,entries]=await Promise.all([
    read('.agents/skills/README.md'),read('.agents/skills/UNIVERSE.zh-CN.md'),
    readdir(skillsRoot,{withFileTypes:true})
  ]);
  const dirs=entries.filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
  const active=dirs.filter(name=>CANONICAL_SKILLS.includes(name));
  assert.deepEqual(active,CANONICAL_SKILLS,'all eight active Skills have distinct responsibilities and routes');
  const reserved=dirs.filter(name=>!CANONICAL_SKILLS.includes(name));
  assert.deepEqual(reserved,['opendesk-marketplace-publish'],'only one explicitly reserved inactive directory');
  await access(file('.agents/skills/opendesk-marketplace-publish/RESERVED.md'));
  await assert.rejects(access(file('.agents/skills/opendesk-marketplace-publish/SKILL.md')),{code:'ENOENT'},
    'planned online marketplace publishing must not appear as an active Skill');
  const descriptions=new Set();
  for(const name of active){
    const content=await read('.agents/skills/'+name+'/SKILL.md');
    const meta=content.match(/^---\r?\nname: ([^\n]+)\r?\ndescription: ([^\n]+)\r?\n---(?:\r?\n|$)/);
    assert.ok(meta,'Skill frontmatter missing '+name);
    assert.equal(meta[1],name,'slug must equal name');
    assert.ok(meta[2].trim().length>=40,'trigger description must be specific '+name);
    assert.ok(!descriptions.has(meta[2]),'duplicate trigger description '+name);
    descriptions.add(meta[2]);
    const entry='('+name+'/SKILL.md)';
    assert.equal(index.split(entry).length-1,1,'README must route Skill exactly once: '+name);
    assert.ok(universe.includes('`'+name+'`'),'universe must register Skill '+name);
  }
  assert.match(universe,/独立评分规则/);
  for(const name of ['opendesk-extension-ui','opendesk-extension-runtime'])
    assert.match(universe,new RegExp('`'+name+'`[^\\n]*\\*\\*(?:98|96)\\*\\*'),'new Skill must be individually scored '+name);
});

test('UI preview Skill routes to the original kit and real package adapter without a second design system',async()=>{
  const [index,skill,contract]=await Promise.all([
    read('.agents/skills/README.md'),
    read('.agents/skills/opendesk-ui-preview/SKILL.md'),
    read('docs/architecture/browser-framework/ui-preview-contract-r1.zh-CN.md')
  ]);
  assert.match(index,/正式源码同源离线预览/);
  assert.match(skill,/scripts\/sidebar-preview-kit\.mjs create/);
  assert.match(skill,/scripts\/preview\/build-preview\.mjs/);
  assert.match(skill,/scripts\/preview\/check-preview-contract\.mjs/);
  assert.match(contract,/src\/ui\/design-tokens\.css/);
  assert.match(contract,/scripts\/build-sidebar-tool\.mjs/);
});

test('Packaging is an active standalone Skill while remote marketplace publishing stays non-executable',async()=>{
  const [index,universe,dev,pack,planned]=await Promise.all([
    read('.agents/skills/README.md'),read('.agents/skills/UNIVERSE.zh-CN.md'),
    read('.agents/skills/opendesk-sidebar-tool-dev/SKILL.md'),
    read('.agents/skills/opendesk-sidebar-tool-package/SKILL.md'),
    read('.agents/skills/opendesk-marketplace-publish/RESERVED.md')
  ]);
  assert.match(index,/opendesk-marketplace-publish\/RESERVED\.md/);
  assert.match(universe,/opendesk-sidebar-tool-package`[^\n]*\*\*96\*\*/);
  assert.match(dev,/opendesk-sidebar-tool-package\/SKILL\.md/);
  for(const phrase of ['build-sidebar-tool.mjs','artifacts/sidebar-tools/','--out',
    'official-tools/catalog.json','serializeSidebarToolPackage','NOT_TESTED'])
    assert.ok(pack.includes(phrase),'build and package Skill missing '+phrase);
  assert.match(pack,/不是第三方在线市场发布|远程市场发布并未/);
  for(const word of ['RESERVED_ONLY','NOT_AN_ACTIVE_SKILL','发布者','签名','审核','未启用'])
    assert.ok(planned.includes(word),'planned market scope missing '+word);
  assert.match(planned,/不得创建带 frontmatter 的 SKILL\.md/);
});

test('Extension UI and runtime skills reference one canonical set of owners, not duplicate systems',async()=>{
  const [ui,runtime]=await Promise.all([
    read('.agents/skills/opendesk-extension-ui/SKILL.md'),
    read('.agents/skills/opendesk-extension-runtime/SKILL.md')
  ]);
  for(const phrase of ['R27','R28','R30','od-page-head','od-disclosure','design-tokens.css','我的 → 定时计划','NOT_TESTED'])
    assert.ok(ui.includes(phrase),'UI Skill missing '+phrase);
  for(const phrase of ['Controller','USER_SCRIPT','Service Worker','Authority','Chrome','WXT','source','NOT_TESTED'])
    assert.ok(runtime.includes(phrase),'runtime Skill missing '+phrase);
  assert.match(ui,/不能新建一级 Tab|不新建一级 Tab/);
  assert.match(runtime,/不创建第二套|不建立重复/);
});

test('Every local Markdown link in newly authored Skill docs resolves inside the repo',async()=>{
  const dirs=(await readdir(skillsRoot,{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name);
  const docs=['.agents/skills/README.md','.agents/skills/UNIVERSE.zh-CN.md',
    ...CANONICAL_SKILLS.map(name=>'.agents/skills/'+name+'/SKILL.md'),
    '.agents/skills/opendesk-marketplace-publish/RESERVED.md'];
  for(const filename of docs){
    const source=await read(filename);
    for(const match of source.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)){
      const link=match[1];
      if(/^(https?:|#|mailto:)/.test(link))continue;
      const resolved=path.resolve(path.dirname(file(filename)),link);
      assert.ok(resolved.startsWith(root),'markdown link must remain inside repo: '+filename+' => '+link);
      await access(resolved);
    }
  }
});

test('R4 actual HTML has five visible tabs and historical tabs stay historical',async()=>{
  const [html,spec,ui]=await Promise.all([read('src/ui/tool.html'),read('docs/product/sidebar-ui-spec.zh-CN.md'),read('.agents/skills/opendesk-extension-ui/SKILL.md')]);
  const tabs=[...html.split('</nav>')[0].matchAll(/<button\b[^>]*\brole="tab"[^>]*>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.filter(x=>!/\shidden(?:\s|>)/.test(x[0])).map(x=>x[1]),['我的','扩展','工作流','开发','云控']);
  assert.ok(tabs.some(x=>x[1]==='调试'&&/\shidden/.test(x[0])));
  const current=spec.split('# 历史存档：OpenDesk Browser Sidebar UI SPEC · R21')[0];
  assert.match(current,/正式五个一级 Tab/);
  assert.match(current,/应用（Sidebar Tool）/);
  assert.match(current,/网页增强（Page Program）/);
  assert.doesNotMatch(current,/^\|\s*(?:发现|工具)\s*\|/m);
  assert.match(ui,/我的 \/ 扩展 \/ 工作流 \/ 开发 \/ 云控/);
});
test('R4 common user requests map to one principal Skill each',async()=>{
  const index=await read('.agents/skills/README.md');
  for(const [phrase,slug] of [
    ['在扩展里开发一个小应用','opendesk-sidebar-tool-dev'],
    ['编译 Cookie Editor 并生成可导入 JSON','opendesk-sidebar-tool-package'],
    ['为网页安装一个增强脚本','opendesk-program-publish'],
    ['修改扩展列表和安装管理界面','opendesk-extension-ui'],
    ['开发一个需要后台能力的扩展功能','opendesk-extension-runtime'],
    ['在我的任务中创建自动化任务','opendesk-script-authoring'],
    ['开发并发布 React/Vue 网页程序','opendesk-program-publish']
  ]){
    const matches=index.split('\n').filter(x=>x.startsWith('| 「'+phrase+'」 |'));
    assert.equal(matches.length,1,'duplicate/missing route '+phrase);
    assert.ok(matches[0].includes('| `'+slug+'` |'),'bad primary route '+phrase);
  }
});
test('R4 ambiguous requests retain one documented principal owner, not simulated AI routing',async()=>{
  const index=await read('.agents/skills/README.md');
  assert.match(index,/TRIGGER_NOT_TESTED/,'static contract must not claim a real Agent trigger');
  for(const [phrase,slug] of [
    ['修复 Cookie Editor 的可信后台权限','opendesk-trusted-sidebar-feature'],
    ['只修改 Cookie Editor 沙箱应用 UI','opendesk-sidebar-tool-dev'],
    ['给网页增加 React 悬浮组件','opendesk-script-authoring'],
    ['修改 Page Program 的安装和撤权','opendesk-extension-runtime'],
    ['修改「我的」定时计划页面','opendesk-extension-ui'],
    ['修复 MV3 Service Worker 生命周期','opendesk-extension-runtime'],
    ['导入已有 Sidebar Tool JSON','opendesk-sidebar-tool-package'],
    ['更新已经发布的 Page Program','opendesk-program-publish']
  ]){
    const matches=index.split('\n').filter(row=>row.startsWith('| 「'+phrase+'」 |'));
    assert.equal(matches.length,1,'ambiguous request has missing/duplicate owner: '+phrase);
    assert.ok(matches[0].includes('| `'+slug+'` |'),'incorrect primary Skill for '+phrase);
  }
});

test('R4 hides historical Tools-only UI while preserving the original Host nodes',async()=>{
  const [html,css]=await Promise.all([
    read('src/ui/tool.html'),read('src/ui/extension-center.css')
  ]);
  assert.match(html,/id="extension-center"/);
  for(const selector of [
    '#sidebar-tool-list-view>.sidebar-tools-head',
    '#sidebar-tool-list-view>#sidebar-tool-my-panel',
    '#sidebar-tool-list-view>#sidebar-tool-discover-panel'
  ])assert.ok(css.includes(selector),'old user-visible Tools-only section not hidden: '+selector);
  assert.match(css,/#sidebar-tool-list-view>[^\n]+\{display:none!important\}/);
});

test('R4 source-of-truth and Skill routing changes trigger governance CI',async()=>{
  const workflow=await read('.github/workflows/agent-skills-governance.yml');
  for(const name of [
    '.agents/skills/**',
    'tests/environment/agent-skills-r1.test.mjs',
    'scripts/agent-skills-r22-eval.mjs',
    'docs/product/sidebar-ui-spec.zh-CN.md',
    'docs/architecture/ui-layout-conventions-r27.zh-CN.md',
    'docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md',
    'docs/architecture/sidebar-design-system-r20.zh-CN.md',
    'docs/api/sidebar-tools.zh-CN.md',
    'docs/api/sidebar-tool-development.zh-CN.md',
    'examples/sidebar-tools/README.zh-CN.md',
    'src/ui/tool.html','src/ui/extension-center.js',
    'src/ui/extension-center-model.js','src/ui/extension-center.css'
  ])assert.ok(workflow.includes("      - '"+name+"'"),'governance path filter misses '+name);
  assert.match(workflow,/node --test tests\/environment\/agent-skills-r1\.test\.mjs/);
  assert.match(workflow,/node --test tests\/environment\/sidebar-r21-design-system\.test\.mjs/);
  assert.ok(workflow.includes('node scripts/agent-skills-r22-eval.mjs --self-test'));
});

test('App/Page/Task execution and permissions remain distinct',async()=>{
  const [app,publish,trusted,runtime,model,center]=await Promise.all([
    read('.agents/skills/opendesk-sidebar-tool-dev/SKILL.md'),
    read('.agents/skills/opendesk-program-publish/SKILL.md'),
    read('.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md'),
    read('.agents/skills/opendesk-extension-runtime/SKILL.md'),
    read('src/ui/extension-center-model.js'),read('src/ui/extension-center.js')]);
  for(const term of ['examples/sidebar-tools/<id>/','opendesk.sidebar-tool.v1/v2','OpenDeskTool.request','opaque-origin'])
    assert.ok(app.includes(term),'app contract missing '+term);
  assert.match(publish,/网页增强/);assert.match(publish,/Authority/);
  assert.match(trusted,/动态工具包/);assert.match(runtime,/Service Worker/);
  assert.match(model,/key:'app:'/);assert.match(model,/key:'page:'/);
  assert.match(center,/row.kind==='page'\?'网页增强':'应用'/);
});


test('R27/R28/R30 and Sidebar Tool API current navigation agree with R4',async()=>{
  const [r27,r28,r30,api,development]=await Promise.all([
    read('docs/architecture/ui-layout-conventions-r27.zh-CN.md'),
    read('docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md'),
    read('docs/architecture/sidebar-design-system-r20.zh-CN.md'),
    read('docs/api/sidebar-tools.zh-CN.md'),
    read('docs/api/sidebar-tool-development.zh-CN.md')]);
  assert.match(r27,/Side Panel 五个正式选项卡/);
  assert.match(r28,/五个现行一级页签「我的 \/ 扩展 \/ 工作流 \/ 开发 \/ 云控」/);
  assert.match(r30,/五个正式页签「我的／扩展／工作流／开发／云控」/);
  assert.doesNotMatch(r28,/六个既有一级页签/);
  assert.match(api,/现行 Extension Center R4/);
  assert.doesNotMatch(api,/「工具」Tab 默认打开「我的工具」/);
  assert.match(development,/「扩展」统一列表中以「网页增强」标签管理/);
  assert.doesNotMatch(development,/「工具 → 已安装网页工具」/);
});

// R1.0: documentary ownership contract only. These assertions cannot prove AI
// behavior, actual installed Chrome results or the absence of future drift.
test('R1 SDK-first ownership routes six positive and counterexample scenarios without shadow Skills',async()=>{
  const index=await read('.agents/skills/README.md');
  const section=index.split('## R1.0 独立扩展所有权与六例防漂移路由')[1]?.split('## 典型需求')[0];
  assert.ok(section,'R1 ownership routing is missing');
  const rows=section.split('\n').filter(line=>/^\| [A-F] /.test(line));
  assert.equal(rows.length,6,'all six scenarios must appear exactly once');
  const expected=[
    ['A ChatGPT Mind Map','Page USER_SCRIPT','examples/programs/chatgpt-mindmap/','opendesk-script-authoring','SDK_GAP_NOT_PROVEN'],
    ['B Cookie Editor','Sidebar Tool','examples/sidebar-tools/cookie-editor/','opendesk-sidebar-tool-dev','打包'],
    ['C Prompt Shortcuts','Sidebar Tool v2','examples/sidebar-tools/prompt-shortcuts/','opendesk-sidebar-tool-dev','page.prompts'],
    ['D Bookmark Manager','Sidebar Tool','examples/sidebar-tools/bookmark-manager/','opendesk-sidebar-tool-dev','Installer'],
    ['E 通用 Page Program','Browser Framework','src/','opendesk-extension-runtime','允许'],
    ['F 只读公开文档','Sidebar Tool','examples/sidebar-tools/<id>/','opendesk-sidebar-tool-dev','OpenDeskTool.request']
  ];
  const promptProject=JSON.parse(await read('examples/sidebar-tools/prompt-shortcuts/tool.config.json'));
  assert.equal(promptProject.format,'opendesk.sidebar-tool.v2','keep real installed Prompt Shortcuts identity');
  assert.equal(promptProject.id,'prompt-shortcuts');
  assert.ok(promptProject.capabilities.includes('page.prompts'),'reuse existing trusted page adapter');
  assert.ok(promptProject.capabilities.includes('browser.contextMenu'),'preserve optional context menu');
  for(let i=0;i<expected.length;i++){
    const cells=rows[i].split('|').slice(1,-1).map(s=>s.trim());
    assert.equal(cells.length,5,'R1 route schema must remain five columns');
    const [caseName,kind,owner,skill,restriction]=expected[i];
    for(const [value,column] of [[caseName,0],[kind,1],[owner,2],[skill,3],[restriction,4]])
      assert.ok(cells[column].includes(value),caseName+' incorrect ownership column '+column);
    assert.ok(CANONICAL_SKILLS.includes(skill),'unknown principal Skill '+skill);
  }
  const [agents,workflow]=await Promise.all([read('AGENTS.md'),read('.agents/workflows/extension-creation.md')]);
  assert.match(agents,/Independent Extension Development · SDK First · Framework Boundary/);
  assert.match(agents,/不采用.*src\/.*路径禁令/);
  assert.match(workflow,/Extension Type & Ownership Gate/);
  for(const token of ['SDK_GAP_NOT_PROVEN','BLOCKED','NOT_TESTED','examples/programs/<id>/','src/<feature>/'])
    assert.ok(agents.includes(token)&&workflow.includes(token),'missing exception/safety case '+token);
});

test('R1 independent authors have public contract paths and platform change exceptions',async()=>{
  const [app,api,page,author,publisher,runtime,trusted,packer,ci,evalScript]=await Promise.all([
    read('docs/api/sidebar-tool-development.zh-CN.md'),read('docs/api/sidebar-tools.zh-CN.md'),
    read('docs/api/page-userscript.zh-CN.md'),read('.agents/skills/opendesk-script-authoring/SKILL.md'),
    read('.agents/skills/opendesk-program-publish/SKILL.md'),read('.agents/skills/opendesk-extension-runtime/SKILL.md'),
    read('.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md'),read('.agents/skills/opendesk-sidebar-tool-package/SKILL.md'),
    read('.github/workflows/agent-skills-governance.yml'),read('scripts/agent-skills-r22-eval.mjs')
  ]);
  assert.match(app,/普通第三方最短流程/);assert.match(api,/公开能力分级/);
  assert.match(page,/第三方独立 Page Program/);assert.match(page,/Installed/);
  assert.match(page,/E_XMIND_RUNTIME_UNAVAILABLE/);
  for(const doc of [app,api,page,author,publisher])assert.match(doc,/无须|不需要|免读|不是第三方开发的前置依赖|只有平台任务/);
  assert.match(runtime,/允许按职责修改/);assert.match(trusted,/第三方与第一方的边界/);
  assert.match(packer,/不改平台/);
  for(const path of ['AGENTS.md','docs/api/README.md','docs/api/page-userscript.zh-CN.md',
    'docs/product/program-development-dual-format-and-sidebar.zh-CN.md'])
    assert.ok(ci.includes("      - '"+path+"'"),'governance CI misses '+path);
  assert.ok(evalScript.includes("mode==='ownership'"),'ownership fixtures must be present in existing evaluator');
  assert.doesNotMatch(ci,/codex exec|--mode ownership/,'CI must not call paid model reasoning');
});
