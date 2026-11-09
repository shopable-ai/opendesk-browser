import test from 'node:test';
import assert from 'node:assert/strict';
import {claimExtensionCenterNodes} from '../../src/ui/react/extension-center-ownership.js';

const IDS=['extension-center','extension-center-list','extension-center-detail-body',
  'extension-center-cleanups','extension-center-empty','extension-center-count','extension-center-status'];
function fakeDoc({missing=null,toolbar=false}={}){
  const nodes=new Map(IDS.filter(id=>id!==missing).map(id=>[id,{dataset:{}}]));
  const bar=toolbar?{dataset:{}}:null;
  const calls=[];
  return {nodes,bar,calls,
    getElementById(id){calls.push(id);return nodes.get(id)??null;},
    querySelector(selector){assert.equal(selector,'#extension-center-list-view > .ec-toolbar');return bar;}};
}

test('app.html owns only the shared ToolHost; missing Side Panel nodes do not abort the React mount',()=>{
  const doc=fakeDoc({missing:'extension-center'});
  assert.deepEqual(claimExtensionCenterNodes(doc,'app'),[]);
  assert.deepEqual(doc.calls,[]);
});

test('Side Panel retains its existing Extension Center ownership contract',()=>{
  const doc=fakeDoc({toolbar:true});
  const claimed=claimExtensionCenterNodes(doc,'sidebar');
  assert.equal(claimed.length,8);
  assert.equal(doc.nodes.get('extension-center').dataset.opendeskReactOwner,'extension-center');
  assert.equal(doc.bar.dataset.opendeskReactOwner,'extension-toolbar');
});

test('incomplete Side Panel DOM still fails closed and rolls back partial claims',()=>{
  const doc=fakeDoc({missing:'extension-center-empty'});
  assert.throws(()=>claimExtensionCenterNodes(doc,'sidebar'),/E_REACT_EXTENSION_MOUNT/);
  for(const node of doc.nodes.values())assert.equal(node.dataset.opendeskReactOwner,undefined);
});

test('unknown surface cannot silently bypass ownership validation',()=>{
  assert.throws(()=>claimExtensionCenterNodes(fakeDoc(),'untrusted'),/E_REACT_SURFACE/);
});
