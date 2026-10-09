import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Component selector guard only; simulated DOM is never Native evidence.
const source=readFileSync(new URL('../framework/sidebar-tools-native-probes.mjs',import.meta.url),'utf8');
const expression=source.match(/async function toolNavigation\(id\)\{\s*return evaluate\(client,`([\s\S]*?)`,id\);\s*\}/)?.[1];
assert(expression,'Extract the exact read-only selector expression used by the native driver');
const title=JSON.parse(readFileSync(new URL('../../examples/sidebar-tools/quick-notes/tool.config.json',import.meta.url),'utf8')).title;
function inspect(names,modern){
  const buttons=names.map(text=>({textContent:text,querySelector:()=>modern?{textContent:text}:null}));
  const list={querySelectorAll:()=>buttons};
  const document={querySelector:selector=>selector===(modern?'#sidebar-tool-list':'#sidebar-tool-tabs')?list:null};
  return JSON.parse(JSON.stringify(runInNewContext(expression,{document})));
}

test('native tool navigation follows the committed single-app list without assuming first tool',()=>{
  const html=readFileSync(new URL('../../src/ui/tool.html',import.meta.url),'utf8');
  assert.match(html,/id="sidebar-tool-list"/);assert.match(html,/id="sidebar-tool-back"/);
  assert.deepEqual(inspect(['React',title,'Vue'],true),{close:'#sidebar-tool-back',open:'#sidebar-tool-list button:nth-child(2)'});
});

test('native tool navigation retains the recorded legacy tabs while identifying notes by title',()=>{
  assert.deepEqual(inspect(['任务列表','React',title],false),{close:'#sidebar-tool-tabs button:first-child',open:'#sidebar-tool-tabs button:nth-child(3)'});
});

test('native tool navigation rejects absent or ambiguous notes before sending input',()=>{
  for(const modern of [true,false])for(const names of [[],['React'],[title,title]])
    assert.throws(()=>inspect(names,modern),/Exactly one installed acceptance notes tool required/);
});
