import {validExactSiteOrigins} from '../local-project-site-scope.js';
import {CONTROLLER_SOURCE_LIMIT,TASK_PACKAGE_LIMIT} from '../source-budgets.js';
import {canonical, digest, digestUtf8, invariant} from '../protocol.js';

export const TASK_PACKAGE_FORMAT = 'opendesk.task-package.v1';
export const TASK_MANIFEST_FORMAT = 'opendesk.task.v1';
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const KINDS = new Set(['string','number','integer','boolean']);

function object(value, allowed, required = allowed) {
  invariant(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value,key)),
    'E_SCHEMA', 'Unexpected task package fields');
}
function label(value, max = 128) {
  invariant(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max,
    'E_SCHEMA','Invalid task package text');
}
function validValue(rule, value) {
  if (rule.type === 'string') {
    invariant(typeof value === 'string' && value.length <= (rule.maxLength ?? 1024) &&
      value.length >= (rule.minLength ?? 0),'E_PARAMS','Invalid string parameter');
  } else if (rule.type === 'boolean') invariant(typeof value === 'boolean','E_PARAMS','Invalid boolean parameter');
  else invariant(typeof value === 'number' && Number.isFinite(value) &&
    (rule.type !== 'integer' || Number.isSafeInteger(value)) &&
    (rule.minimum === undefined || value >= rule.minimum) &&
    (rule.maximum === undefined || value <= rule.maximum),'E_PARAMS','Invalid numeric parameter');
  if (rule.enum) invariant(rule.enum.includes(value),'E_PARAMS','Parameter not in allowed choices');
}
export function checkParamsSchema(schema) {
  object(schema,['type','properties','required','additionalProperties']);
  invariant(schema.type === 'object' && schema.additionalProperties === false,'E_SCHEMA','Parameters must be a closed object');
  invariant(schema.properties && typeof schema.properties==='object' && !Array.isArray(schema.properties),
    'E_SCHEMA','Parameter properties must be an object');
  object(schema.properties,Object.keys(schema.properties));
  const keys = Object.keys(schema.properties);
  invariant(keys.length <= 16 && keys.every(key=>/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)),
    'E_SCHEMA','Invalid parameter names');
  invariant(Array.isArray(schema.required) && schema.required.length <= keys.length &&
    new Set(schema.required).size === schema.required.length &&
    schema.required.every(key=>keys.includes(key)),'E_SCHEMA','Invalid required parameters');
  for (const rule of Object.values(schema.properties)) {
    object(rule,['type','title','description','default','enum','minLength','maxLength','minimum','maximum'],
      ['type','title']);
    invariant(KINDS.has(rule.type),'E_SCHEMA','Unsupported parameter type');
    label(rule.title,60);
    if (rule.description !== undefined) label(rule.description,240);
    invariant(['minLength','maxLength'].every(key=>rule[key]===undefined ||
      rule.type==='string' && Number.isSafeInteger(rule[key]) && rule[key]>=0 && rule[key]<=4096),'E_SCHEMA');
    invariant(['minimum','maximum'].every(key=>rule[key]===undefined ||
      ['number','integer'].includes(rule.type) && typeof rule[key]==='number' && Number.isFinite(rule[key])),'E_SCHEMA');
    invariant(rule.minimum===undefined || rule.maximum===undefined || rule.minimum<=rule.maximum,'E_SCHEMA');
    invariant(rule.minLength===undefined || rule.maxLength===undefined || rule.minLength<=rule.maxLength,'E_SCHEMA');
    if (rule.enum !== undefined) invariant(Array.isArray(rule.enum) && rule.enum.length > 0 && rule.enum.length <= 32 &&
      new Set(rule.enum.map(value=>canonical(value))).size===rule.enum.length,'E_SCHEMA','Invalid parameter choices');
    for (const value of rule.enum || []) validValue({...rule,enum:undefined},value);
    if (Object.hasOwn(rule,'default')) validValue(rule,rule.default);
  }
  canonical(schema);
  return schema;
}
export function validateTaskParams(schema, params) {
  checkParamsSchema(schema);
  object(params,Object.keys(schema.properties),[]);
  const normalized = {};
  for (const [key,rule] of Object.entries(schema.properties)) {
    const supplied = Object.hasOwn(params,key);
    if (!supplied && !Object.hasOwn(rule,'default')) {
      invariant(!schema.required.includes(key),'E_PARAMS',`Missing required parameter: ${key}`);
      continue;
    }
    const value=supplied?params[key]:rule.default;
    validValue(rule,value);
    normalized[key]=value;
  }
  canonical(normalized);
  return normalized;
}
export function taskScriptId(taskId, version) {
  invariant(ID.test(taskId) && VERSION.test(version) && version.length <= 24,'E_SCHEMA','Invalid task identity');
  return `task:${taskId}:${version}`;
}
export function taskKey(namespace, taskId, version) {
  taskScriptId(taskId,version);
  return `task-candidate:${canonical([namespace,taskId,version])}`;
}
export function installedKey(namespace,taskId) {
  invariant(ID.test(taskId),'E_SCHEMA','Invalid task ID');
  return `task-installed:${canonical([namespace,taskId])}`;
}
export function scriptStorageKey(namespace,id,revision) {
  return `script:${canonical(revision === undefined ? [namespace,id] : [namespace,id,revision])}`;
}
// Optional, hash-covered natural-language contract for NEW immutable Task
// versions. An author-provided description/title alone never proves intent or
// result. These templates only bind explicit Schema parameters; execution
// still requires normal installation identity, permissions and TaskWorkbench.
export function checkTaskIntent(intent, schema) {
  object(intent,['templates','resultTexts'],['templates']);
  invariant(Array.isArray(intent.templates) && intent.templates.length>=1 &&
    intent.templates.length<=6 && new Set(intent.templates).size===intent.templates.length,
    'E_SCHEMA','Task intent needs 1–6 distinct templates');
  const namesOf=text=>{
    const matches=[...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/gu)];
    invariant(!/[{}]/u.test(text.replace(/\{[A-Za-z][A-Za-z0-9_]{0,39}\}/gu,'')) &&
      matches.every(match=>Object.hasOwn(schema.properties,match[1])),
    'E_SCHEMA','Task intent uses an undeclared parameter or malformed template');
    return matches.map(match=>match[1]);
  };
  for(const template of intent.templates){
    label(template,320);
    invariant(!/[\r\n]/u.test(template),'E_SCHEMA','Task intent must be one line');
    const names=namesOf(template);
    invariant(schema.required.every(name=>names.includes(name)),
      'E_SCHEMA','Each intent template must bind every required parameter');
  }
  if(intent.resultTexts!==undefined){
    invariant(Array.isArray(intent.resultTexts) && intent.resultTexts.length>=1 &&
      intent.resultTexts.length<=4 && new Set(intent.resultTexts).size===intent.resultTexts.length,
      'E_SCHEMA','Task readback needs 1–4 distinct visible text claims');
    const all=new Set();
    for(const value of intent.resultTexts){
      label(value,160);
      invariant(!/[\r\n]/u.test(value),'E_SCHEMA','Task readback must be one line');
      for(const name of namesOf(value))all.add(name);
    }
    invariant(schema.required.length===0||schema.required.some(name=>all.has(name)),
      'E_SCHEMA','Task readback must include a user-bound parameter');
  }
  return intent;
}

