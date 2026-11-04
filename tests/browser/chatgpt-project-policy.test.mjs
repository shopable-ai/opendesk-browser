import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProjectTask,assertOrdinaryProjectEdit} from '../../src/native-agent/chatgpt-project-policy.js';

const alpha=Object.freeze({workspaceId:'workspace-11111111-1111-1111-1111-111111111111',name:'Alpha',access:'read-write',sourceId:'source-'+'a'.repeat(24)});
const beta=Object.freeze({...alpha,workspaceId:'workspace-22222222-2222-2222-2222-222222222222',name:'Beta',sourceId:'source-'+'b'.repeat(24)});
const mapping=Object.freeze({workspaceId:alpha.workspaceId,sourceId:alpha.sourceId});
const resolve=(task,extra={})=>resolveProjectTask({task,workspaces:[alpha,beta],...extra});
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code&&typeof error.message==='string'&&error.message.length>0&&!error.message.includes('\n'));

test('selects exact named metadata, preserves task and detects bilingual write intent',()=>{
  for(const verb of ['update','modify','change','replace','编辑','修改','替换','改为','更新','写入']){
    const task=`${verb} Alpha 项目的 \`src/main.js\``;
    assert.deepEqual(resolve(task),{workspace:alpha,path:'src/main.js',write:true,task});
  }
  assert.equal(resolve('读取 Alpha 项目的 README.md').write,false);
  assert.equal(resolve('Read Alpha README.md and explain the update handler').write,false);
});

test('explicit read-only instructions never request edit authority',()=>{
  for(const task of [
    '读取 Alpha 项目的 demo.txt，说明真实内容。只读取，不修改任何文件。',
    '读取 Alpha demo.txt，不要修改文件。',
    '查看 Alpha demo.txt，无需更新或写入。',
    'Read Alpha demo.txt. Do not modify any file.',
    "Read Alpha demo.txt, don't change it.",
    'Read-only: inspect Alpha demo.txt and explain the changes.'
  ]){
    assert.equal(resolve(task).write,false,task);
    assert.equal(resolve(task,{workspaces:[{...alpha,access:'read-only'}]}).write,false,task);
  }
});

test('project and file names cannot supply write intent to a read task',()=>{
  for(const path of ['docs/update.md','src/change.js'])
    assert.equal(resolve(`Read Alpha ${path}`).write,false,path);
  assert.equal(resolve('Read Update demo.txt',{workspaces:[{...alpha,name:'Update'}]}).write,false);
  assert.equal(resolve('Read Alpha demo.txt and modify its second line').write,true);
});

test('accepts quoted paths, spaces, Chinese names and repeated references to one file',()=>{
  for(const path of ['"docs/user guide.md"',"'src/main.js'",'`文档/说明.md`','src/main.js'])
    assert.ok(resolve(`修改 Alpha 项目的 ${path}`).write);
  assert.equal(resolve('Read Alpha README.md, then explain README.md.').path,'README.md');
  assert.equal(resolve('读取「示例」项目的 README.md',{workspaces:[{...alpha,name:'示例'}]}).workspace.name,'示例');
  assert.equal(resolve('read "Search Project" README.md',{workspaces:[{...alpha,name:'Search Project'}]}).workspace.name,'Search Project');
});

