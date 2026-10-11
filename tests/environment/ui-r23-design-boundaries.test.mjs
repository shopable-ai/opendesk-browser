import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
test('R23 semantic tokens are sole source of shared values and carry no page reset',async()=>{
  const [tokens,side,workspace,settings]=await Promise.all([
    read('src/ui/design-tokens.css'),read('src/ui/design-system.css'),
    read('src/native-agent/workspace.tailwind.css'),read('src/native-agent/settings.css')
  ]);
  assert.match(tokens,/^\/\*[\s\S]*?\*\/\s*:root\{/);
  assert.doesNotMatch(tokens,/\b(?:html|body)\s*\{|\*\s*\{|overflow\s*:|@import\b|url\s*\(/);
  for(const [name,value] of Object.entries({'od-brand':'#365eda','od-ink':'#1b2c49','od-sub':'#53647e','od-positive':'#138263','od-negative':'#ae3d4b','radius-control':'8px','radius-surface':'12px','space-2':'8px'})){
    assert.ok(tokens.includes('--'+name+':'+value),'missing canonical token '+name);
    for(const [path,css] of [['Side Panel',side],['Workspace',workspace],['Settings',settings]]){
      assert.ok(!css.includes('--'+name+':'+value),path+' duplicates '+name);
    }
  }
  assert.match(side,/html,body\{height:100%;overflow:hidden/);
  assert.doesNotMatch(settings,/html,body\{height:100%;overflow:hidden/);
  assert.match(workspace,/@import "\.\.\/ui\/design-tokens.css";/);
});
test('R23 trusted page styles respect explicit load order and sandbox boundary',async()=>{
  const [tool,settings,workspace,copy,verifier,styleBuild]=await Promise.all([
    read('src/ui/tool.html'),read('src/native-agent/settings.html'),
    read('src/native-agent/workspace.html'),read('scripts/prepare-public.mjs'),
    read('scripts/verify-package.mjs'),read('scripts/build-workspace-style.mjs')
  ]);
  assert.match(tool,/href="design-tokens.css"><link rel="stylesheet" href="design-system.css"><link rel="stylesheet" href="tool-shell.css"/);
  assert.match(settings,/href="\.\.\/ui\/design-tokens.css"><link rel="stylesheet" href="settings.css"/);
  assert.doesNotMatch(settings,/<style\b/i);
  assert.match(settings,/id="bridge-status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(workspace,/href="workspace.css"/);
  assert.doesNotMatch(workspace,/design-tokens.css/);
  for(const file of ['src/ui/design-tokens.css','src/native-agent/settings.css'])
    assert.ok(copy.includes("'"+file+"'"),'unregistered asset '+file);
  for(const file of ['ui/design-tokens.css','native-agent/settings.css'])
    assert.ok(verifier.includes("'"+file+"'"),'unchecked package asset '+file);
  assert.match(styleBuild,/'src\/ui\/design-tokens.css'/);
  assert.doesNotMatch(tool+settings+workspace,/https?:\/\/[^\s]*\.css/);
});