export function validateTaskManifest(manifest) {
  const required=['format','taskId','version','title','description','author','source','siteOrigins',
    'permissions','entryFormat','program','paramsSchema'];
  object(manifest,[...required,'intent','deadlineMs'],required);
  invariant(manifest.format===TASK_MANIFEST_FORMAT && ID.test(manifest.taskId) &&
    VERSION.test(manifest.version) && manifest.version.length<=24,'E_SCHEMA','Unsupported task version');
  for(const key of ['title','author','source']) label(manifest[key],key==='title'?100:160);
  label(manifest.description,800);
  invariant(validExactSiteOrigins(manifest.siteOrigins),'E_PERMISSION',
    'Task requires 1–8 unique canonical exact HTTP(S) origins');
  invariant(Array.isArray(manifest.permissions) && manifest.permissions.length>=1 && manifest.permissions.length<=2 &&
    manifest.permissions[0]==='page.automation' &&
    (manifest.permissions.length===1 || manifest.permissions[1]==='storage.persistent'),
    'E_PERMISSION','Task v1 supports page.automation and optional storage.persistent only');
  invariant(manifest.deadlineMs===undefined || Number.isSafeInteger(manifest.deadlineMs) &&
    manifest.deadlineMs>=1000 && manifest.deadlineMs<=120000,'E_SCHEMA','Invalid Task deadlineMs');
  invariant(manifest.entryFormat==='async-main','E_SCHEMA','Task entry must be async main()');
  object(manifest.program,['revision','sourceHash']);
  invariant(Number.isSafeInteger(manifest.program.revision) && manifest.program.revision>0 &&
    SHA256.test(manifest.program.sourceHash),'E_SCHEMA','Invalid immutable program reference');
  checkParamsSchema(manifest.paramsSchema);
  if(manifest.intent!==undefined)checkTaskIntent(manifest.intent,manifest.paramsSchema);
  canonical(manifest);
  return manifest;
}
export async function verifyTaskPackage(value) {
  object(value,['format','manifest','manifestHash','sourceUtf8']);
  invariant(value.format===TASK_PACKAGE_FORMAT && typeof value.sourceUtf8==='string' &&
    new TextEncoder().encode(value.sourceUtf8).byteLength<=CONTROLLER_SOURCE_LIMIT &&
    new TextEncoder().encode(JSON.stringify(value)).byteLength<=TASK_PACKAGE_LIMIT,'E_LIMIT','Invalid or oversized task package');
  validateTaskManifest(value.manifest);
  invariant(SHA256.test(value.manifestHash) &&
    await digest(value.manifest)===value.manifestHash,'E_HASH','Task manifest checksum mismatch');
  invariant(await digestUtf8(value.sourceUtf8)===value.manifest.program.sourceHash,'E_HASH','Task script checksum mismatch');
  invariant(/\basync\s+function\s+main\s*\(/.test(value.sourceUtf8),'E_SCHEMA','Task v1 requires async function main()');
  return structuredClone(value);
}
export async function createTaskPackage(manifest, sourceUtf8) {
  validateTaskManifest(manifest);
  invariant(await digestUtf8(sourceUtf8)===manifest.program.sourceHash,'E_HASH','Script does not match revision');
  return verifyTaskPackage({format:TASK_PACKAGE_FORMAT,manifest,manifestHash:await digest(manifest),sourceUtf8});
}
