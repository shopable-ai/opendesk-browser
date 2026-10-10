import {checkParamsSchema, validateTaskParams} from '../../platform/tasks/contract.js';

export const WORKFLOW_FORMAT = 'opendesk.workflow.v1';
export const WORKFLOW_OPERATIONS = Object.freeze(['navigate','observe','fill','click','wait','extract','assert','confirm']);
export const WORKFLOW_LOCATORS = Object.freeze(['css','role','label','text','testId']);
const STEP_FIELDS = new Set(['stepId','op','locatorKind','selector','roleName','param','text','url','timeout']);
const STEP_ACTIONS = new Set(['fill','click','wait','extract','assert']);

function check(ok, code, message) {
  if (!ok) throw Object.assign(new Error(message), {code});
}
function string(value, limit, name, required = false) {
  check(typeof value === 'string' && value.length <= limit && (!required || value.trim().length > 0),
    'E_WORKFLOW_SCHEMA', 'Invalid ' + name);
}
function exactOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { check(false, 'E_WORKFLOW_ORIGIN', '网站必须是精确 HTTP(S) origin'); }
  check(['http:','https:'].includes(url.protocol) && url.origin === origin && url.href === origin + '/' &&
    !url.username && !url.password, 'E_WORKFLOW_ORIGIN', '网站只允许精确 HTTP(S) origin');
  return origin;
}
export function validateWorkflow(value) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => ['format','workflowId','title','description','siteOrigin','paramsSchema','steps'].includes(key)),
    'E_WORKFLOW_SCHEMA', 'Unknown workflow fields');
  check(value.format === WORKFLOW_FORMAT, 'E_WORKFLOW_SCHEMA', 'Unsupported workflow format');
  check(/^wf-[a-z0-9-]{8,54}$/.test(value.workflowId), 'E_WORKFLOW_SCHEMA', 'Invalid workflow ID');
  string(value.title, 100, 'title', true);
  string(value.description, 800, 'description');
  exactOrigin(value.siteOrigin);
  checkParamsSchema(value.paramsSchema);
  check(Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 32,
    'E_WORKFLOW_SCHEMA', '工作流必须包含 1–32 个步骤');
  const ids = new Set();
  for (const step of value.steps) {
    check(step && typeof step === 'object' && !Array.isArray(step) &&
      Object.keys(step).every(key => STEP_FIELDS.has(key)), 'E_WORKFLOW_SCHEMA', 'Unknown step fields');
    check(typeof step.stepId === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(step.stepId) &&
      !ids.has(step.stepId), 'E_WORKFLOW_SCHEMA', 'Invalid or duplicate stepId');
    ids.add(step.stepId);
    check(WORKFLOW_OPERATIONS.includes(step.op), 'E_WORKFLOW_SCHEMA', 'Unsupported step operation');
    for (const field of ['selector','roleName','param','text','url']) {
      if (step[field] !== undefined) string(step[field], field === 'url' ? 2000 : 512, field);
    }
    if (step.timeout !== undefined)
      check(Number.isSafeInteger(step.timeout) && step.timeout >= 100 && step.timeout <= 30000,
        'E_WORKFLOW_SCHEMA', 'Invalid step timeout');
    if (STEP_ACTIONS.has(step.op)) {
      check(WORKFLOW_LOCATORS.includes(step.locatorKind), 'E_WORKFLOW_SCHEMA', 'Unsupported locator');
      string(step.selector, 512, 'selector', true);
      if (step.locatorKind === 'role' && step.roleName !== undefined) string(step.roleName, 200, 'roleName');
    }
    if (step.op === 'fill') {
      check(Boolean(step.param) !== (step.text !== undefined), 'E_WORKFLOW_SCHEMA',
        'Fill must use exactly one parameter or literal value');
      if (step.param) check(Object.hasOwn(value.paramsSchema.properties, step.param),
        'E_WORKFLOW_SCHEMA', 'Unknown parameter: ' + step.param);
    }
    if (step.op === 'assert') string(step.text, 512, 'expected text', true);
    if (step.op === 'navigate') {
      let url;
      try { url = new URL(step.url); } catch { check(false, 'E_WORKFLOW_ORIGIN', 'Invalid navigation URL'); }
      check(['http:','https:'].includes(url.protocol) && url.origin === value.siteOrigin &&
        !url.username && !url.password, 'E_WORKFLOW_ORIGIN',
        '跨 origin 跳转需独立授权协调器；Task v1 不允许');
    }
    if (step.op === 'confirm') string(step.text, 512, 'confirmation', true);
  }
  check(new TextEncoder().encode(JSON.stringify(value)).byteLength <= 45000,
    'E_WORKFLOW_LIMIT', 'Workflow definition exceeds 45KB');
  return structuredClone(value);
}
export function emptyWorkflow(origin, uuid) {
  return {format:WORKFLOW_FORMAT,workflowId:'wf-' + uuid,title:'新工作流',description:'',
    siteOrigin:origin,paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false},
    steps:[]};
}
export function normalizeAiProposal(response, original) {
  check(response && typeof response === 'object' && !Array.isArray(response) &&
    Object.keys(response).every(key => ['title','description','paramsSchema','steps'].includes(key)),
    'E_WORKFLOW_AI', '模型返回了不受支持的字段');
  const proposed = {format:WORKFLOW_FORMAT,workflowId:original.workflowId,
    title:response.title,description:response.description || '',
    siteOrigin:original.siteOrigin,paramsSchema:response.paramsSchema,steps:response.steps};
  // Never accept model-supplied executable code, permissions, host identity, or origin.
  return validateWorkflow(proposed);
}
export function validateWorkflowParams(workflow, params) {
  return validateTaskParams(workflow.paramsSchema, params);
}
