import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtensionCenterDOM} from '../../../../tests/helpers/extension-center-react-dom.mjs';
import {Results} from './react-fixture.mjs';

test('custom CSV opens and downloads in saved order, retaining every result field',async t=>{
  const calls=[];
  const state={result:{data:[{price:'£51.77',title:'A Light in the Attic',extra:'new'}]},
    config:{output:{fieldNames:{title:'图书名称',price:'售价'},fieldOrder:['title','missing','price']}},
    selectedId:'saved',profileEpoch:1};
  const before=JSON.stringify(state);
  const ui=createExtensionCenterDOM(t,{component:Results,props:{state,busy:false,active:true,columnsLocked:false,
    app:{download:async(...args)=>calls.push(args)}}});
  ui.doc.getElementById('custom-csv').dispatch('click');
  assert.deepEqual([...ui.doc.querySelectorAll('.csv-header-preview th')].map(node=>node.textContent),['图书名称','售价','extra']);
  ui.doc.getElementById('download-custom-csv').dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[['csv',{fieldNames:{title:'图书名称',price:'售价'},fieldOrder:['title','price','extra']}]]);
  assert.equal(JSON.stringify(state),before);
});
