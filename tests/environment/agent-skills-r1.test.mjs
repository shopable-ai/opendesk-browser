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
  const docs=[
    '.agents/skills/README.md',
    '.agents/skills/UNIVERSE.zh-CN.md',
    '.agents/skills/opendesk-extension-ui/SKILL.md',
    '.agents/skills/opendesk-extension-runtime/SKILL.md'
  ];
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
