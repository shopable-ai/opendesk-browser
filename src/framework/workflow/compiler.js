import {digestUtf8} from '../../platform/protocol.js';
import {validateWorkflow} from './contract.js';

// This is a deliberately restricted code emitter, not an LLM JavaScript evaluator.
// Every runtime operand is JSON-quoted; only known ChromePage/Locator methods are emitted.
function locator(step) {
  const arg = JSON.stringify(step.selector);
  if (step.locatorKind === 'css') return 'page.locator(' + arg + ')';
  if (step.locatorKind === 'role') {
    return 'page.getByRole(' + arg + (step.roleName ? ', {name:' +
      JSON.stringify(step.roleName) + ',exact:true}' : '') + ')';
  }
  const method = {label:'getByLabel',text:'getByText',testId:'getByTestId'}[step.locatorKind];
  return 'page.' + method + '(' + arg + ')';
}
export async function compileWorkflow(value) {
  const workflow = validateWorkflow(value);
  const lines = ['async function main() {','  const __results = Object.create(null);'];
  for (const step of workflow.steps) {
    const id = JSON.stringify(step.stepId);
    lines.push('  // workflow-step: ' + step.stepId);
    if (step.op === 'confirm') {
      throw Object.assign(new Error('确认步骤尚无运行时交互协议，不能生成可执行脚本'),
        {code:'E_WORKFLOW_CONFIRM_UNSUPPORTED'});
    }
    if (step.op === 'navigate') lines.push('  await page.goto(' + JSON.stringify(step.url) + ');');
    if (step.op === 'observe') lines.push('  __results[' + id + '] = await page.observe({maxNodes:48,maxChars:6000});');
    if (step.op === 'fill') {
      const input = step.param ? 'params[' + JSON.stringify(step.param) + ']' : JSON.stringify(step.text);
      lines.push('  await ' + locator(step) + '.fill(' + input + ');');
    }
    if (step.op === 'click') lines.push('  await ' + locator(step) + '.click();');
    if (step.op === 'wait') lines.push('  await ' + locator(step) +
      '.waitFor({state:"visible",timeout:' + (step.timeout ?? 10000) + '});');
    if (step.op === 'extract') lines.push('  __results[' + id + '] = await ' + locator(step) + '.innerText();');
    if (step.op === 'assert') lines.push('  if (!String(await ' + locator(step) +
      '.innerText()).includes(' + JSON.stringify(step.text) +
      ')) throw new Error(' + JSON.stringify('Workflow assertion failed: ' + step.stepId) + ');');
  }
  lines.push('  return __results;','}');
  const sourceUtf8 = lines.join('\n') + '\n';
  return Object.freeze({workflow,sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    stepIds:workflow.steps.map(step => step.stepId)});
}
