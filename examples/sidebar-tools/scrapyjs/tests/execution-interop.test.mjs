import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {evaluateExecution,validateRunReceipt,verifyRecipeHash,
  validateRecipe,validateHeaderProfile,validateNetworkProfile,validateNodeCapabilities,
  validateExecutionPlan,ContractError,CONTRACT_VERSION} from '../contracts/execution-v1.mjs';
const file=new URL('../contracts/fixtures/execution-v1-vectors.json',import.meta.url);
const vectors=JSON.parse(await readFile(file,'utf8'));
assert.equal(vectors.contractVersion,CONTRACT_VERSION);
assert.equal(vectors.format,'scrapyjs.execution.v1.interop-fixtures');
assert.equal(vectors.fixturesOnly,true);
test('Android/Desktop cross-language golden Recipe uses exact canonical SHA-256',async()=>{
  assert.equal(await verifyRecipeHash(vectors.base.recipe,webcrypto.subtle),true);
  assert.equal(vectors.base.recipe.sha256,vectors.base.plan.recipeHash);
  validateRecipe(vectors.base.recipe);
  validateHeaderProfile(vectors.base.headers);
  validateNetworkProfile(vectors.base.network);
  validateNodeCapabilities(vectors.base.node);
  validateExecutionPlan(vectors.base.plan);
  validateRunReceipt(vectors.base.receipt,vectors.base.plan);
});
for(const row of vectors.cases){
  test('portable interop case: '+row.id,()=>{
    const bundle=structuredClone(vectors.base);
    for(const change of row.changes){
      const path=change.path.split('.');
      let pointer=bundle[change.scope];
      for(const key of path.slice(0,-1)){assert(Object.hasOwn(pointer,key));pointer=pointer[key];}
      pointer[path.at(-1)]=change.value;
    }
    const run=()=>row.operation==='validateRunReceipt'?
      validateRunReceipt(bundle.receipt,bundle.plan):evaluateExecution(bundle);
    if(row.expected.error){
      assert.throws(run,e=>e instanceof ContractError&&e.code===row.expected.error);
    }else if(row.expected.reason){
      const result=run();
      assert.equal(result.supported,false);
      assert(result.reasons.some(e=>e.code===row.expected.reason),
        row.id+': expected '+row.expected.reason+', got '+JSON.stringify(result.reasons));
    }else{
      const result=run();
      if(row.operation==='validateRunReceipt')assert.equal(result,bundle.receipt);
      else assert.equal(result.supported,true);
    }
  });
}
