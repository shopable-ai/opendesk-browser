// Standalone Stay Focus v3 app candidate; never compiles Browser WXT code.
// Release verification binds actual compiled UI bytes to the EXISTING Installer
// transaction using its controlled mock-Native Chrome API, not a hand-built v3 object.
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,writeFile,rename,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildStayFocusReact} from './build-stay-focus-react.mjs';
import {createSidebarToolPackage,encodeSidebarToolPackage}
  from './build-sidebar-tool.mjs';

const root=fileURLToPath(new URL('../examples/sidebar-tools/stay-focus/',import.meta.url));
const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const execFileAsync=promisify(execFile);

export async function buildStandaloneStayFocus({preview=false,log=true,reuseCompiled=false}={}){
  if(!reuseCompiled)await buildStayFocusReact({log:false});
  const pkg=await createSidebarToolPackage(root);
  const isV3=pkg.format==='opendesk.sidebar-tool.v2'&&pkg.version==='3.0.0'&&
    pkg.backgroundPolicy?.kind==='site-budget.v3'&&
    pkg.capabilities.includes('browser.siteBudget')&&
    !pkg.capabilities.includes('focus.control')&&
    pkg.requires?.browserSdk==='1.0.0';
  if(!isV3)throw Error('E_STAY_FOCUS_RELEASE_GATE: expected a source-bound v3 app');
  const bytes=encodeSidebarToolPackage(pkg);
  let installerMockMigrationVerified=false;
  if(!preview){
    const temporary=await mkdtemp(join(tmpdir(),'opendesk-stay-focus-v3-'));
    try{
      const candidate=resolve(temporary,'stay-focus-v3-candidate.opendesk-tool.json');
      await writeFile(candidate,bytes,{flag:'wx'});
      // Reuse all old Installer upgrade, rollback and UNKNOWN tests; only
      // replace the synthetic modern candidate with actual compiled app bytes.
      await execFileAsync(process.execPath,
        ['--test','tests/environment/stay-focus-installer-v3-upgrade-r121.test.mjs'],{
          cwd:repositoryRoot,timeout:120000,maxBuffer:4*1024*1024,
          env:{...process.env,OPENDESK_STAY_FOCUS_V3_CANDIDATE:candidate}
        });
      installerMockMigrationVerified=true;
    }catch(error){
      throw Error('E_STAY_FOCUS_RELEASE_GATE: real v3 candidate Installer failed: '+
        String(error?.stderr||error?.message||error).slice(-1800));
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
  const dirname=resolve(root,'dist'),name='stay-focus.opendesk-tool.json';
  await mkdir(dirname,{recursive:true});
  const output=resolve(dirname,name),temp=output+'.'+randomUUID()+'.new';
  await writeFile(temp,bytes,{flag:'wx'});
  await rename(temp,output);
  if(sha256(await readFile(output))!==sha256(bytes))
    throw Error('E_STAY_FOCUS_PACKAGE_HASH: standalone candidate readback failed');
  const result={
    format:'opendesk.independent-app-receipt.v1',toolId:pkg.id,
    version:pkg.version,bytes:bytes.length,sha256:sha256(bytes),
    package:name,installerMockMigrationVerified,
    candidateReady:installerMockMigrationVerified,
    // Node mock-Native is NOT a real Chrome DNR/Alarm or frozen B0 proof.
    nativeChromeVerified:false,releaseReady:false,browserBuildTouched:false
  };
  const receipt=resolve(dirname,'standalone-release-receipt.json');
  const receiptTemp=receipt+'.'+randomUUID()+'.new';
  await writeFile(receiptTemp,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  await rename(receiptTemp,receipt);
  if(log)console.log(JSON.stringify(result));
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  await buildStandaloneStayFocus({preview:process.argv.includes('--preview'),
    reuseCompiled:process.argv.includes('--reuse-compiled')});
