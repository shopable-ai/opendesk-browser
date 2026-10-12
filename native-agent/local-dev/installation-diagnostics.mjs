// Read-only installation inspection. Authentication is the only socket message;
// never attach a workspace, open Chrome, register a Provider or run a project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {installationRoot} from '../installation-root.mjs';
import {manifestLocation} from '../locations.mjs';
import {HOST_NAME} from '../wire.mjs';
import {readCliIdentity,digest} from './cli-identity.mjs';

const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
function readJSON(file,{privateFile=false,maxBytes=65536}={}){
  const info=fs.lstatSync(file);
  if(info.size>maxBytes)throw Object.assign(new Error(),{code:'E_DEV_COMPONENT_INVALID'});
  if(!info.isFile()||info.isSymbolicLink()||
    privateFile&&((info.mode&0o077)!==0||process.getuid&&info.uid!==process.getuid()))
    throw Object.assign(new Error(),{code:'E_INSTALL_PERMISSIONS'});
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function privateDirectories(home,root){
  for(const dir of new Set([path.join(home,'.opendesk-browser'),path.dirname(root),root])){
    const info=fs.lstatSync(dir);
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||
      process.getuid&&info.uid!==process.getuid())throw Object.assign(new Error(),{code:'E_INSTALL_PERMISSIONS'});
  }
}
function real(file){try{return fs.realpathSync(file);}catch{return null;}}
function onPath(name,env){
  for(const dir of (env.PATH||'').split(path.delimiter)){
    if(!path.isAbsolute(dir))continue;
    const file=path.join(dir,name);try{fs.accessSync(file,fs.constants.X_OK);if(fs.statSync(file).isFile())return {path:file,resolvedPath:real(file)};}catch{}
  }
  return null;
}
function importEntry(root,name){
  // Inspect Node's default node/import export branch without importing code.
  // The CLI runtime has no nested node_modules; resolution starts at its package.
  let directory=root;
  for(;;){
    const owner=path.join(directory,'node_modules',name),manifest=path.join(owner,'package.json');
    if(fs.existsSync(manifest)){
      const pkg=readJSON(manifest);
      function select(value){
        if(typeof value==='string')return value;
        if(Array.isArray(value))return value.map(select).find(Boolean);
        if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))
          if(['node','node-addons','import','default'].includes(key)){const chosen=select(child);if(chosen)return chosen;}
        return null;
      }
      const exports=pkg.exports;
      const target=exports===undefined?pkg.main||'index.js':select(exports&&typeof exports==='object'&&!Array.isArray(exports)&&Object.keys(exports).some(key=>key.startsWith('.'))?exports['.']:exports);
      if(typeof target!=='string'||target.includes('\u0000'))return null;
      const candidate=path.resolve(owner,target);
      if(!candidate.startsWith(owner+path.sep))return null;
      try{return fs.statSync(candidate).isFile()?real(candidate):null;}catch{return null;}
    }
    const parent=path.dirname(directory);if(parent===directory)return null;directory=parent;
  }
}
// Mirrors the current read-only upstream findTrustedNode policy. This is a
// prediction, not telemetry from an already running Go process.
export function selectGoNode({env=process.env,cwd=process.cwd(),getuid=process.getuid,
  preferredDirs=['/opt/homebrew/bin','/usr/local/bin','/usr/bin']}={}){
  for(const dir of new Set([...preferredDirs,...(env.PATH||'').split(path.delimiter)])){
    if(!path.isAbsolute(dir)||dir.includes('node_modules')||dir===cwd||dir.startsWith(cwd+path.sep))continue;
    const file=path.join(dir,'node'),resolved=real(file);
    if(!resolved||resolved.includes(path.sep+'node_modules'+path.sep)||resolved.startsWith(cwd+path.sep))continue;
    try{
      const stat=fs.lstatSync(resolved);
      if(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o111)!==0&&
        (!getuid||stat.uid===getuid()||stat.uid===0))return {path:file,resolvedPath:resolved};
    }catch{}
  }
  return null;
}
export function probeNative(cfg,{connect=options=>net.createConnection(options),timeoutMs=1500}={}){
  return new Promise(resolve=>{
    let socket,buffer=Buffer.alloc(0),done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);socket?.destroy();resolve(value);};
    const timer=setTimeout(()=>finish({state:'socket-unavailable',code:'E_NATIVE_NOT_READY'}),timeoutMs);
    try{socket=connect({path:cfg.socketPath});}catch{finish({state:'socket-unavailable',code:'E_NATIVE_NOT_READY'});return;}
    socket.on('error',()=>finish({state:'socket-unavailable',code:'E_NATIVE_NOT_READY'}));
    socket.once('close',()=>finish({state:'socket-closed',code:'E_NATIVE_NOT_READY'}));
    socket.once('connect',()=>socket.write(JSON.stringify({v:1,kind:'auth',credential:cfg.clientCredential})+'\n'));
    socket.on('data',bytes=>{
      buffer=Buffer.concat([buffer,bytes]);
      if(buffer.length>60*1024){finish({state:'invalid-reply',code:'E_NATIVE_PROTOCOL'});return;}
      const end=buffer.indexOf(10);if(end<0)return;
      let reply;try{reply=JSON.parse(buffer.subarray(0,end).toString('utf8'));}catch{finish({state:'invalid-reply',code:'E_NATIVE_PROTOCOL'});return;}
      if(reply?.v!==1||reply.kind!=='authenticated'||typeof reply.browserReady!=='boolean'){
        finish({state:'authentication-failed',code:'E_NATIVE_AUTH'});return;
      }
      const capabilities={};
      for(const key of ['localDevMultiVersion','localFilesVersion','localDevAccessVersion'])
        capabilities[key]=Number.isSafeInteger(reply[key])?reply[key]:null;
      finish({state:reply.browserReady?'connected':'extension-disconnected',authenticated:true,
        browserReady:reply.browserReady,capabilities,
        compatible:reply.browserReady&&Object.values(capabilities).every(value=>value===1)});
    });
  });
}
export async function diagnoseInstallation({loadInstall,assertNode,home=os.homedir(),env=process.env,
  cwd=process.cwd(),cliRoot,expectedRoot,execPath=process.execPath,nodeVersion=process.versions.node,
  platform=process.platform,probe=probeNative,goNode=selectGoNode({env,cwd})}={}){
  const issues=[];
  const issue=(layer,code,reason,repair,severity='error')=>issues.push({layer,code,severity,reason,repair});
  const cli=readCliIdentity(cliRoot),node={execPath,resolvedPath:real(execPath),version:nodeVersion,
    pathNode:onPath('node',env),goSelection:goNode,goSelectionEvidence:'predicted-from-current-upstream-policy'};
  try{assertNode(nodeVersion);}catch{issue('node','E_NODE_VERSION','当前执行 Node 低于 22.12 或版本无法识别','安装受支持 Node；用绝对 Node 路径执行已安装的 CLI，再核对 --doctor。');}
  if(!goNode)issue('node','E_NODE_MISSING','当前 Go 选择策略找不到受信 Node','安装受支持 Node 到用户/系统可执行目录，核对 PATH；项目 node_modules 不能充当 Go Node。');
  else{
    const same=goNode.resolvedPath===node.resolvedPath;
    node.goSelection={...goNode,version:same?nodeVersion:null,versionEvidence:same?'current-process':'not-executed'};
    if(same){try{assertNode(nodeVersion);}catch{issue('node','E_GO_NODE_VERSION','Go 优先选择的当前 Node 不满足 22.12','更新报告中的 Go Node；用该 Node 绝对路径执行已登记 CLI --doctor。');}}
    else issue('node','W_NODE_PATH_DIFFERENT','直接 CLI 与 Go 预计 Node 不同；未执行候选程序，其版本尚未验证',
      '先确认此 Node 来源，再用其绝对路径执行已登记 CLI --doctor，核对 execPath/版本。','warning');
  }
  if(cli.status!=='verified')issue('cli',cli.status==='content-mismatch'?'E_DEV_PACKAGE_CHANGED':'E_DEV_BUILD_UNRECORDED',
    'CLI 内容身份：'+cli.status,'从当前 Browser 源码生成新 tarball；显式安装到选定 prefix 后 --register-go。');
  cli.runtimeDependencies=[];
  try{
    const pkg=readJSON(path.join(cli.packageRoot,'package.json'));
    const require=createRequire(path.join(cli.packageRoot,'package.json'));
    for(const name of Object.keys(pkg.dependencies||{})){
      if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name))throw new Error();
      let resolvedPath=null;try{resolvedPath=require.resolve(name);}catch{}
      const importPath=importEntry(cli.packageRoot,name);
      cli.runtimeDependencies.push({name,resolvedPath,importPath});
      if(!importPath)issue('cli','E_DEV_RUNTIME_DEPENDENCY','已声明运行依赖的 import 入口缺失：'+name,
        '保留备份后从同一候选 tarball 重新 npm install -g --prefix 选定目录 --ignore-scripts；不要只复制 bin/runtime 或自动新增依赖。');
    }
  }catch{issue('cli','E_DEV_PACKAGE_METADATA','不能核对运行依赖声明','重新安装已审阅的完整 npm tarball，再核对候选指纹。');}
  let expected=null;
  cli.dependencyLock={status:'not-recorded'};
  if(fs.existsSync(path.join(cli.packageRoot,'npm-shrinkwrap.json'))){
    try{
      const lock=readJSON(path.join(cli.packageRoot,'npm-shrinkwrap.json'),{maxBytes:1024*1024});
      if(lock.lockfileVersion!==3||!lock.packages||typeof lock.packages!=='object')throw new Error();
      const mismatches=[];let checked=0;
      for(const [relative,expected] of Object.entries(lock.packages)){
        if(relative==='')continue;
        if(!/^(?:node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:\/node_modules\/(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)*$/.test(relative))throw new Error();
        const file=path.join(cli.packageRoot,relative,'package.json');
        if(!fs.existsSync(file)&&expected.optional===true)continue;
        let installed=null;try{installed=readJSON(file).version;}catch{}
        checked++;if(installed!==expected.version)mismatches.push(relative);
      }
      cli.dependencyLock={status:mismatches.length?'version-mismatch':'verified',checked,mismatches};
      if(mismatches.length)issue('cli','E_DEV_DEPENDENCY_LOCK','已安装依赖版本或必需包与随包锁不一致',
        '用候选 tarball 重新 npm install -g --prefix ... --ignore-scripts；核对 --doctor，不手工替换依赖。');
    }catch{
      cli.dependencyLock={status:'invalid'};
      issue('cli','E_DEV_DEPENDENCY_LOCK','随包依赖锁无法安全核对','重新安装经过指纹验证的完整 tarball。');
    }
  }
  if(expectedRoot){
    expected=readCliIdentity(path.resolve(expectedRoot));
    if(expected.status!=='verified')issue('cli','E_EXPECTED_PACKAGE_INVALID','参考候选包不是可验证的完整打包目录','指定含 package.json、bin、runtime、build-info.json 的打包/解压目录。');
    else if(cli.contentFingerprint!==expected.contentFingerprint)issue('cli',cli.version===expected.version?'E_DEV_SAME_VERSION_CONTENT':'E_DEV_PACKAGE_OUTDATED',
      cli.version===expected.version?'版本相同但安装内容与候选不同':'实际安装与候选版本/内容不同',
      '备份后安装此候选 tarball 到报告中的 packageRoot 所属 prefix，重新 --register-go，再用 --expect-package 核对。');
  }
  const registryRoot=path.join(home,'.opendesk-browser','dev-tool-r17');
  const registration={path:path.join(registryRoot,'entry.json'),state:'unavailable'};
  try{
    privateDirectories(home,registryRoot);
    const receipt=readJSON(registration.path,{privateFile:true,maxBytes:4096});
    if(receipt.format!=='opendesk.dev-cli.r17'||!path.isAbsolute(receipt.entry||'')||
      path.normalize(receipt.entry)!==receipt.entry||!receipt.entry.endsWith(path.join('lib','node_modules','@shopable','opendesk-dev','bin','opendesk-dev.mjs'))||
      !/^[a-f0-9]{64}$/.test(receipt.sha256||''))throw Object.assign(new Error(),{code:'E_DEV_COMPONENT_INVALID'});
    registration.entryPath=receipt.entry;
    const info=fs.lstatSync(receipt.entry);
    if(!info.isFile()||info.isSymbolicLink()||info.size>131072||process.getuid&&![0,process.getuid()].includes(info.uid))
      throw Object.assign(new Error(),{code:'E_DEV_COMPONENT_INVALID'});
    registration.entryMatches=digest(fs.readFileSync(receipt.entry))===receipt.sha256;
    registration.identity=readCliIdentity(path.dirname(path.dirname(receipt.entry)));
    registration.contentMatches=receipt.contentFingerprint===registration.identity.contentFingerprint;
    registration.state='readable';
    if(receipt.localDevAccessVersion!==1)issue('registration','E_DEV_COMPONENT_UPDATE_REQUIRED','登记未声明本地读写能力 v1','更新 npm CLI 后 --register-go。');
    if(!registration.entryMatches)issue('registration','E_DEV_COMPONENT_CHANGED','已登记入口的实际 SHA-256 已变化','审阅安装包后，用该安装的绝对入口执行 --register-go。');
    if(!receipt.contentFingerprint)issue('registration','E_DEV_REGISTRATION_LEGACY','旧登记只有入口 SHA，未绑定 runtime 内容','确认包身份 verified 后重新 --register-go。');
    else if(!registration.contentMatches||receipt.packageVersion!==registration.identity.version)
      issue('registration','E_DEV_REGISTRATION_CONTENT_CHANGED','入口可能未变，但登记的包内容/版本已经变化','核对包内容与候选，再 --register-go；不要只比较 R17.1。');
    if(registration.identity.status!=='verified')issue('registration',registration.identity.status==='legacy-unrecorded'?'E_DEV_BUILD_UNRECORDED':'E_DEV_REGISTERED_PACKAGE_INVALID',
      'Go 登记包身份：'+registration.identity.status,'更新报告中 entryPath 所属全局安装，再用该入口 --register-go。');
    if(cli.mode==='installed-package'&&real(receipt.entry)!==real(cli.entryPath))issue('registration','E_DEV_ENTRY_DIFFERENT','Go 登记与当前 CLI 属于不同全局安装（可能是 nvm/Homebrew）',
      '选择目标 prefix；用该包绝对入口 --register-go，随后用报告中的 Go 预计 Node 执行该入口 --doctor。');
  }catch(error){issue('registration',['E_INSTALL_PERMISSIONS','E_DEV_COMPONENT_INVALID'].includes(error.code)?error.code:'E_DEV_COMPONENT_MISSING',
    '开发 CLI 登记缺失、不可读或不合法','核对私有目录归属/权限；安装到选定 npm prefix 后显式 --register-go。');}
  const pathEntry=onPath('opendesk-dev',env);
  registration.pathEntry=pathEntry;
  if(cli.mode==='installed-package'&&pathEntry?.resolvedPath&&pathEntry.resolvedPath!==real(cli.entryPath))
    issue('registration','W_PATH_CLI_DIFFERENT','PATH 中 opendesk-dev 与当前执行包不同','用报告中的绝对入口诊断、安装与登记；不要用 PATH 上的另一份包覆盖登记。','warning');
  const native={state:'unavailable',connection:{state:'not-probed'}};
  try{
    const root=installationRoot({home,instance:env.OPENDESK_NATIVE_INSTANCE});
    native.installRoot=root;native.configPath=path.join(root,'install.json');
    privateDirectories(home,root);
    const raw=readJSON(native.configPath,{privateFile:true});
    const field=key=>raw[key]??raw[key[0].toUpperCase()+key.slice(1)];
    native.provider=field('provider')==='opendesk'?'go':field('provider')==='node'||field('provider')===undefined?'node':'unknown';
    native.extensionId=/^[a-p]{32}$/.test(field('extensionId')||'')?field('extensionId'):null;
    native.browser=['chrome','cft'].includes(field('browser'))?field('browser'):'chrome';
    native.manifestPath=manifestLocation(native.browser,field('userDataDir')||null,{home,platform});
    native.wrapperPath=path.join(root,'native-host');
    native.state='installed';
    if(native.provider==='node')issue('native','E_MIGRATION_REQUIRED','当前注册为旧 Node Native Host，不能提供 Go 目录直连',
      '按更新指南私有备份，停用所属 Profile 连接，用旧 Node cleanup 卸载其自有安装，再 opendesk browser setup --extension-id 实际ID；诊断不会迁移。');
    else if(native.provider!=='go')issue('native','E_NATIVE_PROVIDER','无法识别安装所有者','检查安装来源；不要覆盖未知 Host，按备份/回退指南恢复已知安装。');
    let manifest;
    try{manifest=readJSON(native.manifestPath);}catch{}
    native.registeredTarget=typeof manifest?.path==='string'&&path.isAbsolute(manifest.path)?manifest.path:null;
    native.manifestMatches=manifest?.name===HOST_NAME&&manifest.type==='stdio'&&manifest.path===native.wrapperPath&&
      JSON.stringify(manifest.allowed_origins)===JSON.stringify(['chrome-extension://'+native.extensionId+'/']);
    if(!native.manifestMatches)issue('native','E_NATIVE_MANIFEST','目标 Profile 的 Native manifest 缺失或目标/扩展 ID 不一致',
      '核对报告中的 Profile/manifest/真实扩展 ID；按所属 Host setup/update 修复，切换所有者须先备份并 cleanup。');
    if(native.provider==='go'){
      const cfg=loadInstall(home,{instance:env.OPENDESK_NATIVE_INSTANCE}),executable=field('executable');
      if(typeof executable!=='string'||!path.isAbsolute(executable))throw new Error();
      native.executablePath=executable;
      const wrapper=fs.lstatSync(native.wrapperPath),body=fs.readFileSync(native.wrapperPath,'utf8');
      const instance=env.OPENDESK_NATIVE_INSTANCE;
      const prefix=instance===undefined?'unset OPENDESK_NATIVE_INSTANCE\n':`OPENDESK_NATIVE_INSTANCE=${quote(instance)}\nexport OPENDESK_NATIVE_INSTANCE\n`;
      native.wrapperMatches=wrapper.isFile()&&!wrapper.isSymbolicLink()&&(wrapper.mode&0o077)===0&&
        (wrapper.mode&0o111)!==0&&(!process.getuid||wrapper.uid===process.getuid())&&
        [ `#!/bin/sh\n${prefix}exec ${quote(executable)} browser native-host "$@"\n`,
          ...(instance===undefined?[`#!/bin/sh\nexec ${quote(executable)} browser native-host "$@"\n`]:[])].includes(body);
      if(!native.wrapperMatches)issue('native','E_NATIVE_WRAPPER','Go 配置与 Native launcher 目标不一致','核对报告中的 executablePath，按 Go 安装 update 恢复 launcher；不执行未知 wrapper。');
      try{
        const info=fs.statSync(executable);
        if(!info.isFile()||(info.mode&0o111)===0||process.getuid&&![0,process.getuid()].includes(info.uid))throw new Error();
        fs.accessSync(executable,fs.constants.X_OK);
      }catch{issue('native','E_NATIVE_EXECUTABLE','Go 注册目标不是受信普通可执行文件','恢复备份中的 Go 二进制或使用已构建受信安装，再由 Go update 修复。');}
      // Authenticate only if the local registration is consistent.
      if(native.wrapperMatches&&native.manifestMatches){
        native.connection=await probe(cfg);
        if(!native.connection.authenticated)issue('connection',native.connection.code||'E_NATIVE_NOT_READY',
          '无法建立认证 Socket；尚不能判断扩展能力','在报告对应的 Chrome/Profile 启用本机连接，再 --doctor；检查原生宿主启动错误，不自动打开浏览器。');
        else if(!native.connection.browserReady)issue('connection','E_EXTENSION_DISCONNECTED','Socket 可认证，但已配对扩展未连接',
          '在正确 Profile 启用该实际扩展及 Native 权限，点击本机连接；不要重装 CLI 来修复断线。');
        else if(!native.connection.compatible)issue('capability','E_NATIVE_UPDATE_REQUIRED','已连接但本地目录/文件/读写能力不是 v1',
          '更新 Go Host 和扩展当前构建并重新连接；核对 capability 各字段，不能退化到旧单 Provider。');
      }
    }
  }catch(error){issue('native',error.code==='E_INSTALL_PERMISSIONS'?'E_INSTALL_PERMISSIONS':error.code==='E_MIGRATION_REQUIRED'?'E_MIGRATION_REQUIRED':'E_INSTALL_INVALID',
    '安装配置缺失、权限错误或 Go 字段不合法','核对当前 Native 实例与私有备份；使用对应所有者 setup/update，不自动覆盖安装。');}
  return {format:'opendesk.dev-cli.diagnostic.v1',ok:!issues.some(row=>row.severity==='error'),
    cli,expected,node,registration,native,issues,
    limitations:['未指定 --expect-package 时不能判断是否为最新源码；verified 只表示包内自洽。',
      'Go 当前登记接口只强制校验入口 SHA；完整 runtime 指纹由本诊断核对。',
      'Go Node 选择是当前上游策略推断；Go 暂不转发 dev --doctor/--version --json，须用指定 Node/已登记入口诊断。',
      '认证响应不含扩展加载路径/packageHash；扩展内容一致性须按文档独立核对。',
      '内容指纹覆盖 bin/runtime/package.json；不覆盖外部 node_modules 或运行中的旧进程。']};
}
export function formatDiagnostic(report){
  const lines=[`安装诊断：${report.ok?'通过':'需要处理'}（只读）`,
    `CLI：${report.cli.version||'未知'} · ${report.cli.status} · ${report.cli.contentFingerprint||'无指纹'}`,
    `包路径：${report.cli.packageRoot}`,`当前 Node：${report.node.execPath} · ${report.node.version}`,
    `Go 预计 Node：${report.node.goSelection?.resolvedPath||'未找到'} · ${report.node.goSelection?.version||'未知'}`,
    `Go 登记入口：${report.registration.entryPath||'未登记'}`,
    `Native：${report.native.provider||'未知'} · ${report.native.installRoot||'未安装'}`,
    `注册目标：${report.native.registeredTarget||'未找到'}`,
    `配对扩展：${report.native.extensionId||'未知'} · ${report.native.connection.state}`];
  for(const row of report.issues)lines.push(`[${row.layer}] ${row.code}：${row.reason}`,`  修复：${row.repair}`);
  lines.push(...report.limitations.map(value=>'限制：'+value));
  return lines.join('\n')+'\n';
}
