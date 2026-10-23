import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

test('R2.1.1 mounting Workflow preserves Shell Provider settings and does not retire another lease',async t=>{
  const runtime=createSharedAIProviderRuntime({client:{requestWorkflowAI:async()=>({})},hostInstanceId:'standalone'});
  t.after(()=>runtime.dispose());
  runtime.configure({source:'custom_https',endpoint:'https://model.example/v1/responses',
    model:'configured-model',apiKey:'session-only-key'});
  const before=runtime.configuration();
  const other=runtime.acquire({consumerId:'bookmark',instanceId:'existing-bookmark'});
  const f=await workflowFixture({providerRuntime:runtime});
  t.after(()=>f.view.dispose());
  const control=id=>f.state().controls[id];
  assert.deepEqual(runtime.configuration(),before,'mount must not replace Shell configuration with default controls');
  assert.equal(control('workflow-ai-provider').value,before.source);
  assert.equal(control('workflow-ai-endpoint').value,before.settings.endpoint,'configured endpoint bytes must remain exact');
  assert.equal(other.identity().providerGeneration,before.generation);
  f.input('workflow-ai-model','edited-model');
  assert.equal(runtime.configuration().settings.model,'edited-model');
  assert.equal(runtime.configuration().generation,before.generation+1);
  runtime.updateSettings({source:'cloud_responses',model:'global-model',endpoint:'https://another.example/v1/responses'});
  await tick();
  assert.equal(control('workflow-ai-model').value,'global-model');
  assert.equal(control('workflow-ai-provider').value,'cloud_responses');
  f.view.dispose();
  runtime.updateSettings({model:'after-workflow-close'});
  assert.equal(runtime.configuration().settings.model,'after-workflow-close','Workflow disposal does not dispose Shell runtime');
});
