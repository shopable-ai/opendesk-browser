import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Component proof for the real observer's target selection, never Native proof.
const source=readFileSync(new URL('../framework/sidebar-tools-native-probes.mjs',import.meta.url),'utf8');
const definition=source.match(/function sidePanelTarget\(targets,contexts\)\{[\s\S]*?\n\}/)?.[0];
const select=(targets,contexts)=>{
  assert(definition,'Actual Side Panel target selector must exist');
  return runInNewContext('('+definition+')(targets,contexts)',{assert,targets,contexts});
};
const panel={targetId:'actual-panel',type:'other',url:'chrome-extension://example/ui/tool.html?hostInstanceId=panel'};
const catalog={targetId:'catalog',type:'page',url:'chrome-extension://example/ui/tool.html?hostInstanceId=catalog'};

test('native observer selects the actual Side Panel when the full catalog appears first',()=>{
  assert.equal(select([catalog,panel],[{documentUrl:panel.url}]),panel);
});

test('native observer rejects absent, ambiguous and duplicate Side Panel identities',()=>{
  for(const [targets,contexts] of [
    [[catalog,panel],[]],
    [[catalog,panel],[{documentUrl:panel.url},{documentUrl:catalog.url}]],
    [[catalog],[{documentUrl:panel.url}]],
    [[catalog,panel,{...panel,targetId:'duplicate'}],[{documentUrl:panel.url}]]
  ])assert.throws(()=>select(targets,contexts));
});
