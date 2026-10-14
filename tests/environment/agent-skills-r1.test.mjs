import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const skillsRoot=path.join(root,'.agents/skills');
const file=relative=>path.join(root,relative);
const read=relative=>readFile(file(relative),'utf8');

test('Skills directory routes every canonical Skill exactly once with valid frontmatter',async()=>{
  const [index,universe,entries]=await Promise.all([
    read('.agents/skills/README.md'),read('.agents/skills/UNIVERSE.zh-CN.md'),
    readdir(skillsRoot,{withFileTypes:true})
  ]);
  const dirs=entries.filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
  assert.ok(dirs.length>=6,'six canonical skills after this addition');
  const descriptions=new Set();
  for(const name of dirs){
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
    ...dirs.map(name=>'.agents/skills/'+name+'/SKILL.md')];
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