test('never guesses first, substring, case-insensitive or duplicate-name projects',()=>{
  for(const task of ['read README.md','read Alphabet README.md','read alpha README.md','read Alpha and Beta README.md'])
    rejects(()=>resolve(task),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('read README.md',{workspaces:[alpha]}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('read Alpha README.md',{workspaces:[alpha,{...beta,name:'Alpha'}]}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('读取示例二项目的 README.md',{workspaces:[{...alpha,name:'示例'}]}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('读取示例二 README.md',{workspaces:[{...alpha,name:'示例'}]}),'E_PROJECT_CLARIFY');
});

test('mapping requires only two exact current identities and cannot override an explicit project',()=>{
  assert.equal(resolve('read README.md',{mapping}).workspace,alpha);
  assert.equal(resolve('read Beta README.md',{mapping}).workspace,beta);
  for(const invalid of [{workspaceId:alpha.workspaceId},{...mapping,sourceId:beta.sourceId},{...mapping,path:'README.md'},null])
    rejects(()=>resolve('read README.md',{mapping:invalid}),'E_PROJECT_CLARIFY');
  for(const task of ['读取 Gamma 项目的 README.md','read project Gamma README.md','read "Gamma" project README.md','修改Gamma项目的 README.md','read Gamma project README.md'])
    rejects(()=>resolve(task,{mapping}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('read README.md',{mapping,workspaces:[alpha,{...alpha}]}),'E_PROJECT_CLARIFY');
});

test('file paths cannot select a project or override a mapping',()=>{
  rejects(()=>resolve('read src/Alpha/main.js'),'E_PROJECT_CLARIFY');
  assert.equal(resolve('read src/Beta/main.js',{mapping}).workspace,alpha);
  assert.equal(resolve('读取Alpha项目的 README.md',{mapping}).workspace,alpha);
});

test('trusted mapping supports an explicit empty Native sourceId without inferring another source',()=>{
  const persistent={...alpha,sourceId:''};
  const emptyMapping={workspaceId:alpha.workspaceId,sourceId:''};
  assert.equal(resolve('read README.md',{workspaces:[persistent,beta],mapping:emptyMapping}).workspace,persistent);
  rejects(()=>resolve('read README.md',{mapping:emptyMapping}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('read README.md',{workspaces:[{...persistent,sourceId:undefined}],mapping:emptyMapping}),'E_PROJECT_CLARIFY');
  rejects(()=>resolve('read README.md',{workspaces:[{...persistent,workspaceId:beta.workspaceId}],mapping:emptyMapping}),'E_PROJECT_CLARIFY');
  assert.equal(resolve('read Beta README.md',{workspaces:[persistent,beta],mapping:emptyMapping}).workspace,beta);
});

test('task limit is 4 KiB of UTF-8 bytes, including mapped tasks',()=>{
  const prefix='read Alpha README.md ';
  const boundary=prefix+'x'.repeat(4096-prefix.length);
  assert.equal(resolve(boundary).task,boundary);
  rejects(()=>resolve(boundary+'x'),'E_PROJECT_REVIEW');
  rejects(()=>resolve('read README.md '+'中'.repeat(1361),{mapping}),'E_PROJECT_REVIEW');
});

test('requires authorized workspace metadata and honors read-only access',()=>{
  for(const row of [{...alpha,access:'none'},{...alpha,workspaceId:'fake'},{...alpha,sourceId:'fake'}])
    rejects(()=>resolve('read Alpha README.md',{workspaces:[row]}),'E_PROJECT_CLARIFY');
  const readonly={...alpha,access:'read-only'};
  assert.equal(resolve('read Alpha README.md',{workspaces:[readonly]}).write,false);
  rejects(()=>resolve('modify Alpha README.md',{workspaces:[readonly]}),'E_PROJECT_REVIEW');
});

test('requires exactly one explicit supported relative file without searching',()=>{
  for(const task of ['read Alpha project','modify Alpha README.md and src/main.js'])
    rejects(()=>resolve(task),'E_PROJECT_CLARIFY');
  for(const path of ['../README.md','/tmp/README.md','C:\\temp\\README.md','src/../main.js','image.png','https://host/README.md'])
    rejects(()=>resolve(`read Alpha \`${path}\``),'E_PROJECT_REVIEW');
});

const forbidden=['.env','.env.local','credentials.json','src/secrets.js','auth/token.txt','keys/public.txt','private/data.md','config/auth-config.json','src/authToken.js','src/privateKey.js','package.json','package-lock.json','yarn.lock','pnpm-lock.yaml','tsconfig.json','vite.config.js'];
test('sensitive reads and broad configuration edits are both refused',()=>{
  for(const path of forbidden){
    rejects(()=>resolve(`read Alpha \`${path}\``),'E_PROJECT_REVIEW');
    rejects(()=>assertOrdinaryProjectEdit({path,before:'original',content:'changed'}),'E_PROJECT_REVIEW');
  }
});

test('refuses unsupported operations even with a valid project and path',()=>{
  for(const task of ['create','delete','rename','shell','run npm test','新增','删除','重命名','运行命令','修改全项目','批量更新','update all files'])
    rejects(()=>resolve(`${task} Alpha README.md`),'E_PROJECT_REVIEW');
});

test('ordinary edits accept local changes without a churn quota',()=>{
  assert.equal(assertOrdinaryProjectEdit({path:'src/clock.js',before:'old',content:'new'}),true);
  assert.equal(assertOrdinaryProjectEdit({path:'src/main.js',before:'hello',content:'world'}),true);
  assert.equal(assertOrdinaryProjectEdit({path:'README.md',before:'a'.repeat(300),content:'b'.repeat(300)}),true);
  assert.equal(assertOrdinaryProjectEdit({path:'README.md',before:'a'.repeat(300),content:'b'.repeat(120)}),true);
  assert.equal(assertOrdinaryProjectEdit({path:'README.md',before:'a'.repeat(256),content:'b'}),true);
});

test('edit guard rejects empty, destructive, binary, malformed and oversized text',()=>{
  for(const [before,content] of [['hello',''],['hello','  \n'],['a'.repeat(300),'b'.repeat(119)],['old','a\0b'],[null,'text'],['old',42],['old','\ud800'],['old','中'.repeat(10923)],['x'.repeat(32769),'new']])
    rejects(()=>assertOrdinaryProjectEdit({path:'README.md',before,content}),'E_PROJECT_REVIEW');
  assert.equal(assertOrdinaryProjectEdit({path:'README.md',before:'x',content:'x'.repeat(32768)}),true);
});
