#!/usr/bin/env node
// One foreground directory per invocation. No HTTP server, shell, MCP client,
// dependency installation, script execution or implicit write authorization.
import os from 'node:os';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const APP='OpenDesk Browser 本地目录直连 R17';
const MAX_WIRE=60*1024;
const EXTENSION=/^[a-p]{32}$/;
const SOURCE=/^source-[a-f0-9]{24}$/;
export const HELP=`${APP}
用法：
  opendesk-dev [目录]          接入指定目录，省略则使用当前目录
  opendesk-dev -- <特殊目录>   明确将 - 开头的名称当作目录
  opendesk-dev --register-go  注册已安装的 npm CLI，供 opendesk browser 使用
  opendesk-dev --help | --version

目录默认只读；有长期读写授权时仍以已有授权为准。只有合法
OpenDesk 项目清单才会提供运行绑定；不会自动运行 npm 或网页业务。
按 Ctrl+C 仅结束本进程拥有的临时来源。
`;
function problem(code,message){return Object.assign(new Error(message||code),{code});}
export function assertSupportedNodeVersion(value=process.versions.node){
  const parts=String(value||'').split('.').map(Number);
  if(parts.length<2||parts.some(x=>!Number.isSafeInteger(x)||x<0)||
    parts[0]<22||parts[0]===22&&parts[1]<12)
    throw problem('E_NODE_VERSION','OpenDesk R17 需要 Node.js 22.12 或更新的受支持版本，当前为 '+String(value));
}
function parseArgs(argv){
  let args=[...argv];if(args[0]==='dev')args=args.slice(1);
  if(args.length===1&&['help','-h','--help'].includes(args[0]))return {action:'help'};
  if(args.length===1&&['--version','-V','version'].includes(args[0]))return {action:'version'};
  if(args.length===1&&args[0]==='--register-go')return {action:'register'};
  if(args[0]==='--'){
    if(args.length!==2||!args[1])throw problem('E_SCHEMA','-- 后必须明确提供一个目录路径');
    args=args.slice(1);
  }
  else if(args[0]?.startsWith('-'))throw problem('E_SCHEMA','不支持的参数：'+args[0]);
  if(args.length>1||args.some(x=>!x||x.includes('\u0000')))
    throw problem('E_SCHEMA','只能指定一个目录；包含空格或中文的路径请整体作为一个参数传入。');
  return {action:'attach',dir:args[0]||'.'};
}
function trustedFile(file,mode,owner=true){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0&&mode===0o600||
    owner&&process.getuid&&stat.uid!==process.getuid())
    throw problem('E_INSTALL_PERMISSIONS','本机安装配置不符合权限要求');
  return stat;
}
export function loadGoInstall(home=os.homedir()){
  const root=path.join(home,'.opendesk-browser','native-agent-r1');
  for(const dir of [path.dirname(root),root]){
    const info=fs.lstatSync(dir);
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||
      process.getuid&&info.uid!==process.getuid())
      throw problem('E_INSTALL_PERMISSIONS','本机 OpenDesk Native 配置目录不安全');
  }
  const file=path.join(root,'install.json');const info=trustedFile(file,0o600);
  if(info.size>16384)throw problem('E_INSTALL_INVALID','安装配置过大');
  const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
  if(cfg.Provider!=='opendesk'||cfg.InstallRoot!==root||
    cfg.SocketPath!==path.join(root,'agent.sock')||!EXTENSION.test(cfg.ExtensionID||'')||
    !/^[a-f0-9]{64}$/.test(cfg.ClientCredential||'')||
    !['chrome','cft'].includes(cfg.Browser))
    throw problem('E_MIGRATION_REQUIRED','需要受信 Go OpenDesk Native Host；不自动迁移旧 Node Host');
  return {socketPath:cfg.SocketPath,clientCredential:cfg.ClientCredential,
    extensionId:cfg.ExtensionID,browser:cfg.Browser,userDataDir:cfg.UserDataDir||''};
}
function canonicalDirectory(requested){
  let absolute=path.resolve(requested);
  let info;
  try{absolute=fs.realpathSync(absolute);info=fs.statSync(absolute,{bigint:true});}
  catch{throw problem('E_DEV_PATH','目录不存在或无权访问：'+requested);}
  if(!info.isDirectory()||absolute===path.parse(absolute).root)
    throw problem('E_DEV_PATH','只能接入明确指定的普通目录，不能接入文件系统根目录');
  return {absolute,stat:info};
}
function idForPath(cfg,absolute,stat){
  const mac=crypto.createHmac('sha256',cfg.clientCredential);
  mac.update(absolute+'\0'+stat.dev.toString()+'\0'+stat.ino.toString());
  return 'source-'+mac.digest('hex').slice(0,24);
}
function providerManifest(root){
  const file=path.join(root,'package.json');
  let info;try{info=fs.lstatSync(file);}catch(error){
    if(error.code==='ENOENT')return {runnable:false};
    return {runnable:false,reason:'无法读取 package.json'};
  }
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536)return {runnable:false,reason:'项目清单类型不受支持'};
  try{
    const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!pkg?.opendesk)return {runnable:false};
    const p=pkg.opendesk;
    if(p?.format!=='opendesk.project.v1'||!['controller','page-userscript'].includes(p.runtimeKind)||
      typeof p.entry!=='string'||!p.entry||typeof p.id!=='string'||!p.id)
      return {runnable:false,reason:'OpenDesk 项目清单不完整；工作区仍然可用'};
    return {runnable:true};
  }catch{return {runnable:false,reason:'package.json 不是合法 JSON；工作区仍然可用'};}
}
function frame(value){
  const data=Buffer.from(JSON.stringify(value),'utf8');
  if(data.length>MAX_WIRE)throw problem('E_LIMIT','Native 消息过大');
  return Buffer.concat([data,Buffer.from('\n')]);
}
function attachOnce(cfg,absolute,{timeoutMs=2500}={}){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({path:cfg.socketPath});
    let buffer=Buffer.alloc(0),done=false,state=0;
    const finish=(value,error)=>{
      if(done)return;done=true;clearTimeout(timer);
      socket.removeListener('data',onData);
      socket.removeListener('error',onError);
      if(error){socket.destroy();reject(error);}
      else{socket.on('error',()=>{});resolve({socket,reply:value});}
    };
    const fail=(code,text)=>finish(null,problem(code,text));
    const onError=error=>fail('E_NATIVE_NOT_READY',error.message||'Native Socket 不可用');
    const timer=setTimeout(()=>fail('E_NATIVE_NOT_READY','本机 Host 未在限定时间内建立连接'),timeoutMs);
    socket.on('error',onError);
    socket.once('connect',()=>{
      try{socket.write(frame({v:1,kind:'auth',credential:cfg.clientCredential}));}
      catch(error){fail('E_NATIVE_NOT_READY',error.message);}
    });
    function onData(chunk){
      buffer=Buffer.concat([buffer,chunk]);
      if(buffer.length>MAX_WIRE+1){fail('E_LIMIT','Native 回包过大');return;}
      let split;
      while((split=buffer.indexOf(10))>=0){
        let message;
        try{message=JSON.parse(buffer.subarray(0,split).toString('utf8'));}
        catch{fail('E_SCHEMA','Native 回包不是有效 JSON');return;}
        buffer=buffer.subarray(split+1);
        if(state===0){
          if(message?.kind!=='authenticated'||message.v!==1){fail('E_NATIVE_AUTH','Host 验证未通过');return;}
          if(!message.browserReady){fail('E_NATIVE_NOT_READY','扩展尚未完成 Native 连接');return;}
          if(message.localDevMultiVersion!==1||message.localFilesVersion!==1){
            fail('E_NATIVE_UPDATE_REQUIRED','OpenDesk Host 或浏览器扩展版本太旧，不支持 R17');return;
          }
          state=1;socket.write(frame({v:1,kind:'dev.attach',path:absolute}));continue;
        }
        if(message?.kind==='dev.rejected'){fail(message.error?.code||'E_DEV_AUTH','目录接入被拒绝：'+(message.error?.code||'E_DEV_AUTH'));return;}
        if(message?.kind!=='dev.attached'||message.v!==1||!SOURCE.test(message.sourceId||'')||
          !/^workspace-[a-f0-9-]{36}$/.test(message.workspaceId||'')||
          typeof message.leaseId!=='string'){fail('E_SCHEMA','Host 未返回有效目录身份');return;}
        finish(message,null);return;
      }
    }
    socket.on('data',onData);
    socket.once('close',()=>{if(!done)fail('E_NATIVE_NOT_READY','Native Host 断开连接');});
  });
}
async function openWorkspace(cfg,sourceId){
  const url='chrome-extension://'+cfg.extensionId+'/native-agent/workspace.html?sourceId='+sourceId;
  if(cfg.userDataDir)throw problem('E_PROFILE_TARGET','使用了自定义 Chrome Profile，无法保证自动打开正确实例；可在已配对浏览器打开：'+url);
  let executable,args;
  if(process.platform==='darwin'){
    executable='/usr/bin/open';args=['-a',cfg.browser==='cft'?'Google Chrome for Testing':'Google Chrome',url];
  }else if(process.platform==='linux'){
    executable=['/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(p=>fs.existsSync(p));
    args=[url];
  }else throw problem('E_BROWSER_PLATFORM','当前系统尚无受支持的自动打开实现：'+url);
  if(!executable)throw problem('E_BROWSER_OPEN','无法定位受信浏览器，请在已配对 Chrome 打开：'+url);
  await new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{stdio:'ignore',windowsHide:true});
    child.on('error',e=>reject(problem('E_BROWSER_OPEN',e.message)));
    child.on('close',code=>code===0?resolve():reject(problem('E_BROWSER_OPEN','打开浏览器失败，退出码 '+code+'；可手动打开：'+url)));
  });
}
function safeRegister(bin=process.argv[1]){
  const absolute=fs.realpathSync(bin||'');
  if(!absolute.endsWith(path.join('lib','node_modules','@shopable','opendesk-dev','bin','opendesk-dev.mjs')))
    throw problem('E_DEV_INSTALL','Go 入口只接受 npm 全局安装的 @shopable/opendesk-dev；请使用 npm install -g 后重新登记');
  const home=path.join(os.homedir(),'.opendesk-browser'),dir=path.join(home,'dev-tool-r17');
  const hash=crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  fs.mkdirSync(home,{recursive:true,mode:0o700});fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const d of [home,dir]){
    const info=fs.lstatSync(d);
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077)!==0||
      process.getuid&&info.uid!==process.getuid())throw problem('E_INSTALL_PERMISSIONS','拒绝在不安全的目录注册');
  }
  const location=path.join(dir,'entry.json'),temporary=path.join(dir,'.entry-'+process.pid+'.new');
  fs.writeFileSync(temporary,JSON.stringify({format:'opendesk.dev-cli.r17',entry:absolute,sha256:hash})+'\n',{flag:'wx',mode:0o600});
  try{fs.renameSync(temporary,location);}catch(e){try{fs.unlinkSync(temporary);}catch{}throw e;}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runDevCli(argv=process.argv.slice(2),{stdout=process.stdout,stderr=process.stderr}={}){
  try{
    const parsed=parseArgs(argv);
    if(parsed.action==='help'){stdout.write(HELP);return 0;}
    if(parsed.action==='version'){stdout.write(APP+'\n');return 0;}
    assertSupportedNodeVersion();
    if(parsed.action==='register'){safeRegister();stdout.write('已登记受信 npm CLI 入口。可使用 opendesk browser。\n');return 0;}
    const cfg=loadGoInstall(),{absolute,stat}=canonicalDirectory(parsed.dir);
    const sourceId=idForPath(cfg,absolute,stat);
    stdout.write('请求接入目录：'+absolute+'（仅此目录，默认只读）\n');
    let attached,launched=false,openError=null;
    try{attached=await attachOnce(cfg,absolute,{timeoutMs:1500});}
    catch(err){
      if(err.code!=='E_NATIVE_NOT_READY')throw err;
      stdout.write('正在等待已配对的浏览器扩展建立 Native 连接…\n');
      try{await openWorkspace(cfg,sourceId);launched=true;}
      catch(error){openError=error;stderr.write(error.code+': '+error.message+'\n');}
      const deadline=Date.now()+9000;
      while(Date.now()<deadline&&!attached){
        await pause(350);
        try{attached=await attachOnce(cfg,absolute,{timeoutMs:850});}
        catch(e){if(e.code!=='E_NATIVE_NOT_READY')throw e;}
      }
      if(!attached)throw problem('E_NATIVE_NOT_READY','未检测到已配对的 OpenDesk Host。请在正确的 Chrome Profile 启用 Native 连接并核对版本。');
    }
    const {socket,reply}=attached;
    stdout.write('已连接受信 OpenDesk Native Host；本次目录身份已由 Host 确认。\n');
    if(reply.alreadyActive){
      socket.end();
      stdout.write('此目录已经由另一个 CLI 会话接入；本命令不抢占、不重复登记。\n');
      return 0;
    }
    const manifest=providerManifest(absolute);
    let session;
    try{
      if(manifest.runnable){
        const {LocalDevSession}=await import('./session.mjs');
        const {createLocalProjectProvider}=await import('./provider.mjs');
        session=new LocalDevSession({allowedPaths:[absolute]});
        session.attach({path:absolute});
        session.provider=createLocalProjectProvider({session,leaseId:reply.leaseId,
          installation:()=>({socketPath:cfg.socketPath,clientCredential:cfg.clientCredential})});
      }
      stdout.write('目录已登记：'+reply.name+' · 工作区 '+reply.workspaceId+
        ' · '+(reply.access==='read-write'?'已有读写授权':'只读')+'\n');
      if(!manifest.runnable)stdout.write('文件工作区可用，未配置可运行程序。'+(manifest.reason||'')+'\n');
      if(!launched){
        try{await openWorkspace(cfg,sourceId);launched=true;}
        catch(error){openError=error;stderr.write(error.code+': '+error.message+'\n');}
      }
      stdout.write(launched?'已请求在已配对 Chrome 中打开对应 Workspace（由浏览器确认页面是否打开）。\n':
        '未能自动打开浏览器，可在已配对 Chrome 手动打开 Workspace。\n');
      if(manifest.runnable)stdout.write('源码 Provider 正在连接；浏览器工作台仅在明确点击运行时才执行程序。\n');
      stdout.write('按 Ctrl+C 只结束此命令持有的临时目录来源。\n');
      await new Promise(resolve=>{
        let finished=false;
        const end=()=>{
          if(finished)return;finished=true;
          process.off('SIGINT',end);process.off('SIGTERM',end);
          session?.close();socket.destroy();resolve();
        };
        process.once('SIGINT',end);process.once('SIGTERM',end);
        socket.once('close',end);
      });
      return openError?2:0;
    }finally{session?.close();socket.destroy();}
  }catch(error){
    stderr.write((error.code||'E_DEV')+': '+(error.message||String(error))+'\n');
    return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const code=await runDevCli();process.exitCode=code;
}
