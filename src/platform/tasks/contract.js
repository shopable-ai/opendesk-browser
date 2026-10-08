import {BUDGETS, canonical, digest, digestUtf8, invariant} from '../protocol.js';

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
export function validateTaskManifest(manifest) {
  object(manifest,['format','taskId','version','title','description','author','source','siteOrigins',
    'permissions','entryFormat','program','paramsSchema']);
  invariant(manifest.format===TASK_MANIFEST_FORMAT && ID.test(manifest.taskId) &&
    VERSION.test(manifest.version) && manifest.version.length<=24,'E_SCHEMA','Unsupported task version');
  for(const key of ['title','author','source']) label(manifest[key],key==='title'?100:160);
  label(manifest.description,800);
  invariant(Array.isArray(manifest.siteOrigins) && manifest.siteOrigins.length===1,'E_PERMISSION',
    'Task v1 verifies exactly one website origin');
  for (const origin of manifest.siteOrigins) {
    let url;
    try {url=new URL(origin);} catch {invariant(false,'E_PERMISSION','Task site must be a valid HTTP(S) origin');}
    invariant(['http:','https:'].includes(url.protocol) && url.href === origin+'/' &&
      url.origin===origin && !url.username && !url.password && !url.hash && !url.search &&
      !['*','null'].includes(origin),'E_PERMISSION','Only one precise HTTP(S) origin is allowed');
  }
  invariant(Array.isArray(manifest.permissions) && manifest.permissions.length===1 &&
    manifest.permissions[0]==='page.automation','E_PERMISSION','Task v1 only supports explicitly authorized page automation');
  invariant(manifest.entryFormat==='async-main','E_SCHEMA','Task entry must be async main()');
  object(manifest.program,['revision','sourceHash']);
  invariant(Number.isSafeInteger(manifest.program.revision) && manifest.program.revision>0 &&
    SHA256.test(manifest.program.sourceHash),'E_SCHEMA','Invalid immutable program reference');
  checkParamsSchema(manifest.paramsSchema);
  canonical(manifest);
  return manifest;
}
export async function verifyTaskPackage(value) {
  object(value,['format','manifest','manifestHash','sourceUtf8']);
  invariant(value.format===TASK_PACKAGE_FORMAT && typeof value.sourceUtf8==='string' &&
    new TextEncoder().encode(value.sourceUtf8).byteLength<=Math.min(65536,BUDGETS.maxRawFrameBytes-8192) &&
    JSON.stringify(value).length<=100000,'E_LIMIT','Invalid or oversized task package');
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
