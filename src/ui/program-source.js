import {digestUtf8, invariant} from '../platform/protocol.js';

export const PROGRAM_DRAFT_FORMAT = 'opendesk.program-draft.v1';
export const PROGRAM_DRAFT_LIMIT = 512000;
const bytes = value => new TextEncoder().encode(value).length;
const pathIsLocal = value => typeof value === 'string' && value.length <= 240 &&
  !value.startsWith('/') && !value.includes('\\') &&
  value.split('/').every(part => part && part !== '.' && part !== '..') && /\.m?js$/.test(value);
const compiled = value => /^(?:\s*\/\/[^\n]*\n)*\s*var __opendeskProjectModule[;=]/.test(value);
const fields = (value, keys) => invariant(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key)),
'E_PROGRAM_DRAFT','程序草稿包字段不完整或包含未知字段');

// This envelope is a local authoring snapshot, never a Task/permission receipt.
// The frozen executable bytes, rather than the source viewer, enter RunHost.
export async function validateProgramDraft(input) {
  const value = structuredClone(input);
  fields(value,['format','project','runtimeKind','build','sourceUtf8','authoring']);
  fields(value.project,['id','version','entry']);fields(value.build,['mode','sourceHash','byteLength']);
  fields(value.authoring,['files']);
  invariant(value?.format === PROGRAM_DRAFT_FORMAT, 'E_PROGRAM_DRAFT', '需要本地程序草稿包');
  invariant(bytes(JSON.stringify(value)) <= PROGRAM_DRAFT_LIMIT, 'E_LIMIT', '程序草稿包超过 512000 字节');
  invariant(['controller','page-userscript'].includes(value.runtimeKind), 'E_PROGRAM_KIND', '未知程序运行环境');
  invariant(typeof value.project.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.project.id) &&
    typeof value.project.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(value.project.version) && pathIsLocal(value.project.entry),
  'E_PROGRAM_DRAFT', '项目身份或入口无效');
  const executableLimit = value.runtimeKind === 'controller' ? 65536 : 100000;
  invariant(typeof value.sourceUtf8 === 'string' && value.sourceUtf8.trim() && bytes(value.sourceUtf8) <= executableLimit,
    'E_LIMIT', `执行产物必须非空且不超过 ${executableLimit} 字节`);
  invariant(['production','development'].includes(value.build?.mode) &&
    value.build.byteLength === bytes(value.sourceUtf8) &&
    value.build.sourceHash === await digestUtf8(value.sourceUtf8),
  'E_PROGRAM_HASH', '构建产物大小或 SHA-256 不一致');
  const files = value.authoring?.files;
  invariant(Array.isArray(files) && files.length > 0 && files.length <= 32 &&
    files.every(file => file && typeof file === 'object') && new Set(files.map(file => file.path)).size === files.length &&
    files.some(file => file.path === value.project.entry), 'E_PROGRAM_SOURCE', '源码快照缺少入口或含重复文件');
  let total = 0;
  for (const file of files) {
    fields(file,['path','sourceUtf8','sha256']);
    invariant(pathIsLocal(file.path) && typeof file.sourceUtf8 === 'string', 'E_PROGRAM_SOURCE', '源码路径或内容无效');
    total += bytes(file.sourceUtf8);
    invariant(total <= 256000, 'E_LIMIT', '源码快照超过 256000 字节');
    invariant(file.sha256 === await digestUtf8(file.sourceUtf8), 'E_PROGRAM_HASH', '源码快照 SHA-256 不一致：' + file.path);
    Object.freeze(file);
  }
  Object.freeze(files); Object.freeze(value.authoring); Object.freeze(value.project); Object.freeze(value.build);
  return Object.freeze(value);
}

export function createProgramSourceView({document:doc,listen,onChange}) {
  const get = id => doc.getElementById(id), editor = get('script-source');
  let artifact = null;
  const source = () => artifact?.sourceUtf8 ?? editor.value;
  function show(value) {
    artifact = value;
    const project = value?.project;
    get('program-source-info').hidden = !value;
    editor.readOnly = Boolean(value);
    editor.hidden = Boolean(value && !project);
    get('program-source-files').hidden = !project;
    get('program-new-script').hidden = !value;
    get('program-generated').hidden = !value;
    get('program-generated').open = false;
    get('program-generated-source').textContent = value?.sourceUtf8 || '';
    if (project) {
      get('program-source-files').replaceChildren(new Option('program.js · 实际执行代码',''),
        ...value.authoring.files.map(file => new Option(`${file.path} · 源码快照`,file.path)));
      get('program-source-files').value = '';
      editor.value = value.sourceUtf8;
      const runtime = value.runtimeKind === 'controller' ? 'Controller · 运行草稿' : 'Page · DOM 试运行';
      get('program-source-info').textContent = `${project.id} v${project.version} · ${runtime} · ${project.entry}\n` +
        `${value.build.mode} · 本地构建，浏览器未验证 · ${value.build.byteLength} 字节\nSHA-256：${value.build.sourceHash}\n` +
        '运行使用固定 program.js，请先检查实际执行代码。源码快照只读、仅供参考；SHA-256 校验字节，不证明快照生成了执行代码。修改后请在本地重新构建、导入。';
    } else if (value) {
      editor.value = '';
      get('program-source-info').textContent = '已编译程序 · 无项目源码快照。请回本地项目修改并重新构建；保存与运行使用导入的完整产物。';
      digestUtf8(value.sourceUtf8).then(hash => {
        if (artifact === value) get('program-source-info').textContent += `\n${bytes(value.sourceUtf8)} 字节 · SHA-256：${hash}`;
      }).catch(() => {});
    }
  }
  function replaceSource(sourceUtf8) {
    if (artifact?.project && artifact.sourceUtf8 === sourceUtf8) return;
    show(compiled(sourceUtf8) ? {sourceUtf8} : null);
    if (!artifact) editor.value = sourceUtf8;
  }
  listen(get('program-source-files'),'change',() => {
    if (artifact?.project && get('program-source-files').value === '') {editor.value = artifact.sourceUtf8;return;}
    const file = artifact?.authoring?.files.find(row => row.path === get('program-source-files').value);
    if (file) editor.value = file.sourceUtf8;
  });
  listen(get('program-new-script'),'click',() => {show(null);editor.value = 'async function main() {\n  return await page.title();\n}';onChange();});
  return {source,replaceSource,kind:() => artifact?.runtimeKind,snapshot:() => artifact?.project ? artifact : null,
    async importProject(input,shouldApply=() => true) {
      const value = await validateProgramDraft(input);
      if(!shouldApply())return null;
      show(value);return value;
    }};
}
