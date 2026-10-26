import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text = path => readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const entry=text('prototypes/sidebar/extension-ui-showcase/index.html');
const atlas=text('prototypes/sidebar/extension-ui-showcase/r27-source-aligned-atlas.html');
const tokens=text('src/ui/design-tokens.css');
const doc=text('docs/framework/extension-ui-reference-patterns-r25.zh-CN.md');

test('single reference entry delegates to existing Atlas without a second palette',()=>{
  assert.match(entry,/url=\.\/r27-source-aligned-atlas\.html/);
  assert.match(entry,/src\/ui\/design-tokens\.css/);
  assert.doesNotMatch(entry,/:root\s*\{[^}]*#[\da-fA-F]{3,8}/);
});
test('Atlas loads canonical tokens, no new component root and correct default',()=>{
  assert.match(atlas,/href="\.\.\/\.\.\/\.\.\/src\/ui\/design-tokens\.css"/);
  assert.match(atlas,/id="tab-foundation" aria-selected="true"/);
  assert.match(atlas,/id="pane-guide"/);
  assert.match(atlas,/id="component-catalog"/);
  assert.doesNotMatch(atlas,/createRoot\s*\(/);
  assert.doesNotMatch(atlas,/:root\s*\{[^}]*#[\da-fA-F]{3,8}/);
  assert.match(tokens,/--space-1:4px/);
});
test('source classifications and historical business preview are not promoted',()=>{
  for(const state of ['SHARED_REACT','HOST_CSS_PRIMITIVE','REACT_ARIA_SAMPLE','BUSINESS_REACT','SANDBOX_TOOL','LAYOUT_PATTERN'])
    assert.ok(atlas.includes(state),state);
  for(let i=1;i<=16;i++)assert.ok(atlas.includes('P'+String(i).padStart(2,'0')),'P'+i);
  assert.match(atlas,/HISTORICAL_REAL_REACT/);
  assert.match(atlas,/CHAT_ADAPTER_NOT_SOURCE_HTML/);
  assert.match(atlas,/NOT_TESTED/);
});
test('reference provides environment-specific examples and three reuse tasks',()=>{
  for(const item of ['可信 React · 搜索列表','独立 HTML Tool · 设置页','独立 Vue Tool · 搜索页','设置页','搜索列表页','创建 \/ 编辑页'])
    assert.ok(atlas.includes(item),item);
  assert.match(doc,/页面模式/);
  assert.match(doc,/独立沙箱/);
  assert.match(doc,/200%/);
});
