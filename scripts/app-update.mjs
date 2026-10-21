// Local assistant entry: package a Sidebar App update without re-installing Chrome.
// This only creates a verified JSON release. Installation remains in the trusted UI.
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  createSidebarToolPackage,encodeSidebarToolPackage,buildSidebarTool,
  promoteSidebarToolPackage,checkSidebarToolProjectPackage
} from './build-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../src/ui/sidebar-tools/package.js';
import {decideSidebarAppUpdate} from './app-update-plan.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const usage='Usage: npm run app:update -- <app-id> [--check]';
const fail=(code,message)=>{throw Error(code+': '+message);};
function runNode(args){
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)fail('E_APP_TEST_FAILED',args.join(' ')+' (exit '+result.status+')');
}
function mainBranch(){
  const git=spawnSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'});
  if(git.error||git.status!==0||git.stdout.trim()!=='main')
    fail('E_APP_BRANCH','app release requires the existing main branch');
}
function replaceOnlyVersion(text,oldVersion,newVersion){
  const hits=[...text.matchAll(/"version"\s*:\s*"([^"]*)"/g)];
  if(hits.length!==1||hits[0][1]!==oldVersion)
    fail('E_APP_CONFIG','cannot safely replace exactly one declared version');
  return text.slice(0,hits[0].index)+hits[0][0].replace('"'+oldVersion+'"','"'+newVersion+'"')+
    text.slice(hits[0].index+hits[0][0].length);
}
function installAdvice(id,output,version,sha){
  console.log('\n应用安装包已准备好（尚未安装到 Chrome）：');
  console.log('  应用: '+id+'  版本: '+version+'  SHA-256: '+sha);
  console.log('  文件: '+output);
  console.log('  打开 OpenDesk →「扩展」→「更多操作」→「导入本地工具包」；');
  console.log('  核对应用 ID、版本和权限变化后确认「更新」，不要先卸载。');
  console.log('  重新打开应用并验证修改，数据、权限、实际安装均需真实 Chrome 核验。');
  console.log('  若修改了 trusted/ 网页悬浮层、SW/Host，JSON 更新不包含这些代码；');
  console.log('  请由 Browser 维护者单独更新插件本体，再刷新目标网页。');
}
async function readPrevious(project,id){
  const target=join(project,id+'.opendesk-tool.json');
  let info;
  try{info=await lstat(target)}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!info.isFile()||info.isSymbolicLink())fail('E_APP_PACKAGE','formal package must be a regular file');
  const bytes=await readFile(target);
  const pkg=validateSidebarToolPackage(JSON.parse(bytes.toString('utf8')));
  if(!encodeSidebarToolPackage(pkg).equals(bytes))
    fail('E_APP_PACKAGE','formal release is not canonical; do not silently replace it');
  return {pkg,bytes};
}
async function updateApp(id,{check=false}={}){
  if(!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id))
    fail('E_APP_ID','provide a valid Sidebar App ID');
  if(!check)mainBranch();
  const project=join(root,'examples','sidebar-tools',id);
  const actual=await realpath(project);
  if(actual!==project)fail('E_APP_PATH','app path must not be a symlink');
  const configFile=join(project,'tool.config.json');
  const original=await readFile(configFile,'utf8'),config=JSON.parse(original);
  if(config.id!==id)fail('E_APP_IDENTITY','tool.config.json ID differs from project ID');
  const previous=await readPrevious(project,id);
  const proposed=await createSidebarToolPackage(project);
  const before=encodeSidebarToolPackage(proposed);
  const decision=decideSidebarAppUpdate({previous:previous?.pkg,proposed,bytesEqual:previous?.bytes.equals(before)??false});
  if(check){
    console.log(JSON.stringify({status:decision.kind,id,version:decision.version,
      installed:false,chrome:'NOT_TESTED'},null,2));
    return;
  }
  if(decision.kind==='ALREADY_CURRENT'){
    const matched=await checkSidebarToolProjectPackage(project);
    console.log(JSON.stringify({...matched,status:'APP_PACKAGE_CURRENT_NOT_INSTALLED'},null,2));
    console.log('仅应用 JSON 无变化；如修改了 trusted/，请更新 Browser 本体。');
    return;
  }
  let bumpedText=null,enteredPromotion=false;
  try{
    if(decision.kind==='BUMP_PATCH'){
      bumpedText=replaceOnlyVersion(original,config.version,decision.version);
      if(await readFile(configFile,'utf8')!==original)
        fail('E_APP_SOURCE_CHANGED','tool config changed before version bump');
      await writeFile(configFile,bumpedText,'utf8');
      console.log('应用内容有变化，自动将版本升至 '+decision.version+'（仅 PATCH，不改变权限）。');
    }
    const candidate=join(root,'artifacts','sidebar-tools',id,'candidate.opendesk-tool.json');
    await buildSidebarTool(project,{out:candidate});
    const tests=['tests/environment/sidebar-tools.test.mjs'];
    if(id==='reading-toc')tests.push('tests/environment/reading-toc-r41.test.mjs',
      'tests/environment/reading-toc-placement-r42.test.mjs');
    console.log('运行工具定向测试: '+tests.join(' '));
    runNode(['--test',...tests]);
    // Reject a source change during testing even when the old candidate was valid.
    const reencoded=encodeSidebarToolPackage(await createSidebarToolPackage(project));
    if(!reencoded.equals(await readFile(candidate)))
      fail('E_APP_SOURCE_CHANGED','app changed while running tests; no promotion');
    enteredPromotion=true;
    const promoted=await promoteSidebarToolPackage(project,{from:candidate});
    const checked=await checkSidebarToolProjectPackage(project);
    if(promoted.version!==checked.version||promoted.sha256!==checked.sha256)
      fail('E_APP_PACKAGE','promotion verification disagreed');
    installAdvice(id,checked.output,checked.version,checked.sha256);
  }catch(error){
    // Preserve a concurrent edit. Roll back only the exact version string we wrote.
    if(bumpedText&&!enteredPromotion&&await readFile(configFile,'utf8').catch(()=>null)===bumpedText){
      await writeFile(configFile,original,'utf8');
      console.error('原版本号已恢复；失败没有替换正式安装包。');
    }
    if(enteredPromotion)
      console.error('已进入正式包晋升阶段；保留版本与文件现场，请核对 --check-project 后再重试，不能盲目回滚。');
    throw error;
  }
}
const args=process.argv.slice(2),id=args[0],check=args.length===2&&args[1]==='--check';
if(args.length<1||args.length>2||(args.length===2&&!check)||!id){
  console.error(usage);process.exitCode=2;
}else updateApp(id,{check}).catch(error=>{
  console.error(String(error.message||error));process.exitCode=1;
});
